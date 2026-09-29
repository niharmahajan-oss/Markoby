import type { Platform } from "@/lib/ai/types";
import type { DraftStatus, OutcomeMetric } from "@/lib/types";

export type CalendarDraft = {
  id: string;
  content: string;
  status: DraftStatus;
  editedAt: string | null;
  /** Changes only when the model writes a fresh draft — used as an editor key. */
  generatedAt: string;
};

export type CalendarFeedback = {
  id: string;
  outcomeText: string;
  metric: OutcomeMetric | null;
  submittedAt: string;
};

/** One scheduled item plus everything the founder can do with it. */
export type CalendarItem = {
  id: string;
  platform: Platform;
  week: number;
  day: string | null;
  type: string | null;
  title: string;
  details: string | null;
  effortMinutes: number | null;
  scheduledDate: string | null;
  postedAt: string | null;
  draft: CalendarDraft | null;
  feedback: CalendarFeedback | null;
};
