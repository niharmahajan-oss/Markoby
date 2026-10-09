-- Add billing currency to subscriptions (USD international plan support).
-- Existing rows keep working: INR is the default and matches every
-- pre-existing subscription.

alter table public.subscriptions
  add column currency text not null default 'INR'
    check (currency in ('INR', 'USD'));
