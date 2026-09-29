import { ArrowRight, Sparkles } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { FREE_TRIAL_PROJECTS, SUBSCRIBE_PATH, type Access } from "@/lib/auth";

/** Free-trial status strip shown above the dashboard. Hidden once subscribed. */
export function TrialBanner({ access }: { access: Access }) {
  if (access.active) return null;

  const used = Math.min(access.projectCount, FREE_TRIAL_PROJECTS);
  const cta = `${SUBSCRIBE_PATH}?reason=trial`;

  return (
    <div className="border-primary/25 bg-primary/5 border-b">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-6 py-3">
        <p className="flex items-center gap-2 text-sm">
          <Sparkles className="text-primary h-4 w-4 shrink-0" />
          {access.onTrial ? (
            used === 0 ? (
              <span>
                <span className="font-medium">Your first project is free.</span>{" "}
                <span className="text-muted-foreground">
                  No card needed — subscribe when you want more.
                </span>
              </span>
            ) : (
              <span>
                <span className="font-medium">Free trial</span>{" "}
                <span className="text-muted-foreground">
                  {used} of {FREE_TRIAL_PROJECTS} free project used. Subscribe for
                  unlimited projects.
                </span>
              </span>
            )
          ) : (
            <span>
              <span className="font-medium">Free trial used up.</span>{" "}
              <span className="text-muted-foreground">
                Subscribe to ₹299/month to create more projects.
              </span>
            </span>
          )}
        </p>
        <Button
          size="sm"
          variant={access.onTrial ? "ghost" : "default"}
          render={<Link href={cta} />}
        >
          See the plan
          <ArrowRight className="ml-1.5 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
