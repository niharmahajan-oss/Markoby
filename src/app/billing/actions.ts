"use server";

import { getUserWithSubscription, hasActiveSubscription } from "@/lib/auth";
import {
  createSubscription,
  ensureCustomer,
  explainRazorpayError,
  getRazorpayKeyId,
  verifyCheckoutSignature,
} from "@/lib/billing/razorpay";
import { createAdminClient } from "@/lib/supabase/server";

export type StartSubscriptionResult =
  | {
      ok: true;
      subscriptionId: string;
      razorpayKeyId: string;
      /** Hosted Razorpay page, used as a fallback if Checkout.js won't load. */
      shortUrl: string | null;
    }
  | { ok: false; error: string };

type SubscriptionRow = {
  razorpay_customer_id: string | null;
  razorpay_subscription_id: string | null;
};

/**
 * Billing writes must use the service-role client: the `subscriptions` table is
 * deliberately RLS-locked against user writes (so nobody can self-activate).
 * A user-scoped update is *silently* ignored — Supabase answers 200 with an
 * empty array and no error — which is exactly how the Razorpay ids used to get
 * lost, breaking checkout retries and post-payment activation.
 */
function serviceRoleKeyMissing(): boolean {
  return !process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function loadSubscriptionRow(userId: string): Promise<SubscriptionRow | null> {
  const admin = await createAdminClient();
  const { data, error } = await admin
    .from("subscriptions")
    .select("razorpay_customer_id, razorpay_subscription_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.error("[billing] could not read subscription row:", error.message);
    return null;
  }
  return (data as SubscriptionRow | null) ?? null;
}

/**
 * Creates the Razorpay customer + subscription and stores their ids on the
 * user's subscriptions row (status stays inactive until the webhook confirms).
 * The client then opens Razorpay Checkout with the returned ids.
 */
export async function startSubscription(): Promise<StartSubscriptionResult> {
  const user = await getUserWithSubscription();
  if (!user) return { ok: false, error: "You need to sign in first." };
  if (hasActiveSubscription(user)) {
    return { ok: false, error: "You already have an active subscription." };
  }
  if (serviceRoleKeyMissing()) {
    console.error("[billing] SUPABASE_SERVICE_ROLE_KEY is not set");
    return {
      ok: false,
      error:
        "Billing isn't fully configured on the server (missing service role key). Please contact support@markoby.app.",
    };
  }

  const existing = await loadSubscriptionRow(user.id);

  try {
    const customer = await ensureCustomer(
      user.id,
      user.email,
      user.fullName,
      existing?.razorpay_customer_id,
    );
    const subscription = await createSubscription(
      customer.id,
      existing?.razorpay_subscription_id,
    );

    const admin = await createAdminClient();
    const { data: saved, error } = await admin
      .from("subscriptions")
      .upsert(
        {
          user_id: user.id,
          razorpay_customer_id: customer.id,
          razorpay_subscription_id: subscription.id,
          status: "inactive",
        },
        { onConflict: "user_id" },
      )
      .select("id");

    // Guard against the silent zero-row write described above.
    if (error || !saved?.length) {
      console.error("[billing] could not persist subscription ids:", error?.message);
      return { ok: false, error: "Could not save your subscription. Try again." };
    }

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
  if (serviceRoleKeyMissing()) {
    return { ok: false, error: "Billing isn't fully configured on the server." };
  }

  const row = await loadSubscriptionRow(user.id);
  if (!row) {
    // No row yet: the webhook will create/update it by subscription id.
    console.warn("[billing] no subscriptions row while activating", input.razorpaySubscriptionId);
  } else if (
    row.razorpay_subscription_id &&
    row.razorpay_subscription_id !== input.razorpaySubscriptionId
  ) {
    // A *stale* id (null) is fine — we just stored this one. A mismatched,
    // non-null id means something else is going on.
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

  const admin = await createAdminClient();
  const { data: saved, error } = await admin
    .from("subscriptions")
    .upsert(
      {
        user_id: user.id,
        razorpay_subscription_id: input.razorpaySubscriptionId,
        status: "active",
        current_period_end: periodEnd,
      },
      { onConflict: "user_id" },
    )
    .select("id");

  if (error || !saved?.length) {
    console.error("[billing] could not activate subscription:", error?.message);
    return { ok: false, error: "Could not activate your subscription. Try again." };
  }
  return { ok: true };
}
