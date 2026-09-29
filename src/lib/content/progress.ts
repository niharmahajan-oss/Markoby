import "server-only";

import { addDaysISO, mondayOfISO, todayISODate } from "@/lib/content/plan-items";
import { createAdminClient } from "@/lib/supabase/server";
import type { Platform } from "@/lib/ai/types";

/**
 * Progress rollup (feature 6). Pure arithmetic over rows we already store —
 * deliberately zero AI calls, so opening the dashboard costs nothing.
 */

export const TREND_WEEKS = 8;

export type PlatformProgress = {
  platform: Platform;
  scheduled: number;
  posted: number;
  drafted: number;
  prospects: number;
  contacted: number;
};

export type WeeklyPoint = {
  weekStart: string;
  label: string;
  posted: number;
  drafted: number;
};

export type ProjectProgress = {
  draftsTotal: number;
  draftsApproved: number;
  draftsPosted: number;
  itemsScheduled: number;
  itemsPosted: number;
  itemsUnscheduled: number;
  activePlatforms: Platform[];
  prospectsDiscovered: number;
  prospectsContacted: number;
  checkinsAnswered: number;
  /** Consecutive weeks (ending with the current or last week) with a post. */
  streakWeeks: number;
  /** Platform that carried the current streak, when there is one. */
  streakPlatform: Platform | null;
  weeks: WeeklyPoint[];
  platforms: PlatformProgress[];
};

function weekLabel(weekStart: string): string {
  const [, month, day] = weekStart.split("-");
  return `${day}/${month}`;
}

function shortPlatform(platform: string): Platform {
  return platform as Platform;
}

export async function getProjectProgress(projectId: string): Promise<ProjectProgress> {
  const supabase = await createAdminClient();

  const [itemsRes, draftsRes, prospectsRes, checkinsRes] = await Promise.all([
    supabase
      .from("plan_items")
      .select("id, platform, scheduled_date, posted_at, week")
      .eq("project_id", projectId),
    supabase.from("post_drafts").select("id, platform, status, generated_at").eq("project_id", projectId),
    supabase
      .from("prospects")
      .select("id, platform, status, source_type")
      .eq("project_id", projectId),
    supabase
      .from("checkins")
      .select("id, founder_response")
      .eq("project_id", projectId),
  ]);

  for (const [label, result] of [
    ["plan_items", itemsRes],
    ["post_drafts", draftsRes],
    ["prospects", prospectsRes],
    ["checkins", checkinsRes],
  ] as const) {
    if (result.error) console.error(`[progress] could not load ${label}:`, result.error.message);
  }

  const items = (itemsRes.data ?? []) as unknown as {
    platform: string;
    scheduled_date: string | null;
    posted_at: string | null;
  }[];
  const drafts = (draftsRes.data ?? []) as unknown as {
    platform: string;
    status: string;
    generated_at: string;
  }[];
  const prospects = (prospectsRes.data ?? []) as unknown as {
    platform: string;
    status: string;
    source_type: string;
  }[];
  const checkins = (checkinsRes.data ?? []) as unknown as {
    founder_response: string | null;
  }[];

  const thisWeekStart = mondayOfISO(todayISODate());
  const weekStarts: string[] = [];
  for (let index = TREND_WEEKS - 1; index >= 0; index -= 1) {
    weekStarts.push(addDaysISO(thisWeekStart, -7 * index));
  }
  const weekIndex = new Map(weekStarts.map((start, index) => [start, index]));

  const weeks: WeeklyPoint[] = weekStarts.map((weekStart) => ({
    weekStart,
    label: weekLabel(weekStart),
    posted: 0,
    drafted: 0,
  }));

  const platformKeys = [
    ...new Set<string>([
      ...items.map((item) => item.platform),
      ...drafts.map((draft) => draft.platform),
      ...prospects.map((prospect) => prospect.platform),
    ]),
  ].sort();

  const byPlatform = new Map<string, PlatformProgress>(
    platformKeys.map((platform) => [
      platform,
      shortPlatformRow(platform),
    ]),
  );

  let itemsPosted = 0;
  let itemsUnscheduled = 0;
  const postedWeeksByPlatform = new Map<string, Set<string>>();

  for (const item of items) {
    const row = byPlatform.get(item.platform);
    if (row) row.scheduled += 1;
    if (!item.scheduled_date) itemsUnscheduled += 1;
    if (item.posted_at) {
      itemsPosted += 1;
      if (row) row.posted += 1;
      const weekStart = mondayOfISO(item.posted_at.slice(0, 10));
      const index = weekIndex.get(weekStart);
      if (index !== undefined) weeks[index].posted += 1;
      const set = postedWeeksByPlatform.get(item.platform) ?? new Set<string>();
      set.add(weekStart);
      postedWeeksByPlatform.set(item.platform, set);
    }
  }

  for (const draft of drafts) {
    const row = byPlatform.get(draft.platform);
    if (row) row.drafted += 1;
    const weekStart = mondayOfISO(draft.generated_at.slice(0, 10));
    const index = weekIndex.get(weekStart);
    if (index !== undefined) weeks[index].drafted += 1;
  }

  for (const prospect of prospects) {
    const row = byPlatform.get(prospect.platform);
    if (!row) continue;
    if (prospect.source_type === "api") row.prospects += 1;
    if (prospect.status === "contacted") row.contacted += 1;
  }

  // Streak: walk backwards week by week from the current week. The current week
  // only counts once something has been posted in it, so an in-progress week
  // never breaks a streak that is still alive.
  let streakWeeks = 0;
  let streakPlatform: Platform | null = null;
  for (let index = weeks.length - 1; index >= 0; index -= 1) {
    if (weeks[index].posted === 0) {
      if (index === weeks.length - 1) continue; // this week hasn't happened yet
      break;
    }
    streakWeeks += 1;
    const weekStart = weeks[index].weekStart;
    if (!streakPlatform) {
      for (const [platform, set] of postedWeeksByPlatform) {
        if (set.has(weekStart)) {
          streakPlatform = shortPlatform(platform);
          break;
        }
      }
    }
  }

  const activePlatforms = platformKeys.filter((platform) => {
    const row = byPlatform.get(platform);
    return Boolean(row && (row.scheduled > 0 || row.posted > 0 || row.drafted > 0));
  });

  return {
    draftsTotal: drafts.length,
    draftsApproved: drafts.filter((draft) => draft.status === "approved").length,
    draftsPosted: drafts.filter((draft) => draft.status === "posted").length,
    itemsScheduled: items.length,
    itemsPosted,
    itemsUnscheduled,
    activePlatforms: activePlatforms.map(shortPlatform),
    // Targeting-guide rows live in `prospects` with source_type "guide" — they
    // are instructions, not discovered people, so they don't count as prospects.
    prospectsDiscovered: prospects.filter((prospect) => prospect.source_type === "api").length,
    prospectsContacted: prospects.filter((p) => p.status === "contacted").length,
    checkinsAnswered: checkins.filter((row) => row.founder_response?.trim()).length,
    streakWeeks,
    streakPlatform,
    weeks,
    platforms: [...byPlatform.values()].sort((a, b) => b.posted - a.posted),
  };
}

function shortPlatformRow(platform: string): PlatformProgress {
  return {
    platform: shortPlatform(platform),
    scheduled: 0,
    posted: 0,
    drafted: 0,
    prospects: 0,
    contacted: 0,
  };
}
