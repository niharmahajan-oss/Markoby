import { redirect } from "next/navigation";

import { DashboardHeader } from "@/components/dashboard-header";
import { TrialBanner } from "@/components/trial-banner";
import { getUserWithAccess } from "@/lib/auth";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getUserWithAccess();
  if (!session) redirect("/auth/login?next=/dashboard");

  const { user, access } = session;

  return (
    <div className="flex min-h-svh flex-col">
      <DashboardHeader email={user.email} fullName={user.fullName} />
      <TrialBanner access={access} />
      <main className="flex-1">{children}</main>
    </div>
  );
}
