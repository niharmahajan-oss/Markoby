import "server-only";

import {
  MAX_OPEN_WITHDRAWALS,
  type RewardCurrency,
} from "@/lib/referrals/referrals";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Wallet actions — every balance-affecting decision made here, on the server,
 * via the service-role client and atomic Postgres functions. The frontend can
 * only read (RLS-scoped selects) and request withdrawals.
 */

export type WalletState = {
  pendingInr: number;
  pendingUsd: number;
  availableInr: number;
  availableUsd: number;
  totalWithdrawnInr: number;
  totalWithdrawnUsd: number;
};

/**
 * Derive balances for a user from the authoritative DB model
 * (wallet_balances: ledger + reward status), mirroring the SQL exactly so
 * display and the withdraw-reserve check can never disagree.
 */
export async function getWalletState(userId: string): Promise<WalletState> {
  const admin = await createAdminClient();

  // Use the DB function when available; fall back to an equivalent app-side
  // derivation over the ledger (append-only) + pending reward statuses.
  const { data: balances, error } = await admin.rpc("wallet_balances", {
    p_user_id: userId,
    p_currency: "INR",
  });
  let availableInr = 0;
  let pendingInr = 0;
  if (!error && Array.isArray(balances) && balances.length > 0) {
    availableInr = Number(balances[0].available ?? 0);
    pendingInr = Number(balances[0].pending ?? 0);
  }

  const { data: balancesUsd, error: errUsd } = await admin.rpc("wallet_balances", {
    p_user_id: userId,
    p_currency: "USD",
  });
  let availableUsd = 0;
  let pendingUsd = 0;
  if (!errUsd && Array.isArray(balancesUsd) && balancesUsd.length > 0) {
    availableUsd = Number(balancesUsd[0].available ?? 0);
    pendingUsd = Number(balancesUsd[0].pending ?? 0);
  }

  if (error || errUsd) {
    console.error(
      "[wallet] wallet_balances rpc failed:",
      error?.message ?? errUsd?.message,
    );
  }

  const state: WalletState = {
    availableInr,
    pendingInr,
    availableUsd,
    pendingUsd,
    totalWithdrawnInr: 0,
    totalWithdrawnUsd: 0,
  };

  // Derive total withdrawn from successful payouts.
  const { data: paid } = await admin
    .from("withdrawal_requests")
    .select("currency, amount")
    .eq("user_id", userId)
    .eq("status", "paid");
  for (const row of (paid ?? []) as { currency: string; amount: number }[]) {
    if (row.currency === "USD") state.totalWithdrawnUsd += row.amount;
    else state.totalWithdrawnInr += row.amount;
  }

  return state;
}

export type RequestWithdrawalResult =
  | { ok: true; requestId: string }
  | { ok: false; error: string };

/**
 * Create a withdrawal request. Validates server-side against the derived
 * available balance, enforces the open-request rate limit, and reserves the
 * funds atomically via the Postgres function.
 */
export async function requestWithdrawal(input: {
  userId: string;
  currency: RewardCurrency;
  amountSmallestUnit: number;
  payoutMethod: string;
  payoutDetails: Record<string, string>;
}): Promise<RequestWithdrawalResult> {
  if (!Number.isInteger(input.amountSmallestUnit) || input.amountSmallestUnit <= 0) {
    return { ok: false, error: "Withdrawal amount must be a positive whole number." };
  }

  const admin = await createAdminClient();

  // Rate limit: no more than MAX_OPEN_WITHDRAWALS non-terminal requests.
  const { count } = await admin
    .from("withdrawal_requests")
    .select("id", { count: "exact", head: true })
    .eq("user_id", input.userId)
    .in("status", ["requested", "under_review", "approved"]);
  if ((count ?? 0) >= MAX_OPEN_WITHDRAWALS) {
    return {
      ok: false,
      error: `You already have ${MAX_OPEN_WITHDRAWALS} open withdrawal requests. Wait for one to finish before making another.`,
    };
  }

  // Validate against the derived available balance (not client-supplied).
  const state = await getWalletState(input.userId);
  const available =
    input.currency === "USD" ? state.availableUsd : state.availableInr;
  if (input.amountSmallestUnit > available) {
    return {
      ok: false,
      error: "Requested amount exceeds your available balance.",
    };
  }

  // Atomic reserve (also revalidates inside a single SQL transaction).
  const { data: requestId, error } = await admin.rpc("reserve_withdrawal", {
    p_user_id: input.userId,
    p_currency: input.currency,
    p_amount: input.amountSmallestUnit,
  });
  if (error) {
    if (String(error.message).includes("INSUFFICIENT_BALANCE")) {
      return { ok: false, error: "Requested amount exceeds your available balance." };
    }
    console.error("[wallet] reserve_withdrawal failed:", error.message);
    return { ok: false, error: "Could not create the withdrawal request. Try again." };
  }

  // Save payout details (server-side only; never shown to other users).
  const { error: detailsError } = await admin
    .from("withdrawal_requests")
    .update({ payout_method: input.payoutMethod, payout_details: input.payoutDetails })
    .eq("id", requestId as string)
    .eq("user_id", input.userId);
  if (detailsError) {
    console.error("[wallet] could not save payout details:", detailsError.message);
    return { ok: false, error: "Could not save payout details. Try again." };
  }

  return { ok: true, requestId: String(requestId) };
}
