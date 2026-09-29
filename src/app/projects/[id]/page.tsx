import { redirect } from "next/navigation";

import { InterviewChat } from "@/app/projects/[id]/interview-chat";
import { ProjectWorkspace } from "@/app/projects/[id]/project-workspace";
import { getUserWithSubscription } from "@/lib/auth";
import {
  getOnboardingSummary,
  getProject,
  getProjectMessages,
  getProjectPlans,
  getProjectPlatforms,
  getProjectProspects,
} from "@/lib/projects";
import type { PlanJSONData } from "@/lib/types";

export const metadata = { title: "Project" };

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login");
  // Projects are RLS-scoped to their owner, so a trial user can keep working
  // inside the free project they already created.

  const project = await getProject(id);
  if (!project) redirect("/dashboard");

  // 1) Interview not finished → chat UI.
  if (project.status === "onboarding") {
    const messages = await getProjectMessages(id);
    return (
      <InterviewChat
        projectId={id}
        projectName={project.name}
        initialMessages={messages.map((m) => ({ role: m.role, content: m.content }))}
      />
    );
  }

  // 2) Interview finished but no platforms chosen → platform picker.
  const platforms = await getProjectPlatforms(id);
  if (platforms.length === 0) {
    redirect(`/projects/${id}/platforms`);
  }

  // 3) Full working dashboard: plan tabs per platform + prospect list (4.9).
  const [plans, prospects, summary] = await Promise.all([
    getProjectPlans(id),
    getProjectProspects(id),
    getOnboardingSummary(id),
  ]);

  return (
    <ProjectWorkspace
      projectId={id}
      projectName={project.name}
      projectStatus={project.status}
      platforms={platforms.map((p) => p.platform)}
      plans={plans.map((p) => ({
        platform: p.platform,
        status: p.status,
        error: p.error,
        plan: (p.plan_json as PlanJSONData | null) ?? undefined,
        modelUsed: p.model_used,
        promptVersion: p.prompt_version,
      }))}
      prospects={prospects}
      summary={
        summary
          ? {
              businessDescription: summary.business_description,
              targetAudience: summary.target_audience,
              valueProp: summary.value_prop,
              toneOfVoice: summary.tone_of_voice,
            }
          : null
      }
    />
  );
}
