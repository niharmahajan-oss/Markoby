-- Markoby initial schema
-- Run via: supabase db push  (or paste into the Supabase SQL editor)

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- profiles (mirrors auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  full_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles
  for insert with check (auth.uid() = id);
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create profile + inactive subscription row on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, new.email, new.raw_user_meta_data ->> 'full_name')
  on conflict (id) do nothing;

  insert into public.subscriptions (user_id, status)
  values (new.id, 'inactive')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- subscriptions (single Razorpay plan; webhook is source of truth)
-- ---------------------------------------------------------------------------
create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles (id) on delete cascade,
  razorpay_customer_id text,
  razorpay_subscription_id text,
  status text not null default 'inactive'
    check (status in ('inactive', 'active', 'past_due', 'canceled')),
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.subscriptions enable row level security;

create policy "subscriptions_select_own" on public.subscriptions
  for select using (auth.uid() = user_id);
-- inserts/updates only via service role (webhook / billing routes)

-- ---------------------------------------------------------------------------
-- projects
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null,
  website_url text,
  website_context text,
  status text not null default 'onboarding'
    check (status in ('onboarding', 'plan_ready', 'active')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index projects_user_idx on public.projects (user_id, created_at desc);

alter table public.projects enable row level security;

create policy "projects_all_own" on public.projects
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- shared helper: ownership check for child tables (avoids RLS recursion)
-- ---------------------------------------------------------------------------
create or replace function public.is_project_owner(p_project_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.projects
    where id = p_project_id and user_id = auth.uid()
  );
$$;

revoke execute on function public.is_project_owner(uuid) from anon;
grant execute on function public.is_project_owner(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- onboarding_messages (full interview transcript)
-- ---------------------------------------------------------------------------
create table public.onboarding_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  role text not null check (role in ('assistant', 'user')),
  content text not null,
  created_at timestamptz not null default now()
);

create index onboarding_messages_project_idx
  on public.onboarding_messages (project_id, created_at);

alter table public.onboarding_messages enable row level security;

create policy "onboarding_messages_all_own" on public.onboarding_messages
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- onboarding_summary (structured extraction; grounding for later AI calls)
-- ---------------------------------------------------------------------------
create table public.onboarding_summary (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects (id) on delete cascade,
  business_description text not null,
  target_audience text not null,
  value_prop text not null,
  tone_of_voice text not null,
  constraints text,
  raw_json jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.onboarding_summary enable row level security;

create policy "onboarding_summary_all_own" on public.onboarding_summary
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- project_platforms
-- ---------------------------------------------------------------------------
create table public.project_platforms (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  platform text not null
    check (platform in ('reddit', 'x', 'instagram', 'discord', 'youtube')),
  enabled_at timestamptz not null default now(),
  unique (project_id, platform)
);

alter table public.project_platforms enable row level security;

create policy "project_platforms_all_own" on public.project_platforms
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- marketing_plans (one per project+platform; generation is a background job)
-- ---------------------------------------------------------------------------
create table public.marketing_plans (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  platform text not null
    check (platform in ('reddit', 'x', 'instagram', 'discord', 'youtube')),
  status text not null default 'pending'
    check (status in ('pending', 'generating', 'ready', 'failed')),
  plan_json jsonb,
  model_used text,
  prompt_version text,
  error text,
  generated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (project_id, platform)
);

alter table public.marketing_plans enable row level security;

create policy "marketing_plans_all_own" on public.marketing_plans
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- prospects
-- ---------------------------------------------------------------------------
create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  platform text not null
    check (platform in ('reddit', 'x', 'instagram', 'discord', 'youtube')),
  external_handle_or_url text not null,
  display_name text,
  relevance_reason text,
  relevance_score integer check (relevance_score between 0 and 100),
  context_excerpt text,
  source_type text not null default 'api' check (source_type in ('api', 'guide')),
  status text not null default 'new'
    check (status in ('new', 'contacted', 'ignored')),
  discovered_at timestamptz not null default now(),
  unique (project_id, platform, external_handle_or_url)
);

create index prospects_project_platform_idx
  on public.prospects (project_id, platform, discovered_at desc);

alter table public.prospects enable row level security;

create policy "prospects_all_own" on public.prospects
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- usage_events (model, tokens, prompt version per AI call)
-- ---------------------------------------------------------------------------
create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  event_type text not null,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index usage_events_user_idx on public.usage_events (user_id, created_at desc);

alter table public.usage_events enable row level security;

create policy "usage_events_select_own" on public.usage_events
  for select using (auth.uid() = user_id);
-- writes happen server-side (service role) from the Groq module

-- ---------------------------------------------------------------------------
-- updated_at touch triggers
-- ---------------------------------------------------------------------------
create extension if not exists moddatetime;

create trigger projects_updated_at before update on public.projects
  for each row execute function moddatetime (updated_at);
create trigger subscriptions_updated_at before update on public.subscriptions
  for each row execute function moddatetime (updated_at);
create trigger onboarding_summary_updated_at before update on public.onboarding_summary
  for each row execute function moddatetime (updated_at);
