import { redirect } from "next/navigation";

import { SubscribeClient } from "@/app/billing/subscribe-client";
import { Wordmark } from "@/components/wordmark";
import { getUserWithSubscription, hasActiveSubscription } from "@/lib/auth";

export const metadata = { title: "Subscribe · Markoby" };

export default async function SubscribePage() {
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login?next=/billing/subscribe");
  if (hasActiveSubscription(user)) redirect("/dashboard");

  return (
    <main className="surface-glow flex min-h-svh flex-col items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="mb-10 flex flex-col items-center">
          <Wordmark />
          <p className="text-muted-foreground mt-3 text-center text-sm">
            One plan. Everything included. Cancel anytime.
          </p>
        </div>
        <SubscribeClient email={user.email} name={user.fullName} />
      </div>
    </main>
    );
}
