"use client";

import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { createWithdrawalRequest } from "@/app/referrals/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type ReferralRow = {
  id: string;
  referredEmail: string | null;
  status: string;
  createdAt: string;
  rewardStatus: string | null;
  rewardAmount: number | null;
  rewardCurrency: string | null;
  rewardEligibleAt: string | null;
};

export type WithdrawalRow = {
  id: string;
  currency: string;
  amount: number;
  status: string;
  createdAt: string;
  paymentReference: string | null;
};

type Wallet = {
  pendingInr: number;
  pendingUsd: number;
  availableInr: number;
  availableUsd: number;
  totalWithdrawnInr: number;
  totalWithdrawnUsd: number;
};

const format = (minor: number, currency: string) =>
  currency === "INR"
    ? `₹${(minor / 100).toFixed(2)}`
    : `$${(minor / 100).toFixed(2)}`;

const dateFmt = new Intl.DateTimeFormat("en-IN", {
  dateStyle: "medium",
});

export function ReferralDashboard({
  referralCode,
  referralLink,
  referralCount,
  successfulReferrals,
  wallet,
  referrals,
  withdrawals,
  supportEmail,
}: {
  referralCode: string | null;
  referralLink: string;
  referralCount: number;
  successfulReferrals: number;
  wallet: Wallet;
  referrals: ReferralRow[];
  withdrawals: WithdrawalRow[];
  supportEmail: string;
}) {
  const [copied, setCopied] = useState(false);
  const [showForm, setShowForm] = useState(false);

  async function copyLink() {
    await navigator.clipboard.writeText(referralLink);
    setCopied(true);
    toast.success("Referral link copied!");
    setTimeout(() => setCopied(false), 1500);
  }

  // Which currencies have withdrawable money?
  const withdrawable: { currency: "INR" | "USD"; available: number }[] = [];
  if (wallet.availableInr > 0) withdrawable.push({ currency: "INR", available: wallet.availableInr });
  if (wallet.availableUsd > 0) withdrawable.push({ currency: "USD", available: wallet.availableUsd });

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Refer &amp; earn</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Share your link — earn ₹100 per Indian subscriber or $2 per international
          subscriber, 7 days after their first payment clears.
        </p>
      </div>

      {/* Referral link */}
      <Card>
        <CardHeader>
          <CardTitle>Your referral link</CardTitle>
          <CardDescription>
            Anyone signing up through this link is permanently attributed to you.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row">
            <code className="bg-muted overflow-x-auto rounded-md px-3 py-2 text-xs sm:flex-1">
              {referralCode ? referralLink : "Setting up your link…"}
            </code>
            <Button onClick={copyLink} disabled={!referralCode}>
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {copied ? "Copied" : "Copy link"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard title="Referrals signed up" value={String(referralCount)} />
        <StatCard title="Qualified referrals" value={String(successfulReferrals)} />
        <StatCard
          title="Pending rewards"
          value={`${format(wallet.pendingInr, "INR")} · ${format(wallet.pendingUsd, "USD")}`}
        />
        <StatCard
          title="Available to withdraw"
          value={`${format(wallet.availableInr, "INR")} · ${format(wallet.availableUsd, "USD")}`}
        />
      </div>

      {/* Wallet summary + withdrawal */}
      <Card>
        <CardHeader>
          <CardTitle>Wallet</CardTitle>
          <CardDescription>
            INR and USD balances are separate and never combined. Rewards unlock 7
            days after the referred friend&apos;s first payment clears.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Stat title="INR balance" value={format(wallet.availableInr, "INR")} sub={`${format(wallet.pendingInr, "INR")} pending`} />
            <Stat title="USD balance" value={format(wallet.availableUsd, "USD")} sub={`${format(wallet.pendingUsd, "USD")} pending`} />
            <Stat title="Total paid out" value={`${format(wallet.totalWithdrawnInr, "INR")} · ${format(wallet.totalWithdrawnUsd, "USD")}`} />
          </div>

          <div>
            <Button
              onClick={() => setShowForm((v) => !v)}
              disabled={withdrawable.length === 0}
            >
              Request Withdrawal
            </Button>
            <p className="text-muted-foreground mt-2 text-xs">
              {withdrawable.length === 0
                ? "You need an available balance (released rewards) before you can request a withdrawal."
                : "Manual payouts are processed by the Markoby team, usually within 5 business days."}
            </p>
          </div>

          {showForm && withdrawable.length > 0 && (
            <WithdrawalForm withdrawable={withdrawable} supportEmail={supportEmail} />
          )}
        </CardContent>
      </Card>

      {/* Referral history */}
      <Card>
        <CardHeader>
          <CardTitle>Referral history</CardTitle>
        </CardHeader>
        <CardContent>
          {referrals.length === 0 ? (
            <p className="text-muted-foreground text-sm">No referrals yet.</p>
          ) : (
            <ul className="divide-y">
              {referrals.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">{r.referredEmail ?? "Signed-up user"}</div>
                    <div className="text-muted-foreground text-xs">
                      Joined {dateFmt.format(new Date(r.createdAt))}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">
                      {r.rewardAmount != null && r.rewardCurrency
                        ? `${format(r.rewardAmount, r.rewardCurrency)}`
                        : "—"}
                    </div>
                    <div className="text-muted-foreground text-xs capitalize">
                      {r.rewardStatus ?? r.status}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Withdrawal history */}
      <Card>
        <CardHeader>
          <CardTitle>Withdrawal history</CardTitle>
        </CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? (
            <p className="text-muted-foreground text-sm">No withdrawal requests yet.</p>
          ) : (
            <ul className="divide-y">
              {withdrawals.map((w) => (
                <li key={w.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                  <div>
                    <div className="font-medium">
                      {format(w.amount, w.currency)} · {w.currency}
                    </div>
                    <div className="text-muted-foreground font-mono text-xs">{w.id}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium capitalize">{w.status}</div>
                    <div className="text-muted-foreground text-xs">
                      {dateFmt.format(new Date(w.createdAt))}
                      {w.paymentReference ? ` · ref: ${w.paymentReference}` : ""}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-xs">
        Questions? Email{" "}
        <a href={`mailto:${supportEmail}`} className="underline underline-offset-4">
          {supportEmail}
        </a>
        . Screenshots are supporting evidence only — the payable amount is always
        determined from Markoby&apos;s server-side ledger.
      </p>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card size="sm">
      <CardContent>
        <div className="text-muted-foreground text-xs">{title}</div>
        <div className="mt-1 text-lg font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function Stat({ title, value, sub }: { title: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-muted-foreground text-xs">{title}</div>
      <div className="font-semibold">{value}</div>
      {sub && <div className="text-muted-foreground text-xs">{sub}</div>}
    </div>
  );
}

function WithdrawalForm({
  withdrawable,
  supportEmail,
}: {
  withdrawable: { currency: "INR" | "USD"; available: number }[];
  supportEmail: string;
}) {
  const [pending, setPending] = useState(false);
  const [requestId, setRequestId] = useState<string | null>(null);
  const single = withdrawable.length === 1 ? withdrawable[0].currency : null;
  const [currency, setCurrency] = useState<"INR" | "USD">(
    withdrawable[0]?.currency ?? "INR",
  );
  const maxAmount = withdrawable.find((w) => w.currency === currency)?.available ?? 0;

  async function onSubmit(formData: FormData) {
    setPending(true);
    const result = await createWithdrawalRequest(formData);
    setPending(false);
    if (result.ok && result.requestId) {
      setRequestId(result.requestId);
      toast.success("Withdrawal request created!");
    } else {
      toast.error(result.error ?? "Something went wrong.");
    }
  }

  if (requestId) {
    return (
      <div className="bg-primary/5 border-primary/30 rounded-lg border p-4 text-sm">
        <p className="font-medium">Request received — reference {requestId}</p>
        <p className="text-muted-foreground mt-2">
          Next steps: email a screenshot of this wallet page to{" "}
          <a className="underline underline-offset-4" href={`mailto:${supportEmail}`}>
            {supportEmail}
          </a>{" "}
          with subject &quot;Withdrawal {requestId}&quot;. Include:
        </p>
        <ul className="text-muted-foreground mt-1 list-disc pl-5">
          <li>Your registered Markoby email</li>
          <li>This request ID</li>
          <li>The amount and currency you requested</li>
          <li>Your payout details (matched to what you entered here)</li>
        </ul>
        <p className="text-muted-foreground mt-2 text-xs">
          The screenshot is supporting evidence only. The payable amount is
          verified against Markoby&apos;s internal ledger.
        </p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-4 rounded-lg border p-4 text-sm">
      {single ? (
        <input type="hidden" name="currency" value={single} />
      ) : (
        <div>
          <label className="mb-1 block font-medium">Currency</label>
          <select
            name="currency"
            className="border-border bg-background rounded-md border px-3 py-2 text-sm"
            value={currency}
            onChange={(e) => setCurrency(e.target.value as "INR" | "USD")}
          >
            {withdrawable.map((w) => (
              <option key={w.currency} value={w.currency}>
                {w.currency} — max {(w.available / 100).toFixed(2)}
              </option>
            ))}
          </select>
        </div>
      )}

      <div>
        <label className="mb-1 block font-medium">Withdrawal amount</label>
        <input
          name="amount"
          type="number"
          step={(currency === "INR" ? "0.01" : "0.01")}
          min={0.01}
          max={maxAmount / 100}
          required
          className="border-border bg-background w-48 rounded-md border px-3 py-2 text-sm"
        />
        <p className="text-muted-foreground mt-1 text-xs">
          Available: {format(maxAmount, currency)}
        </p>
      </div>

      <div>
        <label className="mb-1 block font-medium">Payout method</label>
        <select
          name="payout_method"
          className="border-border bg-background rounded-md border px-3 py-2 text-sm"
          defaultValue={currency === "INR" ? "upi" : "paypal"}
        >
          {currency === "INR" && (
            <>
              <option value="upi">UPI (India)</option>
              <option value="bank">Bank transfer (India)</option>
            </>
          )}
          <option value="paypal">PayPal (works for both)</option>
        </select>
      </div>

      {/* Payout detail fields — a little client state to switch form fields */}
      <PayoutFields currency={currency} />

      <label className="flex items-start gap-2 text-xs">
        <input type="checkbox" name="confirm_accuracy" required className="mt-0.5" />
        <span>
          I confirm the payout details above are accurate and belong to me.
          Incorrect details can delay or void this payout.
        </span>
      </label>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating request…" : "Submit withdrawal request"}
      </Button>
    </form>
  );
}

function PayoutFields({ currency }: { currency: "INR" | "USD" }) {
  // Server validates everything; these fields make the common paths obvious.
  return (
    <div className="space-y-3">
      <details open className="text-muted-foreground text-xs">
        <summary className="cursor-pointer font-medium text-sm">Payout details</summary>
        <div className="mt-2 space-y-2">
          <div>
            <label className="mb-1 block">PayPal email (for PayPal payouts)</label>
            <input
              name="paypal_email"
              type="email"
              placeholder="you@example.com"
              className="border-border bg-background w-64 rounded-md border px-3 py-2 text-sm"
            />
          </div>
          {currency === "INR" && (
            <>
              <div>
                <label className="mb-1 block">UPI ID (alternative to PayPal, India)</label>
                <input
                  name="upi_id"
                  placeholder="name@bank"
                  className="border-border bg-background w-64 rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block">
                  Bank account number (optional bank payout)
                </label>
                <input
                  name="account_number"
                  className="border-border bg-background w-64 rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block">IFSC (bank payout)</label>
                <input
                  name="ifsc"
                  className="border-border bg-background w-64 rounded-md border px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="mb-1 block">Account holder name (bank payout)</label>
                <input
                  name="holder_name"
                  className="border-border bg-background w-64 rounded-md border px-3 py-2 text-sm"
                />
              </div>
            </>
          )}
        </div>
      </details>
    </div>
  );
}
