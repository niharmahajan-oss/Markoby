import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { SubscribeClient } from "@/app/billing/subscribe-client";
import { Wordmark } from "@/components/wordmark";
import { getUserWithAccess } from "@/lib/auth";
import { billingCurrencyFromHeaders, countryFromHeaders } from "@/lib/billing/currency";
import { isPayPalConfigured } from "@/lib/billing/paypal";

export const metadata = { title: "Subscribe · Markoby" };

export default async function SubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const session = await getUserWithAccess();
  if (!session) redirect("/auth/login?next=/billing/subscribe");

  const { user, access } = session;
  if (access.active) redirect("/dashboard");

  // Server-decided currency + provider (geo headers); the client only displays it.
  const headersList = await headers();
  const currency = billingCurrencyFromHeaders(headersList);
  const usePayPal =
    isPayPalConfigured() &&
    countryFromHeaders(headersList) !== null &&
    currency === "USD";

  const { reason } = await searchParams;
  const trialUsed = reason === "trial" || access.trialExhausted;

  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <Wordmark />
          <p className="text-muted-foreground mt-3 text-center text-sm">
            {trialUsed
              ? "Your free project is used up. Subscribe to keep building — your work is saved."
              : "One plan. Everything included. Cancel anytime."}
          </p>
        </div>
        <SubscribeClient
          email={user.email}
          name={user.fullName}
          currency={currency}
          usePayPal={usePayPal}
        />

        {access.onTrial && (
          <p className="mt-6 text-center text-sm">
            <Link
              href="/dashboard"
              className="text-muted-foreground inline-flex items-center gap-1.5 underline-offset-4 hover:underline"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Or use your free project first
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
