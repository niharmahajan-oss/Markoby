"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  startPayPalSubscription,
  verifyAndActivatePayPalSubscription,
} from "@/app/billing/paypal-actions";
import { Button } from "@/components/ui/button";

/**
 * PayPal Subscriptions flow using PayPal's hosted approval experience
 * (the official return/cancel redirect flow from the Subscriptions API —
 * no home-grown button, no faked UI):
 *
 * 1. Server action creates the PayPal subscription (plan/price decided
 *    server-side) and stores its id on the user's row.
 * 2. We redirect to PayPal's `approve` link, where the user logs in and
 *    approves the recurring payment.
 * 3. PayPal returns the user to /billing/paypal/return, which calls the
 *    verify-and-activate server action that re-checks the subscription
 *    against PayPal's API before activating Pro.
 */

export function PayPalSubscribeButton({ disabledLabel }: { disabledLabel?: string }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  async function onSubscribe() {
    setStarting(true);
    const result = await startPayPalSubscription();
    if (!result.ok) {
      toast.error(result.error, { duration: 9000 });
      setStarting(false);
      return;
    }

    if (result.approvalUrl) {
      // PayPal's hosted approval page is the official flow.
      window.location.href = result.approvalUrl;
      return;
    }

    // Rare: subscription created without an approve link (e.g. vaulted
    // buyer). Nothing to approve — check verification once, then let the
    // webhook drive.
    const verify = await verifyAndActivatePayPalSubscription({
      paypalSubscriptionId: result.subscriptionId,
    });
    if (verify.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      toast.error(verify.error ?? "Activation failed. If you were charged, you'll get access shortly.", {
        duration: 9000,
      });
      setStarting(false);
    }
  }

  return (
    <Button className="mt-8 w-full" size="lg" onClick={onSubscribe} disabled={starting}>
      {disabledLabel ?? (starting ? "Connecting to PayPal…" : "Subscribe with PayPal")}
    </Button>
  );
}
