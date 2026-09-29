import { CreditCard } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { signOut } from "@/app/auth/actions";
import { SubscribeClient } from "@/app/billing/subscribe-client";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";
import { getUserWithAccess } from "@/lib/auth";

export const metadata = { title: "Subscription needed · Markoby" };

const STATUS_COPY: Record<string, { title: string; body: string }> = {
  past_due: {
    title: "Your last payment didn't go through",
    body: "Retry your payment below to keep your projects, plans, and prospects exactly where you left them.",
  },
  canceled: {
    title: "Your subscription has ended",
    body: "Resubscribe to jump back in — your data is safe and your plans are waiting.",
  },
  inactive: {
    title: "Your subscription isn't active",
    body: "Markoby is a paid product — this is the only plan we offer, and it includes everything.",
  },
};

export default async function InactivePage() {
  const session = await getUserWithAccess();
  if (!session) redirect("/auth/login?next=/billing/inactive");
  const { user, access } = session;
  if (access.active) redirect("/dashboard");

  const copy = STATUS_COPY[user.subscriptionStatus] ?? STATUS_COPY.inactive;

  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-10 flex flex-col items-center">
          <Wordmark />
        </div>

        <div className="border-border bg-card rounded-2xl border p-8">
          <div className="border-border bg-muted flex h-12 w-12 items-center justify-center rounded-xl border">
            <CreditCard className="text-primary h-6 w-6" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold tracking-tight">{copy.title}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{copy.body}</p>

          <SubscribeClient email={user.email} name={user.fullName} />

          {access.onTrial && (
            <p className="mt-4 text-center text-xs">
              <Link
                href="/dashboard"
                className="text-muted-foreground underline-offset-4 hover:underline"
              >
                Not ready to pay? Use your free project instead
              </Link>
            </p>
          )}

          <div className="mt-6 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              Signed in as {user.email}
            </span>
            <form action={signOut}>
              <Button variant="ghost" size="sm" type="submit">
                Log out
              </Button>
            </form>
          </div>
        </div>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          Trouble paying? <Link href="mailto:support@markoby.app" className="underline-offset-4 hover:underline">support@markoby.app</Link>
        </p>
      </div>
    </main>
  );
}
