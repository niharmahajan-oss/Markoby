import { headers, cookies } from "next/headers";
import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard-header";
import { TrialBanner } from "@/components/trial-banner";
import { getUserWithSubscription } from "@/lib/auth";
import { getAccess, type Access } from "@/lib/auth";
import {
  ensureReferralIdentity,
  generateReferralCode,
} from "@/lib/referrals/referrals";
import { getWalletState } from "@/lib/referrals/wallet";
import { createAdminClient } from "@/lib/supabase/server";

import { ReferralDashboard } from "./referral-dashboard";

export const metadata = { title: "Refer & earn · Markoby" };

const SUPPORT_EMAIL = process.env.SUPPORT_EMAIL ?? "support@markoby.app";

export default async function ReferralsPage() {
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login?next=/referrals");
  if (user && !user.email) redirect("/auth/login?next=/referrals");
  const userId = user!.id;

  const admin = await createAdminClient();

  // Referral code + link (server-decided; the base URL comes from env/proxy).
  const h = await headers();
  const siteUrl =
    process.env.NEXT_PUBLIC_SITE_URL ??
    `${h.get("x-forwarded-proto") ?? "https"}://${h.get("host") ?? "markoby.in"}`;
  const profileFetch = await admin
    .from("profiles")
    .select("referral_code")
    .eq("id", userId)
    .maybeSingle();
  let profile: { referral_code: string | null } | null = profileFetch.data;

  // Self-heal: visitors arrive with no profile row (it's created by the
  // auth-users DB trigger, which can lag after the auth user), or no referral
  // code yet. Either way, provision the row (idempotent upsert) and the code.
  if (!profile || !profile.referral_code) {
    try {
      if (!profile) {
        const code = generateReferralCode();
        await admin
          .from("profiles")
          .upsert(
            { id: userId, email: user.email, full_name: user.fullName, referral_code: code },
            { onConflict: "id", ignoreDuplicates: false },
          );
        profile = { referral_code: code };
      } else {
        const refCookie = (await cookies()).get("mk_ref")?.value ?? null;
        await ensureReferralIdentity(userId, refCookie);
        profile = (
          await admin
            .from("profiles")
            .select("referral_code")
            .eq("id", userId)
            .maybeSingle()
        ).data;
      }
    } catch (err) {
      console.error("[referrals] profile/code provisioning failed:", err);
    }
  }
  const referralLink = profile?.referral_code
    ? `${siteUrl}/?ref=${profile.referral_code}`
    : siteUrl;

  // Referral history (referrer side; RLS-scoped to me via RLS, but we use the
  // service role and filter explicitly for determinism).
  const { data: referralRows } = await admin
    .from("referrals")
    .select(
      "id, referred_id, status, created_at, referral_rewards (status, amount, currency, eligible_at)",
    )
    .eq("referrer_id", userId)
    .order("created_at", { ascending: false });

  // Mask referred users' emails (only suffix shown for privacy).
  const { data: referredProfiles } = await admin
    .from("profiles")
    .select("id, email")
    .in(
      "id",
      (referralRows ?? []).map((r) => r.referred_id),
    );
  const emailById = new Map(
    (referredProfiles ?? []).map((p) => [p.id, maskEmail(p.email)]),
  );

  const referrals = (referralRows ?? []).map((r) => {
    const reward = Array.isArray(r.referral_rewards)
      ? r.referral_rewards[0]
      : null;
    return {
      id: r.id,
      referredEmail: emailById.get(r.referred_id) ?? null,
      status: r.status,
      createdAt: r.created_at,
      rewardStatus: reward?.status ?? null,
      rewardAmount: reward?.amount ?? null,
      rewardCurrency: reward?.currency ?? null,
      rewardEligibleAt: reward?.eligible_at ?? null,
    };
  });

  const successful = referrals.filter(
    (r) => r.rewardStatus === "released" || r.rewardStatus === "pending",
  ).length;

  // My withdrawal history (payout details NOT exposed in the list view).
  const { data: withdrawalRows } = await admin
    .from("withdrawal_requests")
    .select("id, currency, amount, status, created_at, payment_reference")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  const wallet = await getWalletState(userId);
  const access: Access = await getAccess(user);

  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader email={user.email} fullName={user.fullName} />
      <TrialBanner access={access} />
      <main className="flex-1">
        <ReferralDashboard
          referralCode={profile?.referral_code ?? null}
          referralLink={referralLink}
          referralCount={referrals.length}
          successfulReferrals={successful}
          wallet={wallet}
          referrals={referrals}
          withdrawals={(withdrawalRows ?? []).map((w) => ({
            id: w.id,
            currency: w.currency,
            amount: w.amount,
            status: w.status,
            createdAt: w.created_at,
            paymentReference: w.payment_reference,
          }))}
          supportEmail={SUPPORT_EMAIL}
        />
      </main>
    </div>
  );
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "Signed-up user";
  const shown = local.slice(0, 2);
  return `${shown}${"•".repeat(Math.max(2, local.length - 2))}@${domain}`;
}
