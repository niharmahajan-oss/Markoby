"use client";

import { useState } from "react";
import { toast } from "sonner";

import { adminUpdateWithdrawal } from "@/app/referrals/actions";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export type AdminRequest = {
  id: string;
  userEmail: string;
  userFullName: string | null;
  currency: string;
  amount: number;
  status: string;
  payoutMethod: string;
  payoutDetails: Record<string, unknown>;
  adminNote: string | null;
  paymentReference: string | null;
  paidAt: string | null;
  paidByAdmin: string | null;
  createdAt: string;
};

const fmt = (minor: number, currency: string) =>
  currency === "INR" ? `₹${(minor / 100).toFixed(2)}` : `$${(minor / 100).toFixed(2)}`;

export function AdminWithdrawalList({
  openRequests,
  processedRequests,
}: {
  openRequests: AdminRequest[];
  processedRequests: AdminRequest[];
}) {
  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 px-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Withdrawal requests — admin
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Payouts are manual. Verify the wallet ledger before paying; the
          screenshot users email in is supporting evidence only.
        </p>
      </div>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Open requests ({openRequests.length})</h2>
        {openRequests.length === 0 && (
          <p className="text-muted-foreground text-sm">No open requests.</p>
        )}
        {openRequests.map((r) => (
          <RequestCard key={r.id} request={r} />
        ))}
      </section>

      <section className="space-y-4">
        <h2 className="text-lg font-medium">Recently processed</h2>
        {processedRequests.length === 0 && (
          <p className="text-muted-foreground text-sm">Nothing processed yet.</p>
        )}
        <ul className="divide-y rounded-lg border">
          {processedRequests.map((r) => (
            <li key={r.id} className="flex items-center justify-between px-4 py-3 text-sm">
              <div>
                <div className="font-medium">
                  {fmt(r.amount, r.currency)} · {r.userEmail}
                </div>
                <div className="text-muted-foreground font-mono text-xs">{r.id}</div>
              </div>
              <div className="text-right">
                <div className="font-medium capitalize">{r.status}</div>
                {r.paymentReference && (
                  <div className="text-muted-foreground text-xs">ref: {r.paymentReference}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function RequestCard({ request: r }: { request: AdminRequest }) {
  const [pending, setPending] = useState(false);

  async function act(formData: FormData) {
    setPending(true);
    const result = await adminUpdateWithdrawal(formData);
    setPending(false);
    if (result.ok) toast.success("Updated.");
    else toast.error(result.error ?? "Failed.");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          {fmt(r.amount, r.currency)} · {r.userEmail}
        </CardTitle>
        <CardDescription>
          <span className="font-mono">{r.id}</span> · requested{" "}
          {new Date(r.createdAt).toLocaleString()} · method: {r.payoutMethod} ·
          status: {r.status}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div>
          <div className="text-muted-foreground mb-1 text-xs font-medium">
            Payout details
          </div>
          <pre className="bg-muted max-w-full overflow-auto rounded px-2 py-1 text-xs">
            {JSON.stringify(r.payoutDetails, null, 2)}
          </pre>
        </div>

        <form action={act} className="flex flex-wrap items-end gap-2 text-sm">
          <input type="hidden" name="request_id" value={r.id} />
          <div>
            <label className="text-muted-foreground block text-xs">Internal note</label>
            <input
              name="note"
              className="border-border bg-background w-56 rounded-md border px-2 py-1.5"
            />
          </div>
          <div>
            <label className="text-muted-foreground block text-xs">
              Payment reference (required to mark paid)
            </label>
            <input
              name="payment_reference"
              className="border-border bg-background w-56 rounded-md border px-2 py-1.5"
              defaultValue={r.paymentReference ?? ""}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {r.status === "requested" && (
              <Button type="submit" name="action" value="under_review" disabled={pending} variant="secondary">
                Under review
              </Button>
            )}
            {r.status !== "approved" && r.status !== "paid" && (
              <Button type="submit" name="action" value="approve" disabled={pending} variant="secondary">
                Approve
              </Button>
            )}
            <Button type="submit" name="action" value="mark_paid" disabled={pending}>
              Mark paid
            </Button>
            <Button type="submit" name="action" value="reject" disabled={pending} variant="destructive">
              Reject
            </Button>
            <Button type="submit" name="action" value="cancel" disabled={pending} variant="outline">
              Cancel
            </Button>
          </div>
        </form>
        {r.adminNote && (
          <p className="text-muted-foreground text-xs">Note: {r.adminNote}</p>
        )}
      </CardContent>
    </Card>
  );
}
