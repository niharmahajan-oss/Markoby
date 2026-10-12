import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard-header";
import { getUserWithSubscription } from "@/lib/auth";
import { isAdminEmail } from "@/lib/referrals/referrals";
import { createAdminClient } from "@/lib/supabase/server";

import { AdminWithdrawalList } from "./admin-withdrawal-list";

export const metadata = { title: "Admin · Withdrawals · Markoby" };

/**
 * Admin-only: withdrawal request management. Authorization happens HERE and
 * in every action (server-side, ADMIN_EMAILS allowlist) — never by hiding
 * buttons in the frontend.
 */
export default async function AdminWithdrawalsPage() {
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login?next=/admin/withdrawals");
  if (user && !isAdminEmail(user.email)) redirect("/dashboard");
  const email = user!.email;

  const admin = await createAdminClient();
  const { data: requests } = await admin
    .from("withdrawal_requests")
    .select(
      "id, user_id, currency, amount, status, payout_method, payout_details, admin_note, payment_reference, paid_at, paid_by_admin, created_at",
    )
    .in("status", ["requested", "under_review", "approved"])
    .order("created_at", { ascending: true });

  const { data: processed } = await admin
    .from("withdrawal_requests")
    .select(
      "id, user_id, currency, amount, status, payout_method, payout_details, admin_note, payment_reference, paid_at, paid_by_admin, created_at",
    )
    .in("status", ["paid", "rejected", "cancelled"])
    .order("created_at", { ascending: false })
    .limit(100);

  // Resolve user emails for display (admin sees full emails; payout details
  // are shown only on this admin page, never to other users).
  const userIds = Array.from(
    new Set([...(requests ?? []), ...(processed ?? [])].map((r) => r.user_id)),
  );
  const { data: profiles } = await admin
    .from("profiles")
    .select("id, email, full_name")
    .in("id", userIds);
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, { email: p.email, fullName: p.full_name }]),
  );

  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader email={email} fullName={user!.fullName} />
      <main className="flex-1">
        <AdminWithdrawalList
          openRequests={(requests ?? []).map((r) => serialize(r, profileById))}
          processedRequests={(processed ?? []).map((r) => serialize(r, profileById))}
        />
      </main>
    </div>
  );
}

type Serialized = {
  id: string;
  userEmail: string;
  userFullName: string | null;
  currency: string;
  amount: number;
  status: string;
  payoutMethod: string;
  payoutDetails: Record<string, unknown>;
  adminNote: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  paidByAdmin: string | null;
  createdAt: string;
};

function serialize(
  row: Record<string, unknown>,
  profileById: Map<string, { email: string; fullName: string | null }>,
): Serialized {
  return {
    id: row.id as string,
    userEmail: profileById.get(row.user_id as string)?.email ?? "(unknown)",
    userFullName: profileById.get(row.user_id as string)?.fullName ?? null,
    currency: row.currency as string,
    amount: row.amount as number,
    status: row.status as string,
    payoutMethod: row.payout_method as string,
    payoutDetails: (row.payout_details ?? {}) as Record<string, unknown>,
    adminNote: (row.admin_note as string | null) ?? null,
    paymentReference: (row.payment_reference as string | null) ?? null,
    paidAt: (row.paid_at as string | null) ?? null,
    paidByAdmin: (row.paid_by_admin as string | null) ?? null,
    createdAt: row.created_at as string,
  };
}
