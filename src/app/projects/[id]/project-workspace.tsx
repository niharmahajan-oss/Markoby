"use client";

import {
  ArrowLeft,
  CalendarDays,
  Check,
  Compass,
  RefreshCw,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";

import { ProspectList } from "@/app/projects/[id]/prospect-list";
import {
  regeneratePlans,
  rerunInterview,
  setProspectStatus,
} from "@/app/projects/actions";
import { PlatformIcon } from "@/components/platform-icon";
import { ProjectNav } from "@/components/project-nav";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { platformLabel } from "@/lib/platform-label";
import type { Platform } from "@/lib/ai/types";
import type { PlanJSONData, Prospect } from "@/lib/types";

export type PlanRow = {
  platform: Platform;
  status: "pending" | "generating" | "ready" | "failed";
  error?: string | null;
  plan?: PlanJSONData;
  modelUsed?: string | null;
  promptVersion?: string | null;
};

type WorkspaceProps = {
  projectId: string;
  projectName: string;
  projectStatus: "onboarding" | "plan_ready" | "active";
  platforms: Platform[];
  plans: PlanRow[];
  prospects: Prospect[];
  summary: {
    businessDescription: string;
    targetAudience: string;
    valueProp: string;
    toneOfVoice: string;
  } | null;
};

export function ProjectWorkspace(props: WorkspaceProps) {
  const router = useRouter();
  const plans = props.plans;

  // Poll while any plan is still generating (4.7's "generating…" state).
  const generating = plans.some(
    (p) => p.status === "pending" || p.status === "generating",
  );
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(timer);
  }, [generating, router]);

  async function onRegenerate() {
    const result = await regeneratePlans(props.projectId);
    if (!result.ok) {
      toast.error(result.error ?? "Could not regenerate plans.");
      return;
    }
    toast.info("Regenerating all plans…");
    router.refresh();
  }

  async function onRerunInterview() {
    const result = await rerunInterview(props.projectId);
    if (!result.ok) {
      toast.error(result.error ?? "Could not reopen the interview.");
      return;
    }
    router.refresh();
  }

  async function onProspectStatus(id: string, status: Prospect["status"]) {
    const result = await setProspectStatus(id, status);
    if (!result.ok) {
      toast.error(result.error ?? "Could not update prospect.");
      return;
    }
  }

  const firstReady = plans.find((p) => p.status === "ready")?.platform;

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            All projects
          </Link>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">
            {props.projectName}
          </h1>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {props.platforms.map((platform) => (
              <span
                key={platform}
                title={platformLabel(platform)}
                className="border-border bg-secondary inline-flex h-7 w-7 items-center justify-center rounded-lg border"
              >
                <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
              </span>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ProjectNav projectId={props.projectId} />
          <Button variant="outline" size="sm" onClick={onRerunInterview}>
            <RefreshCw className="h-4 w-4" />
            Re-run interview
          </Button>
          <Button variant="outline" size="sm" onClick={onRegenerate}>
            <RefreshCw className="h-4 w-4" />
            Regenerate plans
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      {props.summary && (
        <Card className="border-border/70 mt-8">
          <CardContent className="p-5">
            <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
              What Maya learned
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <SummaryItem label="Business" value={props.summary.businessDescription} />
              <SummaryItem label="Ideal customer" value={props.summary.targetAudience} />
              <SummaryItem label="Value prop" value={props.summary.valueProp} />
              <SummaryItem label="Tone" value={props.summary.toneOfVoice} />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Plans */}
      <div className="mt-10 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
          <Compass className="text-primary h-5 w-5" />
          Marketing plans
        </h2>
        {generating && (
          <span className="text-muted-foreground flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Generating…
          </span>
        )}
      </div>

      <Tabs defaultValue={firstReady ?? plans[0]?.platform} className="mt-4">
        <TabsList className="flex-wrap">
          {plans.map((p) => (
            <TabsTrigger key={p.platform} value={p.platform} className="gap-2">
              <PlatformIcon platform={p.platform} className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{platformLabel(p.platform)}</span>
              {p.status === "generating" || p.status === "pending" ? (
                <RefreshCw className="h-3 w-3 animate-spin" />
              ) : p.status === "failed" ? (
                <X className="text-destructive h-3 w-3" />
              ) : null}
            </TabsTrigger>
          ))}
        </TabsList>

        {plans.map((p) => (
          <TabsContent key={p.platform} value={p.platform} className="mt-4">
            <PlanView planRow={p} />
          </TabsContent>
        ))}
      </Tabs>

      <Separator className="my-10" />

      {/* Prospects */}
      <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <Users className="text-primary h-5 w-5" />
        Prospects
      </h2>
      <p className="text-muted-foreground mt-1 text-sm">
        Real threads and videos surfaced via official platform APIs, scored for
        relevance. Platforms without a public search API get a targeting guide.
      </p>
      <ProspectList prospects={props.prospects} onStatusChange={onProspectStatus} />
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-sm leading-relaxed">{value || "—"}</p>
    </div>
  );
}

function PlanView({ planRow }: { planRow: PlanRow }) {
  if (planRow.status === "pending" || planRow.status === "generating") {
    return (
      <Card className="border-border/70">
        <CardContent className="space-y-3 p-6">
          <p className="text-muted-foreground flex items-center gap-2 text-sm">
            <RefreshCw className="h-4 w-4 animate-spin" />
            Building your {platformLabel(planRow.platform)} plan — this takes a
            minute or two.
          </p>
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (planRow.status === "failed") {
    return (
      <Card className="border-destructive/40">
        <CardContent className="flex flex-col items-start gap-3 p-6">
          <p className="text-destructive text-sm">
            Generation failed{planRow.error ? `: ${planRow.error}` : "."}
          </p>
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            <RefreshCw className="h-4 w-4" />
            Check again
          </Button>
        </CardContent>
      </Card>
    );
  }

  const plan = planRow.plan;
  if (!plan) return null;

  return (
    <div className="space-y-6">
      <Card className="border-primary/20 bg-primary/5">
        <CardContent className="p-6">
          <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
            Strategy
          </p>
          <p className="mt-2 leading-relaxed">{plan.strategy_summary}</p>
          <p className="text-muted-foreground mt-3 text-sm">
            <CalendarDays className="mr-1.5 inline h-4 w-4" />
            {plan.posting_cadence}
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold tracking-tight">Content pillars</h3>
            <ul className="mt-3 space-y-3">
              {plan.content_pillars.map((pillar) => (
                <li key={pillar.name}>
                  <p className="text-sm font-medium">{pillar.name}</p>
                  <p className="text-muted-foreground text-sm">{pillar.description}</p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold tracking-tight">Do / don&apos;t</h3>
            <ul className="mt-3 space-y-2">
              {plan.dos.map((d) => (
                <li key={d} className="flex items-start gap-2 text-sm">
                  <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
                  {d}
                </li>
              ))}
              {plan.donts.map((d) => (
                <li key={d} className="text-muted-foreground flex items-start gap-2 text-sm">
                  <X className="text-destructive mt-0.5 h-4 w-4 shrink-0" />
                  {d}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="p-6">
          <h3 className="font-semibold tracking-tight">3-week starter calendar</h3>
          <div className="mt-4 space-y-6">
            {plan.content_calendar.map((week) => (
              <div key={week.week}>
                <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
                  Week {week.week}
                </p>
                <div className="mt-3 space-y-2">
                  {week.items.map((item, idx) => (
                    <div
                      key={`${week.week}-${idx}`}
                      className="border-border/70 bg-background/40 flex flex-col gap-1 rounded-xl border p-4 sm:flex-row sm:items-baseline sm:gap-4"
                    >
                      <span className="text-muted-foreground w-12 shrink-0 text-xs font-medium">
                        {item.day}
                      </span>
                      <span className="text-primary w-20 shrink-0 text-xs font-medium">
                        {item.type}
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{item.title_or_hook}</p>
                        <p className="text-muted-foreground text-sm">{item.details}</p>
                      </div>
                      <span className="text-muted-foreground ml-auto shrink-0 text-xs whitespace-nowrap">
                        ~{item.effort_minutes} min
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <h3 className="font-semibold tracking-tight">
              {planRow.platform === "reddit" ? "Subreddits" : "Communities & accounts"}
            </h3>
            <ul className="mt-3 space-y-3">
              {plan.communities.map((c) => (
                <li key={c.name} className="border-border/60 rounded-xl border p-3.5">
                  <p className="text-sm font-medium">{c.name}</p>
                  <p className="text-muted-foreground mt-1 text-sm">{c.why}</p>
                  <p className="text-muted-foreground mt-1 text-xs">
                    {c.how_to_engage} · {c.rules_to_respect}
                  </p>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold tracking-tight">Keywords & hashtags</h3>
              <div className="mt-3 flex flex-wrap gap-2">
                {plan.hashtags_or_keywords.map((k) => (
                  <Badge key={k.term} variant="secondary">
                    {k.term}
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold tracking-tight">First post draft</h3>
              <p className="text-muted-foreground mt-3 text-sm leading-relaxed whitespace-pre-wrap">
                {plan.first_post_draft}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-6">
              <h3 className="font-semibold tracking-tight">Success metrics</h3>
              <ul className="mt-3 space-y-1.5">
                {plan.kpi_suggestions.map((kpi) => (
                  <li key={kpi} className="text-muted-foreground flex items-start gap-2 text-sm">
                    <span className="bg-primary mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" />
                    {kpi}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      </div>

      {(planRow.modelUsed || planRow.promptVersion) && (
        <p className="text-muted-foreground text-xs">
          Generated with {planRow.modelUsed} · prompt {planRow.promptVersion}
        </p>
      )}
    </div>
  );
}
