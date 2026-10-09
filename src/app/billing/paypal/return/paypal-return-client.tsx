"use client";

import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { verifyAndActivatePayPalSubscription } from "@/app/billing/paypal-actions";
import { Card, CardContent } from "@/components/ui/card";

/**
 * Runs the verify-and-activate server action once on mount. The subscription
 * id comes from PayPal's redirect; the server re-validates it against both
 * the user's stored row and PayPal's API before activating Pro.
 */
export function PayPalReturnClient({ subscriptionId }: { subscriptionId: string }) {
  const router = useRouter();
  const [state, setState] = useState<"verifying" | "success" | "error">("verifying");
  const [message, setMessage] = useState<string>("");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    void (async () => {
      const result = await verifyAndActivatePayPalSubscription({ paypalSubscriptionId: subscriptionId });
      if (result.ok) {
        setState("success");
        toast.success("Welcome to Markoby Pro!");
        // Give the success state a beat to render, then land in the app.
        setTimeout(() => {
          router.push("/dashboard");
          router.refresh();
        }, 1200);
      } else {
        setState("error");
        setMessage(result.error ?? "Verification failed. Please try again.");
      }
    })();
  }, [router, subscriptionId]);

  return (
    <Card className="border-border bg-card rounded-2xl border p-8 text-center">
      <CardContent className="space-y-4">
        {state === "verifying" && (
          <>
            <Loader2 className="text-muted-foreground mx-auto h-10 w-10 animate-spin" />
            <h1 className="text-xl font-semibold">Confirming your subscription…</h1>
            <p className="text-muted-foreground text-sm">
              We&apos;re checking with PayPal. This only takes a moment.
            </p>
          </>
        )}
        {state === "success" && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-[#a3e635]" />
            <h1 className="text-xl font-semibold">You&apos;re on Markoby Pro!</h1>
            <p className="text-muted-foreground text-sm">Taking you to your dashboard…</p>
          </>
        )}
        {state === "error" && (
          <>
            <XCircle className="text-destructive mx-auto h-10 w-10" />
            <h1 className="text-xl font-semibold">We couldn&apos;t confirm your subscription</h1>
            <p className="text-muted-foreground text-sm">{message}</p>
            <Link href="/billing/subscribe" className="text-sm underline underline-offset-4">
              Back to billing
            </Link>
          </>
        )}
      </CardContent>
    </Card>
  );
}
