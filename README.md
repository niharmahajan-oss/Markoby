# Markoby

**Your AI growth marketer for the zero-ad-budget era.**

Markoby interviews early-stage founders about their product, then generates
platform-native organic marketing plans and surfaces real prospects on
Reddit, X (Twitter), Instagram, Discord, and YouTube. Single plan:
**₹299/month** via Razorpay. **The first project is free** — no card needed;
the paid plan is what unlocks creating more projects.

## Stack

| Layer      | Tech                                                                   |
| ---------- | ---------------------------------------------------------------------- |
| Frontend   | Next.js 16 (App Router) · TypeScript · Tailwind v4 · shadcn/ui (Base UI) |
| Backend    | Supabase — Postgres + RLS, Auth (email/password), Edge Functions       |
| AI         | Groq (`openai/gpt-oss-120b` primary, `openai/gpt-oss-20b` scoring) — OpenAI-compatible |
| Payments   | Razorpay Subscriptions + Checkout + webhooks (INR, ₹299/month)         |
| Free trial | `FREE_TRIAL_PROJECTS` in `src/lib/auth.ts` (1 project, no card)        |
| Background | `after()` jobs on the server (plan generation, prospect discovery)     |
| Retention  | Weekly check-in job (`/api/cron/checkins` + Vercel Cron) + optional email |
| Hosting    | Vercel (app) + Supabase (backend)                                      |

## Data model

`profiles`, `subscriptions`, `projects`, `onboarding_messages`,
`onboarding_summary`, `project_platforms`, `marketing_plans`, `prospects`,
`usage_events` (`supabase/migrations/0001_init.sql`) plus the content-ops
tables `plan_items`, `post_drafts`, `post_feedback`, `checkins`
(`supabase/migrations/0002_content_ops.sql`). RLS on every table; users can
only touch rows scoped to `auth.uid()` (via `user_id` or the
`is_project_owner()` helper on child tables).

`marketing_plans.plan_json.content_calendar` stays the model's raw output;
`plan_items` is the queryable schedule the founder actually rearranges (dates,
posting status, drag-to-reschedule). Rows are normalized on generation and
backfilled lazily the first time a project's calendar is opened, so plans
generated before this migration still get a schedule.

`post_feedback` can only be uniquely tied to one calendar item, so that unique
index is **partial** (`where plan_item_id is not null`) — PostgREST can't target
a partial index in `upsert`, which is why those writes are explicit
select-then-update-or-insert.

## AI design notes

- **All Groq calls are server-side only** (`src/lib/ai/groq.ts`); the key
  never reaches the client.
- Purpose-built prompts per task (no mega-prompt): interviewer, extractor,
  one plan prompt **per platform** (Reddit strategy ≠ Instagram strategy),
  and relevance scoring. Versions tracked in `PROMPT_VERSIONS`.
- The onboarding interview streams token-by-token over NDJSON from a route
  handler; each turn is persisted so the transcript is durable.
- Plan generation runs as a background job with a polling "generating…" UI.
- Model, prompt version, and token usage are logged to `usage_events` on
  every call.
- The structured `onboarding_summary` — not the raw transcript — grounds
  plan generation and prospect scoring.
- **Drafts are per-platform by design** (`DRAFT_SYSTEM_PROMPTS`): a Reddit
draft must not read like an ad (no slogans, no CTA, product mentioned once at
most), Instagram/YouTube drafts get a hook + caption/outline structure, and a
Discord draft has to fit a real conversation. Generated **on demand only** —
one click, one call — so Groq spend tracks founder intent.
- **Feedback changes the plan.** Recent `post_feedback` rows and check-in
replies are compiled into one digest (`src/lib/content/feedback.ts`) that plan
generation, draft generation and week extension all receive. When feedback is
present the plan prompt is explicitly told to adapt and to say so in
`strategy_summary`.
- **Competitor scan is honest.** During wrap-up the app optionally fetches the
public landing pages of up to two named competitors (same reader as the
founder's own site drop, 6s timeout each, in parallel) and stores a short
`competitor_notes` summary. The prompt is told to treat it as light context and
never to state anything beyond those notes — and the UI says it's a lightweight
scan, not competitive research.
- **Weekly extension.** Answering a check-in generates one more week of items
per ready platform (`generateWeekItems`), placed after that platform's last
scheduled date so parallel platforms neither overlap nor leave holes.

## Prospect discovery: honest by design

Official APIs only, degrading gracefully where platforms don't allow search:

- **Reddit** — official API (script app, free 100 QPM OAuth tier): search
  posts matching the founder's audience, scored by Groq.
- **YouTube** — official Data API v3 (free 10,000 units/day, 100/search):
  search recent videos, scored by Groq.
- **X / Instagram / Discord** — no usable public search API (X is paywalled;
  Instagram/Discord have none). The product says so plainly and delivers a
  **targeting guide** instead of a fake auto-populated list.

No scraping. No ToS circumvention.

## Setup

### 1. Install

```bash
npm install
cp .env.example .env.local   # fill in everything below
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. SQL Editor → paste and run `supabase/migrations/0001_init.sql`, then
   `supabase/migrations/0002_content_ops.sql` (or `supabase link && supabase db push`).
   Both files are guarded (`if not exists` / `drop … if exists`), so re-running
   one after a partial failure is safe.
3. Auth → Providers → Email: disable "Confirm email" for the fastest
   first-run experience (keep it on for production).
4. Project Settings → API → copy URL + anon key + service_role key.

```bash
npx supabase gen types typescript --project-id <ref> > src/lib/supabase/database.types.ts
```

### 3. Groq

Create a key at [console.groq.com/keys](https://console.groq.com/keys) →
`GROQ_API_KEY`. Model IDs live in `src/lib/ai/models.ts` — verify against
[console.groq.com/docs/models](https://console.groq.com/docs/models) when
upgrading.

### 4. Razorpay

1. Dashboard → Settings → API Keys → generate test keys.
2. Create a **recurring** monthly plan: ₹299 (29900 paise), INR → copy the
   `plan_...` id.
3. Settings → Webhooks → add
   `https://<ref>.supabase.co/functions/v1/razorpay-webhook`, subscribe to
   `subscription.*` events, set a secret.
4. Deploy the webhook:

```bash
supabase functions deploy razorpay-webhook
supabase secrets set RAZORPAY_WEBHOOK_SECRET=... RAZORPAY_KEY_SECRET=...
```

The webhook is the source of truth for subscription status; the app also
optimistically activates after Checkout signature verification so founders
aren't blocked on webhook latency.

**Retrying a payment.** `startSubscription()` reuses the stored
`razorpay_customer_id` / `razorpay_subscription_id` instead of creating new
ones, so closing Checkout and trying again resumes the same mandate. Razorpay
throttles bursts of API calls and reports that as `401 Authentication failed`,
which is why the billing helpers retry transient failures with backoff and
the real provider message is surfaced in the UI rather than a generic error.

Two traps worth knowing:

1. Razorpay rejects a second customer for the same email with *"Customer
already exists for the merchant"* — customer creation therefore passes
`fail_existing: "0"` so it returns the existing customer instead of failing
(the old behaviour made the first checkout work and every retry after it fail).
2. Billing writes use the **service-role** client. `subscriptions` has no
user-facing UPDATE policy (so nobody can self-activate), and a user-scoped
write is silently discarded: Supabase answers `200` with an empty array and no
error. Reads/writes that must not vanish go through `createAdminClient()`.

Every checkout attempt is recorded in `usage_events` (`billing_subscription_created`,
`billing_activated`, `billing_error` with the provider's message), so payment
problems can be diagnosed after the fact instead of from a screenshot.

**Free trial.** `FREE_TRIAL_PROJECTS` (in `src/lib/auth.ts`) controls how many
projects a signed-in user can create before a subscription is required. It is
enforced server-side in `createProject()`, and the dashboard, new-project and
subscribe pages all reflect the trial state.

### 5. Weekly check-ins (the retention loop)

The job lives once, at `POST /api/cron/checkins`, and refuses to run without
`CRON_SECRET` (it returns 503 rather than acting as an unauthenticated way to
email every founder). Two ways to schedule it:

- **Vercel Cron** — already declared in `vercel.json` (Mondays, 14:00 UTC).
  Set `CRON_SECRET` on the project and Vercel sends it as a bearer token.
- **Supabase Edge Function** — deploy `weekly-checkins` and schedule it with
  `pg_cron` + `pg_net` (a ready-to-paste snippet is at the bottom of
  `0002_content_ops.sql`); it simply calls the same route with the same secret.

For each active project the job writes this week's prompt, emails the founder
if `RESEND_API_KEY` is set (email is optional — the in-app card on the calendar
and dashboard works without it), and records a **churn signal** in
`usage_events` (`checkin.churn_risk`) after two consecutive unanswered weeks.
That signal is internal only; the founder is never told they're being scored.

### 6. Prospect APIs (optional, both free)

- **Reddit**: create a *script* app at reddit.com/prefs/apps →
  `REDDIT_CLIENT_ID` / `REDDIT_CLIENT_SECRET`.
- **YouTube**: enable YouTube Data API v3 in Google Cloud → create an API
  key → `YOUTUBE_API_KEY`.

Without these, Reddit/YouTube prospect discovery is skipped gracefully;
plans and guides still work.

### 7. Run

```bash
npm run dev        # http://localhost:3000
npm run build      # production build
```

## Core loop

Sign up → free project (no card) → New Project (optional website drop — the
site is fetched and parsed server-side to sharpen the interview) → AI
interview (adaptive, streamed; ends with an optional "any competitors?" beat) →
structured summary extracted (+ competitor scan) → pick platforms →
per-platform plans generated in the background → plan items normalized into a
dated calendar → generate a draft per item on demand, edit it, approve it, mark
it posted → report how it went → the next plan adapts → weekly check-in keeps
the rhythm and rolls the calendar forward a week → progress dashboard shows the
rollup (no AI calls). Prospect lists + targeting guides live alongside, with
mark contacted / ignore. Creating a second project needs the ₹299/month plan;
every project after that is included (no per-project add-on price).

Three surfaces per project, linked by the shared nav: **Plans** (strategy,
calendar source, prospects), **Calendar** (schedule + drafts + feedback +
check-ins) and **Progress** (stat cards, 8-week trend, per-platform rollup).

## Deploy

- **Vercel**: import the repo, add all `NEXT_PUBLIC_*` and server env vars
  (including `CRON_SECRET` — without it `/api/cron/checkins` refuses to run and
  `/api/health` reports `ok: false`).
- **Supabase**: run both migrations; deploy the `razorpay-webhook` function and
  (optionally) `weekly-checkins`.
- Point Razorpay webhooks at the deployed function URL.
- `GET /api/health` is the fastest way to confirm a deployment is wired up:
it reports supabase, service role, groq, razorpay, cron and the optional
check-in email key.
