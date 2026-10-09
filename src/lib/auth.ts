import "server-only";

import { createClient } from "@/lib/supabase/server";

/**
 * How many projects a signed-in user can create before a subscription is
 * required. One project is free — the full interview, plans and prospects —
 * so founders can see the product work before paying. Creating a *second*
 * project is what requires the paid plan.
 */
export const FREE_TRIAL_PROJECTS = 1;

export const SUBSCRIBE_PATH = "/billing/subscribe";
export const BILLING_INACTIVE_PATH = "/billing/inactive";

/**
 * Next uses thrown "errors" for control flow (dynamic-rendering bailouts,
 * redirects, notFound). They must never be swallowed by our catch blocks.
 */
export function isNextControlFlowError(err: unknown): boolean {
  const digest = (err as { digest?: unknown } | null)?.digest;
  return (
    typeof digest === "string" &&
    (digest === "DYNAMIC_SERVER_USAGE" ||
      digest === "NEXT_NOT_FOUND" ||
      digest.startsWith("NEXT_REDIRECT") ||
      digest.startsWith("NEXT_HTTP_ERROR_FALLBACK"))
  );
}

export type GateUser = {
  id: string;
  email: string;
  fullName: string | null;
  createdAt: string | null;
  subscriptionStatus: "inactive" | "active" | "past_due" | "canceled";
  /** Currency actually billed for this user's plan (null until they subscribe). */
  subscriptionCurrency: "INR" | "USD" | null;
  /** Provider actually billing this user's plan (null until they subscribe). */
  subscriptionProvider: "razorpay" | "paypal" | null;
};

/**
 * Load the signed-in user with their subscription status. Returns null when
 * not signed in. Dashboard routes call requireActiveUser() which redirects.
 */
export async function getUserWithSubscription(): Promise<GateUser | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, currency, payment_provider")
      .eq("user_id", user.id)
      .maybeSingle();

    return {
      id: user.id,
      email: user.email ?? "",
      fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
      createdAt: user.created_at ?? null,
      subscriptionStatus: (sub?.status as GateUser["subscriptionStatus"]) ?? "inactive",
      subscriptionCurrency:
        sub?.currency === "INR" || sub?.currency === "USD" ? sub.currency : null,
      subscriptionProvider:
        sub?.payment_provider === "paypal" ? "paypal" : sub ? "razorpay" : null,
    };
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    // A transient Supabase/network failure must never take down a page
    // render — treat it as "not signed in" and let the route redirect.
    console.error("[auth] getUserWithSubscription failed:", err);
    return null;
  }
}

export function hasActiveSubscription(user: GateUser): boolean {
  return user.subscriptionStatus === "active";
}

/** Count how many projects the user has created (RLS scopes it to them). */
export async function countProjects(userId: string): Promise<number> {
  try {
    const supabase = await createClient();
    const { count } = await supabase
      .from("projects")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);
    return count ?? 0;
  } catch (err) {
    if (isNextControlFlowError(err)) throw err;
    // Fail closed: if we can't prove there's trial room left, don't hand out
    // more free projects.
    console.error("[auth] countProjects failed:", err);
    return Number.MAX_SAFE_INTEGER;
  }
}

export type Access = {
  /** Paid subscription is active. */
  active: boolean;
  projectCount: number;
  /** Free projects still available. */
  trialRemaining: number;
  /** Signed in, not paying, and still has a free project left. */
  onTrial: boolean;
  /** Free projects are used up and there is no active subscription. */
  trialExhausted: boolean;
  canCreateProject: boolean;
};

export async function getAccess(user: GateUser): Promise<Access> {
  const active = hasActiveSubscription(user);
  const projectCount = await countProjects(user.id);
  const trialRemaining = Math.max(0, FREE_TRIAL_PROJECTS - projectCount);

  return {
    active,
    projectCount,
    trialRemaining,
    onTrial: !active && trialRemaining > 0,
    trialExhausted: !active && trialRemaining === 0,
    canCreateProject: active || trialRemaining > 0,
  };
}

/**
 * Signed-in user + their access state, in one call. Returns null when not
 * signed in (or when auth fails).
 */
export async function getUserWithAccess(): Promise<{
  user: GateUser;
  access: Access;
} | null> {
  const user = await getUserWithSubscription();
  if (!user) return null;
  return { user, access: await getAccess(user) };
}
