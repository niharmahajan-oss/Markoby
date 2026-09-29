import { NextResponse } from "next/server";

import { runWeeklyCheckins } from "@/lib/content/checkins";

/**
 * Weekly check-in job (feature 5).
 *
 * Scheduled by vercel.json (Mondays, 14:00 UTC). Vercel automatically sends
 * `Authorization: Bearer <CRON_SECRET>` when CRON_SECRET is set on the project;
 * the Supabase Edge Function `weekly-checkins` calls the same endpoint, so
 * there is exactly one implementation of the job.
 *
 * When CRON_SECRET is missing the endpoint refuses to run rather than sitting
 * open as an unauthenticated way to email every founder.
 */

export const maxDuration = 60;
export const dynamic = "force-dynamic";

function unauthorized() {
  return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
}

function notConfigured() {
  return NextResponse.json(
    { ok: false, error: "CRON_SECRET is not configured on this deployment." },
    { status: 503 },
  );
}

async function handle(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return notConfigured();
  if (request.headers.get("authorization") !== `Bearer ${secret}`) return unauthorized();

  try {
    const summary = await runWeeklyCheckins();
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    console.error("[cron] weekly check-ins failed:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Job failed" },
      { status: 500 },
    );
  }
}

export const GET = handle;
export const POST = handle;
