"use client";

import { AlertTriangle, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * Route-level error boundary. Without one, a thrown server or client error
 * surfaces as a dead browser tab ("This page couldn't load"); this keeps the
 * founder inside the product with a clear way forward.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[app] render error:", error);
  }, [error]);

  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <div className="border-border bg-secondary flex h-14 w-14 items-center justify-center rounded-2xl border">
        <AlertTriangle className="text-primary h-6 w-6" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Something went wrong
      </h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        This page hit an error we didn&apos;t expect. Your projects are safe —
        try again, or head back to your dashboard.
      </p>
      {error.digest && (
        <p className="text-muted-foreground mt-3 font-mono text-xs">
          Reference: {error.digest}
        </p>
      )}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button onClick={reset}>
          <RotateCcw className="h-4 w-4" />
          Try again
        </Button>
        <Button variant="outline" render={<Link href="/dashboard" />}>
          Back to dashboard
        </Button>
      </div>
    </main>
  );
}
