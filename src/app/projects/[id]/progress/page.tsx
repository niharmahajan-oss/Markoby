import {
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  FileText,
  Flame,
  Radar,
  Target,
  Users,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ProjectNav } from "@/components/project-nav";
import { PlatformIcon } from "@/components/platform-icon";
import { Card, CardContent } from "@/components/ui/card";
import { getUserWithSubscription } from "@/lib/auth";
import { getProjectProgress, type ProjectProgress } from "@/lib/content/progress";
import { platformLabel } from "@/lib/platform-label";
import { getProject } from "@/lib/projects";

export const metadata = { title: "Progress" };

export default async function ProgressPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login");

  const project = await getProject(id);
  if (!project) redirect("/dashboard");

  let progress: ProjectProgress | null = null;
  let error: string | null = null;
  try {
    progress = await getProjectProgress(id);
  } catch (err) {
    console.error("[progress] rollup failed:", err);
    error = "Could not load your progress right now. Reload to try again.";
  }

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
            {momentumCopy(progress)}
          </p>
        </div>
        <ProjectNav projectId={id} />
      </div>

      {error || !progress ? (
        <Card className="border-destructive/40 mt-8">
          <CardContent className="text-destructive p-6 text-sm">
            {error ?? "Nothing to show yet."}
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              icon={<FileText className="h-4 w-4" />}
              label="Posts drafted"
              value={progress.draftsTotal}
              hint={
                progress.draftsTotal > 0
                  ? `${progress.draftsApproved} approved · ${progress.draftsPosted} posted`
                  : "Generate a draft from any calendar item"
              }
            />
            <StatCard
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="Posts marked posted"
              value={progress.itemsPosted}
              hint={
                progress.itemsScheduled > 0
                  ? `out of ${progress.itemsScheduled} scheduled`
                  : "Nothing scheduled yet"
              }
            />
            <StatCard
              icon={<Target className="h-4 w-4" />}
              label="Active platforms"
              value={progress.activePlatforms.length}
              hint={
                progress.activePlatforms.length > 0
                  ? progress.activePlatforms.map(platformLabel).join(", ")
                  : "Pick platforms in onboarding"
              }
            />
            <StatCard
              icon={<Users className="h-4 w-4" />}
              label="Prospects contacted"
              value={progress.prospectsContacted}
              hint={
                progress.prospectsDiscovered > 0
                  ? `of ${progress.prospectsDiscovered} discovered`
                  : "Discovery runs when plans are ready"
              }
            />
          </div>

          <div className="border-primary/25 bg-primary/5 mt-4 flex items-center gap-3 rounded-xl border p-4">
            <Flame className="text-primary h-5 w-5 shrink-0" />
            <p className="text-sm">
              <span className="font-medium">{momentumHeadline(progress)}</span>{" "}
              <span className="text-muted-foreground">{momentumDetail(progress)}</span>
            </p>
          </div>

          <Card className="border-border/70 mt-6">
            <CardContent className="p-6">
              <h2 className="flex items-center gap-2 font-semibold tracking-tight">
                <BarChart3 className="text-primary h-4 w-4" />
                Last 8 weeks
              </h2>
              <p className="text-muted-foreground mt-1 text-xs">
                Posts marked posted, with drafts generated alongside.
              </p>
              <TrendChart weeks={progress.weeks} />
            </CardContent>
          </Card>

          <Card className="border-border/70 mt-6">
            <CardContent className="p-6">
              <h2 className="flex items-center gap-2 font-semibold tracking-tight">
                <Radar className="text-primary h-4 w-4" />
                By platform
              </h2>
              {progress.platforms.length === 0 ? (
                <p className="text-muted-foreground mt-3 text-sm">
                  Nothing here yet — pick platforms and generate a plan.
                </p>
              ) : (
                <ul className="mt-4 space-y-3">
                  {progress.platforms.map((row) => (
                    <li
                      key={row.platform}
                      className="border-border/60 flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3.5"
                    >
                      <span className="flex items-center gap-2 font-medium">
                        <PlatformIcon platform={row.platform} className="h-4 w-4" />
                        {platformLabel(row.platform)}
                      </span>
                      <span className="text-muted-foreground flex flex-wrap gap-4 text-xs">
                        <span>{row.posted} posted</span>
                        <span>{row.scheduled} scheduled</span>
                        <span>{row.drafted} drafted</span>
                        <span>
                          {row.contacted}/{row.prospects} prospects contacted
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {progress.itemsUnscheduled > 0 && (
                <p className="text-muted-foreground mt-4 text-xs">
                  {progress.itemsUnscheduled} calendar item
                  {progress.itemsUnscheduled === 1 ? "" : "s"} still unscheduled — drag
                  them onto a day to build momentum.
                </p>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint: string;
}) {
  return (
    <Card className="border-border/70">
      <CardContent className="p-5">
        <p className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
          <span className="text-primary">{icon}</span>
          {label}
        </p>
        <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
        <p className="text-muted-foreground mt-1 text-xs leading-relaxed">{hint}</p>
      </CardContent>
    </Card>
  );
}

function TrendChart({ weeks }: { weeks: ProjectProgress["weeks"] }) {
  const max = Math.max(1, ...weeks.map((week) => Math.max(week.posted, week.drafted)));
  return (
    <div className="mt-6 flex items-end gap-2">
      {weeks.map((week) => (
        <div key={week.weekStart} className="flex min-w-0 flex-1 flex-col items-center gap-2">
          <div className="flex h-32 w-full items-end justify-center gap-1">
            <div
              className="bg-primary/80 w-3 rounded-t-sm"
              style={{ height: `${Math.max(week.posted ? 6 : 0, (week.posted / max) * 100)}%` }}
              title={`${week.posted} posted`}
            />
            <div
              className="bg-primary/25 w-3 rounded-t-sm"
              style={{ height: `${Math.max(week.drafted ? 6 : 0, (week.drafted / max) * 100)}%` }}
              title={`${week.drafted} drafted`}
            />
          </div>
          <span className="text-muted-foreground truncate text-[10px]">{week.label}</span>
        </div>
      ))}
    </div>
  );
}

/** Empty-progress semantics above exist so the page never scolds a new founder. */
function momentumCopy(progress: ProjectProgress | null): string {
  if (!progress || progress.itemsPosted === 0) {
    return "Momentum comes from marking things posted — nothing here is scored but you.";
  }
  return "A rollup of what you've actually shipped. No AI calls, just your own numbers.";
}

function momentumHeadline(progress: ProjectProgress): string {
  if (progress.streakWeeks >= 2) {
    return `${progress.streakWeeks} weeks in a row you've posted${
      progress.streakPlatform ? ` on ${platformLabel(progress.streakPlatform)}` : ""
    }.`;
  }
  if (progress.streakWeeks === 1) return "You've posted this week.";
  return "No post logged this week yet.";
}

function momentumDetail(progress: ProjectProgress): string {
  if (progress.streakWeeks >= 2) {
    return "Rhythm beats volume — keep the same cadence and Markoby will keep the plan matched to it.";
  }
  if (progress.streakWeeks === 1) {
    return "Same time next week keeps the streak alive.";
  }
  return "Open the calendar, post one item, and mark it posted to start a streak.";
}
