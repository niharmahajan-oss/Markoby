/**
 * Billing currency selection.
 *
 * The price a user is charged is decided HERE, on the server, from
 * infrastructure-provided geo headers (Vercel `x-vercel-ip-country`, or
 * Cloudflare's `cf-ipcountry` when fronted by Cloudflare). It is never taken
 * from a client-supplied field, so a tampered request cannot buy the cheaper
 * plan — the client merely *displays* whatever the server already decided.
 */

export type BillingCurrency = "INR" | "USD";

/** Prices are mirrored in src/lib/billing/razorpay.ts (smallest currency unit). */
export const BILLING_PRICING: Record<
  BillingCurrency,
  {
    amountLabel: string;
    checkoutDescription: string;
    buttonLabel: string;
    methodsLabel: string;
  }
> = {
  INR: {
    amountLabel: "₹299",
    checkoutDescription: "₹299/month · all features included",
    buttonLabel: "Subscribe — ₹299/month",
    methodsLabel: "Payments handled securely by Razorpay. UPI, cards, netbanking.",
  },
  USD: {
    amountLabel: "$5",
    checkoutDescription: "$5/month · all features included",
    buttonLabel: "Subscribe — $5/month",
    methodsLabel: "Payments handled securely by PayPal. Cards, PayPal balance and more.",
  },
};

/**
 * INR stays the default whenever the country is unknown (local development,
 * hosts without geo headers). That keeps today's behaviour byte-for-byte
 * unchanged everywhere the signal is missing.
 */
export const DEFAULT_BILLING_CURRENCY: BillingCurrency = "INR";

export function billingCurrencyForCountry(
  country: string | null | undefined,
): BillingCurrency {
  const code = (country ?? "").trim().toUpperCase();
  if (!code) return DEFAULT_BILLING_CURRENCY;
  return code === "IN" ? "INR" : "USD";
}

/** Best-effort country from CDN geo headers; null when neither is present. */
export function countryFromHeaders(headers: Headers): string | null {
  return headers.get("x-vercel-ip-country") ?? headers.get("cf-ipcountry") ?? null;
}

export function billingCurrencyFromHeaders(headers: Headers): BillingCurrency {
  return billingCurrencyForCountry(countryFromHeaders(headers));
}
