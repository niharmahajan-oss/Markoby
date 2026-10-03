/**
 * Forgiving JSON extraction for model output.
 *
 * gpt-oss (like most models) occasionally emits almost-JSON: the payload
 * arrives wrapped in prose or fences, with trailing commas, or — the failure we
 * actually hit in production — with a literal newline inside a long string
 * value (a markdown `first_post_draft`, for example). A plain JSON.parse throws
 * on every one of those, which used to fail an entire plan even though the
 * model's call had succeeded.
 *
 * No new dependency: the repair pass walks the text once, escaping raw control
 * characters inside string literals and dropping commas that sit just before a
 * closing brace or bracket.
 */

export function repairJsonText(input: string): string | null {
  let escapedStrings = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];

    if (inString) {
      if (escaped) {
        escapedStrings += ch;
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escapedStrings += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        escapedStrings += ch;
        inString = false;
        continue;
      }
      if (ch === "\n") {
        escapedStrings += "\\n";
        continue;
      }
      if (ch === "\r") {
        escapedStrings += "\\r";
        continue;
      }
      if (ch === "\t") {
        escapedStrings += "\\t";
        continue;
      }
      if (ch.charCodeAt(0) < 0x20) {
        escapedStrings += `\\u${ch.charCodeAt(0).toString(16).padStart(4, "0")}`;
        continue;
      }
      escapedStrings += ch;
      continue;
    }

    if (ch === '"') inString = true;
    escapedStrings += ch;
  }

  let cleaned = "";
  let insideString = false;
  let backslash = false;

  for (let i = 0; i < escapedStrings.length; i += 1) {
    const ch = escapedStrings[i];

    if (insideString) {
      cleaned += ch;
      if (backslash) backslash = false;
      else if (ch === "\\") backslash = true;
      else if (ch === '"') insideString = false;
      continue;
    }

    if (ch === '"') {
      insideString = true;
      cleaned += ch;
      continue;
    }

    if (ch === ",") {
      let j = i + 1;
      while (j < escapedStrings.length && /\s/.test(escapedStrings[j])) j += 1;
      if (escapedStrings[j] === "}" || escapedStrings[j] === "]") continue; // drop trailing comma
    }

    cleaned += ch;
  }

  return cleaned === input ? null : cleaned;
}

function candidates(raw: string): string[] {
  const trimmed = raw.trim();
  const out: string[] = [];

  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) out.push(fence[1].trim());

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    out.push(trimmed.slice(firstBrace, lastBrace + 1));
  }

  out.push(trimmed);
  return out;
}

function attempt<T>(text: string): T | null {
  try {
    return JSON.parse(text) as T;
  } catch {
    return null;
  }
}

/** Extract JSON from a model reply that may be wrapped, fenced or slightly malformed. */
export function parseJsonLoose<T>(raw: string): T | null {
  const list = candidates(raw);

  for (const candidate of list) {
    const direct = attempt<T>(candidate);
    if (direct !== null) return direct;
  }
  for (const candidate of list) {
    const repaired = repairJsonText(candidate);
    if (!repaired) continue;
    const parsed = attempt<T>(repaired);
    if (parsed !== null) return parsed;
  }
  return null;
}
