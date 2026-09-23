import { redirect } from "next/navigation";

import { NewProjectForm } from "@/app/projects/new/new-project-form";
import { getUserWithSubscription } from "@/lib/auth";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login?next=/projects/new");

  return (
    <div className="surface-glow mx-auto w-full max-w-xl px-6 py-16">
      <h1 className="text-2xl font-semibold tracking-tight">Start a new project</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        This becomes one workspace: one interview, one set of plans, one
        prospect list per platform.
      </p>
      <NewProjectForm />
    </div>
  );
}
