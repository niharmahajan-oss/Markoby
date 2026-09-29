"use server";

import { getUserWithSubscription, hasActiveSubscription } from "@/lib/auth";
import {
  createSubscription,
  ensureCustomer,
  explainRazorpayError,
  getRazorpayKeyId,
  verifyCheckoutSignature,
} from "@/lib/billing/razorpay";
import { createClient } from "@/lib/supabase/server";

export type StartSubscriptionResult =
  | {
      ok: true;
      subscriptionId: string;
      razorpayKeyId: string;
      /** Hosted Razorpay page, used as a fallback if Checkout.js won't load. */
      shortUrl: string | null;
    }
  | { ok: false; error: string };

/**
 * Creates the Razorpay customer + subscription and stores their ids on the
 * user's subscriptions row (status stays inactive until the webhook confirms).
 * The client then opens Razorpay Checkout with the returned ids.
 */
export async function startSubscription(): Promise<StartSubscriptionResult> {
  const user = await getUserWithSubscription();
  if (!user) return { ok: false, error: "You need to sign in first." };
  if (hasActiveSubscription(user)) return { ok: false, error: "You already have an active subscription." };

  const supabase = await createClient();

  // Reuse whatever Razorpay ids we already have so retries are idempotent:
  // closing Checkout and trying again resumes the same customer/mandate
  // instead of creating new ones on every attempt.
  const { data: row } = await supabase
    .from("subscriptions")
    .select("razorpay_customer_id, razorpay_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  try {
    const customer = await ensureCustomer(
      user.id,
      user.email,
      user.fullName,
      row?.razorpay_customer_id,
    );
    const subscription = await createSubscription(
      customer.id,
      row?.razorpay_subscription_id,
    );

    const { error } = await supabase
      .from("subscriptions")
      .update({
        razorpay_customer_id: customer.id,
        razorpay_subscription_id: subscription.id,
        status: "inactive",
      })
      .eq("user_id", user.id);

    if (error) return { ok: false, error: "Could not save your subscription. Try again." };

    return {
      ok: true,
      subscriptionId: subscription.id,
      razorpayKeyId: getRazorpayKeyId(),
      shortUrl: subscription.short_url ?? null,
    };
  } catch (err) {
    console.error("[billing] startSubscription failed:", err);
    return {
      ok: false,
      error: `${explainRazorpayError(err)} You can retry as many times as you need — nothing was charged.`,
    };
  }
}

export type ActivateResult = { ok: boolean; error?: string };

/**
 * Optimistic activation after a successful Checkout auth: verify the Checkout
 * signature client-proof, flip the row to active immediately so the founder
 * isn't blocked on the webhook, and let the webhook remain source of truth.
 */
export async function activateSubscription(input: {
  razorpaySubscriptionId: string;
  razorpayPaymentId: string;
  signature: string;
}): Promise<ActivateResult> {
  const user = await getUserWithSubscription();
  if (!user) return { ok: false, error: "You need to sign in first." };

  const supabase = await createClient();
  const { data: row } = await supabase
    .from("subscriptions")
    .select("id, razorpay_subscription_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!row || row.razorpay_subscription_id !== input.razorpaySubscriptionId) {
    return { ok: false, error: "Subscription mismatch. Contact support." };
  }

  let valid = false;
  try {
    valid = verifyCheckoutSignature(
      input.razorpaySubscriptionId,
      input.razorpayPaymentId,
      input.signature,
    );
  } catch (err) {
    console.error("[billing] signature verification error:", err);
    return { ok: false, error: "Verification error. Please try again." };
  }
  if (!valid) return { ok: false, error: "Invalid payment signature." };

  // Subscription authentication just succeeded; first renewal will confirm
  // via webhook. Optimistically activate with a 48h grace window.
  const periodEnd = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("subscriptions")
    .update({ status: "active", current_period_end: periodEnd })
    .eq("user_id", user.id);

  if (error) return { ok: false, error: "Could not activate your subscription. Try again." };
  return { ok: true };
}
