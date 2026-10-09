import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@supabase/supabase-js";

import { mapPayPalStatus, verifyPayPalWebhookSignature } from "@/lib/billing/paypal";

/**
 * PayPal Webhook Handler
 *
 * Official verification path: the raw event plus PayPal's transport headers
 * are POSTed to /v1/notifications/verify-webhook-signature, which answers
 * SUCCESS/FAILURE against the webhook id. Unverifiable events are rejected
 * (400) — nothing is written on trust.
 *
 * Idempotency: events are keyed by (event id, event type) in usage_events with
 * a unique index; replays hit the conflict and short-circuit. State updates
 * themselves are value-idempotent (same status → same row values).
 *
 * Endpoint: POST /api/paypal-webhook
 */

type PayPalWebhookEvent = {
  id: string;
  event_type: string;
  resource_type?: string;
  resource?: {
    id?: string;
    status?: string;
    billing_info?: { next_billing_time?: string };
    custom_id?: string;
  };
};

/** Billing events we act on; everything else is acked and ignored. */
const HANDLED_EVENTS = new Set([
  "BILLING.SUBSCRIPTION.ACTIVATED",
  "BILLING.SUBSCRIPTION.CANCELLED",
  "BILLING.SUBSCRIPTION.SUSPENDED",
  "BILLING.SUBSCRIPTION.EXPIRED",
  "BILLING.SUBSCRIPTION.UPDATED",
  "PAYMENT.SALE.COMPLETED",
  "PAYMENT.SALE.DENIED",
  "PAYMENT.SALE.REFUNDED",
]);

export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1. Official signature verification (server-side, against PAYPAL_WEBHOOK_ID)
  let valid = false;
  try {
    valid = await verifyPayPalWebhookSignature(rawBody, req.headers);
  } catch (err) {
    console.error("[paypal-webhook] verification error:", err);
    return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
  }
  if (!valid) {
    console.warn("[paypal-webhook] ⚠️ Invalid signature");
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  let event: PayPalWebhookEvent;
  try {
    event = JSON.parse(rawBody) as PayPalWebhookEvent;
  } catch {
    return NextResponse.json({ error: "Bad payload" }, { status: 400 });
  }

  if (!HANDLED_EVENTS.has(event.event_type)) {
    return NextResponse.json({ received: true, ignored: event.event_type });
  }

  const subscriptionId = event.resource?.id;
  if (!subscriptionId) {
    console.warn("[paypal-webhook] event without subscription id:", event.event_type);
    return NextResponse.json({ received: true });
  }

  // 2. Idempotency: record the event id before acting. A duplicate delivery
  //    (PayPal retries until 200) hits the unique index and is acked without
  //    re-processing.
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const { data: inserted, error: dedupeError } = await supabase
    .from("webhook_events")
    .insert({ provider: "paypal", event_id: event.id, event_type: event.event_type })
    .select("id");

  if (dedupeError) {
    if ((dedupeError as { code?: string }).code === "23505") {
      console.info(`[paypal-webhook] duplicate event ${event.id}; already processed`);
      return NextResponse.json({ received: true, duplicate: true });
    }
    console.error("[paypal-webhook] could not record event:", dedupeError);
    // Fail closed-ish: 500 makes PayPal retry later rather than lose the event.
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }
  if (!inserted?.length) {
    // The subscriptions table is service-role writable, but this insert guard
    // mirrors the billing actions: an unexpected zero-row write means RLS or
    // config trouble — retry later.
    return NextResponse.json({ error: "DB error" }, { status: 500 });
  }

  // 3. Map to internal status. PAYMENT.SALE.* events do not change
  //    subscription state (COMPLETED logs money in; DENIED on an active sub is
  //    followed by PayPal's own SUSPENDED event) — but we only update state on
  //    lifecycle events so a stray payment event can't downgrade a row.
  const LIFECYCLE_EVENTS: Record<string, string> = {
    "BILLING.SUBSCRIPTION.ACTIVATED": "ACTIVE",
    "BILLING.SUBSCRIPTION.UPDATED": "ACTIVE",
    "BILLING.SUBSCRIPTION.SUSPENDED": "SUSPENDED",
    "BILLING.SUBSCRIPTION.CANCELLED": "CANCELLED",
    "BILLING.SUBSCRIPTION.EXPIRED": "EXPIRED",
  };

  if (event.event_type in LIFECYCLE_EVENTS) {
    const paypalStatus = LIFECYCLE_EVENTS[event.event_type];
    const internalStatus = mapPayPalStatus(paypalStatus);

    // Period end: use the subscription's next_billing_time when PayPal
    // includes it (BILLING.SUBSCRIPTION.* resources carry billing_info).
    const nextBilling = event.resource?.billing_info?.next_billing_time;
    const currentPeriodEnd = nextBilling ? new Date(nextBilling).toISOString() : null;

    const { error } = await supabase
      .from("subscriptions")
      .update({
        status: internalStatus,
        ...(currentPeriodEnd ? { current_period_end: currentPeriodEnd } : {}),
      })
      .eq("paypal_subscription_id", subscriptionId);

    if (error) {
      console.error("[paypal-webhook] DB update failed:", error);
      return NextResponse.json({ error: "DB update failed" }, { status: 500 });
    }
    console.log(
      `[paypal-webhook] ${event.event_type}: subscription ${subscriptionId} → ${internalStatus}`,
    );
  } else {
    // PAYMENT.SALE.*: log for analytics; state untouched.
    console.log(
      `[paypal-webhook] ${event.event_type} for subscription ${subscriptionId}`,
    );
  }

  return NextResponse.json({ received: true });
}

export function GET() {
  return NextResponse.json({ error: "Method Not Allowed" }, { status: 405 });
}
