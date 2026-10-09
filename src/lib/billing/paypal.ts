import "server-only";

/**
 * PayPal Subscriptions integration (international USD plan) — server-only.
 *
 * Uses PayPal's official REST APIs:
 *   - OAuth 2.0 client-credentials → access token
 *   - Catalog API  → product
 *   - Subscriptions API → plans + subscriptions + webhook-signature verify
 *
 * Docs: https://developer.paypal.com/api/nvp-soap-payflow/recurring-billing/
 * (REST): https://developer.paypal.com/docs/subscriptions/
 *
 * PAYPAL_MODE selects sandbox vs live base URL; the secret never leaves the
 * server. No INR flows here — this provider exists only for USD billing.
 */

export type PayPalMode = "sandbox" | "live";

export type PayPalSubscription = {
  id: string;
  status: string;
  plan_id?: string;
  subscriber?: {
    payer_id?: string;
    email_address?: string;
    name?: { given_name?: string; surname?: string };
  };
  billing_info?: { next_billing_time?: string };
  start_time?: string;
};

export type PayPalPlan = { id: string; name?: string; status?: string };

export function getPayPalApiBase(): string {
  const mode = (process.env.PAYPAL_MODE ?? "sandbox").trim().toLowerCase();
  return mode === "live" ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

/** True when PayPal billing can be offered (client id present for the SDK). */
export function isPayPalConfigured(): boolean {
  return Boolean(process.env.PAYPAL_CLIENT_ID && process.env.PAYPAL_CLIENT_SECRET);
}

/**
 * Configuration check for the UI gate (startup-time). PAYPAL_WEBHOOK_ID is
 * safe to expose as a boolean here: only its presence matters client-side.
 */
export async function isPayPalReady(): Promise<
  { ok: true } | { ok: false; error: string }
> {
  if (!isPayPalConfigured()) {
    return { ok: false, error: "PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing" };
  }
  if (!process.env.PAYPAL_WEBHOOK_ID) {
    return { ok: false, error: "PAYPAL_WEBHOOK_ID missing" };
  }
  return { ok: true };
}

function getPayPalCredentials(): { clientId: string; clientSecret: string } {
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET are not set");
  }
  return { clientId, clientSecret };
}

/**
 * OAuth 2.0 client-credentials token. PayPal tokens are valid ~9 hours, so a
 * tiny in-process cache avoids an OAuth round-trip on every call.
 */
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getPayPalAccessToken(): Promise<string> {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt - 60_000 > now) {
    return cachedToken.token;
  }
  const { clientId, clientSecret } = getPayPalCredentials();
  const res = await fetch(`${getPayPalApiBase()}/v1/oauth2/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`PayPal OAuth failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const json = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: json.access_token,
    expiresAt: now + json.expires_in * 1000,
  };
  return cachedToken.token;
}

async function payPalFetch<T>(
  label: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = await getPayPalAccessToken();
  const res = await fetch(`${getPayPalApiBase()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    const err = new Error(
      `PayPal ${label} failed (${res.status}): ${text.slice(0, 300)}`,
    );
    (err as { statusCode?: number }).statusCode = res.status;
    throw err;
  }
  // 204 No Content (e.g. cancel) — return an empty object.
  if (res.status === 204) return {} as T;
  return (await res.json()) as T;
}

/** Human-readable message for a PayPal failure, for user-facing toasts. */
export function explainPayPalError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/PAYMENT_SOURCE_DECLINED|INSTRUMENT_DECLINED/i.test(message)) {
    return "PayPal declined the payment method. Try a different funding source in PayPal.";
  }
  if (/PLAN_ID|plan/i.test(message) && /not found|invalid/i.test(message)) {
    return "The $5/month plan isn't configured yet. Please contact support@markoby.app.";
  }
  return message;
}

// ── Product & plan management ────────────────────────────────────────────────

/**
 * Create (or reuse) the Markoby Pro product.
 *
 * Preferred: PAYPAL_PRODUCT_ID from the dashboard (e.g. a value like
 * "PROD-XXXXXXXXXXXX"). Fallback: PayPal de-duplicates on PayPal-Request-Id,
 * so replaying the same request id returns the original product and this is
 * safe to call cold.
 */
export async function ensureProduct(): Promise<{ id: string }> {
  const configuredProduct = process.env.PAYPAL_PRODUCT_ID;
  if (configuredProduct) {
    return payPalFetch<{ id: string }>(
      "fetch product",
      `/v1/catalogs/products/${configuredProduct}`,
    );
  }
  const requestId = process.env.PAYPAL_PRODUCT_REQUEST_ID ?? "markoby-pro-product";
  return payPalFetch<{ id: string }>("create product", "/v1/catalogs/products", {
    method: "POST",
    headers: { "PayPal-Request-Id": requestId },
    body: JSON.stringify({
      name: "Markoby Pro",
      description: "AI-powered organic marketing strategy for founders.",
      type: "SERVICE",
      category: "SOFTWARE",
      home_url: "https://markoby.app",
    }),
  });
}

/**
 * Create (or reuse) the $5/month USD recurring plan for a product. Plans are
 * immutable in PayPal — if the price ever changes, create a new plan and
 * point PAYPAL_PLAN_ID at it rather than editing this one.
 */
export async function ensurePlan(): Promise<PayPalPlan> {
  // Preferred: a plan created in the dashboard, referenced by env — mirrors
  // how the Razorpay plan id is configured and avoids auto-creating drift.
  const configured = process.env.PAYPAL_PLAN_ID;
  if (configured && !/^P-[A-Z0-9]+$/i.test(configured)) {
    // A product id (PROD-…) pasted here would fail obscurely at
    // subscription-creation time; fail fast with the actionable message.
    throw new Error(
      `PAYPAL_PLAN_ID "${configured}" doesn't look like a billing plan id (expected "P-...", not a product id like "PROD-...").`,
    );
  }
  if (configured) {
    return payPalFetch<PayPalPlan>("fetch plan", `/v1/billing/plans/${configured}`);
  }

  const product = await ensureProduct();
  // Reuse an ACTIVE plan for this product with the expected fixed price.
  const plans = await payPalFetch<{ plans?: PayPalPlan[] }>(
    "list plans",
    `/v1/billing/plans?product_id=${product.id}&page_size=20`,
  );
  const candidates = (plans.plans ?? []).filter((p) => p.status === "ACTIVE");
  for (const plan of candidates) {
    const full = await payPalFetch<{
      id: string;
      status?: string;
      billing_cycles?: {
        pricing_scheme?: { fixed_price?: { value?: string; currency_code?: string } };
        frequency?: { interval_unit?: string; interval_count?: number };
      }[];
    }>("fetch plan", `/v1/billing/plans/${plan.id}`);
    const cycle = full.billing_cycles?.[0];
    const price = cycle?.pricing_scheme?.fixed_price;
    const freq = cycle?.frequency;
    if (
      price?.currency_code === "USD" &&
      price?.value === "5.00" &&
      freq?.interval_unit === "MONTH" &&
      (freq?.interval_count ?? 0) === 1
    ) {
      return full;
    }
  }

  // None matched — create the canonical $5/month plan.
  return payPalFetch<PayPalPlan>("create plan", "/v1/billing/plans", {
    method: "POST",
    headers: { "PayPal-Request-Id": `${product.id}-usd-5-monthly` },
    body: JSON.stringify({
      product_id: product.id,
      name: "Markoby Pro — $5/month",
      billing_cycles: [
        {
          frequency: { interval_unit: "MONTH", interval_count: 1 },
          tenure_type: "REGULAR",
          sequence: 1,
          pricing_scheme: { fixed_price: { value: "5.00", currency_code: "USD" } },
        },
      ],
      payment_preferences: {
        auto_bill_outstanding: true,
        // PayPal's own failed-payment retry schedule governs retries; these
        // are the standard thresholds (failures before suspend/cancel).
        setup_fee: { value: "0", currency_code: "USD" },
      },
    }),
  });
}

/**
 * Create a PayPal subscription for the given plan. The subscription is
 * initially APPROVAL_PENDING; the client shows PayPal's approval UI and only
 * after approval does it become ACTIVE (confirmed via webhook + API verify).
 */
export async function createPayPalSubscription(
  planId: string,
  userId: string,
  email: string,
): Promise<PayPalSubscription> {
  return payPalFetch<PayPalSubscription>("create subscription", "/v1/billing/subscriptions", {
    method: "POST",
    headers: { "PayPal-Request-Id": `sub-${userId}-${Date.now()}` },
    body: JSON.stringify({
      plan_id: planId,
      custom_id: userId,
      subscriber: { email_address: email },
      application_context: {
        brand_name: "Markoby",
        locale: "en-US",
        shipping_preference: "NO_SHIPPING",
        user_action: "SUBSCRIBE_NOW",
        payment_method: { payer_selected: "PAYPAL", payee_preferred: "IMMEDIATE_PAYMENT_REQUIRED" },
        return_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/billing/paypal/return`,
        cancel_url: `${process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"}/billing/paypal/cancel`,
      },
    }),
  });
}

/** Fetch a subscription with full details (status, plan, subscriber). */
export async function fetchPayPalSubscription(
  subscriptionId: string,
): Promise<PayPalSubscription | null> {
  try {
    return await payPalFetch<PayPalSubscription>(
      "fetch subscription",
      `/v1/billing/subscriptions/${subscriptionId}`,
    );
  } catch (err) {
    console.warn("[paypal] could not fetch subscription:", err);
    return null;
  }
}

/**
 * Server-side source of truth: is this PayPal subscription active right now?
 * Used by the activation action so a frontend callback is never trusted on
 * its own.
 */
export function isPayPalSubscriptionActive(status: string): boolean {
  return status === "ACTIVE" || status === "APPROVED";
}

/** Cancel a PayPal subscription at period end (server-side). */
export async function cancelPayPalSubscription(
  subscriptionId: string,
  reason: string,
): Promise<boolean> {
  try {
    await payPalFetch("cancel subscription", `/v1/billing/subscriptions/${subscriptionId}/cancel`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    return true;
  } catch (err) {
    if ((err as { statusCode?: number }).statusCode === 404) return true; // already gone
    console.error("[paypal] cancel failed:", err);
    return false;
  }
}

/**
 * Official webhook verification: POST the raw event to
 * /v1/notifications/verify-webhook-signature with the transport headers and
 * PayPal answers true/false. Beats hand-rolling the Java/SDK cert chain.
 */
export async function verifyPayPalWebhookSignature(
  rawBody: string,
  headers: Headers,
): Promise<boolean> {
  const webhookId = process.env.PAYPAL_WEBHOOK_ID;
  if (!webhookId) {
    throw new Error("PAYPAL_WEBHOOK_ID is not set");
  }
  const required = [
    "paypal-auth-algo",
    "paypal-cert-url",
    "paypal-transmission-id",
    "paypal-transmission-sig",
    "paypal-transmission-time",
  ] as const;
  const transmission = Object.fromEntries(
    required.map((h) => [h, headers.get(h) ?? ""]),
  );
  if (Object.values(transmission).some((v) => !v)) {
    return false;
  }
  try {
    const result = await payPalFetch<{ verification_status: string }>(
      "verify webhook signature",
      "/v1/notifications/verify-webhook-signature",
      {
        method: "POST",
        body: JSON.stringify({
          auth_algo: transmission["paypal-auth-algo"],
          cert_url: transmission["paypal-cert-url"],
          transmission_id: transmission["paypal-transmission-id"],
          transmission_sig: transmission["paypal-transmission-sig"],
          transmission_time: transmission["paypal-transmission-time"],
          webhook_id: webhookId,
          webhook_event: JSON.parse(rawBody),
        }),
      },
    );
    return result.verification_status === "SUCCESS";
  } catch (err) {
    console.error("[paypal] webhook verification error:", err);
    return false;
  }
}

/**
 * Map PayPal subscription status to Markoby's internal vocabulary (same set
 * of statuses the Razorpay integration uses — one entitlement, two providers).
 */
export function mapPayPalStatus(
  paypalStatus: string,
): "active" | "past_due" | "canceled" | "inactive" {
  switch (paypalStatus) {
    case "ACTIVE":
    case "APPROVED":
      return "active";
    case "SUSPENDED":
    case "PAYMENT.FAILED":
      return "past_due";
    case "CANCELLED":
      return "canceled";
    case "EXPIRED":
    default:
      return "inactive";
  }
}
