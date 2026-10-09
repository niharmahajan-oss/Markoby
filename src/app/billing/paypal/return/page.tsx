import { Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { PayPalReturnClient } from "@/app/billing/paypal/return/paypal-return-client";
import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";
import { getUserWithSubscription } from "@/lib/auth";

export const metadata = { title: "Processing subscription · Markoby" };

/**
 * PayPal redirects here after the user approves the subscription. The page
 * component itself only renders; the actual verify-and-activate happens in a
 * client component so the user sees live status and errors land as toasts.
 */
async function ReturnInner({
  searchParams,
}: {
  searchParams: Promise<{ subscription_id?: string; token?: string }>;
}) {
  const { subscription_id } = await searchParams;

  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login?next=/billing/paypal/return");

  if (!subscription_id) {
    return (
      <Card className="border-border bg-card rounded-2xl border p-8 text-center">
        <CardContent className="space-y-4">
          <XCircle className="text-destructive mx-auto h-10 w-10" />
          <h1 className="text-xl font-semibold">Missing subscription reference</h1>
          <p className="text-muted-foreground text-sm">
            PayPal didn&apos;t tell us which subscription was approved. If you
            were charged, access is granted automatically once the webhook
            arrives — or contact support@markoby.app.
          </p>
          <Link href="/billing/subscribe" className="text-sm underline underline-offset-4">
            Back to billing
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <PayPalReturnClient subscriptionId={subscription_id} />
  );
}

export default async function PayPalReturnPage(props: {
  searchParams: Promise<{ subscription_id?: string; token?: string }>;
}) {
  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-4">
      <div className="mb-10 flex flex-col items-center">
        <Wordmark />
      </div>
      <div className="w-full max-w-md">
        <Suspense
          fallback={
            <Card className="border-border bg-card rounded-2xl border p-8 text-center">
              <CardContent>
                <Loader2 className="text-muted-foreground mx-auto h-6 w-6 animate-spin" />
              </CardContent>
            </Card>
          }
        >
          <ReturnInner searchParams={props.searchParams} />
        </Suspense>
      </div>
    </main>
  );
}
