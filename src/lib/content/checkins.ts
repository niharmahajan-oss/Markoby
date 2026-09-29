import "server-only";

import { checkinEmail, emailConfigured, sendEmail, siteUrl } from "@/lib/email";
import { mondayOfISO, parseISODate, toISODate, todayISODate } from "@/lib/calendar";
import { createAdminClient } from "@/lib/supabase/server";
import type { Checkin } from "@/lib/types";

/**
 * Weekly check-ins (feature 5) — the retention loop.
 *
 * A scheduled job creates one prompt per active project per week. The founder's
 * reply is fed into the same feedback digest plan/draft generation reads, and
 * it triggers one more week of calendar items. Two consecutive unanswered
 * prompts are recorded as a churn signal in usage_events — internal only, the
 * founder is never told they're being scored.
 */

export const CHECKIN_PROMPT =
  "What did you post this week, and how did it go? Even a rough summary helps — Markoby will rebuild next week's plan around what actually worked.";

const MISSED_BEFORE_CHURN = 2;

/** Monday of the week containing `now`. */
export function weekStartISO(now: Date = new Date()): string {
  return mondayOfISO(todayISODate(now));
}

export function formatWeekLabel(weekStart: string): string {
  const date = parseISODate(weekStart);
  return date.toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function logUsageEvent(
  userId: string | null,
  eventType: string,
  metadata: Record<string, unknown>,
) {
  try {
    const supabase = await createAdminClient();
    await supabase.from("usage_events").insert({
      user_id: userId,
      event_type: eventType,
      metadata,
    });
  } catch (err) {
    console.warn("[checkins] usage logging failed:", err);
  }
}

/** How many of the most recent check-ins in a row went unanswered. */
async function consecutiveMissed(projectId: string): Promise<number> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("checkins")
    .select("founder_response, week_start_date")
    .eq("project_id", projectId)
    .order("week_start_date", { ascending: false })
    .limit(6);
  let missed = 0;
  for (const row of (data ?? []) as { founder_response: string | null }[]) {
    if (row.founder_response?.trim()) break;
    missed += 1;
  }
  return missed;
}

export type EnsureCheckinResult = {
  ok: boolean;
  checkin?: Checkin;
  created?: boolean;
  error?: string;
};

/**
 * Idempotently create (or fetch) this week's check-in for one project. Used by
 * the scheduled job and by the in-app card, so the feature still works on a
 * deployment where the cron isn't wired up yet.
 */
export async function ensureCheckinForProject(
  projectId: string,
  options: { notify?: boolean } = {},
): Promise<EnsureCheckinResult> {
  const supabase = await createAdminClient();
  const weekStart = weekStartISO();

  const { data: existing, error: readError } = await supabase
    .from("checkins")
    .select("*")
    .eq("project_id", projectId)
    .eq("week_start_date", weekStart)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (existing) return { ok: true, checkin: existing as Checkin, created: false };

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (!project) return { ok: false, error: "Project not found." };

  const { data: created, error: insertError } = await supabase
    .from("checkins")
    .insert({
      project_id: projectId,
      week_start_date: weekStart,
      prompt_text: CHECKIN_PROMPT,
    })
    .select("*")
    .single();
  if (insertError || !created) {
    // A concurrent run may have won the race; re-read rather than fail.
    const { data: raced } = await supabase
      .from("checkins")
      .select("*")
      .eq("project_id", projectId)
      .eq("week_start_date", weekStart)
      .maybeSingle();
    if (raced) return { ok: true, checkin: raced as Checkin, created: false };
    return { ok: false, error: insertError?.message ?? "Could not create the check-in." };
  }

  if (options.notify) {
    await notifyCheckin({
      projectId,
      projectName: project.name as string,
      userId: project.user_id as string,
      weekStart,
      checkinId: created.id as string,
    });
  }

  return { ok: true, checkin: created as Checkin, created: true };
}

async function notifyCheckin(args: {
  projectId: string;
  projectName: string;
  userId: string;
  weekStart: string;
  checkinId: string;
}) {
  if (!emailConfigured()) return;

  const supabase = await createAdminClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("email")
    .eq("id", args.userId)
    .maybeSingle();
  const email = (profile as { email: string | null } | null)?.email;
  if (!email) return;

  const link = `${siteUrl()}/projects/${args.projectId}/calendar`;
  const message = checkinEmail({
    projectName: args.projectName,
    weekLabel: formatWeekLabel(args.weekStart),
    link,
  });
  const result = await sendEmail({ to: email, subject: message.subject, text: message.text });
  await logUsageEvent(args.userId, "checkin.email", {
    project_id: args.projectId,
    checkin_id: args.checkinId,
    sent: result.sent,
    skipped: result.skipped ?? null,
    error: result.error ?? null,
  });
}

export type WeeklyRunSummary = {
  projectsConsidered: number;
  checkinsCreated: number;
  churnRisks: number;
  emailsSent: number;
};

/**
 * The scheduled job body: one check-in per active project for the current week.
 * Projects with two or more consecutive unanswered prompts get a churn signal.
 */
export async function runWeeklyCheckins(): Promise<WeeklyRunSummary> {
  const supabase = await createAdminClient();
  const weekStart = weekStartISO();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, name, user_id, created_at, project_platforms(platform)")
    .in("status", ["plan_ready", "active"]);
  if (error) throw new Error(error.message);

  const eligible = ((projects ?? []) as unknown as {
    id: string;
    name: string;
    user_id: string;
    created_at: string;
    project_platforms: { platform: string }[] | null;
  }[]).filter((project) => {
    if ((project.project_platforms ?? []).length === 0) return false;
    // Don't nag a project created mid-week: give it a full first week.
    return project.created_at.slice(0, 10) < weekStart;
  });

  const summary: WeeklyRunSummary = {
    projectsConsidered: eligible.length,
    checkinsCreated: 0,
    churnRisks: 0,
    emailsSent: 0,
  };

  for (const project of eligible) {
    try {
      const missedBefore = await consecutiveMissed(project.id);
      if (missedBefore >= MISSED_BEFORE_CHURN) {
        summary.churnRisks += 1;
        await logUsageEvent(project.user_id, "checkin.churn_risk", {
          project_id: project.id,
          project_name: project.name,
          consecutive_missed: missedBefore,
          week_start_date: weekStart,
        });
      }

      const before = emailConfigured();
      const result = await ensureCheckinForProject(project.id, { notify: true });
      if (result.created) {
        summary.checkinsCreated += 1;
        if (before) summary.emailsSent += 1;
      }
    } catch (err) {
      console.error(`[checkins] project ${project.id} failed:`, err);
    }
  }

  await logUsageEvent(null, "checkin.job_run", {
    week_start_date: weekStart,
    ...summary,
  });

  return summary;
}

/** The most recent check-in for a project (open or answered). */
export async function getLatestCheckin(projectId: string): Promise<Checkin | null> {
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("checkins")
    .select("*")
    .eq("project_id", projectId)
    .order("week_start_date", { ascending: false })
    .limit(1);
  const row = (data ?? [])[0] as Checkin | undefined;
  return row ?? null;
}

/** Open check-ins for the signed-in founder's projects (RLS scopes the read). */
export async function getOpenCheckinsForProjects(
  projectIds: string[],
): Promise<Checkin[]> {
  if (projectIds.length === 0) return [];
  const supabase = await createAdminClient();
  const { data } = await supabase
    .from("checkins")
    .select("*")
    .in("project_id", projectIds)
    .is("founder_response", null)
    .order("week_start_date", { ascending: false })
    .limit(5);
  return (data ?? []) as unknown as Checkin[];
}

/**
 * Records the founder's reply. Returns the updated row; the caller triggers the
 * next week's plan so the response visibly changes the calendar.
 */
export async function recordCheckinResponse(
  checkinId: string,
  response: string,
): Promise<{ ok: true; checkin: Checkin } | { ok: false; error: string }> {
  const text = response.trim();
  if (text.length < 3) return { ok: false, error: "Add a little more detail first." };
  if (text.length > 4000) return { ok: false, error: "Keep it under 4000 characters." };

  const supabase = await createAdminClient();
  const { data: checkin, error: readError } = await supabase
    .from("checkins")
    .select("id, project_id, founder_response")
    .eq("id", checkinId)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!checkin) return { ok: false, error: "That check-in no longer exists." };
  if ((checkin as { founder_response: string | null }).founder_response?.trim()) {
    return { ok: false, error: "You already answered this week's check-in." };
  }

  const { data: saved, error } = await supabase
    .from("checkins")
    .update({ founder_response: text, response_received_at: new Date().toISOString() })
    .eq("id", checkinId)
    .select("*")
    .single();
  if (error || !saved) {
    return { ok: false, error: error?.message ?? "Could not save your answer." };
  }

  const projectId = (saved as Checkin).project_id;
  const { data: project } = await supabase
    .from("projects")
    .select("user_id")
    .eq("id", projectId)
    .maybeSingle();
  await logUsageEvent(
    (project as { user_id: string } | null)?.user_id ?? null,
    "checkin.responded",
    { project_id: projectId, checkin_id: checkinId, response_chars: text.length },
  );

  return { ok: true, checkin: saved as Checkin };
}

/** Marks a check-in as having rolled the calendar forward. */
export async function markNextWeekGenerated(checkinId: string): Promise<void> {
  const supabase = await createAdminClient();
  await supabase
    .from("checkins")
    .update({ next_week_plan_generated: true })
    .eq("id", checkinId);
}

/** Small helper for the UI: is this week's check-in already answered? */
export function checkinState(checkin: Checkin | null): "none" | "open" | "answered" {
  if (!checkin) return "none";
  return checkin.founder_response?.trim() ? "answered" : "open";
}

/** Exported for tests/UI: the Monday the current check-in covers. */
export function currentWeekStart(): string {
  return toISODate(parseISODate(weekStartISO()));
}
