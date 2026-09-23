import { after } from "next/server";

import { INTERVIEWER_SYSTEM_PROMPT } from "@/lib/ai/prompts";
import { AiConfigError, groqChatStream } from "@/lib/ai/groq";
import { getUserWithSubscription, hasActiveSubscription } from "@/lib/auth";
import { getProject, getProjectMessages } from "@/lib/projects";
import { createClient } from "@/lib/supabase/server";

export const maxDuration = 60;

const DONE_SENTINEL = "<<DONE>>";

/**
 * Interview route.
 *
 * GET  → generates + persists the interviewer's opener for a fresh interview.
 * POST → saves the founder's message, streams the interviewer's reply.
 *
 * Wire format: newline-delimited JSON — {"t":"chunk"} per text chunk, then
 * {"done":true|false}. done=true means the founder asked to wrap up
 * (model emitted the <<DONE>> sentinel, which is filtered from the stream).
 *
 * Failure contract: the response always speaks NDJSON (even errors) so the
 * client's stream parser can render a specific message instead of guessing.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const auth = await authorize(projectId);
  if (!auth) return unauthorized();
  const { user, project, supabase, messages } = auth;

  if (messages.length > 0) {
    // Already started — nothing to generate.
    return new Response(JSON.stringify({ noop: true }) + "\n", {
      headers: ndjsonHeaders(),
    });
  }

  const websiteContext = project.website_context ?? "";
  try {
    const groqStream = await groqChatStream({
      task: "interviewer",
      system: INTERVIEWER_SYSTEM_PROMPT + (websiteContext ? `\n\n${websiteContext}` : ""),
      history: [],
      user: websiteContext
        ? "The founder just opened the interview. Their website context is attached above — greet them in one line and ask your first sharp question about something the site does NOT answer."
        : "The founder just opened the interview. Greet them in one line and ask your first question.",
      userId: user.id,
      temperature: 0.7,
      maxTokens: 200,
    });

    return ndjsonResponse(groqStream, async (full) => {
      const cleaned = full.replaceAll(DONE_SENTINEL, "").trim();
      if (cleaned) {
        await supabase.from("onboarding_messages").insert({
          project_id: projectId,
          role: "assistant",
          content: cleaned,
        });
      }
    });
  } catch (err) {
    return errorNdjson(err);
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;

  const auth = await authorize(projectId);
  if (!auth) return unauthorized();
  const { user, project, supabase, messages } = auth;

  let content = "";
  try {
    const body = (await request.json()) as { content?: string };
    content = (body.content ?? "").trim();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (!content) return new Response("Empty message", { status: 400 });

  const history = messages.map((m) => ({ role: m.role, content: m.content }));
  const websiteContext = project.website_context ?? "";

  // Create the AI stream BEFORE persisting the user's turn: a config failure
  // (503 below) then leaves no ghost message in the transcript.
  let groqStream;
  try {
    groqStream = await groqChatStream({
      task: "interviewer",
      system: INTERVIEWER_SYSTEM_PROMPT + (websiteContext ? `\n\n${websiteContext}` : ""),
      history,
      user: content,
      userId: user.id,
      temperature: 0.7,
      maxTokens: 400,
    });
  } catch (err) {
    return errorNdjson(err);
  }

  // The client retries after transient provider errors by resending the same
  // text; skip persisting an identical user turn made seconds ago.
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const isDuplicateResend =
    lastUser?.content === content &&
    Date.now() - new Date(lastUser.created_at).getTime() < 15_000;
  if (!isDuplicateResend) {
    const { error: insertError } = await supabase.from("onboarding_messages").insert({
      project_id: projectId,
      role: "user",
      content,
    });
    if (insertError) return new Response("Could not save message", { status: 500 });
  }

  return ndjsonResponse(groqStream, async (full) => {
    const cleaned = full.replaceAll(DONE_SENTINEL, "").trim();
    if (cleaned) {
      await supabase.from("onboarding_messages").insert({
        project_id: projectId,
        role: "assistant",
        content: cleaned,
      });
    }
  });
}

// ── helpers ─────────────────────────────────────────────────────────────────

function ndjsonHeaders(): HeadersInit {
  return {
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "Cache-Control": "no-store",
  };
}

/**
 * Pre-stream failures (config, provider outage) as a single NDJSON error line,
 * so the client UI can show a precise message — and keep the user's typed text.
 */
function errorNdjson(err: unknown): Response {
  if (err instanceof AiConfigError) {
    console.error("[interview] AI not configured:", err.message);
    const body =
      JSON.stringify({ error: "config", message: err.message }) + "\n" +
      JSON.stringify({ done: false, error: true }) + "\n";
    return new Response(body, { status: 503, headers: ndjsonHeaders() });
  }
  console.error("[interview] failed to start stream:", err);
  const body =
    JSON.stringify({ error: "provider", message: "Maya couldn't reach her brain. Try again in a moment." }) + "\n" +
    JSON.stringify({ done: false, error: true }) + "\n";
  return new Response(body, { status: 502, headers: ndjsonHeaders() });
}

async function authorize(projectId: string) {
  const user = await getUserWithSubscription();
  if (!user || !hasActiveSubscription(user)) return null;

  const project = await getProject(projectId);
  if (!project) return null;

  const supabase = await createClient();
  const messages = await getProjectMessages(projectId);

  return { user, project, supabase, messages };
}

function unauthorized() {
  return new Response("Unauthorized", { status: 401 });
}

function ndjsonResponse(
  groqStream: AsyncIterable<string>,
  persist: (full: string) => Promise<void>,
): Response {
  let full = "";
  let done = false;
  const encoder = new TextEncoder();

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const sendLine = (obj: unknown) =>
        controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));
      try {
        // `flushed` marks how much of `full` is safe to emit. We hold back a
        // tail of (sentinel length − 1) chars so a DONE marker split across
        // two chunks can never leak a partial "<<DO" into the chat UI.
        let flushed = 0;
        for await (const chunk of groqStream) {
          full += chunk;
          const idx = full.indexOf(DONE_SENTINEL);
          if (idx !== -1) {
            const clean = full.slice(flushed, idx);
            if (clean) sendLine({ t: clean });
            done = true;
            break;
          }
          const safeEnd = Math.max(flushed, full.length - (DONE_SENTINEL.length - 1));
          if (safeEnd > flushed) {
            sendLine({ t: full.slice(flushed, safeEnd) });
            flushed = safeEnd;
          }
        }
        if (!done) {
          const rest = full.slice(flushed);
          if (rest) sendLine({ t: rest });
        }
        sendLine({ done });
      } catch (err) {
        console.error("[interview] streaming failed:", err);
        sendLine({ t: "Sorry — I hit an error on my side. Send that again?" });
        sendLine({ done: false, error: true });
      } finally {
        controller.close();
      }
    },
  });

  after(async () => {
    try {
      await persist(full);
    } catch (err) {
      console.error("[interview] persist failed:", err);
    }
  });

  return new Response(body, { headers: ndjsonHeaders() });
}
