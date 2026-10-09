"use server";

import { headers } from "next/headers";

import { getUserWithSubscription } from "@/lib/auth";
import { countryFromHeaders } from "@/lib/billing/currency";
import {
  cancelPayPalSubscription,
  createPayPalSubscription,
  ensurePlan,
  explainPayPalError,
  fetchPayPalSubscription,
  isPayPalSubscriptionActive,
} from "@/lib/billing/paypal";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * PayPal billing actions — the international/USD counterpart to
 * src/app/billing/actions.ts. All payment decisions (plan, price, currency,
 * status) are made here on the server; the client only receives ids to hand
 * to PayPal's SDK. Pro is never activated on a frontend callback alone: the
 * subscription is re-fetched from PayPal's API before activation.
 */

export type StartPayPalSubscriptionResult =
  | { ok: true; subscriptionId: string; approvalUrl: string | null }
  | { ok: false; error: string };

export type VerifyPayPalResult = { ok: boolean; error?: string };
export type CancelPayPalResult = { ok: boolean; error?: string };

async function logPayPalEvent(
  userId: string,
  eventType: string,
  metadata: Record<string, unknown>,
): Promise<void> {
  try {
    const admin = await createAdminClient();
    await admin.from("usage_events").insert({ user_id: userId, event_type: eventType, metadata });
  } catch (err) {
    console.warn("[paypal] could not write event log:", err);
  }
}

/**
 * The one place that decides whether a user may use PayPal billing:
 * country outside India (from CDN geo headers) — never a client value.
 */
export async function paypalEligible(): Promise<boolean> {
  const country = countryFromHeaders(await headers());
  // Unknown country → Razorpay INR (the default that keeps today's
  // behaviour), so PayPal requires a positive non-IN signal.
  return country !== null && country.toUpperCase() !== "IN";
}

/**
 * Create a PayPal subscription for the signed-in user against the $5/month
 * USD plan and store its id (status stays inactive until verified activation).
 */
export async function startPayPalSubscription(): Promise<StartPayPalSubscriptionResult> {
  const user = await getUserWithSubscription();
  if (!user) return { ok: false, error: "You need to sign in first." };
  if (user.subscriptionStatus === "active") {
    return { ok: false, error: "You already have an active subscription." };
  }
  if (!process.env.PAYPAL_CLIENT_ID || !process.env.PAYPAL_CLIENT_SECRET) {
    return { ok: false, error: "PayPal isn't configured yet. Please try the Razorpay option." };
  }

  try {
    const plan = await ensurePlan();
    const subscription = await createPayPalSubscription(plan.id, user.id, user.email);

    const admin = await createAdminClient();
    const { data: saved, error } = await admin
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          payment_provider: "paypal",
          paypal_subscription_id: subscription.id,
          currency: "USD",
          status: "inactive",
        },
        { onConflict: "user_id" },
      )
      .select("id");

    if (error || !saved?.length) {
      console.error("[paypal] could not persist subscription id:", error?.message);
      void logPayPalEvent(user.id, "billing_error", {
        stage: "paypal_persist",
        message: error?.message ?? "zero rows written",
      });
      return { ok: false, error: "Could not save your subscription. Try again." };
    }

    void logPayPalEvent(user.id, "billing_paypal_subscription_created", {
      subscription_id: subscription.id,
      plan_id: plan.id,
    });

    // PayPal returns an approve link for redirect-based approval flows.
    const approveLink =
      (subscription as unknown as { links?: { rel: string; href: string }[] }).links?.find(
        (l) => l.rel === "approve",
      )?.href ?? null;

    return { ok: true, subscriptionId: subscription.id, approvalUrl: approveLink };
  } catch (err) {
    console.error("[paypal] startPayPalSubscription failed:", err);
    void logPayPalEvent(user.id, "billing_error", {
      stage: "paypal_create",
      message: explainPayPalError(err),
    });
    return {
      ok: false,
      error: `${explainPayPalError(err)} You can retry as many times as you need — nothing was charged.`,
    };
  }
}

/**
 * Called after PayPal signals approval. Never trusts the callback: re-fetches
 * the subscription from PayPal's API and only activates when PayPal itself
 * reports ACTIVE/APPROVED for the id stored on this user's row.
 */
export async function verifyAndActivatePayPalSubscription(input: {
  paypalSubscriptionId: string;
}): Promise<VerifyPayPalResult> {
  const user = await getUserWithSubscription();
  if (!user) return { ok: false, error: "You need to sign in first." };

  const admin = await createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("paypal_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  // The id must match what WE created for this user — a callback naming some
  // other subscription is rejected before it can touch the row.
  if (!row?.paypal_subscription_id || row.paypal_subscription_id !== input.paypalSubscriptionId) {
    return { ok: false, error: "Subscription mismatch. Contact support." };
  }

  const sub = await fetchPayPalSubscription(input.paypalSubscriptionId);
  if (!sub) {
    return { ok: false, error: "Couldn't verify your subscription with PayPal. Try again." };
  }
  if (!isPayPalSubscriptionActive(sub.status)) {
    // Approved but not yet paid (e.g. e-check pending) — webhook will finish
    // the job when the first payment completes.
    void logPayPalEvent(user.id, "billing_paypal_not_active", {
      subscription_id: sub.id,
      status: sub.status,
    });
    return {
      ok: false,
      error:
        "Your subscription is approved but the first payment hasn't cleared yet. You'll get access automatically once it does.",
    };
  }

  // Period end: prefer PayPal's next_billing_time, fall back to +1 month.
  const nextBilling = sub.billing_info?.next_billing_time;
  const periodEnd = nextBilling
    ? new Date(nextBilling).toISOString()
    : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: saved, error } = await admin
    .from("subscriptions")
    .update({
      status: "active",
      current_period_end: periodEnd,
    })
    .eq("user_id", user.id)
    .eq("paypal_subscription_id", input.paypalSubscriptionId)
    .select("id");

  if (error || !saved?.length) {
    console.error("[paypal] could not activate:", error?.message);
    void logPayPalEvent(user.id, "billing_error", {
      stage: "paypal_activate",
      message: error?.message ?? "zero rows written",
    });
    return { ok: false, error: "Could not activate your subscription. Try again." };
  }

  void logPayPalEvent(user.id, "billing_paypal_activated", {
    subscription_id: sub.id,
    status: sub.status,
  });
  return { ok: true };
}

/**
 * Cancel at period end: PayPal keeps billing/access until the paid term ends
 * (its CANCELLED event flips us to `canceled` when the term lapses — actually
 * PayPal marks the subscription CANCELLED immediately but stops renewal; the
 * webhook's next_billing_time keeps the paid period visible, and our status
 * mapping keeps Pro until then via `canceled` handling below).
 */
export async function cancelPayPalSubscriptionAction(): Promise<CancelPayPalResult> {
  const user = await getUserWithSubscription();
  if (!user) return { ok: false, error: "You need to sign in first." };

  const admin = await createAdminClient();
  const { data: row } = await admin
    .from("subscriptions")
    .select("payment_provider, paypal_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (row?.payment_provider !== "paypal" || !row.paypal_subscription_id) {
    return { ok: false, error: "No PayPal subscription on this account." };
  }

  const ok = await cancelPayPalSubscription(row.paypal_subscription_id, "User requested cancellation");
  if (!ok) {
    return { ok: false, error: "Couldn't reach PayPal to cancel. Try again shortly." };
  }

  // Keep status as-is (active until period end); the CANCELLED webhook will
  // record the provider state, and the period-end timestamp we already store
  // preserves access for the paid term. Record the intent in the event log.
  void logPayPalEvent(user.id, "billing_paypal_cancel_requested", {
    subscription_id: row.paypal_subscription_id,
  });
  return { ok: true };
}
