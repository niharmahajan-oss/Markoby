import { ArrowLeft, CalendarDays, Loader2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CalendarView } from "@/app/projects/[id]/calendar/calendar-view";
import {
  CheckinCard,
  type CheckinSummary,
} from "@/app/projects/[id]/calendar/checkin-card";
import type { CalendarItem } from "@/app/projects/[id]/calendar/types";
import { ProjectNav } from "@/components/project-nav";
import { Card, CardContent } from "@/components/ui/card";
import { getUserWithSubscription } from "@/lib/auth";
import { ensurePlanItemsForProject } from "@/lib/content/plan-items";
import {
  getProject,
  getProjectCheckins,
  getProjectDrafts,
  getProjectFeedback,
  getProjectPlanItems,
  getProjectPlans,
  getProjectPlatforms,
} from "@/lib/projects";
import type { Platform } from "@/lib/ai/types";

export const metadata = { title: "Calendar" };

export default async function CalendarPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login");

  const project = await getProject(id);
  if (!project) redirect("/dashboard");

  const platforms = await getProjectPlatforms(id);
  if (platforms.length === 0) redirect(`/projects/${id}/platforms`);

  // Idempotent backfill: projects whose plans predate the calendar get their
  // rows the first time this page is opened.
  try {
    await ensurePlanItemsForProject(id);
  } catch (err) {
    console.error("[calendar] backfill failed:", err);
  }

  const [items, drafts, feedback, checkins, plans] = await Promise.all([
    getProjectPlanItems(id),
    getProjectDrafts(id),
    getProjectFeedback(id),
    getProjectCheckins(id),
    getProjectPlans(id),
  ]);

  const draftByItem = new Map(
    drafts
      .filter((draft) => draft.plan_item_id)
      .map((draft) => [draft.plan_item_id as string, draft]),
  );
  const feedbackByItem = new Map(
    feedback
      .filter((row) => row.plan_item_id)
      .map((row) => [row.plan_item_id as string, row]),
  );

  const calendarItems: CalendarItem[] = items.map((item) => {
    const draft = draftByItem.get(item.id);
    const row = feedbackByItem.get(item.id);
    return {
      id: item.id,
      platform: item.platform,
      week: item.week,
      day: item.day,
      type: item.type,
      title: item.title_or_hook,
      details: item.details,
      effortMinutes: item.effort_minutes,
      scheduledDate: item.scheduled_date,
      postedAt: item.posted_at,
      draft: draft
        ? {
            id: draft.id,
            content: draft.draft_content,
            status: draft.status,
            editedAt: draft.edited_at,
            generatedAt: draft.generated_at,
          }
        : null,
      feedback: row
        ? {
            id: row.id,
            outcomeText: row.outcome_text,
            metric: row.outcome_metric,
            submittedAt: row.submitted_at,
          }
        : null,
    };
  });

  const toSummary = (checkin: (typeof checkins)[number]): CheckinSummary => ({
    id: checkin.id,
    weekStartDate: checkin.week_start_date,
    founderResponse: checkin.founder_response,
    responseReceivedAt: checkin.response_received_at,
  });

  const latestCheckin = checkins[0] ? toSummary(checkins[0]) : null;
  const history = checkins
    .filter((checkin) => checkin.founder_response?.trim())
    .slice(0, 3)
    .map(toSummary);

  const hasReadyPlan = plans.some((plan) => plan.status === "ready");

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <Link
        href="/dashboard"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        All projects
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Your schedule. Drag anything to a new day, draft it when you&apos;re ready.
          </p>
        </div>
        <ProjectNav projectId={id} />
      </div>

      <CheckinCard projectId={id} latest={latestCheckin} history={history} />

      <div className="mt-8 flex items-center gap-2">
        <CalendarDays className="text-primary h-5 w-5" />
        <h2 className="text-lg font-semibold tracking-tight">Content calendar</h2>
      </div>

      {!hasReadyPlan && calendarItems.length === 0 ? (
        <Card className="border-border/70 mt-4">
          <CardContent className="text-muted-foreground flex items-center gap-2 p-6 text-sm">
            <Loader2 className="h-4 w-4 animate-spin" />
            Your plans are still generating — the calendar appears as soon as they&apos;re
            ready.
          </CardContent>
        </Card>
      ) : (
        <CalendarView
          projectId={id}
          items={calendarItems}
          platforms={platforms.map((row) => row.platform as Platform)}
        />
      )}
    </div>
  );
}
