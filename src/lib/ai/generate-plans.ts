import "server-only";

import { generatePlan } from "@/lib/ai/groq";
import {
  ensurePlanItemsForProject,
  syncPlanItemsForPlan,
} from "@/lib/content/plan-items";
import { loadProjectGenerationContext } from "@/lib/content/summary";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Background job: generates a marketing plan for every platform row that is
 * still pending, using the onboarding_summary as grounding. Runs via after()
 * so the founder's navigation isn't blocked; the project page polls plan
 * status and shows a "generating…" state per platform.
 *
 * Each plan that lands ready is immediately normalized into `plan_items` so the
 * content calendar has real, queryable, date-bearing rows.
 */
export async function kickOffPlanGeneration(projectId: string, userId: string) {
  const supabase = await createAdminClient();

  const [loaded, { data: plans }] = await Promise.all([
    loadProjectGenerationContext(projectId),
    supabase
      .from("marketing_plans")
      .select("id, platform, status")
      .eq("project_id", projectId),
  ]);

  if (!loaded) {
    for (const plan of plans ?? []) {
      await supabase
        .from("marketing_plans")
        .update({ status: "failed", error: "No onboarding summary found for this project." })
        .eq("id", plan.id);
    }
    return;
  }

  const pending = (plans ?? []).filter((p) => p.status !== "ready");

  for (const plan of pending) {
    await supabase
      .from("marketing_plans")
      .update({ status: "generating", error: null })
      .eq("id", plan.id);

    try {
      const result = await generatePlan(
        plan.platform,
        loaded.summary,
        userId,
        loaded.context,
      );
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

      // Turn the fresh plan_json into real calendar rows with suggested dates.
      await syncPlanItemsForPlan({
        projectId,
        planId: plan.id,
        platform: plan.platform,
        planJson: result.planJson,
      });
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

  // Plans that were already ready (regeneration re-runs, plans generated before
  // the calendar existed) still need their rows.
  try {
    await ensurePlanItemsForProject(projectId);
  } catch (err) {
    console.error("[plans] calendar sync failed:", err);
  }

  // Plans done → run prospect discovery where the platform APIs allow it.
  try {
    const { discoverProspectsForProject } = await import("@/lib/ai/discover-prospects");
    await discoverProspectsForProject(projectId, userId, loaded.summary);
  } catch (err) {
    console.error("[plans] prospect discovery failed:", err);
  }
}
