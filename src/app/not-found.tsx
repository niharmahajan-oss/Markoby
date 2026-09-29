import { Compass } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";

export const metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-6 text-center">
      <Wordmark />
      <div className="border-border bg-secondary mt-10 flex h-14 w-14 items-center justify-center rounded-2xl border">
        <Compass className="text-primary h-6 w-6" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        We couldn&apos;t find that page
      </h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm leading-relaxed">
        The link may be old or mistyped. Your dashboard has everything you
        created.
      </p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button render={<Link href="/dashboard" />}>Go to dashboard</Button>
        <Button variant="outline" render={<Link href="/" />}>
          Back to home
        </Button>
      </div>
    </main>
  );
}
