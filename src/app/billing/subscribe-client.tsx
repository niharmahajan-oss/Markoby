"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { activateSubscription, startSubscription } from "@/app/billing/actions";
import { PayPalSubscribeButton } from "@/components/billing/paypal-subscribe-button";
import { BILLING_PRICING, type BillingCurrency } from "@/lib/billing/currency";
import { Button } from "@/components/ui/button";

type RazorpayCheckoutOptions = {
  key: string;
  subscription_id: string;
  name: string;
  description: string;
  prefill?: { email?: string; name?: string };
  theme?: { color?: string };
  handler: (response: {
    razorpay_subscription_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
  }) => void;
  modal: { ondismiss: () => void };
};

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayCheckoutOptions) => { open: () => void };
  }
}

function loadRazorpayScript(): Promise<boolean> {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const existing = document.querySelector<HTMLScriptElement>('script[src*="checkout.razorpay.com"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(true));
      existing.addEventListener("error", () => resolve(false));
      return;
    }
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });
}

export function SubscribeClient({
  email,
  name,
  currency,
  usePayPal,
}: {
  email: string;
  name: string | null;
  /** Decided server-side (geo headers) — this is display only. */
  currency: BillingCurrency;
  /** True when PayPal is configured and the server picked the PayPal flow. */
  usePayPal: boolean;
}) {
  const pricing = BILLING_PRICING[currency];
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  async function onSubscribe() {
    setStarting(true);

    // Create (or resume) the Razorpay subscription first — that's where a
    // provider error can actually happen, and it fails fast.
    const result = await startSubscription();
    if (!result.ok) {
      toast.error(result.error, { duration: 9000 });
      setStarting(false);
      return;
    }

    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      // Checkout.js can be blocked by ad-blockers or offline networks; Razorpay
      // hosts the same flow on a short link we already have.
      if (result.shortUrl) {
        toast.info("Opening Razorpay's secure checkout page…");
        window.location.href = result.shortUrl;
        return;
      }
      toast.error("Couldn't reach Razorpay. Check your connection and retry.");
      setStarting(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: result.razorpayKeyId,
      subscription_id: result.subscriptionId,
      name: "Markoby",
      description: pricing.checkoutDescription,
      // Razorpay rejects names that aren't person names, so never prefill an
      // email-like value into the name field.
      prefill: { email, name: name && !name.includes("@") ? name : undefined },
      theme: { color: "#a3e635" },
      handler: (response) => {
        // Fire-and-forget: navigate on success, toast on failure.
        void (async () => {
          const { ok, error } = await activateSubscription({
            razorpaySubscriptionId: response.razorpay_subscription_id,
            razorpayPaymentId: response.razorpay_payment_id,
            signature: response.razorpay_signature,
          });
          if (ok) {
            router.push("/dashboard");
            router.refresh();
          } else {
            toast.error(error ?? "Activation failed. If you were charged, you'll get access shortly.");
          }
        })();
      },
      modal: {
        ondismiss: () => {
          setStarting(false);
          toast.info("Checkout closed before completing. You can retry as many times as you like.");
        },
      },
    });
    rzp.open();
  }

  return (
    <div className="border-border bg-card rounded-2xl border p-8 shadow-sm">
      <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">Markoby Pro</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tracking-tight">{pricing.amountLabel}</span>
        <span className="text-muted-foreground text-sm">/ month</span>
      </div>
      <ul className="mt-8 space-y-3 text-sm">
        {[
          "Unlimited projects — your first one is free",
          "AI onboarding interview that actually understands your product",
          "Organic marketing plans for Reddit, X, Instagram, Discord & YouTube",
          "Prospect lists: real people to reach, with reasons why",
          "Weekly content calendars with ready-to-adapt drafts",
          "Re-run the interview anytime your product evolves",
        ].map((feature) => (
          <li key={feature} className="flex items-start gap-2.5">
            <Check className="text-primary mt-0.5 h-4 w-4 shrink-0" />
            <span>{feature}</span>
          </li>
        ))}
      </ul>
      {usePayPal ? (
        <PayPalSubscribeButton />
      ) : (
        <>
          <Button className="mt-8 w-full" size="lg" onClick={onSubscribe} disabled={starting}>
            {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {pricing.buttonLabel}
            {!starting && <ArrowRight className="ml-2 h-4 w-4" />}
          </Button>
          <p className="text-muted-foreground mt-4 text-center text-xs">
            {pricing.methodsLabel}
          </p>
        </>
      )}
      {usePayPal && (
        <p className="text-muted-foreground mt-4 text-center text-xs">
          {pricing.methodsLabel}
        </p>
      )}
      <p className="text-muted-foreground mt-2 text-center text-xs">
        Closed the checkout or cancelled your plan before? You can start again
        whenever you want — nothing was charged.
      </p>
    </div>
  );
}
