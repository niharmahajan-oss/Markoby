import { ArrowRight, BellRing, Clock, Lock, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PlatformIcon } from "@/components/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SUBSCRIBE_PATH, getUserWithAccess } from "@/lib/auth";
import { getOpenCheckinsForProjects } from "@/lib/content/checkins";
import { listProjects } from "@/lib/projects";

export const metadata = { title: "Dashboard" };

const STATUS_COPY: Record<string, { label: string; className: string }> = {
  onboarding: { label: "Onboarding", className: "bg-amber-500/15 text-amber-400" },
  plan_ready: { label: "Plan ready", className: "bg-primary/15 text-primary" },
  active: { label: "Active", className: "bg-emerald-500/15 text-emerald-400" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

export default async function DashboardPage() {
  const session = await getUserWithAccess();
  if (!session) redirect("/auth/login?next=/dashboard");

  const { user, access } = session;
  const projects = await listProjects(user.id);
  const subscribeHref = `${SUBSCRIBE_PATH}?reason=trial`;

  // In-app notification for the weekly check-in (feature 5): anything the
  // founder hasn't answered shows up here, not just inside the project. Grouped
  // by project so a founder who skipped two weeks sees one row, not three.
  let openCheckins: { projectId: string; count: number; oldestWeek: string }[] = [];
  try {
    const rows = await getOpenCheckinsForProjects(projects.map((project) => project.id));
    const byProject = new Map<string, { count: number; oldestWeek: string }>();
    for (const row of rows) {
      const entry = byProject.get(row.project_id);
      if (entry) {
        entry.count += 1;
        if (row.week_start_date < entry.oldestWeek) entry.oldestWeek = row.week_start_date;
      } else {
        byProject.set(row.project_id, { count: 1, oldestWeek: row.week_start_date });
      }
    }
    openCheckins = [...byProject.entries()].map(([projectId, entry]) => ({
      projectId,
      ...entry,
    }));
  } catch (err) {
    console.error("[dashboard] could not load check-ins:", err);
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your projects</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Each project gets its own interview, plans, and prospect lists.
          </p>
        </div>
        {access.canCreateProject ? (
          <Button render={<Link href="/projects/new" />}>
            <Plus className="h-4 w-4" />
            {access.onTrial ? "Start your free project" : "New project"}
          </Button>
        ) : (
          <Button render={<Link href={subscribeHref} />}>
            <Lock className="h-4 w-4" />
            Subscribe for more projects
          </Button>
        )}
      </div>

      {openCheckins.length > 0 && (
        <Card className="border-primary/25 bg-primary/5 mt-8">
          <CardContent className="flex flex-wrap items-center justify-between gap-3 p-5">
            <div className="flex items-start gap-3">
              <BellRing className="text-primary mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-medium">
                  {openCheckins.length === 1
                    ? "A check-in is waiting"
                    : `${openCheckins.length} projects have check-ins waiting`}
                </p>
                <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                  Tell Markoby what you posted and how it went — it rebuilds next
                  week&apos;s plan from that.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {openCheckins.slice(0, 3).map((checkin) => {
                const project = projects.find((row) => row.id === checkin.projectId);
                return (
                  <Button
                    key={checkin.projectId}
                    variant="outline"
                    size="sm"
                    render={<Link href={`/projects/${checkin.projectId}/calendar`} />}
                  >
                    {project?.name ?? "Project"}
                    <span className="text-muted-foreground">
                      · {checkin.count > 1 ? `${checkin.count} waiting` : "this week"}
                    </span>
                  </Button>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {projects.length === 0 ? (
        <Card className="border-border/70 mt-12 border-dashed">
          <CardContent className="flex flex-col items-center py-16 text-center">
            <div className="border-border bg-secondary flex h-14 w-14 items-center justify-center rounded-2xl border">
              <Sparkles className="text-primary h-6 w-6" />
            </div>
            <h2 className="mt-6 text-xl font-semibold tracking-tight">
              Create your first project
            </h2>
            <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
              Drop your product&apos;s URL, have a quick conversation with your AI
              growth marketer, and walk away with a concrete plan for every
              platform you pick.
              {access.onTrial && " Your first project is free — no card needed."}
            </p>
            <Button
              className="mt-8"
              render={<Link href={access.canCreateProject ? "/projects/new" : subscribeHref} />}
            >
              {access.canCreateProject ? "Start the interview" : "Subscribe to continue"}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => {
            const status = STATUS_COPY[project.status] ?? STATUS_COPY.onboarding;
            const platforms = project.project_platforms ?? [];
            return (
              <Link key={project.id} href={`/projects/${project.id}`} className="group">
                <Card className="border-border/70 group-hover:border-primary/40 h-full transition-colors">
                  <CardContent className="flex h-full flex-col p-6">
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-semibold tracking-tight">{project.name}</h3>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${status.className}`}
                      >
                        {status.label}
                      </span>
                    </div>
                    {project.website_url && (
                      <p className="text-muted-foreground mt-1.5 truncate text-xs">
                        {project.website_url}
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-1.5">
                      {platforms.length === 0 ? (
                        <span className="text-muted-foreground text-xs">
                          No platforms yet
                        </span>
                      ) : (
                        platforms.map((p) => (
                          <span
                            key={p.platform}
                            title={p.platform}
                            className="border-border bg-secondary inline-flex h-7 w-7 items-center justify-center rounded-lg border"
                          >
                            <PlatformIcon platform={p.platform} className="h-3.5 w-3.5" />
                          </span>
                        ))
                      )}
                    </div>
                    <p className="text-muted-foreground mt-auto flex items-center gap-1.5 pt-5 text-xs">
                      <Clock className="h-3.5 w-3.5" />
                      Updated {timeAgo(project.updated_at)}
                    </p>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
