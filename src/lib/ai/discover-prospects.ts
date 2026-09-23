import "server-only";

import { scoreProspect } from "@/lib/ai/groq";
import type { OnboardingSummaryData, Platform, ProspectCandidate } from "@/lib/ai/types";
import { platformLabel } from "@/lib/platform-label";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Prospect discovery per platform, with graceful degradation (spec 4.8):
 *
 * - Reddit: official API (OAuth script app, free 100 QPM tier) — search
 *   posts matching the founder's audience, then score with Groq.
 * - YouTube: official Data API v3 (free 10k units/day, 100 units per search)
 *   — search recent videos matching the founder's audience, then score.
 * - X / Instagram / Discord: no usable public search API (X's is paywalled;
 *   Instagram and Discord have none) — we store a targeting guide row instead
 *   of faking a list, so the product never promises what it can't deliver.
 *
 * Never scrapes. Never circumvents platform ToS.
 */

const SCORE_THRESHOLD = 45;
const REDDIT_SEARCHES = 3;
const YOUTUBE_SEARCHES = 2;
const MAX_PER_PLATFORM = 10;

type NewProspect = {
  project_id: string;
  platform: Platform;
  external_handle_or_url: string;
  display_name: string | null;
  relevance_reason: string | null;
  relevance_score: number | null;
  context_excerpt: string | null;
  source_type: "api" | "guide";
};

type RedditToken = { access_token: string; token_type: string };

let redditTokenCache: { token: string; fetchedAt: number } | null = null;

async function getRedditToken(): Promise<string> {
  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("REDDIT_CLIENT_ID / REDDIT_CLIENT_SECRET not set");
  }
  if (redditTokenCache && Date.now() - redditTokenCache.fetchedAt < 55 * 60 * 1000) {
    return redditTokenCache.token;
  }
  const res = await fetch("https://www.reddit.com/api/v1/access_token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": "markoby:markoby-discovery:v1.0 (by /u/markoby_app)",
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit token error ${res.status}`);
  const json = (await res.json()) as RedditToken;
  redditTokenCache = { token: json.access_token, fetchedAt: Date.now() };
  return json.access_token;
}

type RedditSearchItem = {
  data: {
    title: string;
    subreddit: string;
    permalink: string;
    selftext: string;
    num_comments: number;
    ups: number;
    created_utc: number;
  };
};

async function redditSearch(
  token: string,
  query: string,
  sort: "hot" | "new" | "top" = "new",
): Promise<RedditSearchItem[]> {
  const url = new URL("https://oauth.reddit.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("sort", sort);
  url.searchParams.set("limit", "10");
  url.searchParams.set("raw_json", "1");
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": "markoby:markoby-discovery:v1.0 (by /u/markoby_app)",
    },
  });
  if (!res.ok) throw new Error(`Reddit search error ${res.status}`);
  const json = (await res.json()) as { data?: { children?: RedditSearchItem[] } };
  return json.data?.children ?? [];
}

type YoutubeSearchItem = {
  snippet: {
    channelTitle: string;
    title: string;
    description: string;
  };
  id?: { videoId?: string; channelId?: string };
};

async function youtubeSearch(query: string, recencyDays?: number): Promise<YoutubeSearchItem[]> {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (!apiKey) throw new Error("YOUTUBE_API_KEY not set");
  const url = new URL("https://www.googleapis.com/youtube/v3/search");
  url.searchParams.set("part", "snippet");
  url.searchParams.set("q", query);
  url.searchParams.set("type", "video");
  url.searchParams.set("maxResults", "10");
  url.searchParams.set("relevanceLanguage", "en");
  if (recencyDays) {
    url.searchParams.set(
      "publishedAfter",
      new Date(Date.now() - recencyDays * 86_400_000).toISOString(),
    );
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`YouTube search error ${res.status}`);
  const json = (await res.json()) as { items?: YoutubeSearchItem[] };
  return json.items ?? [];
}

/** Derive a few audience-specific search queries from the interview summary. */
export function buildQueries(summary: OnboardingSummaryData): string[] {
  const aud = (summary.target_audience || "").trim();
  const biz = (summary.business_description || "").trim();
  const vp = (summary.value_prop || "").trim();

  const phrases = [aud, vp]
    .join(" ")
    .split(/[.,;•\n—–]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8 && s.length < 80);

  const queries: string[] = [];
  if (aud) queries.push(aud.slice(0, 90));
  if (phrases[0] && phrases[0] !== aud) queries.push(phrases[0]);
  if (phrases[1] && phrases[1] !== aud) queries.push(phrases[1]);
  if (queries.length === 0 && biz) queries.push(biz.slice(0, 90));
  return queries.slice(0, REDDIT_SEARCHES);
}

type PlanLike = {
  communities?: { name: string; why: string; how_to_engage: string; rules_to_respect: string }[];
  hashtags_or_keywords?: { term: string; use: string }[];
} | null;

function buildGuide(platform: Platform, summary: OnboardingSummaryData, plan: PlanLike): string {
  const label = platformLabel(platform);
  const communities = plan?.communities ?? [];
  const keywords = plan?.hashtags_or_keywords ?? [];

  const lines: string[] = [
    `Markoby doesn't auto-scan ${label}: the platform offers no public search API we can legally use on your behalf (X's API is paywalled, Instagram and Discord have none). Instead of a fake list, here's exactly where to look — 15 focused minutes a week beats any scraper.`,
    ``,
    `Your ideal customer: ${summary.target_audience || "(from your interview)"}`,
    ``,
  ];

  if (communities.length > 0) {
    lines.push(`Where to show up:`);
    communities.forEach((c, i) => {
      lines.push(`${i + 1}. ${c.name} — ${c.why} ${c.how_to_engage} (${c.rules_to_respect})`);
    });
  } else {
    lines.push(
      `Where to show up: search the platform weekly for communities where your ideal customer already gathers.`,
    );
  }

  lines.push("");
  lines.push(
    keywords.length > 0
      ? `What to search: ${keywords.map((k) => k.term).join(" · ")}`
      : `What to search: combine your audience's job-to-be-done phrases with words like "community", "recommendations", or "alternative to <competitor>".`,
  );
  return lines.join("\n");
}

export async function discoverProspectsForProject(
  projectId: string,
  userId: string,
  summary: OnboardingSummaryData,
) {
  const supabase = await createAdminClient();

  const { data: platforms } = await supabase
    .from("project_platforms")
    .select("platform")
    .eq("project_id", projectId);
  const enabled = (platforms ?? []).map((p) => p.platform) as Platform[];
  if (enabled.length === 0) return;

  const { data: plans } = await supabase
    .from("marketing_plans")
    .select("platform, plan_json")
    .eq("project_id", projectId)
    .eq("status", "ready");
  const planByPlatform = new Map(
    (plans ?? []).map((p) => [p.platform, p.plan_json as PlanLike]),
  );

  const queries = buildQueries(summary);
  const candidates: ProspectCandidate[] = [];

  // ── Reddit (official API) ────────────────────────────────────────────────
  if (enabled.includes("reddit")) {
    try {
      const token = await getRedditToken();
      for (const q of queries.slice(0, REDDIT_SEARCHES)) {
        try {
          const items = await redditSearch(token, q);
          for (const item of items) {
            const d = item.data;
            candidates.push({
              platform: "reddit",
              title: d.title.slice(0, 280),
              url: `https://www.reddit.com${d.permalink}`,
              community: `r/${d.subreddit}`,
              excerpt: d.selftext?.slice(0, 500) || "",
            });
          }
        } catch (err) {
          console.warn(`[prospects] reddit query "${q}" failed:`, err);
        }
      }
    } catch (err) {
      console.warn("[prospects] reddit discovery failed:", err);
    }
  }

  // ── YouTube (official Data API v3) ───────────────────────────────────────
  if (enabled.includes("youtube")) {
    try {
      for (const q of queries.slice(0, YOUTUBE_SEARCHES)) {
        try {
          const items = await youtubeSearch(q);
          for (const item of items) {
            candidates.push({
              platform: "youtube",
              title: item.snippet.title.slice(0, 280),
              url: item.id?.videoId
                ? `https://www.youtube.com/watch?v=${item.id.videoId}`
                : "https://www.youtube.com",
              community: item.snippet.channelTitle,
              excerpt: item.snippet.description?.slice(0, 500) || "",
            });
          }
        } catch (err) {
          console.warn(`[prospects] youtube query "${q}" failed:`, err);
        }
      }
    } catch (err) {
      console.warn("[prospects] youtube discovery failed:", err);
    }
  }

  // Dedupe by platform+URL.
  const seen = new Set<string>();
  const unique = candidates.filter((c) => {
    const key = `${c.platform}:${c.url}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Score with the fast model, in parallel.
  const scored = await Promise.all(
    unique.map(async (c) => ({ candidate: c, score: await scoreProspect(c, summary, userId) })),
  );

  const rows: NewProspect[] = [];
  const perPlatformCount = new Map<Platform, number>();
  for (const { candidate, score } of scored) {
    if (!score || score.relevance_score < SCORE_THRESHOLD) continue;
    const count = perPlatformCount.get(candidate.platform) ?? 0;
    if (count >= MAX_PER_PLATFORM) continue;
    perPlatformCount.set(candidate.platform, count + 1);
    rows.push({
      project_id: projectId,
      platform: candidate.platform,
      external_handle_or_url: candidate.url,
      display_name: candidate.title,
      relevance_reason: score.relevance_reason,
      relevance_score: score.relevance_score,
      context_excerpt: candidate.excerpt ?? null,
      source_type: "api",
    });
  }

  // ── Honest targeting guides for X / Instagram / Discord ─────────────────
  for (const platform of ["x", "instagram", "discord"] as Platform[]) {
    if (!enabled.includes(platform)) continue;
    rows.push({
      project_id: projectId,
      platform,
      external_handle_or_url: `guide:${platform}`,
      display_name: `${platformLabel(platform)} targeting guide`,
      relevance_reason: buildGuide(platform, summary, planByPlatform.get(platform) ?? null),
      relevance_score: null,
      context_excerpt: null,
      source_type: "guide",
    });
  }

  if (rows.length > 0) {
    const { error } = await supabase.from("prospects").upsert(rows, {
      onConflict: "project_id,platform,external_handle_or_url",
      ignoreDuplicates: false,
    });
    if (error) console.error("[prospects] upsert failed:", error);
  }
}
