-- Add PayPal as an international payment provider alongside Razorpay.
-- Existing rows keep working: payment_provider defaults to 'razorpay', which
-- matches every pre-existing subscription.

alter table public.subscriptions
  add column payment_provider text not null default 'razorpay'
    check (payment_provider in ('razorpay', 'paypal'));

alter table public.subscriptions
  add column paypal_subscription_id text;

-- Webhook lookups come in by PayPal subscription id; keep it unique.
create unique index subscriptions_paypal_subscription_id_idx
  on public.subscriptions (paypal_subscription_id)
  where paypal_subscription_id is not null;

-- Provider-agnostic webhook event log + dedupe. Unique (provider, event_id)
-- makes replays harmless: the second delivery conflicts and is acked.
create table public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null check (provider in ('razorpay', 'paypal')),
  event_id text not null,
  event_type text not null,
  received_at timestamptz not null default now(),
  unique (provider, event_id)
);

alter table public.webhook_events enable row level security;
-- No policies: only the service role writes/reads this table.
