import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PlatformSelectClient } from "@/app/projects/[id]/platforms/platform-select-client";
import { getProject } from "@/lib/projects";
import { getUserWithSubscription, hasActiveSubscription } from "@/lib/auth";

export const metadata = { title: "Pick your platforms" };

export default async function PlatformsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login");
  if (!hasActiveSubscription(user)) redirect("/billing/inactive");

  const project = await getProject(id);
  if (!project) redirect("/dashboard");
  if (project.status === "plan_ready" || project.status === "active") {
    redirect(`/projects/${id}`);
  }

  return (
    <div className="surface-glow mx-auto w-full max-w-3xl px-6 py-14">
      <Link
        href={`/projects/${id}`}
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1.5 text-sm transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to project
      </Link>
      <h1 className="mt-6 text-2xl font-semibold tracking-tight">
        Where do you want to grow?
      </h1>
      <p className="text-muted-foreground mt-2 text-sm">
        Pick the platforms you can realistically commit to. You&apos;ll get a
        plan built around each one&apos;s actual culture — plus prospect lists
        where the platform&apos;s API allows it.
      </p>
      <PlatformSelectClient projectId={id} />
    </div>
  );
}
