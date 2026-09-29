import "server-only";

import { generateDraft, generateWeekItems } from "@/lib/ai/groq";
import type { PlanJSON } from "@/lib/ai/types";
import {
  addDaysISO,
  existingTitlesForPlan,
  insertExtendedWeek,
  lastScheduledDateForPlan,
  maxWeekForPlan,
  mondayOfISO,
  todayISODate,
} from "@/lib/content/plan-items";
import { loadProjectGenerationContext } from "@/lib/content/summary";
import { createAdminClient } from "@/lib/supabase/server";
import type { PlanItem, PostDraft } from "@/lib/types";

/**
 * The two write-side operations of the content loop:
 *
 *  1. createDraftForItem — one Groq call for one calendar item, only when the
 *     founder asks for it (cost control).
 *  2. extendPlanByWeek — turn a weekly check-in reply into next week's items.
 */

export type DraftResult =
  | { ok: true; draft: PostDraft }
  | { ok: false; error: string };

export async function createDraftForItem(
  planItemId: string,
  userId: string,
): Promise<DraftResult> {
  const supabase = await createAdminClient();

  const { data: item, error: itemError } = await supabase
    .from("plan_items")
    .select("*")
    .eq("id", planItemId)
    .maybeSingle();
  if (itemError) return { ok: false, error: itemError.message };
  if (!item) return { ok: false, error: "That calendar item no longer exists." };

  const planItem = item as PlanItem;
  const loaded = await loadProjectGenerationContext(planItem.project_id);
  if (!loaded) {
    return {
      ok: false,
      error: "This project has no interview summary yet — finish the interview first.",
    };
  }

  let generated;
  try {
    generated = await generateDraft({
      item: {
        platform: planItem.platform,
        week: planItem.week,
        day: planItem.day,
        type: planItem.type,
        title_or_hook: planItem.title_or_hook,
        details: planItem.details,
        effort_minutes: planItem.effort_minutes,
        scheduled_date: planItem.scheduled_date,
      },
      summary: loaded.summary,
      userId,
      context: loaded.context,
    });
  } catch (err) {
    console.error("[drafts] generation failed:", err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Draft generation failed. Try again.",
    };
  }
  if (!generated) {
    return { ok: false, error: "The model returned an empty draft. Try again." };
  }

  const { data: existing } = await supabase
    .from("post_drafts")
    .select("id, status")
    .eq("plan_item_id", planItemId)
    .maybeSingle();
  const current = existing as Pick<PostDraft, "id" | "status"> | null;

  const payload = {
    project_id: planItem.project_id,
    plan_item_id: planItemId,
    platform: planItem.platform,
    draft_content: generated.content,
    status: current?.status === "posted" ? "posted" : "draft",
    model_used: generated.modelUsed,
    prompt_version: generated.promptVersion,
    generated_at: new Date().toISOString(),
    edited_at: null,
  };

  // Explicit update-or-insert: the unique index on plan_item_id is partial
  // (`where plan_item_id is not null`), which PostgREST's upsert can't target.
  const query = current
    ? supabase.from("post_drafts").update(payload).eq("id", current.id)
    : supabase.from("post_drafts").insert(payload);

  const { data: saved, error: saveError } = await query.select("*").single();
  if (saveError || !saved) {
    console.error("[drafts] could not persist draft:", saveError?.message);
    return { ok: false, error: "Could not save the draft. Try again." };
  }

  return { ok: true, draft: saved as PostDraft };
}

export type ExtendWeekResult = { ok: true; itemsAdded: number } | { ok: false; error: string };

/**
 * Generates one more week of calendar items for every ready platform, placed
 * after whatever is already scheduled. Called after a founder answers a weekly
 * check-in so their report visibly changes the plan.
 */
export async function extendPlanByWeek(
  projectId: string,
  userId: string,
): Promise<ExtendWeekResult> {
  const loaded = await loadProjectGenerationContext(projectId);
  if (!loaded) return { ok: false, error: "This project has no interview summary yet." };

  const supabase = await createAdminClient();
  const { data: plans, error } = await supabase
    .from("marketing_plans")
    .select("id, platform, plan_json")
    .eq("project_id", projectId)
    .eq("status", "ready");
  if (error) return { ok: false, error: error.message };
  if (!plans?.length) return { ok: false, error: "There are no ready plans to extend yet." };

  let itemsAdded = 0;

  for (const plan of plans) {
    try {
      const [maxWeek, lastDate, previousTitles] = await Promise.all([
        maxWeekForPlan(plan.id),
        lastScheduledDateForPlan(plan.id),
        existingTitlesForPlan(plan.id),
      ]);

      const plannedWeeks = Array.isArray(
        (plan.plan_json as PlanJSON | null)?.content_calendar,
      )
        ? ((plan.plan_json as PlanJSON).content_calendar?.length ?? 0)
        : 0;
      const weekNumber = Math.max(maxWeek, plannedWeeks) + 1;
      // Continue the timeline after this platform's own last date, so parallel
      // platforms don't leave holes or overlap.
      const startISO = lastDate
        ? addDaysISO(lastDate, 7)
        : mondayOfISO(todayISODate());

      const generated = await generateWeekItems({
        platform: plan.platform,
        summary: loaded.summary,
        weekNumber,
        existingPlan: (plan.plan_json as PlanJSON | null) ?? null,
        previousTitles,
        userId,
        context: loaded.context,
      });
      if (!generated) {
        console.warn(`[week-plan] empty generation for ${plan.platform}`);
        continue;
      }

      itemsAdded += await insertExtendedWeek({
        projectId,
        planId: plan.id,
        platform: plan.platform,
        weekNumber,
        items: generated.items,
        startISO,
      });
    } catch (err) {
      // One platform failing must not lose the others.
      console.error(`[week-plan] ${plan.platform} failed:`, err);
    }
  }

  if (itemsAdded === 0) {
    return { ok: false, error: "Could not generate next week's plan. Try again in a moment." };
  }
  return { ok: true, itemsAdded };
}
