import "server-only";

import Groq from "groq-sdk";

import { GROQ_MODELS } from "./models";
import { PROMPT_VERSIONS } from "./prompts";
import type {
  DraftSourceItem,
  GeneratedWeek,
  GenerationContext,
  OnboardingSummaryData,
  PlanJSON,
  PlanWeekItem,
  ProspectCandidate,
} from "./types";

/**
 * Central, server-only Groq client. Every AI call in the app funnels through
 * here so we can log usage (model, prompt version, tokens) to usage_events
 * in one place. The API key never reaches the client.
 */

/** Thrown when AI isn't configured (missing GROQ_API_KEY). Callers show a setup hint instead of a generic failure. */
export class AiConfigError extends Error {
  constructor(message = "AI is not configured on this deployment: GROQ_API_KEY is missing") {
    super(message);
    this.name = "AiConfigError";
  }
}

function getGroq(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new AiConfigError();
  return new Groq({ apiKey });
}

const MODEL_BY_TASK: Record<string, string> = {
  interviewer: GROQ_MODELS.primary,
  extractor: GROQ_MODELS.primary,
  plan: GROQ_MODELS.primary,
  scoring: GROQ_MODELS.fast,
  // Drafts are generated one at a time, on demand — the founder's Groq spend
  // goes where they asked for it, so quality wins over the cheaper model.
  draft: GROQ_MODELS.primary,
  week_plan: GROQ_MODELS.primary,
};

/** Maps a Groq task to the prompt version that produced it. */
function promptVersionFor(task: string): string {
  switch (task) {
    case "interviewer":
      return PROMPT_VERSIONS.interviewer;
    case "extractor":
      return PROMPT_VERSIONS.extractor;
    case "plan":
      return PROMPT_VERSIONS.plan;
    case "scoring":
      return PROMPT_VERSIONS.scoring;
    case "draft":
      return PROMPT_VERSIONS.draft;
    case "week_plan":
      return PROMPT_VERSIONS.week_plan;
    default:
      return "unknown";
  }
}

type UsageRow = {
  user_id: string | null;
  event_type: string;
  ok: boolean;
  metadata: Record<string, unknown>;
};

/** Fire-and-forget usage logging into usage_events; never throws into the AI call path. */
async function logUsage(row: UsageRow) {
  try {
    const { createAdminClient } = await import("@/lib/supabase/server");
    const supabase = await createAdminClient();
    const { error } = await supabase.from("usage_events").insert({
      user_id: row.user_id,
      event_type: row.event_type,
      metadata: { ...row.metadata, ok: row.ok },
    });
    if (error) throw new Error(error.message);
  } catch (err) {
    console.error("[groq] usage logging failed:", err);
  }
}

export type ChatArgs = {
  task: string;
  system: string;
  user: string;
  /** User id for usage attribution (auth.uid) — never a project id. */
  userId: string | null;
  temperature?: number;
  maxTokens?: number;
  /**
   * gpt-oss models emit hidden reasoning before visible content, which counts
   * against max_tokens. "low" keeps chat snappy and stops reasoning from
   * starving small JSON budgets (e.g. prospect scoring at 200 tokens).
   */
  reasoningEffort?: "low" | "medium" | "high";
  /** Extra message history (e.g. interview transcript turns). */
  history?: { role: "user" | "assistant"; content: string }[];
};

/** Whether a failed call is worth retrying (provider/infra problems) vs. permanent (config, bad request). */
export function isRetryable(err: unknown): boolean {
  if (err instanceof AiConfigError) return false;
  const status = (err as { status?: number } | null)?.status;
  if (typeof status === "number") return status >= 500 || status === 429;
  return true; // network errors, timeouts
}

export async function groqChat(args: ChatArgs): Promise<string> {
  const model = MODEL_BY_TASK[args.task] ?? GROQ_MODELS.primary;
  const groq = getGroq(); // throws AiConfigError when unconfigured

  let completion;
  try {
    completion = await groq.chat.completions.create({
      model,
      temperature: args.temperature ?? 0.7,
      max_tokens: args.maxTokens,
      reasoning_effort: args.reasoningEffort ?? "low",
      messages: [
        { role: "system", content: args.system },
        ...(args.history ?? []),
        { role: "user", content: args.user },
      ],
    });
  } catch (err) {
    console.error(`[groq] ${args.task} call failed:`, err);
    await logUsage({
      user_id: args.userId,
      event_type: `groq.${args.task}`,
      ok: false,
      metadata: {
        model,
        prompt_version: promptVersionFor(args.task),
        error: err instanceof Error ? err.message : String(err),
      },
    });
    throw err;
  }

  await logUsage({
    user_id: args.userId,
    event_type: `groq.${args.task}`,
    ok: true,
    metadata: {
      model,
      prompt_version: promptVersionFor(args.task),
      prompt_tokens: completion.usage?.prompt_tokens ?? null,
      completion_tokens: completion.usage?.completion_tokens ?? null,
      total_tokens: completion.usage?.total_tokens ?? null,
    },
  });

  return completion.choices[0]?.message?.content ?? "";
}

type StreamUsage = {
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
};

export async function groqChatStream(args: ChatArgs): Promise<AsyncIterable<string>> {
  const model = MODEL_BY_TASK[args.task] ?? GROQ_MODELS.primary;
  const groq = getGroq(); // throws AiConfigError when unconfigured

  const stream = await groq.chat.completions.create({
    model,
    stream: true,
    temperature: args.temperature ?? 0.7,
    max_tokens: args.maxTokens,
    reasoning_effort: args.reasoningEffort ?? "low",
    messages: [
      { role: "system", content: args.system },
      ...(args.history ?? []),
      { role: "user", content: args.user },
    ],
  });

  // Token counts arrive on the final chunk via x_groq.usage.
  const usage: StreamUsage = {
    prompt_tokens: null,
    completion_tokens: null,
    total_tokens: null,
  };

  async function* iterate() {
    try {
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;
        if (delta?.content) yield delta.content;
        const streamUsage = (chunk as { x_groq?: { usage?: Partial<StreamUsage> } }).x_groq
          ?.usage;
        if (streamUsage) {
          usage.prompt_tokens = streamUsage.prompt_tokens ?? usage.prompt_tokens;
          usage.completion_tokens =
            streamUsage.completion_tokens ?? usage.completion_tokens;
          usage.total_tokens = streamUsage.total_tokens ?? usage.total_tokens;
        }
      }
    } catch (err) {
      console.error(`[groq] ${args.task} stream failed:`, err);
      await logUsage({
        user_id: args.userId,
        event_type: `groq.${args.task}`,
        ok: false,
        metadata: {
          model,
          prompt_version: promptVersionFor(args.task),
          error: err instanceof Error ? err.message : String(err),
        },
      });
      throw err;
    }
    await logUsage({
      user_id: args.userId,
      event_type: `groq.${args.task}`,
      ok: true,
      metadata: {
        model,
        prompt_version: promptVersionFor(args.task),
        ...usage,
      },
    });
  }

  return iterate();
}

/** Extract JSON from a model reply that may be wrapped in fences/prose. */
export function parseJsonFromModel<T>(raw: string): T | null {
  const trimmed = raw.trim();
  const candidates: string[] = [];
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch) candidates.push(fenceMatch[1]);
  candidates.push(trimmed);
  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    candidates.push(trimmed.slice(firstBrace, lastBrace + 1));
  }
  for (const c of candidates) {
    try {
      return JSON.parse(c) as T;
    } catch {
      // try next candidate
    }
  }
  return null;
}

// Convenience wrappers -------------------------------------------------------

export async function extractOnboardingSummary(
  transcript: string,
  userId: string | null,
): Promise<OnboardingSummaryData | null> {
  const { EXTRACTOR_SYSTEM_PROMPT, extractorUserPrompt } = await import("./prompts");
  const raw = await groqChat({
    task: "extractor",
    system: EXTRACTOR_SYSTEM_PROMPT,
    user: extractorUserPrompt(transcript),
    userId,
    temperature: 0,
  });
  return parseJsonFromModel<OnboardingSummaryData>(raw);
}

export async function generatePlan(
  platform: string,
  summary: OnboardingSummaryData,
  userId: string | null,
  context: GenerationContext = {},
): Promise<{ planJson: unknown; modelUsed: string; promptVersion: string } | null> {
  const {
    COMPETITOR_DIFFERENTIATION_INSTRUCTION,
    FEEDBACK_ADAPTATION_INSTRUCTION,
    PLATFORM_PLAN_PROMPTS,
    planUserPrompt,
  } = await import("./prompts");
  const base = PLATFORM_PLAN_PROMPTS[platform];
  if (!base) throw new Error(`No plan prompt for platform: ${platform}`);
  const system = [
    base,
    context.competitorNotes ? COMPETITOR_DIFFERENTIATION_INSTRUCTION : "",
    context.feedbackSummary ? FEEDBACK_ADAPTATION_INSTRUCTION : "",
  ]
    .filter(Boolean)
    .join("");
  const model = MODEL_BY_TASK["plan"];
  const raw = await groqChat({
    task: "plan",
    system,
    user: planUserPrompt(summary, context),
    userId,
    temperature: 0.8,
    maxTokens: 8192,
  });
  const planJson = parseJsonFromModel(raw);
  if (!planJson) return null;
  return { planJson, modelUsed: model, promptVersion: PROMPT_VERSIONS.plan };
}

/**
 * One-shot draft for a single calendar item. Never called in bulk: the UI only
 * invokes it when the founder clicks "Generate draft" on a specific item.
 */
export async function generateDraft(args: {
  item: DraftSourceItem;
  summary: OnboardingSummaryData;
  userId: string | null;
  context?: GenerationContext;
}): Promise<{ content: string; modelUsed: string; promptVersion: string } | null> {
  const { DRAFT_SYSTEM_PROMPTS, draftUserPrompt } = await import("./prompts");
  const system = DRAFT_SYSTEM_PROMPTS[args.item.platform];
  if (!system) throw new Error(`No draft prompt for platform: ${args.item.platform}`);
  const model = MODEL_BY_TASK["draft"];
  const raw = await groqChat({
    task: "draft",
    system,
    user: draftUserPrompt({
      item: args.item,
      summary: args.summary,
      context: args.context,
    }),
    userId: args.userId,
    temperature: 0.75,
    maxTokens: 1600,
  });
  const content = raw.replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/, "").trim();
  if (!content) return null;
  return { content, modelUsed: model, promptVersion: PROMPT_VERSIONS.draft };
}

/**
 * Extends a plan by one week, used when a founder answers a weekly check-in.
 * Receives the existing plan plus the feedback context so week N+1 reflects
 * what actually happened in weeks 1..N.
 */
export async function generateWeekItems(args: {
  platform: string;
  summary: OnboardingSummaryData;
  weekNumber: number;
  existingPlan: PlanJSON | null;
  previousTitles: string[];
  userId: string | null;
  context?: GenerationContext;
}): Promise<{ items: PlanWeekItem[]; modelUsed: string; promptVersion: string } | null> {
  const { weekExtensionSystemPrompt, weekExtensionUserPrompt } = await import("./prompts");
  const model = MODEL_BY_TASK["week_plan"];
  const raw = await groqChat({
    task: "week_plan",
    system: weekExtensionSystemPrompt(args.platform),
    user: weekExtensionUserPrompt({
      platform: args.platform,
      summary: args.summary,
      weekNumber: args.weekNumber,
      strategySummary: args.existingPlan?.strategy_summary ?? "",
      pillars: (args.existingPlan?.content_pillars ?? []).map((p) => p.name),
      postingCadence: args.existingPlan?.posting_cadence ?? "",
      previousTitles: args.previousTitles,
      context: args.context,
    }),
    userId: args.userId,
    temperature: 0.8,
    maxTokens: 2000,
  });
  const parsed = parseJsonFromModel<GeneratedWeek>(raw);
  const items = Array.isArray(parsed?.items) ? parsed.items : [];
  const cleaned = items
    .filter((item) => item && typeof item.title_or_hook === "string" && item.title_or_hook.trim())
    .map((item) => ({
      day: String(item.day ?? ""),
      type: String(item.type ?? "post"),
      title_or_hook: item.title_or_hook.trim(),
      details: String(item.details ?? ""),
      effort_minutes: Number.isFinite(Number(item.effort_minutes))
        ? Math.max(0, Math.round(Number(item.effort_minutes)))
        : 30,
    }));
  if (cleaned.length === 0) return null;
  return { items: cleaned, modelUsed: model, promptVersion: PROMPT_VERSIONS.week_plan };
}

export async function scoreProspect(
  candidate: ProspectCandidate,
  summary: OnboardingSummaryData,
  userId: string | null,
): Promise<{ relevance_score: number; relevance_reason: string } | null> {
  const { scoringUserPrompt } = await import("./prompts");
  const raw = await groqChat({
    task: "scoring",
    system:
      "You are a precise B2B relevance-scoring engine. Output only valid JSON. Scores under 40 mean 'not worth the founder's time'.",
    user: scoringUserPrompt(candidate, summary),
    userId,
    temperature: 0,
    maxTokens: 200,
  });
  return parseJsonFromModel(raw);
}
