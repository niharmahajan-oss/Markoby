import Link from "next/link";
import { MailCheck } from "lucide-react";

import { Button } from "@/components/ui/button";

export const metadata = { title: "Confirm your email · Markoby" };

export default async function CheckEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <div className="border-border bg-card flex h-14 w-14 items-center justify-center rounded-2xl border">
        <MailCheck className="text-primary h-7 w-7" />
      </div>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">Check your inbox</h1>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        We sent you a confirmation link. Click it to activate your account, then
        you&apos;ll be taken straight to subscribe.
      </p>
      <Button className="mt-8" variant="secondary" render={<Link href={next ? `/auth/login?next=${encodeURIComponent(next)}` : "/auth/login"} />}>
        Back to login
      </Button>
    </main>
  );
}
