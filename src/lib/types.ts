export type Platform = "reddit" | "x" | "instagram" | "discord" | "youtube";

export type SubscriptionStatus = "inactive" | "active" | "past_due" | "canceled";

export type ProjectStatus = "onboarding" | "plan_ready" | "active";

export type Profile = {
  id: string;
  email: string;
  full_name: string | null;
  created_at: string;
};

export type Subscription = {
  id: string;
  user_id: string;
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
  status: SubscriptionStatus;
  current_period_end: string | null;
  updated_at: string;
};

export type Project = {
  id: string;
  user_id: string;
  name: string;
  website_url: string | null;
  website_context: string | null;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
};

export type OnboardingMessage = {
  id: string;
  project_id: string;
  role: "assistant" | "user";
  content: string;
  created_at: string;
};

export type OnboardingSummaryRow = {
  id: string;
  project_id: string;
  business_description: string;
  target_audience: string;
  value_prop: string;
  tone_of_voice: string;
  constraints: string | null;
  /** Lightweight scan of the competitor sites the founder named. */
  competitor_notes: string | null;
  raw_json: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};

export type ProjectPlatform = {
  id: string;
  project_id: string;
  platform: Platform;
  enabled_at: string;
};

export type PlanStatus = "pending" | "generating" | "ready" | "failed";

export type MarketingPlan = {
  id: string;
  project_id: string;
  platform: Platform;
  status: PlanStatus;
  plan_json: PlanJSONData | null;
  model_used: string | null;
  prompt_version: string | null;
  error: string | null;
  generated_at: string | null;
  created_at: string;
};

export type ProspectStatus = "new" | "contacted" | "ignored";

export type Prospect = {
  id: string;
  project_id: string;
  platform: Platform;
  external_handle_or_url: string;
  display_name: string | null;
  relevance_reason: string | null;
  relevance_score: number | null;
  context_excerpt: string | null;
  source_type: "api" | "guide";
  status: ProspectStatus;
  discovered_at: string;
};

// ── Content operations (migration 0002) ────────────────────────────────────

/** A single scheduled calendar item, normalized out of plan_json. */
export type PlanItem = {
  id: string;
  project_id: string;
  plan_id: string;
  platform: Platform;
  /** Stable identity inside plan_json ("3-2"); extended weeks use "x-…". */
  source_key: string;
  week: number;
  day: string | null;
  type: string | null;
  title_or_hook: string;
  details: string | null;
  effort_minutes: number | null;
  /** "YYYY-MM-DD" or null when the founder unscheduled it. */
  scheduled_date: string | null;
  posted_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type DraftStatus = "draft" | "approved" | "posted";

export type PostDraft = {
  id: string;
  project_id: string;
  plan_item_id: string | null;
  platform: Platform;
  draft_content: string;
  status: DraftStatus;
  model_used: string | null;
  prompt_version: string | null;
  generated_at: string;
  edited_at: string | null;
  posted_at: string | null;
  created_at: string;
};

/** Loose self-reported numbers the founder doesn't have to fill in. */
export type OutcomeMetric = {
  likes?: number;
  comments?: number;
  signups?: number;
};

export type PostFeedback = {
  id: string;
  project_id: string;
  plan_item_id: string | null;
  post_draft_id: string | null;
  platform: Platform;
  outcome_text: string;
  outcome_metric: OutcomeMetric | null;
  submitted_at: string;
};

export type Checkin = {
  id: string;
  project_id: string;
  week_start_date: string;
  prompt_text: string;
  prompt_sent_at: string;
  founder_response: string | null;
  response_received_at: string | null;
  next_week_plan_generated: boolean;
  created_at: string;
};

export type PlanJSONData = {
  platform: string;
  strategy_summary: string;
  content_pillars: { name: string; description: string; post_types: string[] }[];
  posting_cadence: string;
  content_calendar: {
    week: number;
    items: {
      day: string;
      type: string;
      title_or_hook: string;
      details: string;
      effort_minutes: number;
    }[];
  }[];
  communities: {
    name: string;
    why: string;
    how_to_engage: string;
    rules_to_respect: string;
  }[];
  hashtags_or_keywords: { term: string; use: string }[];
  dos: string[];
  donts: string[];
  kpi_suggestions: string[];
  first_post_draft: string;
};
