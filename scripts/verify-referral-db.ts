/* Verify referral schema end-to-end against the live (remote) Supabase. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const A = "ref-verifier-A@test.local";
const B = "ref-verifier-B@test.local";
const A_EMAILS = "ref-verifier-a2@test.local";

async function createTestUser(email: string) {
  // Idempotent: reuse any existing verifier account with this email.
  const { data: found } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .maybeSingle();
  if (found) return { id: found.id } as { id: string };

  const { data, error } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    password: crypto.randomUUID(),
  });
  if (error) throw new Error(`createUser failed: ${error.message}`);
  const { error: pe } = await admin
    .from("profiles")
    .upsert(
      {
        id: data.user.id,
        email,
        full_name: "Referral Verifier",
      },
      { onConflict: "id" },
    );
  if (pe) throw new Error(`profile create failed: ${pe.message}`);
  return data.user;
}

async function cleanup(ids: string[]) {
  for (const id of ids) {
    await admin.auth.admin.deleteUser(id);
  }
}

async function main() {
  const created: string[] = [];
  try {
    console.log("== setup: create test users ==");
    const userA = await createTestUser(A);
    const userB = await createTestUser(B);
    created.push(userA.id, userB.id);
    console.log("created A:", userA.id, "B:", userB.id);

    // Give A a referral code.
    const code = "mkverify00x";
    await admin.from("profiles").update({ referral_code: code }).eq("id", userA.id).is("referral_code", null);

    console.log("== 1. attribution via ensureReferralIdentity-equivalent ==");
    // Simulate what ensureReferralIdentity writes for a visitor ?ref=CODE.
    const { data: referrer } = await admin
      .from("profiles")
      .select("id")
      .eq("referral_code", code)
      .maybeSingle();
    if (!referrer || referrer.id !== userA.id) throw new Error("code lookup failed");
    const { error: attrErr } = await admin
      .from("profiles")
      .update({ referred_by: referrer.id })
      .eq("id", userB.id)
      .is("referred_by", null);
    console.log("attribution write:", attrErr?.message ?? "written");
    const { error: referralErr } = await admin
      .from("referrals")
      .insert({ referrer_id: referrer.id, referred_id: userB.id });
    console.log("referral row:", referralErr?.message ?? "created");

    console.log("== 2. self-referral would violate check ==");
    const selfRef = await admin
      .from("referrals")
      .insert({ referrer_id: userA.id, referred_id: userA.id });
    console.log(
      "self-referral insert:",
      selfRef.error ? `blocked ✓ (${(selfRef.error as { code?: string }).code})` : "NOT BLOCKED (BUG)",
    );

    console.log("== 3. re-attribution to a DIFFERENT user is blocked ==");
    const userC = await createTestUser(A_EMAILS);
    created.push(userC.id);
    const { error: immutErr } = await admin
      .from("profiles")
      .update({ referred_by: userC.id })
      .eq("id", userB.id);
    console.log(
      "re-pointing B's referred_by A→C:",
      immutErr ? "blocked ✓ (trigger)" : "ALLOWED (BUG)",
    );

    console.log("== 4. award_referral_reward (₹100) ==");
    const award1 = await admin.rpc("award_referral_reward", {
      p_referred_user_id: userB.id,
      p_provider: "razorpay",
      p_payment_id: "verify_payment_001",
      p_amount: 10000,
      p_currency: "INR",
      p_hours_until_eligible: 0,
    });
    const rewardId = award1.data as string;
    console.log("award 1:", rewardId, award1.error?.message ?? "");

    console.log("== 5. duplicate payment webhook idempotency ==");
    const award2 = await admin.rpc("award_referral_reward", {
      p_referred_user_id: userB.id,
      p_provider: "razorpay",
      p_payment_id: "verify_payment_001",
      p_amount: 10000,
      p_currency: "INR",
      p_hours_until_eligible: 0,
    });
    console.log(
      "award 2 (same payment id) returned same reward id:",
      award2.data === rewardId,
      award2.error?.message ?? "",
    );

    console.log("== 6. wallet_balances (pending ₹100, available ₹0) ==");
    const bal = await admin.rpc("wallet_balances", {
      p_user_id: userA.id,
      p_currency: "INR",
    });
    console.log("referrer INR:", JSON.stringify(bal.data));

    console.log("== 7. release (eligible_at = now) ==");
    if (rewardId) {
      const rel = await admin.rpc("release_referral_reward", { p_reward_id: rewardId });
      console.log("release:", rel.data);
    }
    const balAfterRelease = await admin.rpc("wallet_balances", {
      p_user_id: userA.id,
      p_currency: "INR",
    });
    console.log("balances after release:", JSON.stringify(balAfterRelease.data));

    console.log("== 8. reserve > balance fails ==");
    const bad = await admin.rpc("reserve_withdrawal", {
      p_user_id: userA.id,
      p_currency: "INR",
      p_amount: 10_000_000,
    });
    console.log("over-balance withdraw:", bad.error?.message ?? "NO ERROR (BUG)");

    console.log("== 9. reserve ₹50 OK ==");
    const res = await admin.rpc("reserve_withdrawal", {
      p_user_id: userA.id,
      p_currency: "INR",
      p_amount: 5000,
    });
    const wReqId = res.data as string;
    console.log("reserve:", wReqId, res.error?.message ?? "");
    const balAfterReserve = await admin.rpc("wallet_balances", {
      p_user_id: userA.id,
      p_currency: "INR",
    });
    console.log("balances after reserve:", JSON.stringify(balAfterReserve.data));

    console.log("== 10. second reserve beyond remaining fails ==");
    const dup = await admin.rpc("reserve_withdrawal", {
      p_user_id: userA.id,
      p_currency: "INR",
      p_amount: 10_000_000,
    });
    console.log("over-draw:", dup.error?.message ?? "NO ERROR (BUG)");

    console.log("== 11. mark paid twice (no double-deduct) ==");
    if (wReqId) {
      const paid1 = await admin.rpc("mark_withdrawal_paid", {
        p_request_id: wReqId,
        p_payment_reference: "VERIFY-MANUAL-001",
        p_admin_email: "admin@test.local",
      });
      const paid2 = await admin.rpc("mark_withdrawal_paid", {
        p_request_id: wReqId,
        p_payment_reference: "VERIFY-MANUAL-001",
        p_admin_email: "admin@test.local",
      });
      console.log(
        "paid1:", paid1.data,
        "paid2 (must be false):", paid2.data, paid2.error?.message ?? "",
      );

      const balFinal = await admin.rpc("wallet_balances", {
        p_user_id: userA.id,
        p_currency: "INR",
      });
      console.log("balances after paid:", JSON.stringify(balFinal.data));
    }

    console.log("== 12. reserve→release (reject restores funds) ==");
    const res2 = await admin.rpc("reserve_withdrawal", {
      p_user_id: userA.id,
      p_currency: "INR",
      p_amount: 2500,
    });
    const wReqId2 = res2.data as string;
    const beforeRelease = await admin.rpc("wallet_balances", {
      p_user_id: userA.id,
      p_currency: "INR",
    });
    const rejected = await admin.rpc("release_withdrawal", {
      p_request_id: wReqId2,
      p_admin_email: "admin@test.local",
      p_note: "verify: reject restoration",
    });
    const afterRelease = await admin.rpc("wallet_balances", {
      p_user_id: userA.id,
      p_currency: "INR",
    });
    console.log(
      "reject:", rejected.data,
      "before:", JSON.stringify(beforeRelease.data),
      "after (released must restore):", JSON.stringify(afterRelease.data),
    );

    console.log("== 13. USD reward separate from INR ==");
    const awardUsd = await admin.rpc("award_referral_reward", {
      p_referred_user_id: userB.id,
      p_provider: "paypal",
      p_payment_id: "verify_payment_USD_001",
      p_amount: 200,
      p_currency: "USD",
      p_hours_until_eligible: 0,
    });
    console.log("USD award:", awardUsd.data, awardUsd.error?.message ?? "");
    const balUsd = await admin.rpc("wallet_balances", {
      p_user_id: userA.id,
      p_currency: "USD",
    });
    const balInrAfterUsd = await admin.rpc("wallet_balances", {
      p_user_id: userA.id,
      p_currency: "INR",
    });
    console.log("USD balances:", JSON.stringify(balUsd.data), "INR unchanged check:", JSON.stringify(balInrAfterUsd.data));

    console.log("== cleanup ==");
    await cleanup(created);
    console.log("test users deleted (ledger rows remain auditably by design)");
  } catch (err) {
    console.error("FAILED:", err instanceof Error ? err.message : err);
    await cleanup(created);
    process.exit(1);
  }
}

main();
