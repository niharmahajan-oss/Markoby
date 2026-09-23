/** Shared types for the AI layer and generated artifacts. */

export type Platform = "reddit" | "x" | "instagram" | "discord" | "youtube";

export const PLATFORMS: Platform[] = ["reddit", "x", "instagram", "discord", "youtube"];

export const PLATFORM_META: Record<
  Platform,
  { label: string; prospectDiscovery: "api" | "guide" }
> = {
  reddit: { label: "Reddit", prospectDiscovery: "api" },
  x: { label: "X (Twitter)", prospectDiscovery: "guide" },
  instagram: { label: "Instagram", prospectDiscovery: "guide" },
  discord: { label: "Discord", prospectDiscovery: "guide" },
  youtube: { label: "YouTube", prospectDiscovery: "api" },
};

export type OnboardingSummaryData = {
  business_description: string;
  target_audience: string;
  value_prop: string;
  stage_traction_pricing: string;
  tone_of_voice: string;
  previous_attempts: string;
  constraints: string;
  goals: string;
};

export type PlanWeekItem = {
  day: string;
  type: string;
  title_or_hook: string;
  details: string;
  effort_minutes: number;
};

export type PlanWeek = { week: number; items: PlanWeekItem[] };

export type PlanCommunity = {
  name: string;
  why: string;
  how_to_engage: string;
  rules_to_respect: string;
};

export type PlanJSON = {
  platform: string;
  strategy_summary: string;
  content_pillars: { name: string; description: string; post_types: string[] }[];
  posting_cadence: string;
  content_calendar: PlanWeek[];
  communities: PlanCommunity[];
  hashtags_or_keywords: { term: string; use: string }[];
  dos: string[];
  donts: string[];
  kpi_suggestions: string[];
  first_post_draft: string;
};

export type ProspectCandidate = {
  platform: Platform;
  title: string;
  url: string;
  community?: string;
  excerpt?: string;
};

export type ScoredProspect = { relevance_score: number; relevance_reason: string };
