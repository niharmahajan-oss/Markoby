import "server-only";

/**
 * Light server-side website fetch for the "website drop" step. Extracts
 * title, meta description, and a trimmed sample of visible text so the AI
 * interview starts with context instead of asking what the site already says.
 * Never executes page scripts (plain HTML fetch + cheerio parse only).
 */

export type SiteContext = {
  url: string;
  title: string;
  description: string;
  textSample: string;
};

const FETCH_TIMEOUT_MS = 10_000;
const MAX_HTML_BYTES = 2_000_000;
const MAX_TEXT_CHARS = 4000;

export async function fetchSiteContext(rawUrl: string): Promise<SiteContext> {
  let url = rawUrl.trim();
  if (!url) throw new Error("Empty URL");
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;

  const parsed = new URL(url);
  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error("Only http(s) URLs are supported");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  let html: string;
  try {
    const res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "MarkobyBot/1.0 (+https://markoby.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    if (!res.ok) throw new Error(`Site returned HTTP ${res.status}`);
    const contentType = res.headers.get("content-type") ?? "";
    if (contentType && !contentType.includes("html")) {
      throw new Error("URL did not return an HTML page");
    }
    const buffer = await res.arrayBuffer();
    const slice = buffer.byteLength > MAX_HTML_BYTES
      ? buffer.slice(0, MAX_HTML_BYTES)
      : buffer;
    html = new TextDecoder("utf-8", { fatal: false }).decode(slice);
  } finally {
    clearTimeout(timer);
  }

  const cheerio = await import("cheerio");
  const $ = cheerio.load(html);

  // Drop non-visible bulk before extracting text.
  $(
    "script, style, noscript, svg, iframe, template, link, meta[http-equiv]",
  ).remove();

  const title =
    $("title").first().text().trim() ||
    $('meta[property="og:title"]').attr("content")?.trim() ||
    parsed.hostname;

  const description =
    $('meta[name="description"]').attr("content")?.trim() ||
    $('meta[property="og:description"]').attr("content")?.trim() ||
    "";

  const bodyText = $("body").text().replace(/\s+/g, " ").trim();

  return {
    url: parsed.toString(),
    title: title.slice(0, 300),
    description: description.slice(0, 500),
    textSample: bodyText.slice(0, MAX_TEXT_CHARS),
  };
}

/** Compact, prompt-ready rendering of a site context. */
export function siteContextForPrompt(ctx: SiteContext | null): string {
  if (!ctx) return "";
  return [
    `WEBSITE CONTEXT (fetched from ${ctx.url} — use this to avoid asking what the site already answers):`,
    `Page title: ${ctx.title}`,
    ctx.description ? `Meta description: ${ctx.description}` : "",
    `Visible text (trimmed): ${ctx.textSample}`,
  ]
    .filter(Boolean)
    .join("\n");
}
