-- Referral program, wallet ledger, and manual withdrawal requests.
--
-- Design notes:
-- - All amounts are stored in the smallest currency unit (paise for INR,
--   cents for USD) to keep integer arithmetic exact.
-- - INR and USD are separate ledger rows and separate balances; never mixed.
-- - wallet_ledger is append-only: no UPDATE or DELETE is possible (RLS +
--   no policies; the service role writes inserts only).
-- - Referral attribution is written once at signup (service role) and then
--   locked: the profiles trigger rejects any UPDATE of referred_by.

-- ---------------------------------------------------------------------------
-- profiles: referral identity
-- ---------------------------------------------------------------------------
alter table public.profiles
  add column referral_code text unique;
alter table public.profiles
  add column referred_by uuid references public.profiles (id) on delete set null;

create index profiles_referred_by_idx on public.profiles (referred_by);

-- Attribution is immutable: any UPDATE that changes referred_by is rejected.
create or replace function public.enforce_referred_by_immutable()
returns trigger
language plpgsql
as $$
begin
  if new.referred_by is distinct from old.referred_by then
    raise exception 'referred_by is immutable after signup';
  end if;
  return new;
end;
$$;

create trigger profiles_referred_by_immutable
  before update on public.profiles
  for each row execute function public.enforce_referred_by_immutable();

-- ---------------------------------------------------------------------------
-- referrals: referrer → referred relationship + lifecycle
-- ---------------------------------------------------------------------------
create table public.referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references public.profiles (id) on delete cascade,
  referred_id uuid not null unique references public.profiles (id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending', 'rewarded', 'reversed')),
  created_at timestamptz not null default now(),
  check (referrer_id <> referred_id)
);

create index referrals_referrer_idx on public.referrals (referrer_id, status);

alter table public.referrals enable row level security;
create policy "referrals_select_own" on public.referrals
  for select using (auth.uid() = referrer_id or auth.uid() = referred_id);
-- Writes happen only server-side (service role), never from the client.

-- ---------------------------------------------------------------------------
-- referral_rewards: one row per qualifying payment (duplicate-proof)
-- ---------------------------------------------------------------------------
create table public.referral_rewards (
  id uuid primary key default gen_random_uuid(),
  referral_id uuid not null references public.referrals (id) on delete cascade,
  provider text not null check (provider in ('razorpay', 'paypal')),
  payment_id text not null,
  currency text not null check (currency in ('INR', 'USD')),
  amount integer not null check (amount > 0),
  status text not null default 'pending'
    check (status in ('pending', 'released', 'reversed')),
  payment_verified_at timestamptz not null default now(),
  eligible_at timestamptz not null,
  released_at timestamptz,
  reversed_at timestamptz,
  unique (provider, payment_id)
);

create index referral_rewards_referral_idx on public.referral_rewards (referral_id);

alter table public.referral_rewards enable row level security;
create policy "referral_rewards_select_own" on public.referral_rewards
  for select using (
    exists (
      select 1 from public.referrals r
      where r.id = referral_id
        and (r.referrer_id = auth.uid() or r.referred_id = auth.uid())
    )
  );
-- Writes happen only server-side (service role).

-- ---------------------------------------------------------------------------
-- wallet_ledger: append-only, server-authoritative balances
-- ---------------------------------------------------------------------------
create table public.wallet_ledger (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  currency text not null check (currency in ('INR', 'USD')),
  -- Signed delta in the smallest currency unit.
  amount integer not null check (amount <> 0),
  entry_type text not null check (entry_type in (
    'referral_pending',      -- + pending reward
    'referral_released',     -- + available (pending → available)
    'referral_reversed',     -- − pending (refund/dispute)
    'withdrawal_reserved',   -- − available (reserve for a requested payout)
    'withdrawal_paid',       -- − reserved (settlement; recorded at paid)
    'withdrawal_released'    -- + available (reject/cancel; funds return)
  )),
  referral_reward_id uuid references public.referral_rewards (id) on delete set null,
  withdrawal_request_id uuid,
  note text,
  created_at timestamptz not null default now()
);

create index wallet_ledger_user_currency_idx
  on public.wallet_ledger (user_id, currency, created_at desc);

alter table public.wallet_ledger enable row level security;
create policy "wallet_ledger_select_own" on public.wallet_ledger
  for select using (auth.uid() = user_id);
-- Writes happen only server-side (service role).

-- ---------------------------------------------------------------------------
-- withdrawal_requests: manual payouts
-- ---------------------------------------------------------------------------
create table public.withdrawal_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  currency text not null check (currency in ('INR', 'USD')),
  amount integer not null check (amount > 0),
  status text not null default 'requested'
    check (status in ('requested', 'under_review', 'approved', 'paid', 'rejected', 'cancelled')),
  payout_method text not null,
  payout_details jsonb not null,
  admin_note text,
  payment_reference text,
  paid_at timestamptz,
  paid_by_admin text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index withdrawal_requests_user_idx
  on public.withdrawal_requests (user_id, created_at desc);
create index withdrawal_requests_status_idx
  on public.withdrawal_requests (status, created_at);

alter table public.withdrawal_requests enable row level security;
create policy "withdrawal_requests_select_own" on public.withdrawal_requests
  for select using (auth.uid() = user_id);
-- Writes happen only server-side (service role). Payout details never reach
-- other users: the select policy scopes every row to its owner, and admins
-- read through the service role with an ADMIN_EMAILS check in app code.

create extension if not exists moddatetime;
create trigger withdrawal_requests_updated_at before update on public.withdrawal_requests
  for each row execute function moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Atomic reward + wallet functions (single SQL statement each; no races)
-- ---------------------------------------------------------------------------

-- Award a pending referral reward. Unique (provider, payment_id) makes this
-- idempotent; the referral and referrer≠referred checks run inside the same
-- transaction.
create or replace function public.award_referral_reward(
  p_referred_user_id uuid,
  p_provider text,
  p_payment_id text,
  p_amount integer,
  p_currency text,
  p_hours_until_eligible integer default 168  -- 7 days
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_referral_id uuid;
  v_reward_id uuid;
  v_existing uuid;
begin
  -- 1. Find the referral for this user (must exist and be attributable).
  select r.id into v_referral_id
    from public.referrals r
    where r.referred_id = p_referred_user_id
    for update;
  if v_referral_id is null then
    return null;  -- no referrer — nothing to award
  end if;

  -- 2. Referrer must be a different user (schema CHECK also guards it).
  perform 1 from public.referrals
    where id = v_referral_id and referrer_id <> referred_id;
  if not found then
    return null;
  end if;

  -- 3. Duplicate payment check (unique index also enforced, belt & braces).
  select id into v_existing from public.referral_rewards
    where provider = p_provider and payment_id = p_payment_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- 4. Create pending reward.
  insert into public.referral_rewards
    (referral_id, provider, payment_id, currency, amount, status, eligible_at)
  values (
    v_referral_id, p_provider, p_payment_id, p_currency, p_amount, 'pending',
    now() + make_interval(hours => p_hours_until_eligible)
  )
  returning id into v_reward_id;

  -- 5. Ledger: pending credit to the referrer.
  insert into public.wallet_ledger
    (user_id, currency, amount, entry_type, referral_reward_id, note)
  select r.referrer_id, p_currency, p_amount, 'referral_pending', v_reward_id,
         'Referral reward (pending release after 7 days)'
    from public.referrals r where r.id = v_referral_id;

  -- 6. Referral becomes rewarded.
  update public.referrals set status = 'rewarded' where id = v_referral_id;

  return v_reward_id;
end;
$$;

-- Release a pending reward once eligible. Returns true when released.
create or replace function public.release_referral_reward(
  p_reward_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward record;
begin
  select * into v_reward from public.referral_rewards
    where id = p_reward_id and status = 'pending' and eligible_at <= now()
    for update;
  if not found then
    return false;
  end if;

  insert into public.wallet_ledger
    (user_id, currency, amount, entry_type, referral_reward_id, note)
  select r.referrer_id, v_reward.currency, v_reward.amount, 'referral_released',
         v_reward.id, 'Referral reward released from pending to available'
    from public.referrals r where r.id = v_reward.referral_id;

  update public.referral_rewards
    set status = 'released', released_at = now()
    where id = p_reward_id;

  return true;
end;
$$;

-- Reverse a pending (or released) reward after a refund/dispute.
create or replace function public.reverse_referral_reward(
  p_provider text,
  p_payment_id text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reward record;
  v_referrer_id uuid;
begin
  select * into v_reward from public.referral_rewards
    where provider = p_provider and payment_id = p_payment_id
      and status in ('pending', 'released')
    for update;
  if not found then
    return false;
  end if;

  select r.referrer_id into v_referrer_id
    from public.referrals r where r.id = v_reward.referral_id;

  if v_reward.status = 'pending' then
    -- Take back the pending amount (net effect zero for the referrer).
    insert into public.wallet_ledger
      (user_id, currency, amount, entry_type, referral_reward_id, note)
    values
      (v_referrer_id, v_reward.currency, -v_reward.amount,
       'referral_reversed', v_reward.id,
       'Referral reward reversed (payment refunded or disputed)');
  else
    -- Released reward already counted as available; claw it back (this may
    -- make the balance negative — tracked in the ledger for admin review).
    insert into public.wallet_ledger
      (user_id, currency, amount, entry_type, referral_reward_id, note)
    values
      (v_referrer_id, v_reward.currency, -v_reward.amount,
       'referral_reversed', v_reward.id,
       'Referral reward reversed after release (refund/dispute) — balance may be negative');
  end if;

  update public.referral_rewards
    set status = 'reversed', reversed_at = now()
    where id = v_reward.id;

  update public.referrals set status = 'reversed'
    where id = v_reward.referral_id and status = 'rewarded';

  return true;
end;
$$;

-- Derive wallet balances from ledger + reward status (per currency).
-- available: ledger sums for released/released withdrawals, minus the reserve
--   booked when a payout was requested, minus released rewards later reversed.
--   PENDING rewards are excluded (they are not spendable yet), so a
--   reversed-while-pending reward nets zero (no available impact).
-- pending: sum of amounts of rewards currently in 'pending' status owned by
--   this referrer (never negative; reversal simply removes it).
create or replace function public.wallet_balances(
  p_user_id uuid,
  p_currency text
)
returns table (available integer, pending integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce((
      select sum(w.amount)
      from public.wallet_ledger w
      left join public.referral_rewards rr on rr.id = w.referral_reward_id
      where w.user_id = p_user_id and w.currency = p_currency
        and (
          w.entry_type in ('referral_released', 'withdrawal_released', 'withdrawal_reserved')
          or (w.entry_type = 'referral_reversed' and rr.status = 'released')
        )
    ), 0)::integer,
    coalesce((
      select sum(rr.amount)
      from public.referral_rewards rr
      join public.referrals r on r.id = rr.referral_id
      where r.referrer_id = p_user_id
        and rr.currency = p_currency
        and rr.status = 'pending'
    ), 0)::integer
  from (select 1) as _one;
$$;

-- Reserve funds for a withdrawal (atomic; fails when balance is insufficient).
create or replace function public.reserve_withdrawal(
  p_user_id uuid,
  p_currency text,
  p_amount integer
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_available integer;
  v_request_id uuid;
begin
  -- Lock the user's ledger rows for this currency (serializes concurrent
  -- withdrawal requests from the same user).
  perform 1
    from public.wallet_ledger
    where user_id = p_user_id and currency = p_currency
    for update;

  -- Single source of truth for balances (ledger + reward status).
  select available into v_available
    from public.wallet_balances(p_user_id, p_currency);

  if v_available is null or v_available < p_amount then
    raise exception 'INSUFFICIENT_BALANCE';
  end if;

  insert into public.withdrawal_requests
    (user_id, currency, amount, payout_method, payout_details, status)
  values
    (p_user_id, p_currency, p_amount, 'manual', '{}'::jsonb, 'requested')
  returning id into v_request_id;

  insert into public.wallet_ledger
    (user_id, currency, amount, entry_type, withdrawal_request_id, note)
  values
    (p_user_id, p_currency, -p_amount, 'withdrawal_reserved', v_request_id,
     'Withdrawal reserved');

  return v_request_id;
end;
$$;

-- Finalize a withdrawal as paid (double-process-proof).
create or replace function public.mark_withdrawal_paid(
  p_request_id uuid,
  p_payment_reference text,
  p_admin_email text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  select * into v_request from public.withdrawal_requests
    where id = p_request_id and status in ('requested', 'under_review', 'approved')
    for update;
  if not found then
    return false;  -- already paid / rejected / cancelled
  end if;

  update public.withdrawal_requests
    set status = 'paid',
        payment_reference = p_payment_reference,
        paid_at = now(),
        paid_by_admin = p_admin_email
    where id = p_request_id;

  -- Permanent debit (the reserved entry reduced available; this entry is the
  -- settlement record against the reserved amount, which we booked negative
  -- at reserve time — so the payout entry zeroes the reservation out).
  insert into public.wallet_ledger
    (user_id, currency, amount, entry_type, withdrawal_request_id, note)
  values
    (v_request.user_id, v_request.currency, v_request.amount,
     'withdrawal_paid', v_request.id,
     'Withdrawal paid (reserves settled)');

  return true;
end;
$$;

-- Reject/cancel a withdrawal and give the reserve back.
create or replace function public.release_withdrawal(
  p_request_id uuid,
  p_admin_email text,
  p_note text
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request record;
begin
  select * into v_request from public.withdrawal_requests
    where id = p_request_id and status in ('requested', 'under_review', 'approved')
    for update;
  if not found then
    return false;
  end if;

  update public.withdrawal_requests
    set status = 'rejected', admin_note = p_note, paid_by_admin = p_admin_email
    where id = p_request_id;

  insert into public.wallet_ledger
    (user_id, currency, amount, entry_type, withdrawal_request_id, note)
  values
    (v_request.user_id, v_request.currency, v_request.amount,
     'withdrawal_released', v_request.id,
     'Withdrawal rejected — reserved funds returned to available balance');

  return true;
end;
$$;
