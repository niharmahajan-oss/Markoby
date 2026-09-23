import "server-only";

import type {
  MarketingPlan,
  OnboardingMessage,
  Project,
  ProjectPlatform,
  Prospect,
} from "@/lib/types";
import { createClient } from "@/lib/supabase/server";

/** All queries run as the signed-in user, so RLS enforces ownership. */

export type ProjectWithPlatforms = Project & {
  project_platforms: { platform: ProjectPlatform["platform"] }[];
};

export async function listProjects(userId: string): Promise<ProjectWithPlatforms[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*, project_platforms(platform)")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  return (data ?? []) as unknown as ProjectWithPlatforms[];
}

export async function getProject(projectId: string): Promise<Project | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .maybeSingle();
  return (data as Project) ?? null;
}

export async function getProjectMessages(projectId: string): Promise<OnboardingMessage[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_messages")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []) as OnboardingMessage[];
}

export async function getProjectPlatforms(projectId: string): Promise<ProjectPlatform[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("project_platforms")
    .select("*")
    .eq("project_id", projectId)
    .order("enabled_at", { ascending: true });
  return (data ?? []) as ProjectPlatform[];
}

export async function getProjectPlans(projectId: string): Promise<MarketingPlan[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("marketing_plans")
    .select("*")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true });
  return (data ?? []) as MarketingPlan[];
}

export async function getProjectProspects(projectId: string): Promise<Prospect[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("prospects")
    .select("*")
    .eq("project_id", projectId)
    .order("relevance_score", { ascending: false, nullsFirst: false })
    .order("discovered_at", { ascending: false });
  return (data ?? []) as Prospect[];
}

export async function getOnboardingSummary(projectId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("onboarding_summary")
    .select("*")
    .eq("project_id", projectId)
    .maybeSingle();
  return data;
}

/** Build compact interview transcript text for AI calls. */
export function transcriptToText(
  messages: Pick<OnboardingMessage, "role" | "content">[],
): string {
  return messages
    .map((m) => `${m.role === "assistant" ? "INTERVIEWER" : "FOUNDER"}: ${m.content}`)
    .join("\n\n");
}
