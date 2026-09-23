import { ArrowRight, Clock, Plus, Sparkles } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PlatformIcon } from "@/components/platform-icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { getUserWithSubscription } from "@/lib/auth";
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
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login?next=/dashboard");

  const projects = await listProjects(user.id);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Your projects</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Each project gets its own interview, plans, and prospect lists.
          </p>
        </div>
        <Button render={<Link href="/projects/new" />}>
          <Plus className="h-4 w-4" />
          New project
        </Button>
      </div>

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
            </p>
            <Button className="mt-8" render={<Link href="/projects/new" />}>
              Start the interview
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
