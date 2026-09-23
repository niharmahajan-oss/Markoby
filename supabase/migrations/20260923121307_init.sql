-- -------------------------------------------------
--  Supabase schema for Markoby
--  Generates the tables the app expects:
--   * profiles  – optional user profile data
--   * subscriptions – stores the Razorpay subscription status
-- -------------------------------------------------

-- 1️⃣ profiles (optional, but handy for future extensions)
create table if not exists public.profiles (
  id          uuid    primary key references auth.users on delete cascade,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz default now()
);

-- 2️⃣ subscriptions
create table if not exists public.subscriptions (
  id          uuid    primary key default gen_random_uuid(),
  user_id     uuid    not null references auth.users on delete cascade,
  status      text    not null check (status in ('active','inactive','past_due','canceled')),
  plan_id     text,                      -- Razorpay plan identifier (optional)
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

-- Keep the `updated_at` column in sync automatically
create trigger update_subscriptions_timestamp
  before update on public.subscriptions
  for each row
  execute function public.update_timestamp();

-- Helper function used by the trigger (if not already present)
create or replace function public.update_timestamp()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
