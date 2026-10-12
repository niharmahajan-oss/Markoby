import "server-only";

import {
  REWARD_ELIGIBILITY_HOURS,
  rewardAmountForCurrency,
  type RewardCurrency,
} from "@/lib/referrals/referrals";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Server-side reward engine. Every decision here reads only provider-verified
 * webhook payloads (already signature-checked by the calling route) — never
 * frontend callbacks.
 *
 * Qualifying initial payments:
 *  - Razorpay: the first `payment.captured` for the referred user's Razorpay
 *    subscription with an INR amount.
 *  - PayPal: the first `PAYMENT.SALE.COMPLETED` for the referred user's
 *    PayPal subscription (resource.custom_id carries our user id — set when
 *    createPayPalSubscription runs).
 */

export type AwardResult =
  | { awarded: true; rewardId: string }
  | { awarded: false; reason: "no_referral" | "not_first_payment" | "error" | "self_referral" };

/**
 * Award a pending referral reward for a referred user's first qualifying
 * payment. Idempotent per (provider, payment_id) at the DB level and also
 * guarded here by a "already has any reward" check so a second payment on the
 * same subscription can't score twice.
 */
export async function awardReferralRewardForPayment(input: {
  referredUserId: string;
  provider: "razorpay" | "paypal";
  paymentId: string;
  currency: RewardCurrency;
}): Promise<AwardResult> {
  const admin = await createAdminClient();

  // Only the FIRST qualifying payment on this user's account earns a reward.
  const { count: priorPayments } = await admin
    .from("referral_rewards")
    .select("id", { count: "exact", head: true })
    .eq("provider", input.provider)
    // Same referred user: find via referral join isn't necessary — the
    // reward is keyed to a referral; count any prior reward from this
    // user's referral instead.
    .in(
      "referral_id",
      (
        await admin
          .from("referrals")
          .select("id")
          .eq("referred_id", input.referredUserId)
      ).data?.map((r) => r.id) ?? [],
    );
  if ((priorPayments ?? 0) > 0) {
    return { awarded: false, reason: "not_first_payment" };
  }

  const { data: rewardId, error } = await admin.rpc("award_referral_reward", {
    p_referred_user_id: input.referredUserId,
    p_provider: input.provider,
    p_payment_id: input.paymentId,
    p_amount: rewardAmountForCurrency(input.currency),
    p_currency: input.currency,
    p_hours_until_eligible: REWARD_ELIGIBILITY_HOURS,
  });

  if (error) {
    console.error("[rewards] award_referral_reward failed:", error.message);
    return { awarded: false, reason: "error" };
  }
  if (!rewardId) {
    return { awarded: false, reason: "no_referral" };
  }
  return { awarded: true, rewardId: String(rewardId) };
}

/** Release all pending rewards now eligible (called opportunistically). */
export async function releaseEligibleRewards(): Promise<number> {
  const admin = await createAdminClient();
  const { data: pending } = await admin
    .from("referral_rewards")
    .select("id")
    .eq("status", "pending")
    .lte("eligible_at", new Date().toISOString());

  let released = 0;
  for (const row of pending ?? []) {
    const { data: ok } = await admin.rpc("release_referral_reward", {
      p_reward_id: (row as { id: string }).id,
    });
    if (ok === true) released++;
  }
  return released;
}

/**
 * Reverse a reward tied to a provider payment that was refunded or disputed.
 * Called from both webhook routes when the provider reports REFUNDED/DENIED
 * (dispute) on the payment that generated a reward.
 */
export async function reverseRewardForPayment(input: {
  provider: "razorpay" | "paypal";
  paymentId: string;
}): Promise<boolean> {
  const admin = await createAdminClient();
  const { data: ok } = await admin.rpc("reverse_referral_reward", {
    p_provider: input.provider,
    p_payment_id: input.paymentId,
  });
  return ok === true;
}
