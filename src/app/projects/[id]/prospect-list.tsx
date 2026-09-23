"use client";

import { Check, ExternalLink, EyeOff, Map, Radar } from "lucide-react";
import { useState } from "react";

import { PlatformIcon } from "@/components/platform-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { platformLabel } from "@/lib/platform-label";
import type { Prospect, ProspectStatus } from "@/lib/types";

export function ProspectList({
  prospects,
  onStatusChange,
}: {
  prospects: Prospect[];
  onStatusChange: (id: string, status: ProspectStatus) => Promise<void>;
}) {
  const platforms = [...new Set(prospects.map((p) => p.platform))];

  if (prospects.length === 0) {
    return (
      <Card className="border-border/70 mt-4 border-dashed">
        <CardContent className="text-muted-foreground py-10 text-center text-sm">
          No prospects discovered yet. They appear here automatically once your
          plans finish generating.
        </CardContent>
      </Card>
    );
  }

  return (
    <Tabs defaultValue={platforms[0]} className="mt-4">
      <TabsList className="flex-wrap">
        {platforms.map((platform) => (
          <TabsTrigger key={platform} value={platform} className="gap-2">
            <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{platformLabel(platform)}</span>
          </TabsTrigger>
        ))}
      </TabsList>

      {platforms.map((platform) => {
        const items = prospects.filter((p) => p.platform === platform);
        return (
          <TabsContent key={platform} value={platform} className="mt-4">
            <div className="space-y-3">
              {items.map((prospect) => (
                <ProspectCard
                  key={prospect.id}
                  prospect={prospect}
                  onStatusChange={onStatusChange}
                />
              ))}
            </div>
          </TabsContent>
        );
      })}
    </Tabs>
  );
}

function ProspectCard({
  prospect,
  onStatusChange,
}: {
  prospect: Prospect;
  onStatusChange: (id: string, status: ProspectStatus) => Promise<void>;
}) {
  const [status, setStatus] = useState<ProspectStatus>(prospect.status);
  const [pending, setPending] = useState(false);

  async function change(next: ProspectStatus) {
    setPending(true);
    setStatus(next); // optimistic
    await onStatusChange(prospect.id, next);
    setPending(false);
  }

  const isGuide = prospect.source_type === "guide";

  return (
    <Card
      className={`border-border/70 ${status === "ignored" ? "opacity-50" : ""}`}
    >
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              {isGuide ? (
                <Badge variant="secondary" className="gap-1">
                  <Map className="h-3 w-3" />
                  Targeting guide
                </Badge>
              ) : (
                <Badge
                  variant="secondary"
                  className={scoreColor(prospect.relevance_score)}
                >
                  <Radar className="h-3 w-3" />
                  {prospect.relevance_score ?? "—"}% match
                </Badge>
              )}
              {status === "contacted" && (
                <Badge className="bg-emerald-500/15 text-emerald-400 gap-1">
                  <Check className="h-3 w-3" />
                  Contacted
                </Badge>
              )}
            </div>

            {isGuide ? (
              <p className="mt-3 text-sm leading-relaxed whitespace-pre-wrap">
                {prospect.relevance_reason}
              </p>
            ) : (
              <>
                <a
                  href={prospect.external_handle_or_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-primary mt-3 inline-flex items-center gap-1.5 font-medium transition-colors"
                >
                  {prospect.display_name}
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
                {prospect.context_excerpt && (
                  <p className="text-muted-foreground mt-1.5 line-clamp-2 text-sm">
                    {prospect.context_excerpt}
                  </p>
                )}
                <p className="text-muted-foreground mt-2 text-sm leading-relaxed">
                  <span className="text-foreground font-medium">Why: </span>
                  {prospect.relevance_reason}
                </p>
              </>
            )}
          </div>

          {!isGuide && (
            <div className="flex shrink-0 gap-2">
              {status !== "contacted" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending}
                  onClick={() => change("contacted")}
                >
                  <Check className="h-4 w-4" />
                  Mark contacted
                </Button>
              )}
              {status !== "ignored" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => change("ignored")}
                  className="text-muted-foreground"
                >
                  <EyeOff className="h-4 w-4" />
                  Ignore
                </Button>
              )}
              {status !== "new" && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => change("new")}
                  className="text-muted-foreground"
                >
                  Reset
                </Button>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function scoreColor(score: number | null): string {
  if (score === null) return "";
  if (score >= 75) return "bg-primary/15 text-primary";
  if (score >= 60) return "bg-amber-500/15 text-amber-400";
  return "bg-secondary text-secondary-foreground";
}
