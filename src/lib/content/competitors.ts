import "server-only";

import type { CompetitorMention } from "@/lib/ai/types";
import { fetchSiteContext } from "@/lib/website";

/**
 * Optional competitor scan (feature 4).
 *
 * Deliberately shallow and honest: we fetch the competitor's public landing
 * page with the same reader used for the founder's own site and summarise only
 * what is visible there. No keyword APIs, no pricing scrapes, no pretending
 * this is competitive research — the note says so, and so does the UI.
 */

const MAX_COMPETITORS = 2;
/**
 * Tight on purpose: these fetches run inside the interview wrap-up server
 * action, on top of the extraction call, and the founder is watching a spinner.
 * Two competitors are fetched in parallel, so this bounds the added latency to
 * roughly one timeout rather than two.
 */
const COMPETITOR_TIMEOUT_MS = 4_000;
const THEME_CHARS = 420;

function looksLikeDomain(value: string): boolean {
  return /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(value.trim());
}

/** Best-guess public URLs for a competitor the founder named. */
export function candidateUrls(mention: CompetitorMention): string[] {
  const urls: string[] = [];
  const website = mention.website?.trim() ?? "";

  if (website) {
    if (/^https?:\/\//i.test(website)) urls.push(website);
    else if (looksLikeDomain(website)) urls.push(`https://${website}`);
  }

  const slug = mention.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  if (!website && slug.length >= 3) {
    urls.push(`https://${slug}.com`);
    urls.push(`https://www.${slug}.com`);
  }

  return [...new Set(urls)].slice(0, 2);
}

export type ScannedCompetitor = {
  name: string;
  url: string | null;
  title: string;
  summary: string;
};

export async function scanCompetitor(mention: CompetitorMention): Promise<ScannedCompetitor> {
  for (const url of candidateUrls(mention)) {
    try {
      const ctx = await fetchSiteContext(url, {
        timeoutMs: COMPETITOR_TIMEOUT_MS,
        maxTextChars: THEME_CHARS + 200,
      });
      return {
        name: mention.name,
        url: ctx.url,
        title: ctx.title,
        summary: ctx.textSample.slice(0, THEME_CHARS),
      };
    } catch (err) {
      console.warn(`[competitors] could not read ${url}:`, err);
    }
  }
  return { name: mention.name, url: null, title: "", summary: "" };
}

/**
 * Scan up to two named competitors in parallel and return a prompt-ready note.
 * Returns "" when nothing was named or nothing could be read, so plan
 * generation never gets told to differentiate from an empty scan.
 */
export async function scanCompetitors(
  mentions: CompetitorMention[] | undefined,
): Promise<string> {
  const named = (mentions ?? [])
    .filter((mention) => mention && typeof mention.name === "string" && mention.name.trim())
    .slice(0, MAX_COMPETITORS);
  if (named.length === 0) return "";

  const scanned = await Promise.all(named.map((mention) => scanCompetitor(mention)));
  const found = scanned.filter((entry) => entry.url && (entry.title || entry.summary));
  if (found.length === 0) {
    return [
      `The founder named ${named.map((m) => m.name).join(", ")} as competitors, but no public page could be read.`,
      `Treat this as unverified — do not invent anything about them.`,
    ].join("\n");
  }

  const lines = [
    "Lightweight scan of publicly visible pages only — this is not deep competitive research, and nothing beyond these notes is known about them:",
  ];
  for (const entry of found) {
    lines.push(`- ${entry.name} (${entry.url})`);
    lines.push(`  Page title: ${entry.title}`);
    if (entry.summary) lines.push(`  Visible copy: ${entry.summary}`);
  }
  const unread = scanned.filter((entry) => !entry.url).map((entry) => entry.name);
  if (unread.length > 0) {
    lines.push(
      `- Could not read a public page for: ${unread.join(", ")} — unverified, don't assume anything about them.`,
    );
  }
  return lines.join("\n");
}
