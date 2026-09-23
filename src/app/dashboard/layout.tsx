import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard-header";
import { getUserWithSubscription, hasActiveSubscription } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login?next=/dashboard");
  if (!hasActiveSubscription(user)) redirect("/billing/inactive");

  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader email={user.email} fullName={user.fullName} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
