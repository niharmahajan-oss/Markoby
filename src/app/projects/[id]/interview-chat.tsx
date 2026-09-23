"use client";

import { ArrowRight, Loader2, Send, Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { finishInterview } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";

type ChatMessage = { role: "assistant" | "user"; content: string };

type StreamEvent = {
  t?: string;
  done?: boolean;
  error?: boolean | string;
  message?: string;
  noop?: boolean;
};

export function InterviewChat({
  projectId,
  projectName,
  initialMessages,
}: {
  projectId: string;
  projectName: string;
  initialMessages: ChatMessage[];
}) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [awaitingFirstChunk, setAwaitingFirstChunk] = useState(false);
  const [interviewDone, setInterviewDone] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);
  const lastInitRef = useRef<RequestInit | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, awaitingFirstChunk, scrollToBottom]);

  /** Consumes the NDJSON stream, appending text into a live assistant bubble. */
  const runStream = useCallback(
    async (init: RequestInit) => {
      lastInitRef.current = init;
      setStreaming(true);
      setAwaitingFirstChunk(true);
      setSetupError(null);

      // Seed an empty assistant bubble to stream into.
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      let done = false;
      let receivedText = false;
      let configError: string | null = null;
      let providerError: string | null = null;

      try {
        const res = await fetch(`/api/projects/${projectId}/interview`, init);
        if (!res.ok || !res.body) {
          // Error responses still speak NDJSON: {error:"config"|"provider",message}.
          let msg = `Stream failed (${res.status})`;
          let isConfig = false;
          try {
            const first = JSON.parse((await res.text()).split("\n")[0]) as StreamEvent;
            if (first.error === "config") isConfig = true;
            msg = first.message ?? msg;
          } catch {
            // keep defaults
          }
          if (isConfig) configError = msg;
          else providerError = msg;
          return;
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        for (;;) {
          const { done: readerDone, value } = await reader.read();
          if (readerDone) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.trim()) continue;
            let evt: StreamEvent;
            try {
              evt = JSON.parse(line) as StreamEvent;
            } catch {
              continue;
            }
            if (evt.error === "config") {
              configError =
                evt.message ??
                "Maya isn't configured on this deployment yet (missing GROQ_API_KEY).";
              break;
            }
            if (evt.error) {
              providerError = evt.message ?? "Maya hit an error — try again.";
              break;
            }
            if (evt.t) {
              receivedText = true;
              setAwaitingFirstChunk(false);
              setMessages((prev) => {
                const next = [...prev];
                const last = next[next.length - 1];
                if (last?.role === "assistant") {
                  next[next.length - 1] = { ...last, content: last.content + evt.t };
                }
                return next;
              });
            }
            if (typeof evt.done === "boolean") done = evt.done;
          }
        }
      } catch (err) {
        console.error(err);
        providerError = "Connection hiccup — try sending that again.";
      } finally {
        // Drop an empty bubble if the model returned nothing usable.
        if (!receivedText) {
          setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last?.role === "assistant" && last.content === "") {
              return prev.slice(0, -1);
            }
            return prev;
          });
        }
        if (configError) {
          setSetupError(configError);
        } else if (providerError) {
          // Put the founder's words back in the composer so a resend is one
          // keystroke away (the server de-dupes the saved copy on retry).
          if (init.method === "POST") {
            const sent = JSON.parse(String(init.body ?? "{}")) as { content?: string };
            if (sent.content) setInput(sent.content);
            setMessages((prev) => {
              const last = prev[prev.length - 1];
              return last?.role === "user" && last.content === sent.content
                ? prev.slice(0, -1)
                : prev;
            });
          }
          toast.error(providerError);
        }
        if (done) {
          setInterviewDone(true);
        }
        setAwaitingFirstChunk(false);
        setStreaming(false);
      }
    },
    [projectId],
  );

  // Auto-open the interview: fetch the AI's first message on mount.
  // NOTE: no cleanup that clears the timer — under Strict Mode the component
  // double-mounts, and the startedRef guard already prevents a double fire.
  // Clearing the timer in cleanup cancelled the only fire, so Maya never spoke.
  useEffect(() => {
    if (initialMessages.length > 0 || startedRef.current) return;
    startedRef.current = true;
    setTimeout(() => void runStream({ method: "GET" }), 0);
  }, [initialMessages.length, runStream]);

  async function send() {
    const content = input.trim();
    if (!content || streaming) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content }]);
    await runStream({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
  }

  async function wrapUp() {
    if (finishing) return;
    setFinishing(true);
    const result = await finishInterview(projectId);
    if (!result.ok) {
      toast.error(result.error);
      setFinishing(false);
      return;
    }
    router.push(result.next);
  }

  const turnCount = messages.length;

  return (
    <div className="mx-auto flex h-[calc(100svh-4rem)] w-full max-w-3xl flex-col px-4 sm:px-6">
      {/* Header */}
      <div className="border-border/60 flex items-center justify-between border-b py-4">
        <div>
          <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
            Discovery interview
          </p>
          <h1 className="font-semibold tracking-tight">{projectName}</h1>
        </div>
        <div className="flex items-center gap-2">
          <span className="border-border bg-secondary inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs">
            <Sparkles className="text-primary h-3.5 w-3.5" />
            Maya · growth marketer
          </span>
        </div>
      </div>

      {/* Setup / provider error banner */}
      {setupError && (
        <div className="border-destructive/40 bg-destructive/10 text-destructive mx-auto mt-4 flex w-full max-w-3xl flex-col gap-2 rounded-xl border px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p className="text-sm">{setupError}</p>
          <Button
            variant="outline"
            size="sm"
            disabled={streaming}
            onClick={() => {
              const init = lastInitRef.current;
              if (init) void runStream(init);
            }}
          >
            Retry
          </Button>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 space-y-5 overflow-y-auto py-6">
        {messages.map((message, i) => (
          <div
            key={i}
            className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
          >
            {message.role === "assistant" && (
              <div className="bg-primary text-primary-foreground mr-3 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold">
                M
              </div>
            )}
            <div
              className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                message.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-md"
                  : "border-border bg-card rounded-bl-md border"
              } ${message.content === "" ? "py-4" : ""}`}
            >
              {message.content === "" ? (
                <TypingIndicator />
              ) : (
                <p className="whitespace-pre-wrap">{message.content}</p>
              )}
            </div>
          </div>
        ))}
        {awaitingFirstChunk && messages[messages.length - 1]?.role !== "assistant" && (
          <div className="flex justify-start">
            <div className="bg-primary text-primary-foreground mr-3 flex h-8 w-8 items-center justify-center rounded-lg text-xs font-bold">
              M
            </div>
            <div className="border-border bg-card rounded-bl-md rounded-2xl border px-4 py-4">
              <TypingIndicator />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer / wrap-up */}
      <div className="border-border/60 border-t py-4">
        {interviewDone ? (
          <div className="border-primary/30 bg-primary/5 flex flex-col items-center gap-3 rounded-2xl border p-5 text-center">
            <p className="text-sm font-medium">Interview wrapped.</p>
            <p className="text-muted-foreground text-sm">
              Maya has everything she needs. Time to pick platforms and build
              your plans.
            </p>
            <Button onClick={wrapUp} disabled={finishing} className="mt-1">
              {finishing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Distilling your answers…
                </>
              ) : (
                <>
                  Build my marketing plans
                  <ArrowRight className="ml-2 h-4 w-4" />
                </>
              )}
            </Button>
          </div>
        ) : (
          <>
            <div className="border-border bg-card focus-within:border-primary/50 flex items-end gap-2 rounded-2xl border p-2 transition-colors">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Answer in your own words…"
                disabled={streaming}
                className="placeholder:text-muted-foreground max-h-40 min-h-11 flex-1 resize-none bg-transparent px-3 py-2.5 text-[15px] outline-none"
              />
              <Button
                size="icon"
                onClick={() => void send()}
                disabled={streaming || !input.trim()}
                className="mb-0.5 h-11 w-11 rounded-xl"
                aria-label="Send"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
            <div className="mt-2 flex items-center justify-between px-1">
              <p className="text-muted-foreground text-xs">
                {streaming ? "Maya is typing…" : "Enter to send · Shift+Enter for a new line"}
              </p>
              {turnCount >= 4 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={wrapUp}
                  disabled={finishing || streaming}
                  className="text-muted-foreground h-7 text-xs"
                >
                  {finishing ? "Wrapping up…" : "Wrap up early"}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <span className="flex items-center gap-1.5" aria-label="Maya is typing">
      <span className="bg-muted-foreground/70 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:0ms]" />
      <span className="bg-muted-foreground/70 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:150ms]" />
      <span className="bg-muted-foreground/70 h-1.5 w-1.5 animate-bounce rounded-full [animation-delay:300ms]" />
    </span>
  );
}
