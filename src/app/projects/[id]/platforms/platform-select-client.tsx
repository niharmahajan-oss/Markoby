"use client";

import { Check, Loader2, Radar, Map } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { savePlatformsAndGenerate } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import type { Platform } from "@/lib/ai/types";

const PLATFORMS: {
  id: Platform;
  label: string;
  blurb: string;
  discovery: "api" | "guide";
}[] = [
  {
    id: "reddit",
    label: "Reddit",
    blurb: "Communities, build-in-public threads, comment-led trust building.",
    discovery: "api",
  },
  {
    id: "x",
    label: "X (Twitter)",
    blurb: "Build in public, niche replies, sharp single-observation posts.",
    discovery: "guide",
  },
  {
    id: "instagram",
    label: "Instagram",
    blurb: "Reels for discovery, carousels for saves, Stories for relationship.",
    discovery: "guide",
  },
  {
    id: "discord",
    label: "Discord",
    blurb: "Real-time community presence; own a server once it's earned.",
    discovery: "guide",
  },
  {
    id: "youtube",
    label: "YouTube",
    blurb: "Search-intent videos that compound, Shorts for reach.",
    discovery: "api",
  },
];

export function PlatformSelectClient({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<Platform>>(new Set());
  const [pending, setPending] = useState(false);

  function toggle(platform: Platform) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(platform)) next.delete(platform);
      else next.add(platform);
      return next;
    });
  }

  async function onContinue() {
    setPending(true);
    const result = await savePlatformsAndGenerate(projectId, [...selected]);
    if (!result.ok) {
      toast.error(result.error);
      setPending(false);
      return;
    }
    router.push(result.redirect);
  }

  return (
    <div className="mt-8">
      <div className="grid gap-3 sm:grid-cols-2">
        {PLATFORMS.map((platform) => {
          const isSelected = selected.has(platform.id);
          return (
            <button
              key={platform.id}
              type="button"
              onClick={() => toggle(platform.id)}
              aria-pressed={isSelected}
              className={`border-border bg-card text-left transition-all ${
                isSelected
                  ? "border-primary ring-primary/30 ring-2"
                  : "hover:border-foreground/25"
              } rounded-2xl border p-5`}
            >
              <div className="flex items-center justify-between">
                <span className="font-semibold tracking-tight">{platform.label}</span>
                <span
                  className={`flex h-5 w-5 items-center justify-center rounded-md border transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "border-border"
                  }`}
                >
                  {isSelected && <Check className="h-3.5 w-3.5" />}
                </span>
              </div>
              <p className="text-muted-foreground mt-2 text-sm">{platform.blurb}</p>
              <p className="mt-3 flex items-center gap-1.5 text-xs">
                {platform.discovery === "api" ? (
                  <>
                    <Radar className="text-primary h-3.5 w-3.5" />
                    <span className="text-primary">Prospect discovery included</span>
                  </>
                ) : (
                  <>
                    <Map className="text-muted-foreground h-3.5 w-3.5" />
                    <span className="text-muted-foreground">
                      Targeting guide (no public search API)
                    </span>
                  </>
                )}
              </p>
            </button>
          );
        })}
      </div>

      <Button
        size="lg"
        className="mt-8 w-full"
        onClick={onContinue}
        disabled={pending || selected.size === 0}
      >
        {pending ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Kicking off generation…
          </>
        ) : (
          <>
            Generate my plans ({selected.size}{" "}
            {selected.size === 1 ? "platform" : "platforms"})
          </>
        )}
      </Button>
      <p className="text-muted-foreground mt-3 text-center text-xs">
        Plan generation runs in the background — you can watch progress on the
        project page.
      </p>
    </div>
  );
}
