"use client";

import { ArrowRight, Check, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { activateSubscription, startSubscription } from "@/app/billing/actions";
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

export function SubscribeClient({ email, name }: { email: string; name: string | null }) {
  const router = useRouter();
  const [starting, setStarting] = useState(false);

  async function onSubscribe() {
    setStarting(true);
    const loaded = await loadRazorpayScript();
    if (!loaded || !window.Razorpay) {
      toast.error("Couldn't reach Razorpay. Check your connection and retry.");
      setStarting(false);
      return;
    }

    const result = await startSubscription();
    if (!result.ok) {
      toast.error(result.error);
      setStarting(false);
      return;
    }

    const rzp = new window.Razorpay({
      key: result.razorpayKeyId,
      subscription_id: result.subscriptionId,
      name: "Markoby",
      description: "₹299/month · all features included",
      prefill: { email, name: name ?? undefined },
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
          toast.info("Checkout closed before completing. You can retry anytime.");
        },
      },
    });
    rzp.open();
  }

  return (
    <div className="border-border bg-card rounded-2xl border p-8 shadow-sm">
      <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">Markoby Pro</p>
      <div className="mt-3 flex items-baseline gap-2">
        <span className="text-5xl font-semibold tracking-tight">₹299</span>
        <span className="text-muted-foreground text-sm">/ month</span>
      </div>
      <ul className="mt-8 space-y-3 text-sm">
        {[
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
      <Button className="mt-8 w-full" size="lg" onClick={onSubscribe} disabled={starting}>
        {starting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Subscribe — ₹299/month
        {!starting && <ArrowRight className="ml-2 h-4 w-4" />}
      </Button>
      <p className="text-muted-foreground mt-4 text-center text-xs">
        Payments handled securely by Razorpay. UPI, cards, netbanking.
      </p>
    </div>
  );
}
