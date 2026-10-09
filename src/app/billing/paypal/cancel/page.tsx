import { XCircle } from "lucide-react";
import Link from "next/link";

import { Card, CardContent } from "@/components/ui/card";
import { Wordmark } from "@/components/wordmark";

export const metadata = { title: "Checkout cancelled · Markoby" };

/**
 * PayPal redirects here when the buyer cancels the approval. Nothing was
 * charged; the stored subscription id simply stays inactive and can be
 * re-approved later or replaced by a fresh one.
 */
export default function PayPalCancelPage() {
  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-4">
      <div className="mb-10 flex flex-col items-center">
        <Wordmark />
      </div>
      <div className="w-full max-w-md">
        <Card className="border-border bg-card rounded-2xl border p-8 text-center">
          <CardContent className="space-y-4">
            <XCircle className="text-muted-foreground mx-auto h-10 w-10" />
            <h1 className="text-xl font-semibold">Checkout cancelled</h1>
            <p className="text-muted-foreground text-sm">
              You cancelled the PayPal approval — nothing was charged and
              nothing is subscribed. You can retry whenever you like.
            </p>
            <Link href="/billing/subscribe" className="text-sm underline underline-offset-4">
              Back to billing
            </Link>
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
