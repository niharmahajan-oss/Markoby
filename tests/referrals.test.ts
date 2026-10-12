import { describe, expect, it, vi } from "vitest";

/**
 * Unit tests for the pure (no-DB) parts of the referral program:
 * reward amounts per currency, code generation, and the admin gate.
 *
 * The DB-backed flows (attribution, awarding, wallet, withdrawals) are
 * exercised by Postgres functions in 0005_referrals_wallet.sql and verified
 * against a live Supabase project; they need service credentials and are
 * covered by the migration's constraints + app-level guards documented in
 * the final implementation report.
 */

vi.mock("@/lib/supabase/server", () => ({
  createAdminClient: vi.fn(async () => {
    throw new Error("no DB in unit tests");
  }),
}));

describe("reward amounts", () => {
  it("INR reward is ₹100 (10,000 paise)", async () => {
    const { rewardAmountForCurrency, REFERRAL_REWARD_INR_PAISE } =
      await import("@/lib/referrals/referrals");
    expect(REFERRAL_REWARD_INR_PAISE).toBe(10_000);
    expect(rewardAmountForCurrency("INR")).toBe(10_000);
  });

  it("USD reward is $2 (200 cents)", async () => {
    const { rewardAmountForCurrency, REFERRAL_REWARD_USD_CENTS } =
      await import("@/lib/referrals/referrals");
    expect(REFERRAL_REWARD_USD_CENTS).toBe(200);
    expect(rewardAmountForCurrency("USD")).toBe(200);
  });

  it("eligibility window is 7 days (168 hours)", async () => {
    const { REWARD_ELIGIBILITY_HOURS } = await import(
      "@/lib/referrals/referrals"
    );
    expect(REWARD_ELIGIBILITY_HOURS).toBe(168);
  });
});

describe("referral code generation", () => {
  it("produces url-safe, unambiguous codes", async () => {
    const { generateReferralCode } = await import("@/lib/referrals/referrals");
    for (let i = 0; i < 50; i++) {
      const code = generateReferralCode();
      expect(code).toMatch(/^mk[abcdefghjkmnpqrstuvwxyz23456789]{10}$/);
      expect(code).not.toMatch(/[0oO1lI]/);
    }
  });

  it("is random (two calls essentially never collide)", async () => {
    const { generateReferralCode } = await import("@/lib/referrals/referrals");
    const seen = new Set(Array.from({ length: 200 }, () => generateReferralCode()));
    expect(seen.size).toBe(200);
  });
});

describe("admin gate", () => {
  const loadGate = async () => (await import("@/lib/referrals/referrals")).isAdminEmail;

  it("fails closed when ADMIN_EMAILS is unset", async () => {
    delete process.env.ADMIN_EMAILS;
    const isAdminEmail = await loadGate();
    expect(isAdminEmail("admin@markoby.in")).toBe(false);
  });

  it("allows exactly the allowlisted emails (case-insensitive)", async () => {
    process.env.ADMIN_EMAILS = " Admin@Markoby.in , ops@markoby.in";
    const isAdminEmail = await loadGate();
    expect(isAdminEmail("admin@markoby.in")).toBe(true);
    expect(isAdminEmail("OPS@MARKOBY.IN")).toBe(true);
    expect(isAdminEmail("user@markoby.in")).toBe(false);
    expect(isAdminEmail(null)).toBe(false);
    expect(isAdminEmail("")).toBe(false);
  });
});
