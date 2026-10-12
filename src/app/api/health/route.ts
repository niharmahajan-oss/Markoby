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
      process.env.RAZORPAY_PLAN_ID &&
      // International USD flow — absence degrades to INR-only, so report it
      // separately rather than failing the whole service.
      process.env.RAZORPAY_USD_PLAN_ID,
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
      razorpayUsdPlan: Boolean(process.env.RAZORPAY_USD_PLAN_ID),
      paypal: Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET),
      paypalMode: process.env.PAYPAL_MODE ?? "sandbox",
      // Safe (booleans/shapes only — values are never echoed): the two most
      // common PayPal misconfigurations are a product id pasted into the plan
      // slot and a plan created in the opposite mode from the credentials.
      // Both fail at first checkout; surfacing them here makes that visible
      // without a secret ever leaving the server.
      paypalPlanIdSet: Boolean(process.env.PAYPAL_PLAN_ID),
      paypalPlanIdWellFormed: /^P-[A-Z0-9]+$/i.test(process.env.PAYPAL_PLAN_ID ?? ""),
      paypalWebhookIdSet: Boolean(process.env.PAYPAL_WEBHOOK_ID),
      paypalProductIdSet: Boolean(process.env.PAYPAL_PRODUCT_ID),
      cron: cron,
      checkinEmail: Boolean(process.env.RESEND_API_KEY),
      redditDiscovery: Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET),
      youtubeDiscovery: Boolean(process.env.YOUTUBE_API_KEY),
    },
  });
}
