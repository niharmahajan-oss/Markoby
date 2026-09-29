"use client";

import { CheckCircle2, Loader2, MessageSquareQuote, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { ensureWeeklyCheckin, submitCheckinResponse } from "@/app/projects/content-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { formatISODate, mondayOfISO, todayISODate } from "@/lib/calendar";

export type CheckinSummary = {
  id: string;
  weekStartDate: string;
  founderResponse: string | null;
  responseReceivedAt: string | null;
};

/**
 * Feature 5's in-app half: the weekly "what did you post, and how did it go?"
 * prompt. Its answer feeds the same context plan generation reads, and triggers
 * one more week of calendar items.
 */
export function CheckinCard({
  projectId,
  latest,
  history,
}: {
  projectId: string;
  latest: CheckinSummary | null;
  history: CheckinSummary[];
}) {
  const router = useRouter();
  const [response, setResponse] = useState("");
  const [busy, setBusy] = useState<null | "start" | "submit">(null);

  const thisWeek = mondayOfISO(todayISODate());
  const isCurrentWeek = latest?.weekStartDate === thisWeek;
  const pending = latest && !latest.founderResponse ? latest : null;

  async function start() {
    setBusy("start");
    const result = await ensureWeeklyCheckin(projectId);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error ?? "Could not start this week's check-in.");
      return;
    }
    router.refresh();
  }

  async function submit() {
    if (!pending) return;
    setBusy("submit");
    const result = await submitCheckinResponse(pending.id, response);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setResponse("");
    router.refresh();
    toast.success("Thanks — Markoby is rebuilding next week's plan around this.");
  }

  return (
    <Card className="border-primary/25 bg-primary/5 mt-6">
      <CardContent className="p-5">
        {pending ? (
          <>
            <p className="flex items-center gap-2 font-medium">
              <MessageSquareQuote className="text-primary h-4 w-4" />
              {isCurrentWeek ? "This week's check-in" : "Your check-in is still open"}
              <span className="text-muted-foreground text-xs font-normal">
                week of {formatISODate(pending.weekStartDate, { day: "numeric", month: "short" })}
              </span>
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              What did you post this week, and how did it go? Rough is fine — this is the
              signal Markoby uses to change next week&apos;s plan.
            </p>
            <Textarea
              value={response}
              onChange={(event) => setResponse(event.target.value)}
              rows={3}
              className="mt-3"
              placeholder="e.g. Two Reddit comments and one post. The post got 60 upvotes and three people asked for a demo link; the X thread did nothing."
              aria-label="Weekly check-in response"
            />
            <Button className="mt-3" onClick={() => void submit()} disabled={busy !== null}>
              {busy === "submit" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              Send update
            </Button>
          </>
        ) : isCurrentWeek && latest?.founderResponse ? (
          <div>
            <p className="flex items-center gap-2 font-medium">
              <CheckCircle2 className="h-4 w-4 text-emerald-400" />
              You&apos;re checked in for this week
            </p>
            <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
              Thanks — your update is part of the context for everything Markoby writes
              next.
            </p>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-medium">Weekly check-in</p>
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                Markoby asks once a week what you posted and how it went, then rebuilds
                your plan around the answer.
              </p>
            </div>
            <Button variant="outline" onClick={() => void start()} disabled={busy !== null}>
              {busy === "start" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Start this week&apos;s check-in
            </Button>
          </div>
        )}

        {history.length > 0 && (
          <div className="border-border/60 mt-4 border-t pt-4">
            <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
              Earlier updates
            </p>
            <ul className="mt-2 space-y-2">
              {history.map((entry) => (
                <li key={entry.id} className="text-sm">
                  <span className="text-muted-foreground mr-2 text-xs">
                    {formatISODate(entry.weekStartDate, { day: "numeric", month: "short" })}
                  </span>
                  <span className="whitespace-pre-wrap">{entry.founderResponse}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
