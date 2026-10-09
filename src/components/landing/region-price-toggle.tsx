"use client";

import { Globe, IndianRupee } from "lucide-react";
import { useState } from "react";

type Region = "IN" | "INTL";

const REGION_PRICING: Record<
  Region,
  { amount: string; note: string; gateway: string }
> = {
  IN: {
    amount: "₹299",
    note: "Billed monthly in INR",
    gateway: "Razorpay",
  },
  INTL: {
    amount: "$5",
    note: "Billed monthly in USD",
    gateway: "PayPal",
  },
};

/**
 * Landing-page pricing toggle: the price a visitor actually pays is decided
 * server-side at checkout from geo headers; this control only previews the
 * regional card. Default is India (the product's Indian launch audience);
 * international visitors see $5/PayPal after a single tap — cheap, honest,
 * and no hydration risk.
 */
export function RegionPriceToggle() {
  const [region, setRegion] = useState<Region>("IN");
  const price = REGION_PRICING[region];

  return (
    <div>
      <div className="mb-4 inline-flex rounded-full border border-zinc-800 bg-zinc-900/80 p-0.5 text-xs font-medium">
        <button
          type="button"
          aria-pressed={region === "IN"}
          onClick={() => setRegion("IN")}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
            region === "IN"
              ? "bg-[#a3f324] text-black"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <IndianRupee className="h-3 w-3" />
          India
        </button>
        <button
          type="button"
          aria-pressed={region === "INTL"}
          onClick={() => setRegion("INTL")}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors ${
            region === "INTL"
              ? "bg-[#a3f324] text-black"
              : "text-zinc-400 hover:text-white"
          }`}
        >
          <Globe className="h-3 w-3" />
          International
        </button>
      </div>
      <div className="mb-4 flex items-baseline gap-2">
        <span className="text-5xl font-extrabold tracking-tight text-white sm:text-6xl">
          {price.amount}
        </span>
        <span className="text-lg font-medium text-zinc-400">/ month</span>
      </div>
      <p className="text-xs text-zinc-400 sm:text-sm">
        {price.note} via {price.gateway}.
      </p>
    </div>
  );
}
