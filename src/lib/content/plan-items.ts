import "server-only";

import type { PlanJSON, PlanWeekItem, Platform } from "@/lib/ai/types";
import { addDaysISO, parseISODate, todayISODate, weekdayIndexFromDay } from "@/lib/calendar";
import { createAdminClient } from "@/lib/supabase/server";
import type { PlanItem } from "@/lib/types";

export {
  addDaysISO,
  mondayOfISO,
  parseISODate,
  toISODate,
  todayISODate,
  weekdayIndexFromDay,
} from "@/lib/calendar";

/**
 * Normalizes `marketing_plans.plan_json.content_calendar` into `plan_items`
 * rows (feature 2) and owns every calendar date calculation.
 *
 * Why a table at all: founders drag items around, mark them posted, and the
 * progress dashboard rolls dates up by week — all of which needs queryable
 * dates rather than nested JSON.
 *
 * All dates are handled as plain "YYYY-MM-DD" strings anchored to UTC midnight
 * so a founder in IST and a server in UTC never disagree about which day an
 * item sits on.
 */

// ── suggested dates ─────────────────────────────────────────────────────────

/**
 * Suggested dates for one generated calendar, keyed `${week}-${index}`.
 *
 * Week 1 starts on `startISO` (today by default). Items that name a weekday are
 * placed on that weekday inside their week window; the rest are spread evenly
 * across the window so a 3-item week doesn't stack up on one day.
 */
export function assignSuggestedDates(
  weeks: { week: number; items: PlanWeekItem[] }[],
  startISO: string = todayISODate(),
): Map<string, string> {
  const dates = new Map<string, string>();
  const startWeekday = parseISODate(startISO).getUTCDay();

  for (const week of weeks) {
    const weekStart = addDaysISO(startISO, (week.week - 1) * 7);
    const items = week.items ?? [];
    const parsed = items.map((item) => weekdayIndexFromDay(item.day));

    items.forEach((_, index) => {
      const weekday = parsed[index];
      // Named weekdays land on that weekday inside the week's 7-day window;
      // unlabeled items are spread evenly so a 3-item week doesn't stack up.
      const offset =
        weekday !== null
          ? (weekday - startWeekday + 7) % 7
          : items.length <= 1
            ? 0
            : Math.round((index * 6) / (items.length - 1));
      dates.set(`${week.week}-${index}`, addDaysISO(weekStart, offset));
    });
  }

  return dates;
}

/** Evenly spread a single list of items across the 7 days from `startISO`. */
export function datesForWeek(items: PlanWeekItem[], startISO: string): string[] {
  return items.map((item, index) => {
    const weekday = weekdayIndexFromDay(item.day);
    if (weekday !== null) {
      const startWeekday = parseISODate(startISO).getUTCDay();
      return addDaysISO(startISO, (weekday - startWeekday + 7) % 7);
    }
    return addDaysISO(
      startISO,
      items.length <= 1 ? 0 : Math.round((index * 6) / (items.length - 1)),
    );
  });
}

// ── normalization ───────────────────────────────────────────────────────────

type PlanItemInsert = Omit<PlanItem, "id" | "created_at" | "updated_at" | "posted_at">;

function extractWeeks(planJson: unknown): { week: number; items: PlanWeekItem[] }[] {
  const calendar = (planJson as PlanJSON | null)?.content_calendar;
  if (!Array.isArray(calendar)) return [];
  return calendar
    .filter((week) => week && Array.isArray(week.items))
    .map((week, weekIndex) => ({
      week: typeof week.week === "number" ? week.week : weekIndex + 1,
      items: week.items.filter((item) => item && typeof item.title_or_hook === "string"),
    }))
    .filter((week) => week.items.length > 0);
}

/**
 * Write (or refresh) the `plan_items` rows for one generated plan.
 *
 * Re-running is safe: rows are upserted on (plan_id, source_key) and any
 * founder-set `scheduled_date` is preserved. Rows under an "x-" key came from a
 * weekly check-in extension, never from plan_json, so they are left alone.
 */
export async function syncPlanItemsForPlan(args: {
  projectId: string;
  planId: string;
  platform: Platform;
  planJson: unknown;
  startISO?: string;
}): Promise<number> {
  const weeks = extractWeeks(args.planJson);
  if (weeks.length === 0) return 0;

  const supabase = await createAdminClient();
  const suggested = assignSuggestedDates(weeks, args.startISO ?? todayISODate());

  const { data: existing, error: readError } = await supabase
    .from("plan_items")
    .select("source_key, scheduled_date")
    .eq("plan_id", args.planId);
  if (readError) {
    console.error("[plan-items] could not read existing rows:", readError.message);
  }
  const existingDates = new Map(
    ((existing ?? []) as { source_key: string; scheduled_date: string | null }[]).map((row) => [
      row.source_key,
      row.scheduled_date,
    ]),
  );

  const rows: PlanItemInsert[] = [];
  for (const week of weeks) {
    week.items.forEach((item, index) => {
      const sourceKey = `${week.week}-${index}`;
      const preserved = existingDates.get(sourceKey);
      rows.push({
        project_id: args.projectId,
        plan_id: args.planId,
        platform: args.platform,
        source_key: sourceKey,
        week: week.week,
        day: item.day ?? null,
        type: item.type ?? null,
        title_or_hook: item.title_or_hook,
        details: item.details ?? null,
        effort_minutes:
          Number.isFinite(Number(item.effort_minutes)) && item.effort_minutes != null
            ? Math.max(0, Math.round(Number(item.effort_minutes)))
            : null,
        scheduled_date:
          preserved !== undefined ? preserved : (suggested.get(sourceKey) ?? null),
        sort_order: week.week * 100 + index,
      });
    });
  }

  const { error: upsertError } = await supabase
    .from("plan_items")
    .upsert(rows, { onConflict: "plan_id,source_key" });
  if (upsertError) {
    console.error("[plan-items] upsert failed:", upsertError.message);
    return 0;
  }

  // Drop rows for plan output that no longer exists (regenerated plans). Keep
  // "x-" rows: those are check-in extensions.
  const keep = new Set(rows.map((row) => row.source_key));
  const stale = [...existingDates.keys()].filter(
    (key) => !keep.has(key) && !key.startsWith("x-"),
  );
  for (const key of stale) {
    const { error } = await supabase
      .from("plan_items")
      .delete()
      .eq("plan_id", args.planId)
      .eq("source_key", key);
    if (error) console.warn("[plan-items] stale row cleanup failed:", error.message);
  }

  return rows.length;
}

/**
 * Idempotent backfill: give every ready plan its calendar rows. Called when a
 * project's calendar is first opened so projects generated before this feature
 * existed get a schedule without the founder doing anything.
 */
export async function ensurePlanItemsForProject(projectId: string): Promise<void> {
  const supabase = await createAdminClient();
  const { data: plans, error } = await supabase
    .from("marketing_plans")
    .select("id, platform, plan_json")
    .eq("project_id", projectId)
    .eq("status", "ready");
  if (error || !plans?.length) {
    if (error) console.warn("[plan-items] could not load plans:", error.message);
    return;
  }

  const planIds = plans.map((plan) => plan.id);
  const { data: items } = await supabase
    .from("plan_items")
    .select("plan_id")
    .in("plan_id", planIds);
  const counts = new Map<string, number>();
  for (const row of (items ?? []) as { plan_id: string }[]) {
    counts.set(row.plan_id, (counts.get(row.plan_id) ?? 0) + 1);
  }

  for (const plan of plans) {
    if ((counts.get(plan.id) ?? 0) > 0) continue;
    await syncPlanItemsForPlan({
      projectId,
      planId: plan.id,
      platform: plan.platform,
      planJson: plan.plan_json,
    });
  }
}

// ── check-in driven week extension ──────────────────────────────────────────

/** Highest week number already on the calendar for a plan (0 when empty). */
export async function maxWeekForPlan(planId: string): Promise<number> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("plan_items")
    .select("week")
    .eq("plan_id", planId)
    .order("week", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { week?: number } | undefined;
  return row?.week ?? 0;
}

/** The last date already scheduled for a plan, or null. */
export async function lastScheduledDateForPlan(planId: string): Promise<string | null> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("plan_items")
    .select("scheduled_date")
    .eq("plan_id", planId)
    .not("scheduled_date", "is", null)
    .order("scheduled_date", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as { scheduled_date?: string | null } | undefined;
  return row?.scheduled_date ?? null;
}

/** Titles already scheduled, so new weeks never repeat them. */
export async function existingTitlesForPlan(planId: string): Promise<string[]> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("plan_items")
    .select("title_or_hook, scheduled_date")
    .eq("plan_id", planId)
    .order("scheduled_date", { ascending: false })
    .limit(24);
  const titles = ((data ?? []) as { title_or_hook: string | null }[])
    .map((row) => row.title_or_hook)
    .filter((title): title is string => Boolean(title))
    .reverse();
  return titles.filter((title, index) => titles.indexOf(title) === index).slice(-20);
}

/**
 * Append a freshly generated week to the calendar, placed after everything
 * already scheduled so the timeline keeps moving forward instead of colliding
 * with the plan's original 3 weeks.
 */
export async function insertExtendedWeek(args: {
  projectId: string;
  planId: string;
  platform: Platform;
  weekNumber: number;
  items: PlanWeekItem[];
  startISO: string;
}): Promise<number> {
  if (args.items.length === 0) return 0;
  const supabase = await createAdminClient();
  const dates = datesForWeek(args.items, args.startISO);

  const rows: PlanItemInsert[] = args.items.map((item, index) => ({
    project_id: args.projectId,
    plan_id: args.planId,
    platform: args.platform,
    source_key: `x-${args.weekNumber}-${index}`,
    week: args.weekNumber,
    day: item.day ?? null,
    type: item.type ?? null,
    title_or_hook: item.title_or_hook,
    details: item.details ?? null,
    effort_minutes:
      Number.isFinite(Number(item.effort_minutes)) && item.effort_minutes != null
        ? Math.max(0, Math.round(Number(item.effort_minutes)))
        : null,
    scheduled_date: dates[index] ?? args.startISO,
    sort_order: args.weekNumber * 100 + index,
  }));

  const { error } = await supabase
    .from("plan_items")
    .upsert(rows, { onConflict: "plan_id,source_key" });
  if (error) {
    console.error("[plan-items] extended week insert failed:", error.message);
    return 0;
  }
  return rows.length;
}
