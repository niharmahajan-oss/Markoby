"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";

import { extractOnboardingSummary } from "@/lib/ai/groq";
import type { Platform } from "@/lib/ai/types";
import {
  FREE_TRIAL_PROJECTS,
  SUBSCRIBE_PATH,
  countProjects,
  getUserWithSubscription,
} from "@/lib/auth";
import { getProject, getProjectMessages, transcriptToText } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";
import { fetchSiteContext, siteContextForPrompt } from "@/lib/website";

async function requireUser() {
  const user = await getUserWithSubscription();
  if (!user) redirect("/auth/login?next=/dashboard");
  return user;
}

// ── Website drop + project creation (4.4) ───────────────────────────────────

export type CreateProjectResult =
  | { ok: true; projectId: string }
  | { ok: false; error: string; code?: "trial_used"; subscribeUrl?: string };

export async function createProject(input: {
  name: string;
  websiteUrl?: string;
}): Promise<CreateProjectResult> {
  const user = await requireUser();
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give your project a name first." };

  // Free trial: one project without a subscription. Server-side, so the limit
  // holds no matter what the client sends.
  if (user.subscriptionStatus !== "active") {
    const existing = await countProjects(user.id);
    if (existing >= FREE_TRIAL_PROJECTS) {
      return {
        ok: false,
        code: "trial_used",
        subscribeUrl: `${SUBSCRIBE_PATH}?reason=trial`,
        error:
          "Your free project is used up. Subscribe to ₹299/month to create more projects.",
      };
    }
  }

  let websiteContext: string | null = null;
  let normalizedUrl: string | null = null;
  if (input.websiteUrl?.trim()) {
    try {
      const ctx = await fetchSiteContext(input.websiteUrl);
      normalizedUrl = ctx.url;
      websiteContext = siteContextForPrompt(ctx);
    } catch (err) {
      // The website drop is optional — never block project creation on it.
      console.warn("[projects] website fetch failed:", err);
    }
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: user.id,
      name,
      website_url: normalizedUrl,
      website_context: websiteContext,
    })
    .select("id")
    .single();

  if (error || !data) {
    return { ok: false, error: "Could not create the project. Try again." };
  }
  return { ok: true, projectId: data.id };
}

// ── Summary extraction (end of 4.5) ─────────────────────────────────────────

export type FinishResult =
  | { ok: true; next: string }
  | { ok: false; error: string };

export async function finishInterview(projectId: string): Promise<FinishResult> {
  const user = await requireUser();
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  const supabase = await createClient();
  const messages = await getProjectMessages(projectId);
  if (messages.length < 4) {
    return { ok: false, error: "The interview is too short to summarize yet." };
  }

  const transcript = transcriptToText(messages);
  const summary = await extractOnboardingSummary(transcript, user.id);
  if (!summary) {
    return { ok: false, error: "Could not summarize the interview. Try again." };
  }

  const { error: summaryError } = await supabase.from("onboarding_summary").upsert({
    project_id: projectId,
    business_description: summary.business_description ?? "",
    target_audience: summary.target_audience ?? "",
    value_prop: summary.value_prop ?? "",
    tone_of_voice: summary.tone_of_voice ?? "",
    constraints: summary.constraints ?? "",
    raw_json: summary as unknown as Record<string, unknown>,
  });

  if (summaryError) {
    return { ok: false, error: "Could not save the interview summary." };
  }

  return { ok: true, next: `/projects/${projectId}/platforms` };
}

// ── Ongoing use (4.9): prospect status, re-run interview, regenerate plans ─

export async function setProspectStatus(
  prospectId: string,
  status: "new" | "contacted" | "ignored",
): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  // RLS scopes this update to the owner's rows.
  const { error } = await supabase
    .from("prospects")
    .update({ status })
    .eq("id", prospectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function rerunInterview(projectId: string): Promise<{ ok: boolean; error?: string }> {
  await requireUser();
  const supabase = await createClient();
  // Keep the transcript so Maya can pick up where you left off; just flip the
  // project back into onboarding so the chat opens again.
  const { error } = await supabase
    .from("projects")
    .update({ status: "onboarding" })
    .eq("id", projectId);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function regeneratePlans(
  projectId: string,
): Promise<{ ok: boolean; error?: string }> {
  const user = await requireUser();
  const supabase = await createClient();

  const { error } = await supabase
    .from("marketing_plans")
    .update({ status: "pending", error: null })
    .eq("project_id", projectId);
  if (error) return { ok: false, error: error.message };

  after(async () => {
    const { kickOffPlanGeneration } = await import("@/lib/ai/generate-plans");
    try {
      await kickOffPlanGeneration(projectId, user.id);
    } catch (err) {
      console.error("[plans] regeneration failed:", err);
    }
  });

  return { ok: true };
}

// ── Platform selection (4.6) + plan generation kickoff (4.7) ────────────────

export type PlatformsResult =
  | { ok: true; redirect: string }
  | { ok: false; error: string };

export async function savePlatformsAndGenerate(
  projectId: string,
  platforms: Platform[],
): Promise<PlatformsResult> {
  const user = await requireUser();
  if (platforms.length === 0) {
    return { ok: false, error: "Pick at least one platform." };
  }

  const supabase = await createClient();
  const project = await getProject(projectId);
  if (!project) return { ok: false, error: "Project not found." };

  await supabase.from("project_platforms").delete().eq("project_id", projectId);
  const { error } = await supabase.from("project_platforms").insert(
    platforms.map((platform) => ({ project_id: projectId, platform })),
  );
  if (error) return { ok: false, error: "Could not save platform selection." };

  await supabase.from("projects").update({ status: "plan_ready" }).eq("id", projectId);

  // Seed a plan row per platform with status=pending; generation runs in the
  // background so the UI can show a "generating…" state (4.7).
  for (const platform of platforms) {
    await supabase.from("marketing_plans").upsert({
      project_id: projectId,
      platform,
      status: "pending",
      error: null,
    });
  }

  // Generation runs after this action's response completes (after() keeps
  // the serverless function alive for it on Vercel).
  after(async () => {
    const { kickOffPlanGeneration } = await import("@/lib/ai/generate-plans");
    try {
      await kickOffPlanGeneration(projectId, user.id);
    } catch (err) {
      console.error("[plans] generation kickoff failed:", err);
    }
  });

  return { ok: true, redirect: `/projects/${projectId}` };
}
