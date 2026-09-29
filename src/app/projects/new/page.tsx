import { Sparkles } from "lucide-react";
import { redirect } from "next/navigation";

import { NewProjectForm } from "@/app/projects/new/new-project-form";
import { Badge } from "@/components/ui/badge";
import { FREE_TRIAL_PROJECTS, SUBSCRIBE_PATH, getUserWithAccess } from "@/lib/auth";

export const metadata = { title: "New project" };

export default async function NewProjectPage() {
  const session = await getUserWithAccess();
  if (!session) redirect("/auth/login?next=/projects/new");

  const { access } = session;
  // Free trial is used up and there's no active subscription → paywall.
  if (!access.canCreateProject) redirect(`${SUBSCRIBE_PATH}?reason=trial`);

  return (
    <div className="surface-glow mx-auto w-full max-w-xl px-6 py-16">
      {access.onTrial && (
        <Badge variant="secondary" className="mb-5 gap-1.5 rounded-full px-3 py-1">
          <Sparkles className="text-primary h-3.5 w-3.5" />
          Free trial — project {access.projectCount + 1} of {FREE_TRIAL_PROJECTS}
        </Badge>
      )}
      <h1 className="text-2xl font-semibold tracking-tight">Start a new project</h1>
      <p className="text-muted-foreground mt-2 text-sm">
        This becomes one workspace: one interview, one set of plans, one
        prospect list per platform.
      </p>
      <NewProjectForm />
    </div>
  );
}
