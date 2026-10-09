import "server-only";

import Razorpay from "razorpay";

import type { BillingCurrency } from "@/lib/billing/currency";


/**
 * Server-only Razorpay helpers. Uses Razorpay Subscriptions (recurring plan)
 * + Standard Checkout — no custom card handling, per the product spec.
 */

export const RAZORPAY_PLAN_AMOUNT_PAISE = 29900; // ₹299.00
export const RAZORPAY_PLAN_CURRENCY = "INR";
export const RAZORPAY_PLAN_PERIOD = "monthly" as const;

// International plan: $5.00/month. Razorpay amounts are in the smallest
// currency unit, so USD uses *cents* — 500 = $5.00 (paise only applies to
// INR). The plan itself lives in the Razorpay dashboard; see
// RAZORPAY_USD_PLAN_ID.
export const RAZORPAY_USD_PLAN_AMOUNT_CENTS = 500; // $5.00
export const RAZORPAY_USD_PLAN_CURRENCY = "USD";

/** Resolve the Razorpay plan id for a currency; fails loudly if unset. */
export function razorpayPlanIdForCurrency(currency: BillingCurrency): string {
  const planId =
    currency === "INR"
      ? process.env.RAZORPAY_PLAN_ID
      : process.env.RAZORPAY_USD_PLAN_ID;
  const label =
    currency === "INR"
      ? "RAZORPAY_PLAN_ID (the ₹299/month INR plan)"
      : "RAZORPAY_USD_PLAN_ID (the $5/month USD plan)";
  if (!planId) {
    throw new Error(`${label} is not set`);
  }
  return planId;
}

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

/** Actionable, user-facing explanation of a Razorpay failure. */
export function explainRazorpayError(err: unknown): string {
  const detail = describeRazorpayError(err);
  if (/authentication failed/i.test(detail)) {
    return "Razorpay is temporarily rate-limiting this account. Wait about a minute, then press Subscribe again.";
  }
  if (/name format is invalid/i.test(detail)) {
    return "Razorpay couldn't accept the name on the account. Set a display name on your profile, then try again.";
  }
  return detail;
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
  attempts = 4,
): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt === attempts || !isTransient(err)) break;
      // Throttling clears on a longer timescale than a network blip, so back
      // off harder for "Authentication failed" (Razorpay's rate-limit signal).
      const throttled = /authentication failed/i.test(describeRazorpayError(err));
      const delay = throttled
        ? 1200 * attempt
        : 400 * attempt + Math.floor(Math.random() * 200);
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
 * Razorpay rejects a customer whose `name` isn't a person name — passing the
 * user's email there fails with "The name format is invalid".
 */
function isPlausiblePersonName(value: string): boolean {
  if (value.length < 2 || value.length > 60) return false;
  if (value.includes("@") || /https?:|www\./i.test(value)) return false;
  if (!/^[A-Za-z][A-Za-z .'-]*$/.test(value)) return false;
  return value.replace(/[^A-Za-z]/g, "").length >= 2;
}

/**
 * Best available human name for Razorpay, or null when we genuinely don't have
 * one (in which case the field is omitted rather than filled with junk).
 */
export function resolveCustomerName(
  fullName: string | null,
  email: string,
): string | null {
  const candidate = (fullName ?? "").trim().replace(/\s+/g, " ");
  if (isPlausiblePersonName(candidate)) return candidate;

  // Fall back to a humanised email local part: "nihar.mahajan+1@x.com" →
  // "Nihar Mahajan".
  const derived = (email.split("@")[0] ?? "")
    .split("+")[0]
    .replace(/[._-]+/g, " ")
    .replace(/[^A-Za-z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return isPlausiblePersonName(derived) ? derived : null;
}

/**
 * Look up a customer by email. Only an exact email match is ever returned —
 * taking an arbitrary customer would attach someone else's payment history to
 * this account.
 */
async function findCustomerByEmail(
  rzp: Razorpay,
  email: string,
): Promise<RazorpayCustomer | null> {
  try {
    const params = { email, count: 50 } as unknown as Parameters<
      typeof rzp.customers.all
    >[0];
    const result = await withRetry("customers.all", () => rzp.customers.all(params));
    const items = (result as unknown as { items?: RazorpayCustomer[] })?.items ?? [];
    const match = items.find(
      (candidate) => (candidate.email ?? "").toLowerCase() === email.toLowerCase(),
    );
    return match ?? null;
  } catch (err) {
    console.warn("[billing] customer lookup failed:", describeRazorpayError(err));
    return null;
  }
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

  const customerName = resolveCustomerName(name, email);

  try {
    // fail_existing: "0" is Razorpay's documented switch for "return the
    // customer with this email if one already exists". Without it, every
    // checkout attempt after the first fails with "Customer already exists for
    // the merchant" — the payment error founders hit when they retried.
    const params = {
      ...(customerName ? { name: customerName } : {}),
      email,
      fail_existing: "0",
      notes: { user_id: userId },
    } as unknown as Parameters<typeof rzp.customers.create>[0];
    const customer = await withRetry("customers.create", () =>
      rzp.customers.create(params),
    );
    return customer as RazorpayCustomer;
  } catch (err) {
    // Backstop for older API behaviour / accounts where fail_existing is
    // ignored: find the customer by exact email match and reuse it.
    if (/already exists/i.test(describeRazorpayError(err))) {
      const existing = await findCustomerByEmail(rzp, email);
      if (existing) {
        console.info(`[billing] reusing existing customer ${existing.id} for ${email}`);
        return existing;
      }
    }
    throw err;
  }
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
 * already has an unfinished subscription *on the same plan*, reuse it — that
 * way closing Checkout and retrying resumes the same mandate instead of
 * stacking duplicates (and avoids extra create calls against Razorpay's rate
 * limit). A stored subscription created for a different currency is never
 * reused; the caller supplies the currency-appropriate plan id.
 */
export async function createSubscription(
  customerId: string,
  existingSubscriptionId: string | null,
  currency: BillingCurrency,
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

  // The plan id — and therefore the amount and currency — comes from server
  // configuration only, never from the client.
  const planId = razorpayPlanIdForCurrency(currency);
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
