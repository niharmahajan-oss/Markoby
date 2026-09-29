import { NextResponse } from "next/server";

/**
 * Configuration health check — no auth, no secrets in the response.
 * Useful for verifying a deployment is wired up before hitting the AI flows.
 */
export function GET() {
  const groq = Boolean(process.env.GROQ_API_KEY);
  const supabase = Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
  const razorpay = Boolean(
    process.env.RAZORPAY_KEY_ID &&
      process.env.RAZORPAY_KEY_SECRET &&
      process.env.RAZORPAY_PLAN_ID,
  );
  // Billing writes go through the service role (the subscriptions table is
  // RLS-locked against user writes), so a missing key breaks checkout.
  const supabaseServiceRole = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  // The weekly check-in job refuses to run without CRON_SECRET (see
  // /api/cron/checkins) — surfaced here so a silent retention feature is visible.
  const cron = Boolean(process.env.CRON_SECRET);

  return NextResponse.json({
    ok: groq && supabase && razorpay && supabaseServiceRole && cron,
    services: {
      supabase: supabase,
      supabaseServiceRole: supabaseServiceRole,
      groq: groq,
      razorpay: razorpay,
      cron: cron,
      checkinEmail: Boolean(process.env.RESEND_API_KEY),
      redditDiscovery: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
      youtubeDiscovery: Boolean(process.env.YOUTUBE_API_KEY),
    },
  });
}
