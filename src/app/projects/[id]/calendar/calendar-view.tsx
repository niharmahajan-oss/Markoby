"use client";

import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleDot,
  Clock,
  GripVertical,
  Loader2,
  Sparkles,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { reschedulePlanItem, syncCalendar } from "@/app/projects/content-actions";
import { PlatformIcon } from "@/components/platform-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import type { Platform } from "@/lib/ai/types";
import {
  addDaysISO,
  addMonthsISO,
  formatISODate,
  formatMonth,
  formatWeekRange,
  isTodayISO,
  monthGrid,
  todayISODate,
  WEEKDAY_LABELS,
  weekDates,
} from "@/lib/calendar";
import { platformLabel } from "@/lib/platform-label";
import { DraftPanel } from "./draft-panel";
import type { CalendarItem } from "./types";

/**
 * Feature 2: the plan as a real schedule.
 *
 * Drag-and-drop is native HTML5 (no drag library): items are `draggable` and
 * every day cell is a drop target. The move is optimistic, then persisted; if
 * the write fails we put the item back and say so.
 */
export function CalendarView({
  projectId,
  items: initialItems,
  platforms,
}: {
  projectId: string;
  items: CalendarItem[];
  platforms: Platform[];
}) {
  /**
   * Local overlays rather than a copy of the server rows: every value written
   * here is either optimistic and then confirmed by the action's own response,
   * or already server truth, so a fresh render can never be masked by a stale
   * override. It also means new rows from a server refresh (e.g. the week a
   * check-in adds) appear immediately, with no props→state effect.
   */
  const [overrides, setOverrides] = useState<Record<string, Partial<CalendarItem>>>({});
  const [view, setView] = useState<"week" | "month">("week");
  const [filter, setFilter] = useState<"all" | Platform>("all");
  const [anchor, setAnchor] = useState(() => todayISODate());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);

  const items = useMemo(
    () =>
      initialItems.map((item) =>
        overrides[item.id] ? { ...item, ...overrides[item.id] } : item,
      ),
    [initialItems, overrides],
  );

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((item) => item.platform === filter)),
    [items, filter],
  );


  const byDate = useMemo(() => {
    const map = new Map<string, CalendarItem[]>();
    for (const item of visible) {
      if (!item.scheduledDate) continue;
      const bucket = map.get(item.scheduledDate) ?? [];
      bucket.push(item);
      map.set(item.scheduledDate, bucket);
    }
    for (const bucket of map.values()) {
      bucket.sort((a, b) => a.title.localeCompare(b.title));
    }
    return map;
  }, [visible]);

  const unscheduled = visible.filter((item) => !item.scheduledDate);
  const selected = items.find((item) => item.id === selectedId) ?? null;

  function patchItem(id: string, patch: Partial<CalendarItem>) {
    setOverrides((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function move(id: string, dateISO: string | null) {
    const before = items.find((item) => item.id === id);
    if (!before || before.scheduledDate === dateISO) return;
    patchItem(id, { scheduledDate: dateISO }); // optimistic
    const result = await reschedulePlanItem(id, dateISO);
    if (!result.ok) {
      patchItem(id, { scheduledDate: before.scheduledDate });
      toast.error(result.error);
      return;
    }
    patchItem(id, { scheduledDate: result.item.scheduled_date });
  }

  function onDrop(event: React.DragEvent, dateISO: string) {
    event.preventDefault();
    setDragOver(null);
    const id = event.dataTransfer.getData("text/plain");
    if (id) void move(id, dateISO);
  }

  async function onSync() {
    setSyncing(true);
    const result = await syncCalendar(projectId);
    setSyncing(false);
    if (!result.ok) {
      toast.error(result.error ?? "Could not build the calendar.");
      return;
    }
    toast.success("Calendar built from your plans.");
  }

  function shift(direction: -1 | 1) {
    setAnchor((current) =>
      view === "week"
        ? addDaysISO(current, direction * 7)
        : addMonthsISO(current, direction),
    );
  }

  const filteredPlatforms = platforms.filter((platform) =>
    items.some((item) => item.platform === platform),
  );

  return (
    <div>
      {/* Controls */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="border-border bg-secondary/60 flex items-center gap-1 rounded-full border p-1">
            {(["week", "month"] as const).map((option) => (
              <button
                key={option}
                type="button"
                onClick={() => setView(option)}
                aria-pressed={view === option}
                className={`rounded-full px-3 py-1.5 text-sm font-medium capitalize transition-colors ${
                  view === option
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1">
            <Button variant="outline" size="icon-sm" onClick={() => shift(-1)} aria-label="Previous">
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setAnchor(todayISODate())}>
              Today
            </Button>
            <Button variant="outline" size="icon-sm" onClick={() => shift(1)} aria-label="Next">
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-sm font-medium">
            {view === "week" ? formatWeekRange(anchor) : formatMonth(anchor)}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <FilterChip active={filter === "all"} onClick={() => setFilter("all")}>
            All platforms
          </FilterChip>
          {filteredPlatforms.map((platform) => (
            <FilterChip
              key={platform}
              active={filter === platform}
              onClick={() => setFilter(platform)}
            >
              <PlatformIcon platform={platform} className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{platformLabel(platform)}</span>
            </FilterChip>
          ))}
        </div>
      </div>

      {items.length === 0 ? (
        <Card className="border-border/70 mt-6 border-dashed">
          <CardContent className="flex flex-col items-center py-12 text-center">
            <CalendarDays className="text-muted-foreground h-6 w-6" />
            <p className="mt-3 font-medium">No calendar yet</p>
            <p className="text-muted-foreground mt-1 max-w-sm text-sm">
              Your plans are ready but haven&apos;t been turned into a schedule. Build it
              once and every item gets a suggested date you can drag around.
            </p>
            <Button className="mt-5" onClick={() => void onSync()} disabled={syncing}>
              {syncing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              Build calendar from my plans
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {view === "week" ? (
            <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-7">
              {weekDates(anchor).map((date, index) => (
                <DayCell
                  key={date}
                  date={date}
                  weekday={WEEKDAY_LABELS[index]}
                  items={byDate.get(date) ?? []}
                  isDragOver={dragOver === date}
                  selectedId={selectedId}
                  onSelect={setSelectedId}
                  onDragOver={() => setDragOver(date)}
                  onDragLeave={() => setDragOver((current) => (current === date ? null : current))}
                  onDrop={onDrop}
                />
              ))}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-xl border border-border/70">
              <div className="bg-secondary/40 grid grid-cols-7 border-b border-border/70">
                {WEEKDAY_LABELS.map((label) => (
                  <span
                    key={label}
                    className="text-muted-foreground px-2 py-2 text-center text-xs font-medium"
                  >
                    {label}
                  </span>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {monthGrid(anchor)
                  .flat()
                  .map((date) => {
                    const dayItems = byDate.get(date) ?? [];
                    const inMonth =
                      formatMonth(date) === formatMonth(anchor);
                    return (
                      <div
                        key={date}
                        onDragOver={(event) => {
                          event.preventDefault();
                          setDragOver(date);
                        }}
                        onDragLeave={() =>
                          setDragOver((current) => (current === date ? null : current))
                        }
                        onDrop={(event) => onDrop(event, date)}
                        className={`min-h-24 border-b border-r border-border/60 p-1.5 align-top transition-colors ${
                          dragOver === date ? "bg-primary/10" : ""
                        } ${inMonth ? "" : "bg-secondary/20"}`}
                      >
                        <span
                          className={`text-xs ${
                            isTodayISO(date)
                              ? "bg-primary text-primary-foreground inline-flex h-5 w-5 items-center justify-center rounded-full"
                              : "text-muted-foreground"
                          }`}
                        >
                          {Number(date.slice(8, 10))}
                        </span>
                        <div className="mt-1 space-y-1">
                          {dayItems.slice(0, 3).map((item) => (
                            <MiniChip
                              key={item.id}
                              item={item}
                              selected={item.id === selectedId}
                              onSelect={setSelectedId}
                            />
                          ))}
                          {dayItems.length > 3 && (
                            <span className="text-muted-foreground block text-[11px]">
                              +{dayItems.length - 3} more
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {unscheduled.length > 0 && (
            <div className="mt-4">
              <p className="text-muted-foreground text-xs font-medium tracking-widest uppercase">
                Unscheduled ({unscheduled.length}) — drag onto a day
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {unscheduled
                  .filter((item) => item.id !== selectedId)
                  .map((item) => (
                    <MiniChip
                      key={item.id}
                      item={item}
                      selected={false}
                      onSelect={setSelectedId}
                    />
                  ))}
                {unscheduled.length === 1 && unscheduled[0].id === selectedId && (
                  <span className="text-muted-foreground text-xs">
                    The selected item is unscheduled — pick a date below.
                  </span>
                )}
              </div>
            </div>
          )}

          {selected ? (
            <ItemDetail
              item={selected}
              onClose={() => setSelectedId(null)}
              onDraft={(draft) => patchItem(selected.id, { draft })}
              onPostedAt={(postedAt) => patchItem(selected.id, { postedAt })}
              onFeedback={(feedback) => patchItem(selected.id, { feedback })}
              onSchedule={(dateISO) => void move(selected.id, dateISO)}
            />
          ) : (
            <p className="text-muted-foreground mt-6 text-sm">
              Select an item to draft it, approve it, or log how it went.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors ${
        active
          ? "border-primary/40 bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function DayCell({
  date,
  weekday,
  items,
  isDragOver,
  selectedId,
  onSelect,
  onDragOver,
  onDragLeave,
  onDrop,
}: {
  date: string;
  weekday: string;
  items: CalendarItem[];
  isDragOver: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onDragOver: () => void;
  onDragLeave: () => void;
  onDrop: (event: React.DragEvent, dateISO: string) => void;
}) {
  const today = isTodayISO(date);
  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        onDragOver();
      }}
      onDragLeave={onDragLeave}
      onDrop={(event) => onDrop(event, date)}
      className={`min-h-32 rounded-xl border p-2 transition-colors ${
        isDragOver
          ? "border-primary/50 bg-primary/10"
          : today
            ? "border-primary/30 bg-primary/5"
            : "border-border/60 bg-card/40"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className="text-muted-foreground text-[11px] font-medium">{weekday}</span>
        <span className={`text-[11px] ${today ? "text-primary font-semibold" : "text-muted-foreground"}`}>
          {formatISODate(date, { day: "numeric", month: "short" })}
        </span>
      </div>
      <div className="mt-2 space-y-1.5">
        {items.map((item) => (
          <MiniChip key={item.id} item={item} selected={item.id === selectedId} onSelect={onSelect} />
        ))}
      </div>
    </div>
  );
}

function MiniChip({
  item,
  selected,
  onSelect,
}: {
  item: CalendarItem;
  selected: boolean;
  onSelect: (id: string) => void;
}) {
  const status = itemStatus(item);
  return (
    <button
      type="button"
      draggable
      onDragStart={(event) => {
        event.dataTransfer.setData("text/plain", item.id);
        event.dataTransfer.effectAllowed = "move";
      }}
      onClick={() => onSelect(item.id)}
      title={item.title}
      className={`group flex w-full cursor-grab items-start gap-1.5 rounded-lg border px-2 py-1.5 text-left text-[12px] leading-snug transition-colors active:cursor-grabbing ${
        selected ? "border-primary/50 bg-primary/10" : "border-border/60 bg-background/60 hover:bg-accent/40"
      }`}
    >
      <GripVertical className="text-muted-foreground/60 mt-px h-3 w-3 shrink-0" />
      <PlatformIcon platform={item.platform} className="mt-px h-3 w-3 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="line-clamp-2">{item.title}</span>
        <span className={`mt-0.5 block text-[10px] font-medium ${status.className}`}>
          {status.label}
        </span>
      </span>
    </button>
  );
}

function itemStatus(item: CalendarItem): { label: string; className: string } {
  if (item.postedAt) return { label: "Posted", className: "text-emerald-400" };
  if (item.feedback) return { label: "Reported", className: "text-emerald-400" };
  if (item.draft?.status === "approved") return { label: "Approved", className: "text-primary" };
  if (item.draft) return { label: "Draft", className: "text-amber-400" };
  return { label: "No draft", className: "text-muted-foreground" };
}

function ItemDetail({
  item,
  onClose,
  onDraft,
  onPostedAt,
  onFeedback,
  onSchedule,
}: {
  item: CalendarItem;
  onClose: () => void;
  onDraft: (draft: CalendarItem["draft"]) => void;
  onPostedAt: (postedAt: string | null) => void;
  onFeedback: (feedback: CalendarItem["feedback"]) => void;
  onSchedule: (dateISO: string | null) => void;
}) {
  const status = itemStatus(item);
  return (
    <Card className="border-border/70 mt-6">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="gap-1">
                <PlatformIcon platform={item.platform} className="h-3 w-3" />
                {platformLabel(item.platform)}
              </Badge>
              {item.type && <Badge variant="outline">{item.type}</Badge>}
              {item.day && <Badge variant="ghost">{item.day}</Badge>}
              <span className={`text-xs font-medium ${status.className}`}>
                <CircleDot className="mr-1 inline h-3 w-3" />
                {status.label}
              </span>
            </div>
            <h3 className="mt-3 font-medium">{item.title}</h3>
            {item.details && (
              <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
                {item.details}
              </p>
            )}
            <p className="text-muted-foreground mt-3 flex flex-wrap items-center gap-3 text-xs">
              <span>
                <Clock className="mr-1 inline h-3 w-3" />
                {item.effortMinutes != null ? `~${item.effortMinutes} min` : "effort unspecified"}
              </span>
              <span>
                {item.scheduledDate
                  ? formatISODate(item.scheduledDate, {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })
                  : "unscheduled"}
              </span>
            </p>
          </div>
          <Button variant="ghost" size="icon-sm" onClick={onClose} aria-label="Close detail">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => onSchedule(todayISODate())}>
            Move to today
          </Button>
          <Button variant="outline" size="sm" onClick={() => onSchedule(addDaysISO(todayISODate(), 1))}>
            Tomorrow
          </Button>
          {item.scheduledDate && (
            <Button variant="ghost" size="sm" onClick={() => onSchedule(null)}>
              Unschedule
            </Button>
          )}
        </div>

        <DraftPanel
          item={item}
          onDraft={onDraft}
          onPostedAt={onPostedAt}
          onFeedback={onFeedback}
        />
      </CardContent>
    </Card>
  );
}
