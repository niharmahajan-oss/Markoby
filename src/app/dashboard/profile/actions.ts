"use server";

import { revalidatePath } from "next/cache";

import { getUserWithSubscription } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type UpdateProfileResult = { ok: true } | { ok: false; error: string };

/** Update the display name on the auth user + the profiles mirror row. */
export async function updateProfile(input: {
  fullName: string;
}): Promise<UpdateProfileResult> {
  const user = await getUserWithSubscription();
  if (!user) return { ok: false, error: "You need to sign in first." };

  const fullName = input.fullName.trim().replace(/\s+/g, " ");
  if (fullName.length > 80) {
    return { ok: false, error: "Keep your name under 80 characters." };
  }

  const supabase = await createClient();

  const { error: authError } = await supabase.auth.updateUser({
    data: { full_name: fullName || null },
  });
  if (authError) {
    console.error("[profile] auth updateUser failed:", authError);
    return { ok: false, error: "Could not save your name. Try again." };
  }

  // Best effort: keep the profiles mirror in sync. RLS allows own-row updates
  // and the auth metadata above is the source of truth for the UI.
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: fullName || null })
    .eq("id", user.id);
  if (profileError) {
    console.warn("[profile] profiles mirror update failed:", profileError.message);
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/profile");
  return { ok: true };
}
