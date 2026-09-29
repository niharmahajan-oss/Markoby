import "server-only";

import Razorpay from "razorpay";


/**
 * Server-only Razorpay helpers. Uses Razorpay Subscriptions (recurring plan)
 * + Standard Checkout — no custom card handling, per the product spec.
 */

export const RAZORPAY_PLAN_AMOUNT_PAISE = 29900; // ₹299.00
export const RAZORPAY_PLAN_CURRENCY = "INR";
export const RAZORPAY_PLAN_PERIOD = "monthly" as const;

/** Razorpay subscription states that can still be paid / retried. */
const REUSABLE_SUBSCRIPTION_STATES = new Set([
  "created",
  "authenticated",
  "pending",
  "halted",
  "resumed",
  "active",
]);

export type RazorpayCustomer = { id: string; email?: string; name?: string };

export type RazorpaySubscription = {
  id: string;
  status: string;
  short_url?: string;
};

export function getRazorpayKeyId(): string {
  const id = process.env.RAZORPAY_KEY_ID;
  if (!id) throw new Error("RAZORPAY_KEY_ID is not set");
  return id;
}

function getRazorpayClient(): Razorpay {
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new Error("RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are not set");
  }
  return new Razorpay({ key_id: keyId, key_secret: keySecret });
}

/** Pull the human-readable reason out of a Razorpay SDK error. */
export function describeRazorpayError(err: unknown): string {
  const e = err as {
    error?: { description?: string; reason?: string; code?: string };
    message?: string;
  };
  return (
    e?.error?.description ??
    e?.error?.reason ??
    e?.message ??
    "unknown payment provider error"
  );
}

/**
 * Razorpay throttles bursts of API calls from the same key and reports it as
 * `401 {"description":"Authentication failed"}` even when the credentials are
 * fine, which is exactly what a founder hits when they close Checkout and
 * immediately try again. Those, plus network blips and 5xx, are worth retrying.
 */
function isTransient(err: unknown): boolean {
  const e = err as {
    statusCode?: number;
    status?: number;
    error?: { description?: string };
    message?: string;
  };
  const status = e?.statusCode ?? e?.status;
  if (status === 429) return true;
  if (typeof status === "number" && status >= 500) return true;

  const description = e?.error?.description ?? "";
  if (status === 401 && /authentication failed/i.test(description)) return true;
  if (/authentication failed/i.test(description) && /rate|throttl|limit/i.test(description)) {
    return true;
  }
  if (/ECONNRESET|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|fetch failed|socket hang up/i.test(e?.message ?? "")) {
    return true;
  }
  return false;
}

/** Retry transient Razorpay failures with a short, jittered backoff. */
async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  attempts = 3,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !isTransient(err)) break;
      const delay = 400 * attempt + Math.floor(Math.random() * 200);
      console.warn(
        `[billing] ${label} attempt ${attempt}/${attempts} failed (${describeRazorpayError(
          err,
        )}); retrying in ${delay}ms`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }
  throw lastErr;
}

/**
 * Create (or reuse) a Razorpay customer for this user. Reusing the stored
 * customer id keeps one Razorpay customer per user and removes a create call
 * from every retry.
 */
export async function ensureCustomer(
  userId: string,
  email: string,
  name: string | null,
  existingCustomerId?: string | null,
): Promise<RazorpayCustomer> {
  const rzp = getRazorpayClient();

  if (existingCustomerId) {
    try {
      const existing = await withRetry("customers.fetch", () =>
        rzp.customers.fetch(existingCustomerId),
      );
      return existing as RazorpayCustomer;
    } catch (err) {
      // Customer was deleted in the Razorpay dashboard → create a new one.
      console.warn(
        "[billing] stored customer unusable, creating a new one:",
        describeRazorpayError(err),
      );
    }
  }

  const customer = await withRetry("customers.create", () =>
    rzp.customers.create({
      name: name ?? email,
      email,
      notes: { user_id: userId },
    }),
  );
  return customer as RazorpayCustomer;
}

/** Fetch a subscription so we can decide whether it is still payable. */
async function fetchSubscription(id: string): Promise<RazorpaySubscription | null> {
  try {
    const rzp = getRazorpayClient();
    const sub = await withRetry("subscriptions.fetch", () => rzp.subscriptions.fetch(id));
    return sub as unknown as RazorpaySubscription;
  } catch (err) {
    console.warn("[billing] could not fetch subscription:", describeRazorpayError(err));
    return null;
  }
}

/**
 * Create a Razorpay Subscription against the configured plan id. If the user
 * already has an unfinished subscription, reuse it — that way closing Checkout
 * and retrying resumes the same mandate instead of stacking duplicates (and
 * avoids extra create calls against Razorpay's rate limit).
 */
export async function createSubscription(
  customerId: string,
  existingSubscriptionId?: string | null,
): Promise<RazorpaySubscription> {
  if (existingSubscriptionId) {
    const existing = await fetchSubscription(existingSubscriptionId);
    const status = existing?.status ?? "";
    if (existing && REUSABLE_SUBSCRIPTION_STATES.has(status)) {
      console.info(
        `[billing] reusing subscription ${existing.id} (status=${status})`,
      );
      return existing;
    }
    if (existing) {
      console.info(
        `[billing] subscription ${existing.id} is ${status}; creating a new one`,
      );
    }
  }

  const planId = process.env.RAZORPAY_PLAN_ID;
  if (!planId) {
    throw new Error(
      "RAZORPAY_PLAN_ID is not set (create a ₹299/month plan in the Razorpay dashboard)",
    );
  }
  const rzp = getRazorpayClient();
  // customer_id is valid per Razorpay's API docs but missing from this SDK's
  // request-body types, hence the cast.
  const params = {
    plan_id: planId,
    customer_id: customerId,
    total_count: 12, // renewals before auto-cancels; adjust to taste
    quantity: 1,
    notes: {},
  } as unknown as Parameters<typeof rzp.subscriptions.create>[0];
  const subscription = await withRetry("subscriptions.create", () =>
    rzp.subscriptions.create(params),
  );
  return subscription as unknown as RazorpaySubscription;
}

/** Verify Razorpay webhook signatures (X-Razorpay-Signature, HMAC-SHA256). */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("RAZORPAY_WEBHOOK_SECRET is not set");
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac, timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature ?? "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Verify the signature returned by Checkout's handler for a subscription
 * payment: HMAC-SHA256(subscription_id|payment_id, key_secret).
 */
export function verifyCheckoutSignature(
  subscriptionId: string,
  paymentId: string,
  signature: string,
): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) throw new Error("RAZORPAY_KEY_SECRET is not set");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createHmac, timingSafeEqual } = require("node:crypto") as typeof import("node:crypto");
  const expected = createHmac("sha256", secret)
    .update(`${subscriptionId}|${paymentId}`)
    .digest("hex");
  const a = Buffer.from(expected, "utf8");
  const b = Buffer.from(signature ?? "", "utf8");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Map Razorpay subscription.status to our internal status vocabulary.
 * https://razorpay.com/docs/api/subscriptions/#subscription-states
 */
export function mapRazorpayStatus(rzpStatus: string): "active" | "past_due" | "canceled" | "inactive" {
  switch (rzpStatus) {
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
