import "server-only";

import { randomBytes } from "crypto";

import { createAdminClient } from "@/lib/supabase/server";

/**
 * Referral program: code generation, attribution, reward amounts, admin gate.
 *
 * All amounts are in the smallest currency unit (paise/cents) to match the
 * wallet ledger:
 *   INR reward = ₹100  → 10_000 paise
 *   USD reward = $2    → 200 cents
 */

export const REFERRAL_REWARD_INR_PAISE = 10_000;
export const REFERRAL_REWARD_USD_CENTS = 200;

/** Reward eligibility window: 7 days after the verified initial payment. */
export const REWARD_ELIGIBILITY_HOURS = 7 * 24;

/** Manual payout rate limit: max open withdrawal requests per user. */
export const MAX_OPEN_WITHDRAWALS = 3;

export type RewardCurrency = "INR" | "USD";

export function rewardAmountForCurrency(currency: RewardCurrency): number {
  return currency === "INR" ? REFERRAL_REWARD_INR_PAISE : REFERRAL_REWARD_USD_CENTS;
}

/** Url-safe, unambiguous referral code (no 0/O/1/I). */
export function generateReferralCode(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  let code = "mk";
  for (const b of bytes) code += alphabet[b % alphabet.length];
  return code;
}

/**
 * Server-side admin gate. ADMIN_EMAILS is a comma/whitespace-separated
 * allowlist compared against the signed-in user's confirmed email. No admin
 * action may rely on hidden frontend buttons — every action and page calls
 * this.
 */
export function isAdminEmail(email: string | null | undefined): boolean {
  const allow = (process.env.ADMIN_EMAILS ?? "")
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (allow.length === 0) return false;
  return Boolean(email && allow.includes(email.trim().toLowerCase()));
}

/**
 * Generate a unique referral code for a user. Called once from the signup
 * path (server-side, service role); safe to call redundantly because it
 * leaves an existing code untouched.
 *
 * Also records referral attribution when `referrerCode` is valid and not a
 * self-referral. Attribution is write-once: later calls cannot change it
 * (enforced additionally by a DB trigger).
 */
export async function ensureReferralIdentity(
  userId: string,
  referrerCode?: string | null,
): Promise<void> {
  const admin = await createAdminClient();

  // 1. Resolve attribution BEFORE creating the user's own code (so a user
  //    can never refer themselves by reading their own code).
  if (referrerCode) {
    const { data: referrer } = await admin
      .from("profiles")
      .select("id")
      .eq("referral_code", referrerCode.trim())
      .maybeSingle();
    if (referrer && referrer.id !== userId) {
      // Write-once: only set when not already set (DB trigger also blocks
      // any later change).
      const { data: self } = await admin
        .from("profiles")
        .select("referred_by")
        .eq("id", userId)
        .maybeSingle();
      if (self && !self.referred_by) {
        await admin.from("profiles").update({ referred_by: referrer.id }).eq("id", userId);
        await admin.from("referrals").insert({
          referrer_id: referrer.id,
          referred_id: userId,
          status: "pending",
        });
      }
    }
  }

  // 2. Give the user their own code (idempotent).
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateReferralCode();
    const { error } = await admin
      .from("profiles")
      .update({ referral_code: code })
      .eq("id", userId)
      .is("referral_code", null)
      .select("id");
    if (!error) break;
  }
}
