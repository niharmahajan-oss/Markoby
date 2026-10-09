import Link from "next/link";

import { AccountMenu } from "@/components/account-menu";
import { WordmarkLink } from "@/components/wordmark";
import { SUBSCRIBE_PATH, getUserWithSubscription } from "@/lib/auth";

export async function DashboardHeader({
  email,
  fullName,
}: {
  email: string;
  fullName: string | null;
}) {
  // "Plan & billing" should land active subscribers on the page that manages
  // their plan — which differs by provider (PayPal manages itself in-account;
  // Razorpay goes through our subscribe/cancel flow).
  const user = await getUserWithSubscription();
  const billingHref =
    user?.subscriptionStatus === "active" && user.subscriptionProvider === "paypal"
      ? "/dashboard/profile"
      : `${SUBSCRIBE_PATH}?reason=trial`;
  return (
    <header className="border-border/60 bg-background/70 sticky top-0 z-50 border-b backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
        <WordmarkLink />
        <div className="flex items-center gap-1">
          {/* Direct link so the profile is always one click away, independent of
              the account menu. */}
          <Link
            href="/dashboard/profile"
            className="text-muted-foreground hover:text-foreground hover:bg-accent/60 hidden rounded-full px-3 py-1.5 text-sm transition-colors sm:inline-block"
          >
            Profile
          </Link>
          <AccountMenu email={email} fullName={fullName} billingHref={billingHref} />
        </div>
      </div>
    </header>
  );
}
