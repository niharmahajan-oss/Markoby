"use server";

import { revalidatePath } from "next/cache";

import { getUserWithSubscription } from "@/lib/auth";
import { isAdminEmail } from "@/lib/referrals/referrals";
import {
  releaseEligibleRewards,
} from "@/lib/referrals/rewards";
import { requestWithdrawal } from "@/lib/referrals/wallet";
import { createAdminClient } from "@/lib/supabase/server";

export type FormResult = { ok: boolean; error?: string; requestId?: string };

/** User action: create a manual withdrawal request. */
export async function createWithdrawalRequest(formData: FormData): Promise<FormResult> {
  const user = await getUserWithSubscription();
  if (!user) return { ok: false, error: "You need to sign in first." };

  // Opportunistically release rewards that are due (cheap; idempotent).
  try {
    await releaseEligibleRewards();
  } catch (err) {
    console.error("[referrals] release pass failed:", err);
  }

  const currency = String(formData.get("currency") ?? "");
  if (currency !== "INR" && currency !== "USD") {
    return { ok: false, error: "Invalid currency." };
  }

  const amountMajor = Number(formData.get("amount"));
  if (!Number.isFinite(amountMajor) || amountMajor <= 0) {
    return { ok: false, error: "Enter a valid withdrawal amount." };
  }
  // Convert major units to smallest currency unit (paise/cents).
  const amountSmallestUnit = Math.round(amountMajor * (currency === "INR" ? 100 : 100));

  const payoutMethod = String(formData.get("payout_method") ?? "");
  const payoutDetails: Record<string, string> = {};
  if (payoutMethod === "upi") {
    const upiId = String(formData.get("upi_id") ?? "").trim();
    if (!/^[\w.\-]{2,}@[a-zA-Z]{2,}$/.test(upiId)) {
      return { ok: false, error: "Enter a valid UPI ID (name@bank)." };
    }
    payoutDetails.upi_id = upiId;
  } else if (payoutMethod === "paypal") {
    const paypalEmail = String(formData.get("paypal_email") ?? "").trim();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(paypalEmail)) {
      return { ok: false, error: "Enter a valid PayPal email." };
    }
    payoutDetails.paypal_email = paypalEmail;
  } else if (payoutMethod === "bank") {
    const acct = String(formData.get("account_number") ?? "").trim();
    const ifsc = String(formData.get("ifsc") ?? "").trim().toUpperCase();
    const holder = String(formData.get("holder_name") ?? "").trim();
    if (!/^\d{9,18}$/.test(acct) || !/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc) || !holder) {
      return { ok: false, error: "Enter valid bank account number, IFSC and holder name." };
    }
    payoutDetails.bank_account_number = acct;
    payoutDetails.bank_ifsc = ifsc;
    payoutDetails.bank_holder_name = holder;
  } else {
    return { ok: false, error: "Choose a payout method." };
  }

  const confirmed = formData.get("confirm_accuracy") === "on";
  if (!confirmed) {
    return { ok: false, error: "Please confirm your payout details are accurate." };
  }

  const result = await requestWithdrawal({
    userId: user.id,
    currency,
    amountSmallestUnit,
    payoutMethod,
    payoutDetails,
  });
  if (!result.ok) return { ok: false, error: result.error };

  revalidatePath("/dashboard/referrals");
  return { ok: true, requestId: result.requestId };
}

/** Admin action: transition a withdrawal request. Server-authorized. */
export async function adminUpdateWithdrawal(formData: FormData): Promise<FormResult> {
  const user = await getUserWithSubscription();
  if (!user) return { ok: false, error: "Sign in required." };
  if (!isAdminEmail(user.email)) {
    return { ok: false, error: "Not authorized." };
  }

  const admin = await createAdminClient();
  const requestId = String(formData.get("request_id") ?? "");
  const action = String(formData.get("action") ?? "");
  const note = String(formData.get("note") ?? "").trim() || null;
  const paymentReference =
    String(formData.get("payment_reference") ?? "").trim() || null;
  const adminEmail = user.email;

  if (!requestId) return { ok: false, error: "Missing request id." };

  if (action === "under_review") {
    const { error } = await admin
      .from("withdrawal_requests")
      .update({ status: "under_review", admin_note: note })
      .eq("id", requestId)
      .in("status", ["requested"]);
    if (error) return { ok: false, error: error.message };
  } else if (action === "approve") {
    const { error } = await admin
      .from("withdrawal_requests")
      .update({ status: "approved", admin_note: note })
      .eq("id", requestId)
      .in("status", ["requested", "under_review"]);
    if (error) return { ok: false, error: error.message };
  } else if (action === "reject") {
    // Releases the reserved funds back inside the atomic function.
    const { data: ok, error } = await admin.rpc("release_withdrawal", {
      p_request_id: requestId,
      p_admin_email: adminEmail,
      p_note: note ?? "Rejected",
    });
    if (error || ok !== true) return { ok: false, error: error?.message ?? "Already processed." };
  } else if (action === "mark_paid") {
    if (!paymentReference) {
      return { ok: false, error: "A payment reference is required to mark paid." };
    }
    // Atomic; double-processing is impossible (function checks status).
    const { data: ok, error } = await admin.rpc("mark_withdrawal_paid", {
      p_request_id: requestId,
      p_payment_reference: paymentReference,
      p_admin_email: adminEmail,
    });
    if (error || ok !== true) return { ok: false, error: error?.message ?? "Already processed." };
  } else if (action === "cancel") {
    const { data: ok, error } = await admin.rpc("release_withdrawal", {
      p_request_id: requestId,
      p_admin_email: adminEmail,
      p_note: note ?? "Cancelled",
    });
    if (error || ok !== true) return { ok: false, error: error?.message ?? "Already processed." };
  } else {
    return { ok: false, error: "Unknown action." };
  }

  revalidatePath("/admin/withdrawals");
  return { ok: true };
}
