import "server-only";

/**
 * Optional transactional email. Deliberately provider-thin: if RESEND_API_KEY
 * isn't configured the send is skipped and reported, never thrown. Email is a
 * nice-to-have on top of the in-app notification — a missing key must not stop
 * the weekly check-in job from running.
 */

export type EmailResult = { sent: boolean; skipped?: string; error?: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function emailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function sendEmail(input: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}): Promise<EmailResult> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) return { sent: false, skipped: "RESEND_API_KEY not set" };
  if (!input.to || !input.to.includes("@")) return { sent: false, skipped: "no recipient" };

  const from = process.env.EMAIL_FROM ?? "Markoby <hello@markoby.app>";

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
      }),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.error(`[email] provider returned ${res.status}: ${body.slice(0, 300)}`);
      return { sent: false, error: `HTTP ${res.status}` };
    }
    return { sent: true };
  } catch (err) {
    console.error("[email] send failed:", err);
    return { sent: false, error: err instanceof Error ? err.message : "unknown error" };
  }
}

export function siteUrl(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ??
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000")
  );
}

export function checkinEmail(input: {
  projectName: string;
  weekLabel: string;
  link: string;
}): { subject: string; text: string } {
  return {
    subject: `How did ${input.projectName} do this week?`,
    text: [
      `Weekly check-in for ${input.projectName} (week of ${input.weekLabel}).`,
      ``,
      `What did you post this week, and how did it go? Reply in the app and Markoby will build next week's plan around what actually worked:`,
      input.link,
      ``,
      `— Markoby`,
    ].join("\n"),
  };
}
