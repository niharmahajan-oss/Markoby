"use client";

import {
  Check,
  CheckCheck,
  Loader2,
  RefreshCw,
  Send,
  Sparkles,
  Wand2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import {
  generateDraftForItem,
  markItemPosted,
  saveDraftContent,
  setDraftStatus,
  submitPostFeedback,
} from "@/app/projects/content-actions";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { CalendarDraft, CalendarFeedback, CalendarItem } from "./types";

/**
 * The collapsible "Draft" section on a calendar item.
 *
 * Cost control is a design constraint here: nothing is generated until the
 * founder clicks Generate, and regenerating is an explicit second click.
 *
 * The editor is a `key`-ed child rather than a `useEffect` seed: a new draft
 * remounts it with fresh content, while typing in the current one never gets
 * clobbered by a server refresh.
 */
export function DraftPanel({
  item,
  onDraft,
  onPostedAt,
  onFeedback,
}: {
  item: CalendarItem;
  onDraft: (draft: CalendarDraft | null) => void;
  onPostedAt: (postedAt: string | null) => void;
  onFeedback: (feedback: CalendarFeedback) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<null | "generate" | "post">(null);
  const draft = item.draft;
  const posted = Boolean(item.postedAt);

  async function generate() {
    setBusy("generate");
    const result = await generateDraftForItem(item.id);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onDraft({
      id: result.draft.id,
      content: result.draft.draft_content,
      status: result.draft.status,
      editedAt: result.draft.edited_at,
      generatedAt: result.draft.generated_at,
    });
    router.refresh();
    toast.success(
      draft ? "Draft regenerated." : "Draft ready — edit it until it sounds like you.",
    );
  }

  async function togglePosted() {
    setBusy("post");
    const next = !posted;
    const result = await markItemPosted(item.id, next);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onPostedAt(result.item.posted_at);
    if (draft) onDraft({ ...draft, status: next ? "posted" : "draft" });
    router.refresh();
    toast.success(next ? "Nice — marked as posted." : "Unmarked.");
  }

  return (
    <div className="border-border/70 bg-background/40 mt-4 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
          Draft
        </p>
        <div className="flex flex-wrap items-center gap-2">
          {draft && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void generate()}
              disabled={busy !== null}
              title="Write a fresh version (one more AI call)"
            >
              {busy === "generate" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Regenerate
            </Button>
          )}
          <Button
            variant={posted ? "outline" : "default"}
            size="sm"
            onClick={() => void togglePosted()}
            disabled={busy !== null}
          >
            {busy === "post" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <CheckCheck className="h-4 w-4" />
            )}
            {posted ? "Posted" : "Mark posted"}
          </Button>
        </div>
      </div>

      {draft ? (
        <DraftEditor
          key={`${draft.id}:${draft.generatedAt}`}
          item={item}
          draft={draft}
          onDraft={onDraft}
        />
      ) : (
        <div className="mt-3">
          <p className="text-muted-foreground text-sm leading-relaxed">
            Write this one from scratch, or have Markoby draft it in your voice for this
            exact platform and item.
          </p>
          <Button
            className="mt-3"
            size="sm"
            onClick={() => void generate()}
            disabled={busy !== null}
          >
            {busy === "generate" ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Writing your draft…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate draft
              </>
            )}
          </Button>
          <p className="text-muted-foreground mt-2 text-xs">
            Drafts are generated on demand only — one click, one call.
          </p>
        </div>
      )}

      {posted ? (
        <FeedbackForm
          key={item.feedback?.submittedAt ?? "new"}
          item={item}
          onFeedback={onFeedback}
        />
      ) : (
        draft && (
          <p className="text-muted-foreground mt-3 text-xs leading-relaxed">
            Once this goes out, hit <span className="text-foreground">Mark posted</span> and
            tell Markoby how it did — that&apos;s what shapes your next plan.
          </p>
        )
      )}
    </div>
  );
}

function DraftEditor({
  item,
  draft,
  onDraft,
}: {
  item: CalendarItem;
  draft: CalendarDraft;
  onDraft: (draft: CalendarDraft) => void;
}) {
  const router = useRouter();
  const [content, setContent] = useState(draft.content);
  const [busy, setBusy] = useState<null | "save" | "approve">(null);
  const dirty = content.trim() !== draft.content.trim();

  async function save() {
    setBusy("save");
    const result = await saveDraftContent(draft.id, content);
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onDraft({
      id: result.draft.id,
      content: result.draft.draft_content,
      status: result.draft.status,
      editedAt: result.draft.edited_at,
      generatedAt: result.draft.generated_at,
    });
    router.refresh();
    toast.success("Saved.");
  }

  async function approve() {
    setBusy("approve");
    const result = await setDraftStatus(draft.id, "approved");
    setBusy(null);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    onDraft({
      id: result.draft.id,
      content: result.draft.draft_content,
      status: result.draft.status,
      editedAt: result.draft.edited_at,
      generatedAt: result.draft.generated_at,
    });
    router.refresh();
    toast.success("Approved — copy it across when you're ready to post.");
  }

  return (
    <div className="mt-3">
      <Textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        rows={14}
        className="min-h-48 font-mono text-[13px] leading-relaxed"
        aria-label={`Draft for ${item.title}`}
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={!dirty || busy !== null}>
          {busy === "save" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Check className="h-4 w-4" />
          )}
          {dirty ? "Save changes" : "Saved"}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void approve()}
          disabled={busy !== null || draft.status !== "draft"}
        >
          {busy === "approve" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {draft.status === "draft" ? "Approve" : "Approved"}
        </Button>
        {dirty && <span className="text-muted-foreground text-xs">Unsaved edits</span>}
      </div>
    </div>
  );
}

function FeedbackForm({
  item,
  onFeedback,
}: {
  item: CalendarItem;
  onFeedback: (feedback: CalendarFeedback) => void;
}) {
  const router = useRouter();
  const [text, setText] = useState(item.feedback?.outcomeText ?? "");
  const [likes, setLikes] = useState(numberToInput(item.feedback?.metric?.likes));
  const [comments, setComments] = useState(numberToInput(item.feedback?.metric?.comments));
  const [signups, setSignups] = useState(numberToInput(item.feedback?.metric?.signups));
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    const metric = {
      likes: toNumber(likes),
      comments: toNumber(comments),
      signups: toNumber(signups),
    };
    const result = await submitPostFeedback({
      planItemId: item.id,
      outcomeText: text,
      metric,
    });
    setBusy(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not save that.");
      return;
    }
    onFeedback({
      id: item.feedback?.id ?? `local-${item.id}`,
      outcomeText: text.trim(),
      metric,
      submittedAt: new Date().toISOString(),
    });
    router.refresh();
    toast.success("Logged — your next plan will adapt to it.");
  }

  return (
    <div className="border-primary/25 bg-primary/5 mt-4 rounded-xl border p-4">
      <p className="flex items-center gap-1.5 text-sm font-medium">
        <Send className="text-primary h-3.5 w-3.5" />
        How did this go?
      </p>
      <p className="text-muted-foreground mt-1 text-xs leading-relaxed">
        A sentence is plenty. Markoby uses it to change what you do next — what got
        traction, what flopped, what got removed.
      </p>
      <Textarea
        value={text}
        onChange={(event) => setText(event.target.value)}
        rows={3}
        placeholder="e.g. 40 upvotes and a good discussion, nothing like the last one that got removed."
        className="mt-3"
        aria-label="What happened with this post"
      />
      <div className="mt-3 grid grid-cols-3 gap-2">
        <MetricInput label="Upvotes / likes" value={likes} onChange={setLikes} />
        <MetricInput label="Comments" value={comments} onChange={setComments} />
        <MetricInput label="Signups" value={signups} onChange={setSignups} />
      </div>
      <Button className="mt-3" size="sm" onClick={() => void submit()} disabled={busy}>
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
        {item.feedback ? "Update report" : "Save report"}
      </Button>
    </div>
  );
}

function MetricInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-muted-foreground text-[11px]">{label}</span>
      <input
        type="number"
        min={0}
        inputMode="numeric"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="—"
        className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 mt-1 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-2"
      />
    </label>
  );
}

function numberToInput(value: number | undefined): string {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "";
}

function toNumber(value: string): number | undefined {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.round(parsed) : undefined;
}
