import "server-only";

import { generatePlan } from "@/lib/ai/groq";
import type { OnboardingSummaryData } from "@/lib/ai/types";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Background job: generates a marketing plan for every platform row that is
 * still pending, using the onboarding_summary as grounding. Runs via after()
 * so the founder's navigation isn't blocked; the project page polls plan
 * status and shows a "generating…" state per platform.
 */
export async function kickOffPlanGeneration(projectId: string, userId: string) {
  const supabase = await createAdminClient();

  const { data: summaryRow } = await supabase
    .from("onboarding_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();

  const { data: plans } = await supabase
    .from("marketing_plans")
    .select("id, platform, status")
    .eq("project_id", projectId);

  if (!summaryRow) {
    for (const plan of plans ?? []) {
      await supabase
        .from("marketing_plans")
        .update({ status: "failed", error: "No onboarding summary found for this project." })
        .eq("id", plan.id);
    }
    return;
  }

  const raw = summaryRow.raw_json;
  const summary: OnboardingSummaryData = {
    business_description: summaryRow.business_description,
    target_audience: summaryRow.target_audience,
    value_prop: summaryRow.value_prop,
    tone_of_voice: summaryRow.tone_of_voice,
    constraints: summaryRow.constraints ?? "",
    stage_traction_pricing: (raw as unknown as OnboardingSummaryData | null)?.stage_traction_pricing ?? "",
    previous_attempts: (raw as unknown as OnboardingSummaryData | null)?.previous_attempts ?? "",
    goals: (raw as unknown as OnboardingSummaryData | null)?.goals ?? "",
  };

  const pending = (plans ?? []).filter((p) => p.status !== "ready");

  for (const plan of pending) {
    await supabase
      .from("marketing_plans")
      .update({ status: "generating", error: null })
      .eq("id", plan.id);

    try {
      const result = await generatePlan(plan.platform, summary, userId);
      if (!result) throw new Error("Model returned unparseable JSON");

      const { error } = await supabase
        .from("marketing_plans")
        .update({
          status: "ready",
          plan_json: result.planJson as Record<string, unknown>,
          model_used: result.modelUsed,
          prompt_version: result.promptVersion,
          generated_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", plan.id);
      if (error) throw new Error(error.message);
    } catch (err) {
      console.error(`[plans] generation failed for ${plan.platform}:`, err);
      await supabase
        .from("marketing_plans")
        .update({
          status: "failed",
          error: err instanceof Error ? err.message : "Unknown generation error",
        })
        .eq("id", plan.id);
    }
  }

  // Plans done → run prospect discovery where the platform APIs allow it.
  try {
    const { discoverProspectsForProject } = await import("@/lib/ai/discover-prospects");
    await discoverProspectsForProject(projectId, userId, summary);
  } catch (err) {
    console.error("[plans] prospect discovery failed:", err);
  }
}
