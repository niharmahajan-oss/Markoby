import "server-only";

import { createClient } from "@/lib/supabase/server";

export type GateUser = {
  id: string;
  email: string;
  fullName: string | null;
  subscriptionStatus: "inactive" | "active" | "past_due" | "canceled";
};

/**
 * Load the signed-in user with their subscription status. Returns null when
 * not signed in. Dashboard routes call requireActiveUser() which redirects.
 */
export async function getUserWithSubscription(): Promise<GateUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: sub } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("user_id", user.id)
    .maybeSingle();

  return {
    id: user.id,
    email: user.email ?? "",
    fullName: (user.user_metadata?.full_name as string | undefined) ?? null,
    subscriptionStatus: (sub?.status as GateUser["subscriptionStatus"]) ?? "inactive",
  };
}

export function hasActiveSubscription(user: GateUser): boolean {
  return user.subscriptionStatus === "active";
}
