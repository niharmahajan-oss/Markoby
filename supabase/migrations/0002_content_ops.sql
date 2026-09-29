-- Markoby — content operations pass
-- Run via: supabase db push  (or paste into the Supabase SQL editor)
--
-- Adds the tables behind: per-calendar-item drafts, the real content calendar
-- (normalized out of marketing_plans.plan_json so dates are queryable), the
-- post-performance feedback loop, and weekly check-ins.
--
-- Every statement is guarded (if not exists / drop if exists) so the whole file
-- can be pasted again after a partial failure without erroring out.

-- ---------------------------------------------------------------------------
-- onboarding_summary.competitor_notes
--   Lightweight, publicly-visible scan of the competitors the founder named
--   during the interview. Used to angle plan generation away from what the
--   competition already publishes.
-- ---------------------------------------------------------------------------
alter table public.onboarding_summary
  add column if not exists competitor_notes text;

-- ---------------------------------------------------------------------------
-- plan_items
--   Normalized content-calendar rows. `plan_json.content_calendar` stays the
--   model's raw output; plan_items is the queryable schedule the founder
--   actually rearranges (dates, posting status, drag-to-reschedule).
-- ---------------------------------------------------------------------------
create table if not exists public.plan_items (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  plan_id uuid not null references public.marketing_plans (id) on delete cascade,
  platform text not null
    check (platform in ('reddit', 'x', 'instagram', 'discord', 'youtube')),
  -- Stable identity of the row inside plan_json ("3-2" = week 3, item 2).
  -- Extended weeks use an "x-" prefix so they never collide with plan output.
  source_key text not null,
  week integer not null default 1,
  day text,
  type text,
  title_or_hook text not null,
  details text,
  effort_minutes integer,
  scheduled_date date,
  posted_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (plan_id, source_key)
);

create index if not exists plan_items_project_date_idx
  on public.plan_items (project_id, scheduled_date);
create index if not exists plan_items_project_platform_idx
  on public.plan_items (project_id, platform, scheduled_date);

alter table public.plan_items enable row level security;

drop policy if exists "plan_items_all_own" on public.plan_items;
create policy "plan_items_all_own" on public.plan_items
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- post_drafts
--   One live draft per calendar item (regenerating replaces it). Generated on
--   demand — never in bulk — so Groq spend stays tied to founder intent.
-- ---------------------------------------------------------------------------
create table if not exists public.post_drafts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  plan_item_id uuid references public.plan_items (id) on delete set null,
  platform text not null
    check (platform in ('reddit', 'x', 'instagram', 'discord', 'youtube')),
  draft_content text not null,
  status text not null default 'draft'
    check (status in ('draft', 'approved', 'posted')),
  model_used text,
  prompt_version text,
  generated_at timestamptz not null default now(),
  edited_at timestamptz,
  posted_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists post_drafts_plan_item_unique
  on public.post_drafts (plan_item_id)
  where plan_item_id is not null;
create index if not exists post_drafts_project_idx
  on public.post_drafts (project_id, generated_at desc);

alter table public.post_drafts enable row level security;

drop policy if exists "post_drafts_all_own" on public.post_drafts;
create policy "post_drafts_all_own" on public.post_drafts
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- post_feedback
--   "How did this go?" — the founder's free-text outcome plus optional loose
--   numbers. Recent rows are fed back into plan and draft generation.
-- ---------------------------------------------------------------------------
create table if not exists public.post_feedback (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  plan_item_id uuid references public.plan_items (id) on delete set null,
  post_draft_id uuid references public.post_drafts (id) on delete set null,
  platform text not null
    check (platform in ('reddit', 'x', 'instagram', 'discord', 'youtube')),
  outcome_text text not null,
  outcome_metric jsonb,
  submitted_at timestamptz not null default now()
);

create index if not exists post_feedback_project_idx
  on public.post_feedback (project_id, submitted_at desc);

alter table public.post_feedback enable row level security;

drop policy if exists "post_feedback_all_own" on public.post_feedback;
create policy "post_feedback_all_own" on public.post_feedback
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- checkins
--   Weekly "what did you post, and how did it go?" prompts. The scheduled job
--   writes these with the service role; the founder's reply lands here, feeds
--   the same feedback context and triggers next week's plan.
-- ---------------------------------------------------------------------------
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  -- Monday of the week the prompt covers.
  week_start_date date not null,
  prompt_text text not null,
  prompt_sent_at timestamptz not null default now(),
  founder_response text,
  response_received_at timestamptz,
  next_week_plan_generated boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, week_start_date)
);

create index if not exists checkins_project_idx
  on public.checkins (project_id, week_start_date desc);
create index if not exists checkins_open_idx
  on public.checkins (project_id) where founder_response is null;

alter table public.checkins enable row level security;

drop policy if exists "checkins_all_own" on public.checkins;
create policy "checkins_all_own" on public.checkins
  for all using (public.is_project_owner(project_id))
  with check (public.is_project_owner(project_id));

-- ---------------------------------------------------------------------------
-- updated_at touch trigger
-- ---------------------------------------------------------------------------
create extension if not exists moddatetime;

drop trigger if exists plan_items_updated_at on public.plan_items;
create trigger plan_items_updated_at before update on public.plan_items
  for each row execute function moddatetime (updated_at);

-- ---------------------------------------------------------------------------
-- Scheduling the weekly check-in job
-- ---------------------------------------------------------------------------
-- The job itself is POST /api/cron/checkins (see src/app/api/cron/checkins) and
-- is already scheduled through vercel.json. If you'd rather drive it from
-- Supabase, deploy the `weekly-checkins` Edge Function (it calls that route) and
-- schedule it with pg_cron + pg_net once those extensions are enabled:
--
--   select cron.schedule(
--     'markoby-weekly-checkins',
--     '0 14 * * 1',                                    -- Mondays, 14:00 UTC
--     $$
--       select net.http_post(
--         url     := 'https://<your-app-domain>/api/cron/checkins',
--         headers := jsonb_build_object('Authorization', 'Bearer <CRON_SECRET>')
--       );
--     $$
--   );
