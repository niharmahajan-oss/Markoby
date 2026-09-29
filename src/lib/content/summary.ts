import "server-only";

import type {
  CompetitorMention,
  GenerationContext,
  OnboardingSummaryData,
} from "@/lib/ai/types";
import { buildFeedbackSummary } from "@/lib/content/feedback";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * One loader for everything the AI layer needs about a project: the structured
 * interview summary, the founder's recent performance feedback, and the
 * lightweight competitor scan. Plan generation, draft generation and weekly
 * week-extension all go through here so their context never drifts apart.
 */

export type ProjectGenerationContext = {
  summary: OnboardingSummaryData;
  context: GenerationContext;
};

export function summaryFromRow(row: {
  business_description?: string | null;
  target_audience?: string | null;
  value_prop?: string | null;
  tone_of_voice?: string | null;
  constraints?: string | null;
  raw_json?: unknown;
  competitor_notes?: string | null;
}): OnboardingSummaryData {
  const raw = row.raw_json as OnboardingSummaryData | null;
  const competitors = Array.isArray(raw?.competitors)
    ? (raw?.competitors ?? []).filter(
        (entry): entry is CompetitorMention =>
          Boolean(entry) && typeof (entry as CompetitorMention).name === "string",
      )
    : [];
  return {
    business_description: row.business_description ?? "",
    target_audience: row.target_audience ?? "",
    value_prop: row.value_prop ?? "",
    tone_of_voice: row.tone_of_voice ?? "",
    constraints: row.constraints ?? "",
    stage_traction_pricing: raw?.stage_traction_pricing ?? "",
    previous_attempts: raw?.previous_attempts ?? "",
    goals: raw?.goals ?? "",
    competitors,
  };
}

export async function loadProjectGenerationContext(
  projectId: string,
  options: { includeFeedback?: boolean } = {},
): Promise<ProjectGenerationContext | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("onboarding_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) {
    console.error("[context] could not load onboarding summary:", error.message);
    return null;
  }
  if (!data) return null;

  const summary = summaryFromRow(data);

  let feedbackSummary = "";
  if (options.includeFeedback !== false) {
    feedbackSummary = await buildFeedbackSummary(projectId);
  }

  const context: GenerationContext = {
    feedbackSummary: feedbackSummary || undefined,
    competitorNotes: (data.competitor_notes as string | null) || undefined,
  };

  return { summary, context };
}
