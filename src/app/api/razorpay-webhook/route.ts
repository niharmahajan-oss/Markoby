import { NextRequest, NextResponse } from "next/server";

import {
  mapRazorpayStatus,
  verifyWebhookSignature,
} from "@/lib/billing/razorpay";
import { createClient } from "@supabase/supabase-js";

/**
 * Razorpay Webhook Handler
 *
 * Verifies the X-Razorpay-Signature header, maps the Razorpay subscription
 * status to our internal vocabulary, and updates the `subscriptions` table.
 *
 * Endpoint: POST /api/razorpay-webhook
 */
export async function POST(req: NextRequest) {
  // 1. Read raw body for signature verification
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature") ?? "";

  // 2. Verify signature using the shared billing helper (uses timingSafeEqual)
  let valid = false;
  try {
    valid = verifyWebhookSignature(rawBody, signature);
  } catch (err) {
    console.error("[razorpay-webhook] Signature verification error:", err);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }

  if (!valid) {
    console.warn("[razorpay-webhook] ⚠️ Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  // 3. Parse payload
  const payload = JSON.parse(rawBody);
  const event = payload.event as string;

  console.log("[razorpay-webhook] ✅ Verified event:", event);

  // 4. Handle subscription-related events
  if (event.startsWith("subscription.")) {
    const subscriptionEntity = payload.payload?.subscription?.entity;
    if (!subscriptionEntity) {
      console.warn("[razorpay-webhook] Missing subscription entity in payload");
      return NextResponse.json({ received: true });
    }

    const razorpaySubscriptionId = subscriptionEntity.id as string;
    const rzpStatus = subscriptionEntity.status as string;
    const internalStatus = mapRazorpayStatus(rzpStatus);

    // Compute current_period_end from charge_at or current_end
    const chargeAt = subscriptionEntity.charge_at ?? subscriptionEntity.current_end;
    const currentPeriodEnd = chargeAt
      ? new Date(chargeAt * 1000).toISOString()
      : null;

    // Use service-role client to bypass RLS
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: internalStatus,
        ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
      })
      .eq("razorpay_subscription_id", razorpaySubscriptionId);

    if (error) {
      console.error("[razorpay-webhook] DB update failed:", error);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }

    console.log(
      `[razorpay-webhook] Updated subscription ${razorpaySubscriptionId}: ${rzpStatus} → ${internalStatus}`,
    );
  }

  // 5. Handle payment events (e.g. for logging / analytics)
  if (event === "payment.captured") {
    const payment = payload.payload?.payment?.entity;
    console.log(
      `[razorpay-webhook] Payment captured: ${payment?.id}, amount: ${payment?.amount} paise`,
    );
  }

  return NextResponse.json({ received: true });
}

// Reject anything that isn't POST
export function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
