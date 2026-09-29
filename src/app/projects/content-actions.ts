"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { isNextControlFlowError, getUserWithSubscription } from "@/lib/auth";
import {
  createDraftForItem,
  extendPlanByWeek,
} from "@/lib/content/generate-content";
import {
  ensureCheckinForProject,
  markNextWeekGenerated,
  recordCheckinResponse,
  type EnsureCheckinResult,
} from "@/lib/content/checkins";
import { ensurePlanItemsForProject } from "@/lib/content/plan-items";
import { getProject } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import type { Checkin, DraftStatus, OutcomeMetric, PlanItem, PostDraft } from "@/lib/types";

/**
 * Content-loop actions: generate/edit/approve a draft, drag a calendar item to
 * a new date, report how a post did, and answer the weekly check-in.
 *
 * Every mutation goes through the user-scoped client wherever RLS can enforce
 * ownership, and proves ownership with that client before delegating to a
 * service-role helper (draft generation, calendar backfill, week extension).
 */

async function requireUser() {
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login?next=/dashboard");
  return user;
}

async function refreshProject(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
  revalidatePath(`/projects/${projectId}/calendar`);
  revalidatePath(`/projects/${projectId}/progress`);
  revalidatePath("/dashboard");
}

// ── drafts ──────────────────────────────────────────────────────────────────

export type DraftActionResult =
  | { ok: true; draft: PostDraft }
  | { ok: false; error: string };

export async function generateDraftForItem(planItemId: string): Promise<DraftActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  // RLS-scoped read doubles as the ownership proof for the service-role call.
  const { data: item } = await supabase
    .from("plan_items")
    .select("id, project_id")
    .eq("id", planItemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "That calendar item is not available." };

  const result = await createDraftForItem(planItemId, user.id);
  if (result.ok) await refreshProject((item as { project_id: string }).project_id);
  return result;
}

export async function saveDraftContent(
  draftId: string,
  content: string,
): Promise<DraftActionResult> {
  await requireUser();
  const text = content.trim();
  if (!text) return { ok: false, error: "A draft can't be empty." };
  if (text.length > 20_000) return { ok: false, error: "That draft is too long to save." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("post_drafts")
    .update({ draft_content: text, edited_at: new Date().toISOString() })
    .eq("id", draftId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not save the draft." };

  await refreshProject((data as PostDraft).project_id);
  return { ok: true, draft: data as PostDraft };
}

export async function setDraftStatus(
  draftId: string,
  status: DraftStatus,
): Promise<DraftActionResult> {
  await requireUser();
  const supabase = await createClient();

  const patch: Record<string, unknown> = { status };
  if (status === "posted") patch.posted_at = new Date().toISOString();
  if (status === "draft") patch.posted_at = null;

  const { data, error } = await supabase
    .from("post_drafts")
    .update(patch)
    .eq("id", draftId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not update the draft." };

  const draft = data as PostDraft;

  // Approving/marking a draft posted is also the signal that the calendar item
  // itself went out; keep the two in sync so the dashboard counts stay honest.
  if (draft.plan_item_id && (status === "posted" || status === "draft")) {
    await supabase
      .from("plan_items")
      .update({ posted_at: status === "posted" ? new Date().toISOString() : null })
      .eq("id", draft.plan_item_id);
  }

  await refreshProject(draft.project_id);
  return { ok: true, draft };
}

// ── calendar ────────────────────────────────────────────────────────────────

export type ItemActionResult =
  | { ok: true; item: PlanItem }
  | { ok: false; error: string };

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function reschedulePlanItem(
  planItemId: string,
  dateISO: string | null,
): Promise<ItemActionResult> {
  await requireUser();
  if (dateISO !== null && !ISO_DATE.test(dateISO)) {
    return { ok: false, error: "That date doesn't look right." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("plan_items")
    .update({ scheduled_date: dateISO })
    .eq("id", planItemId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not move that item." };

  await refreshProject((data as PlanItem).project_id);
  return { ok: true, item: data as PlanItem };
}

export async function markItemPosted(
  planItemId: string,
  posted: boolean,
): Promise<ItemActionResult> {
  await requireUser();
  const supabase = await createClient();
  const postedAt = posted ? new Date().toISOString() : null;

  const { data, error } = await supabase
    .from("plan_items")
    .update({ posted_at: postedAt })
    .eq("id", planItemId)
    .select("*")
    .single();
  if (error || !data) return { ok: false, error: error?.message ?? "Could not update that item." };

  const item = data as PlanItem;

  // Keep a linked draft's status aligned so "approved" doesn't linger after the
  // founder says it went out.
  const { data: draft } = await supabase
    .from("post_drafts")
    .select("id, status")
    .eq("plan_item_id", planItemId)
    .maybeSingle();
  const draftRow = draft as { id: string; status: DraftStatus } | null;
  if (draftRow) {
    if (posted && draftRow.status !== "posted") {
      await supabase
        .from("post_drafts")
        .update({ status: "posted", posted_at: postedAt })
        .eq("id", draftRow.id);
    } else if (!posted && draftRow.status === "posted") {
      await supabase
        .from("post_drafts")
        .update({ status: "draft", posted_at: null })
        .eq("id", draftRow.id);
    }
  }

  await refreshProject(item.project_id);
  return { ok: true, item };
}

/** Backfill/refresh the calendar rows for every ready plan of a project. */
export async function syncCalendar(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  try {
    await ensurePlanItemsForProject(projectId);
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    console.error("[calendar] sync failed:", err);
    return { ok: false, error: "Could not build the calendar. Try again." };
  }
  await refreshProject(projectId);
  return { ok: true };
}

// ── performance feedback ────────────────────────────────────────────────────

export async function submitPostFeedback(input: {
  planItemId: string;
  outcomeText: string;
  metric?: OutcomeMetric;
}): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const text = input.outcomeText.trim();
  if (text.length < 2) return { ok: false, error: "Tell us a little about what happened." };
  if (text.length > 4000) return { ok: false, error: "Keep it under 4000 characters." };

  const supabase = await createClient();
  const { data: item } = await supabase
    .from("plan_items")
    .select("id, project_id, platform, posted_at")
    .eq("id", input.planItemId)
    .maybeSingle();
  if (!item) return { ok: false, error: "That calendar item is not available." };

  const planItem = item as Pick<
    PlanItem,
    "id" | "project_id" | "platform" | "posted_at"
  >;

  const { data: draft } = await supabase
    .from("post_drafts")
    .select("id")
    .eq("plan_item_id", planItem.id)
    .maybeSingle();

  const metric = sanitiseMetric(input.metric);
  const now = new Date().toISOString();
  const draftId = (draft as { id: string } | null)?.id ?? null;

  // Explicit update-or-insert: the unique index on plan_item_id is partial
  // (`where plan_item_id is not null`), which an ON CONFLICT target can't match.
  const { data: existing } = await supabase
    .from("post_feedback")
    .select("id")
    .eq("plan_item_id", planItem.id)
    .maybeSingle();

  if (existing) {
    const { error: updateError } = await supabase
      .from("post_feedback")
      .update({
        outcome_text: text,
        outcome_metric: metric,
        submitted_at: now,
        post_draft_id: draftId,
      })
      .eq("id", (existing as { id: string }).id);
    if (updateError) return { ok: false, error: updateError.message };
  } else {
    const { error: insertError } = await supabase.from("post_feedback").insert({
      project_id: planItem.project_id,
      plan_item_id: planItem.id,
      post_draft_id: draftId,
      platform: planItem.platform,
      outcome_text: text,
      outcome_metric: metric,
    });
    if (insertError) return { ok: false, error: insertError.message };
  }

  // Reporting an outcome means the post went out.
  if (!planItem.posted_at) {
    await supabase.from("plan_items").update({ posted_at: now }).eq("id", planItem.id);
  }

  await refreshProject(planItem.project_id);
  return { ok: true };
}

function sanitiseMetric(metric: OutcomeMetric | undefined): OutcomeMetric | null {
  if (!metric) return null;
  const clean: OutcomeMetric = {};
  for (const key of ["likes", "comments", "signups"] as const) {
    const value = metric[key];
    if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
      clean[key] = Math.round(value);
    }
  }
  return Object.keys(clean).length > 0 ? clean : null;
}

// ── weekly check-ins ────────────────────────────────────────────────────────

export async function ensureWeeklyCheckin(
  projectId: string,
): Promise<EnsureCheckinResult> {
  await requireUser();
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const result = await ensureCheckinForProject(projectId);
  if (result.ok) await refreshProject(projectId);
  return result;
}

export type CheckinSubmitResult = { ok: true } | { ok: false; error: string };

export async function submitCheckinResponse(
  checkinId: string,
  response: string,
): Promise<CheckinSubmitResult> {
  const user = await requireUser();
  const supabase = await createClient();

  // RLS-scoped read: proves the check-in belongs to this founder.
  const { data: checkin } = await supabase
    .from("checkins")
    .select("id, project_id, founder_response")
    .eq("id", checkinId)
    .maybeSingle();
  if (!checkin) return { ok: false, error: "That check-in is not available." };

  const row = checkin as Pick<Checkin, "id" | "project_id" | "founder_response">;
  const saved = await recordCheckinResponse(row.id, response);
  if (!saved.ok) return saved;

  await refreshProject(row.project_id);

  // Roll the calendar forward in the background: the founder's update becomes
  // new context and one more week of items.
  after(async () => {
    try {
      const result = await extendPlanByWeek(row.project_id, user.id);
      if (result.ok) {
        await markNextWeekGenerated(row.id);
        revalidatePath(`/projects/${row.project_id}/calendar`);
      } else {
        console.warn("[checkins] week extension skipped:", result.error);
      }
    } catch (err) {
      console.error("[checkins] week extension failed:", err);
    }
  });

  return { ok: true };
}
