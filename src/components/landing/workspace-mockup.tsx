import { CalendarDays } from "lucide-react";

/**
 * Static product mock for the hero: the two surfaces a Markoby session
 * produces — the AI interview on the left, the weekly distribution plan on
 * the right. Purely presentational.
 */

const QUICK_ANGLES = [
  '"Share our zero-dollar tech stack"',
  '"Post a cold teardown of our landing page"',
];

type DistributionRow = {
  badge: string;
  badgeClass: string;
  title: string;
  meta: string;
  metaClass?: string;
  body: string;
  note?: string;
  noteClass?: string;
};

const DISTRIBUTION_ROWS: DistributionRow[] = [
  {
    badge: "r/",
    badgeClass: "bg-[#ff4500]/15 text-[#ff4500]",
    title: "r/Entrepreneur · Value Post",
    meta: "Scheduled: 2:15 PM",
    body: '"Why spending money on Google Ads before $1k MRR hurt our churn..."',
    note: "Rule check passed: Non-promotional tone",
    noteClass: "text-[#a3f324]",
  },
  {
    badge: "𝕏",
    badgeClass: "bg-zinc-800 text-white",
    title: "X (Twitter) · 7-Tweet Breakdown",
    meta: "Tomorrow 9:00 AM",
    body: '"How we got our first 100 beta signups with 0 followers and 0 ad dollars."',
    note: "Hook rating: 94/100 · High retweet likelihood",
    noteClass: "text-zinc-500",
  },
  {
    badge: "D",
    badgeClass: "bg-[#5865F2]/15 text-[#5865F2]",
    title: "Indie Hackers Discord · Feedback Lounge",
    meta: "Ready to share",
    metaClass: "text-[#a3f324] font-medium",
    body: "Custom script addressing 3 members looking for this solution.",
  },
];

export function WorkspaceMockup() {
  return (
    <div className="mx-auto mt-10 max-w-5xl rounded-2xl border border-zinc-800/80 bg-[#0d0f14]/90 p-3 text-left shadow-2xl backdrop-blur-xl sm:p-5">
      {/* Window chrome */}
      <div className="flex items-center justify-between border-b border-zinc-800/80 pb-4 text-xs text-zinc-500">
        <div className="flex items-center gap-2">
          <span className="inline-block h-3 w-3 rounded-full bg-red-500/80" />
          <span className="inline-block h-3 w-3 rounded-full bg-yellow-500/80" />
          <span className="inline-block h-3 w-3 rounded-full bg-green-500/80" />
          <span className="ml-2 font-mono text-zinc-400">
            markoby.vercel.app/growth-workspace/preview
          </span>
        </div>
        <span className="hidden items-center gap-1.5 rounded bg-zinc-800/80 px-2.5 py-1 font-mono text-[11px] text-zinc-300 sm:flex">
          <span className="h-1.5 w-1.5 rounded-full bg-[#a3f324]" />
          Live Growth Session
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Interview */}
        <div className="flex flex-col justify-between space-y-4 rounded-xl border border-zinc-800/70 bg-black/40 p-4 lg:col-span-6">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-zinc-800/40 pb-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-semibold text-zinc-200">
                <span className="h-2 w-2 rounded-full bg-[#a3f324]" />
                AI Marketer Dialogue
              </span>
              <span className="text-[11px] text-zinc-500">Question 3 of 6</span>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#a3f324] text-xs font-extrabold text-black">
                M
              </div>
              <div className="rounded-xl rounded-tl-sm border border-zinc-700/50 bg-zinc-800/60 p-3 text-xs leading-relaxed text-zinc-200">
                <p className="mb-1 font-medium text-white">
                  What&apos;s the #1 reason a founder would churn after week
                  one?
                </p>
                Be blunt. This tells me which subreddit pain threads to
                prioritize and what counter-narratives to write.
              </div>
            </div>

            <div className="flex items-start justify-end gap-2.5">
              <div className="max-w-[85%] rounded-xl rounded-tr-sm border border-[#a3f324]/30 bg-[#a3f324]/10 p-3 text-xs leading-relaxed text-zinc-200">
                They give up because manual cold DM outreach takes 3 hours a
                day, so they stop altogether.
              </div>
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-zinc-700 bg-zinc-800 text-xs font-bold text-zinc-300">
                You
              </div>
            </div>

            <div className="flex items-start gap-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#a3f324] text-xs font-extrabold text-black">
                M
              </div>
              <div className="w-full rounded-xl rounded-tl-sm border border-zinc-700/50 bg-zinc-800/60 p-3 text-xs leading-relaxed text-zinc-200">
                <div className="mb-1 flex items-center gap-2 text-[11px] font-medium text-[#a3f324]">
                  <svg
                    className="h-3.5 w-3.5 animate-spin"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      d="M4 12a8 8 0 018-8v8H4z"
                      fill="currentColor"
                    />
                  </svg>
                  Synthesizing zero-budget hooks for r/SaaS &amp; X
                  build-in-public...
                </div>
                <div className="text-[11px] text-zinc-400">
                  Identified 4 active threads complaining about manual outreach
                  today.
                </div>
              </div>
            </div>
          </div>

          <div className="pt-2">
            <div className="mb-1.5 font-mono text-[11px] tracking-wider text-zinc-500 uppercase">
              Suggested Quick Angles:
            </div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ANGLES.map((angle) => (
                <span
                  key={angle}
                  className="rounded-md border border-zinc-700/80 bg-zinc-800/90 px-2 py-1 text-[11px] text-zinc-300 transition hover:border-[#a3f324]/50 hover:text-white"
                >
                  {angle}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Weekly plan */}
        <div className="flex flex-col justify-between rounded-xl border border-zinc-800/70 bg-black/40 p-4 lg:col-span-6">
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-zinc-800/40 pb-2 text-xs text-zinc-400">
              <span className="flex items-center gap-1.5 font-semibold text-zinc-200">
                <CalendarDays className="h-4 w-4 text-[#a3f324]" />
                Weekly Organic Distribution Engine
              </span>
              <span className="rounded bg-[#a3f324]/10 px-2 py-0.5 text-[11px] font-medium text-[#a3f324]">
                Native Angle Active
              </span>
            </div>

            <div className="space-y-2.5">
              {DISTRIBUTION_ROWS.map((row) => (
                <div
                  key={row.title}
                  className="flex items-start gap-3 rounded-lg border border-zinc-800 bg-zinc-900/80 p-2.5"
                >
                  <div
                    className={`flex h-7 w-7 shrink-0 items-center justify-center rounded text-xs font-bold ${row.badgeClass}`}
                  >
                    {row.badge}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-zinc-200">
                        {row.title}
                      </span>
                      <span
                        className={`text-[10px] ${row.metaClass ?? "text-zinc-400"}`}
                      >
                        {row.meta}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-zinc-400">
                      {row.body}
                    </p>
                    {row.note ? (
                      <span
                        className={`mt-1 inline-block font-mono text-[10px] ${row.noteClass}`}
                      >
                        {row.note}
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between border-t border-zinc-800 pt-3 text-xs text-zinc-400">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />5
              platform-native blueprints generated
            </span>
            <span className="rounded bg-[#a3f324] px-2.5 py-1 text-xs font-semibold text-black">
              Export Schedule
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
