"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";

import { ensureReferralIdentity } from "@/lib/referrals/referrals";
import { createClient } from "@/lib/supabase/server";

async function getOrigin(): Promise<string> {
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL;
  const h = await headers();
  return h.get("origin") ?? "http://localhost:3000";
}

export async function signUp(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const fullName = String(formData.get("full_name") ?? "").trim();

  if (!email || !password || password.length < 8) {
    redirect("/auth/signup?error=Please+use+a+valid+email+and+8%2B+character+password");
  }

  const supabase = await createClient();
  const origin = await getOrigin();

  // Referral attribution: captured from the ?ref= query param the visitor
  // landed with, persisted in a short-lived signed cookie by the landing
  // page, and written once here (write-once; immutable afterwards).
  const refCookie = (await cookies()).get("mk_ref")?.value ?? null;

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { full_name: fullName || null },
      emailRedirectTo: `${origin}/auth/callback`,
    },
    // Supabase delivers this via email link when confirmation is on; the
    // /auth/callback handler reads the same cookie, so attribution survives
    // the confirmation hop.
  });

  if (error) {
    redirect(`/auth/signup?error=${encodeURIComponent(error.message)}`);
  }

  if (data.user) {
    try {
      await ensureReferralIdentity(data.user.id, refCookie);
    } catch (err) {
      // Referral must never block signup.
      console.error("[auth] referral identity setup failed:", err);
    }
  }

  // If email confirmation is disabled a session exists now → straight into
  // their free project (no card needed to start).
  if (data.session) {
    redirect("/dashboard");
  }
  redirect("/auth/check-email");
}

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(`/auth/login?error=${encodeURIComponent(error.message)}`);
  }

  // Only allow internal paths from the ?next= parameter.
  redirect(next.startsWith("/") ? next : "/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
