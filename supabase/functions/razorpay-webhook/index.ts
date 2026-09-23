// Markoby — Razorpay subscription webhook (Supabase Edge Function, Deno runtime)
//
// Set this function's secrets with:
//   supabase secrets set RAZORPAY_WEBHOOK_SECRET=... RAZORPAY_KEY_SECRET=...
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided to Edge Functions
// automatically.
//
// In the Razorpay dashboard, point a webhook at:
//   https://<project-ref>.supabase.co/functions/v1/razorpay-webhook
// and subscribe to the `subscription.*` events.
//
// The webhook is the single source of truth for subscriptions.status; the app
// never flips subscription status from client code.

import { createHmac, timingSafeEqual } from "node:crypto";

type SubscriptionEntity = {
  id: string;
  entity: string;
  status: string;
  current_end?: number;
  customer_id?: string;
  notes?: Record<string, string>;
};

type WebhookBody = {
  event: string;
  payload?: {
    subscription?: { entity: SubscriptionEntity };
    payment?: { entity: { id: string; subscription_id?: string } };
  };
};

function mapStatus(rzp: string): "active" | "past_due" | "canceled" | "inactive" {
  switch (rzp) {
    case "active":
    case "authenticated":
      return "active";
    case "pending":
    case "halted":
    case "resumed":
      return "past_due";
    case "cancelled":
    case "completed":
      return "canceled";
    case "expired":
      return "inactive";
    default:
      return "inactive";
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  const signature = req.headers.get("x-razorpay-signature") ?? "";
  const rawBody = await req.text();

  const secret = Deno.env.get("RAZORPAY_WEBHOOK_SECRET");
  if (!secret) {
    console.error("RAZORPAY_WEBHOOK_SECRET not configured");
    return new Response("Server misconfigured", { status: 500 });
  }

  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = new TextEncoder().encode(expected);
  const b = new TextEncoder().encode(signature);
  const valid = a.length === b.length && timingSafeEqual(a, b);
  if (!valid) {
    return new Response("Invalid signature", { status: 401 });
  }

  let body: WebhookBody;
  try {
    body = JSON.parse(rawBody) as WebhookBody;
  } catch {
    return new Response("Bad payload", { status: 400 });
  }

  // Only subscription lifecycle events matter for gating.
  const entity = body.payload?.subscription?.entity;
  if (!entity) {
    return new Response(JSON.stringify({ ok: true, ignored: body.event }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const status = mapStatus(entity.status);
  const currentPeriodEnd = entity.current_end
    ? new Date(entity.current_end * 1000).toISOString()
    : null;

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;

  // Find the owning user via the subscription row's razorpay_subscription_id.
  const lookupRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?razorpay_subscription_id=eq.${entity.id}&select=user_id`,
    { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
  );
  const rows = lookupRes.ok ? ((await lookupRes.json()) as { user_id: string }[]) : [];

  if (rows.length === 0) {
    // Subscription created from Checkout before we stored the id — update by
    // customer id instead (the checkout route stores razorpay_customer_id).
    const customerRes = await fetch(
      `${supabaseUrl}/rest/v1/subscriptions?razorpay_customer_id=eq.${entity.customer_id}&select=user_id`,
      { headers: { Authorization: `Bearer ${serviceRoleKey}`, apikey: serviceRoleKey } },
    );
    const byCustomer = customerRes.ok
      ? ((await customerRes.json()) as { user_id: string }[])
      : [];
    if (byCustomer.length === 0) {
      console.warn(`Webhook for unknown subscription ${entity.id}; ignoring`);
      return new Response(JSON.stringify({ ok: true, unmatched: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // Patch status via PostgREST as service role (bypasses RLS by design).
  const patchRes = await fetch(
    `${supabaseUrl}/rest/v1/subscriptions?razorpay_subscription_id=eq.${entity.id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status,
        current_period_end: currentPeriodEnd,
        razorpay_customer_id: entity.customer_id ?? null,
      }),
    },
  );

  if (!patchRes.ok) {
    console.error(`Failed to patch subscription ${entity.id}: ${patchRes.status}`);
    return new Response("Patch failed", { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true, status }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
