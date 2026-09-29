import "server-only";

import { createAdminClient } from "@/lib/supabase/server";
import type { Checkin, OutcomeMetric, PostFeedback } from "@/lib/types";

/**
 * The performance feedback loop's read side (feature 3). Two sources feed the
 * same context blob that plan and draft generation receive:
 *
 *  - post_feedback: "How did this go?" on individual posts.
 *  - checkins: the weekly "what did you post, and how did it go?" replies.
 *
 * Admin client on purpose: this runs from background jobs (plan generation,
 * post-check-in week extension) where there is no user session to scope RLS.
 */

const FEEDBACK_WINDOW_DAYS = 70;
const MAX_FEEDBACK_ROWS = 6;
const MAX_CHECKIN_ROWS = 2;
const MAX_QUOTE_CHARS = 320;

export function formatOutcomeMetric(metric: OutcomeMetric | null | undefined): string {
  if (!metric) return "";
  const parts: string[] = [];
  if (typeof metric.likes === "number" && Number.isFinite(metric.likes)) {
    parts.push(`${metric.likes} likes/upvotes`);
  }
  if (typeof metric.comments === "number" && Number.isFinite(metric.comments)) {
    parts.push(`${metric.comments} comments`);
  }
  if (typeof metric.signups === "number" && Number.isFinite(metric.signups)) {
    parts.push(`${metric.signups} signups`);
  }
  return parts.join(", ");
}

function trimQuote(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  return collapsed.length > MAX_QUOTE_CHARS
    ? `${collapsed.slice(0, MAX_QUOTE_CHARS)}…`
    : collapsed;
}

function sinceISO(): string {
  return new Date(Date.now() - FEEDBACK_WINDOW_DAYS * 86_400_000).toISOString();
}

export async function getRecentPostFeedback(
  projectId: string,
  limit = MAX_FEEDBACK_ROWS,
): Promise<PostFeedback[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("post_feedback")
    .select("*")
    .eq("project_id", projectId)
    .gte("submitted_at", sinceISO())
    .order("submitted_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[feedback] could not load post_feedback:", error.message);
    return [];
  }
  return (data ?? []) as unknown as PostFeedback[];
}

export async function getRecentCheckinResponses(
  projectId: string,
  limit = MAX_CHECKIN_ROWS,
): Promise<Checkin[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("checkins")
    .select("*")
    .eq("project_id", projectId)
    .not("founder_response", "is", null)
    .gte("week_start_date", sinceISO().slice(0, 10))
    .order("week_start_date", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[feedback] could not load check-ins:", error.message);
    return [];
  }
  return (data ?? []) as unknown as Checkin[];
}

/**
 * Compact, prompt-ready digest of what has actually happened. Returns "" when
 * the founder has never reported anything — callers must not tell the model to
 * "adapt to feedback" when there is none.
 */
export async function buildFeedbackSummary(projectId: string): Promise<string> {
  const [feedback, checkins] = await Promise.all([
    getRecentPostFeedback(projectId),
    getRecentCheckinResponses(projectId),
  ]);

  const lines: string[] = [];

  for (const row of checkins) {
    if (!row.founder_response?.trim()) continue;
    lines.push(
      `- Weekly check-in (week of ${row.week_start_date}): "${trimQuote(row.founder_response)}"`,
    );
  }

  for (const row of feedback) {
    const metric = formatOutcomeMetric(row.outcome_metric);
    const day = row.submitted_at.slice(0, 10);
    lines.push(
      `- ${row.platform} post reported ${day}: "${trimQuote(row.outcome_text)}"${
        metric ? ` (${metric})` : ""
      }`,
    );
  }

  if (lines.length === 0) return "";
  return [
    "The founder's own reports from the last ~10 weeks, most recent first:",
    ...lines,
  ].join("\n");
}

/** Same digest, built from rows the caller already loaded (avoids re-querying). */
export function summariseFeedbackRows(
  feedback: PostFeedback[],
  checkins: Checkin[],
): string {
  const lines: string[] = [];
  for (const row of checkins) {
    if (!row.founder_response?.trim()) continue;
    lines.push(
      `- Weekly check-in (week of ${row.week_start_date}): "${trimQuote(row.founder_response)}"`,
    );
  }
  for (const row of feedback) {
    const metric = formatOutcomeMetric(row.outcome_metric);
    lines.push(
      `- ${row.platform} post reported ${row.submitted_at.slice(0, 10)}: "${trimQuote(
        row.outcome_text,
      )}"${metric ? ` (${metric})` : ""}`,
    );
  }
  if (lines.length === 0) return "";
  return [
    "The founder's own reports from the last ~10 weeks, most recent first:",
    ...lines,
  ].join("\n");
}
