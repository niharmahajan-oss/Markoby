import "server-only";

import Razorpay from "razorpay";


/**
 * Server-only Razorpay helpers. Uses Razorpay Subscriptions (recurring plan)
 * + Standard Checkout — no custom card handling, per the product spec.
 */

export const RAZORPAY_PLAN_AMOUNT_PAISE = 29900; // ₹299.00
export const RAZORPAY_PLAN_CURRENCY = "INR";
export const RAZORPAY_PLAN_PERIOD = "monthly" as const;

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

/** Create (or reuse) a Razorpay customer for this user. */
export async function ensureCustomer(userId: string, email: string, name: string | null) {
  const rzp = getRazorpayClient();
  const customer = await rzp.customers.create({
    name: name ?? email,
    email,
    notes: { user_id: userId },
  });
  return customer as { id: string; email?: string; name?: string };
}

/** Create a Razorpay Subscription against the configured plan id. */
export async function createSubscription(customerId: string) {
  const planId = process.env.RAZORPAY_PLAN_ID;
  if (!planId) {
    throw new Error("RAZORPAY_PLAN_ID is not set (create a ₹299/month plan in the Razorpay dashboard)");
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
  const subscription = await rzp.subscriptions.create(params);
  return subscription as unknown as {
    id: string;
    status: string;
    short_url?: string;
  };
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
