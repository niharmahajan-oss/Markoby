// Markoby — weekly check-in scheduler (Supabase Edge Function, Deno runtime)
//
// Thin shim, on purpose: the job logic (creating this week's check-in per
// active project, emailing founders, logging churn signals) lives once in the
// Next app at `POST /api/cron/checkins`. This function only schedules the call,
// so there is no second copy to drift.
//
// Deploy + schedule:
//   supabase functions deploy weekly-checkins
//   supabase secrets set MARKOBY_APP_URL=https://markoby.vercel.app CRON_SECRET=...
//
// Then schedule it with pg_cron + pg_net (see supabase/migrations/0002_content_ops.sql)
// or any external scheduler:
//
//   select cron.schedule(
//     'markoby-weekly-checkins',
//     '0 14 * * 1',
//     $$
//       select net.http_post(
//         url     := 'https://<project-ref>.supabase.co/functions/v1/weekly-checkins',
//         headers := jsonb_build_object('Authorization', 'Bearer <FUNCTION_SECRET>'),
//         body    := '{}'::jsonb
//       );
//     $$
//   );
//
// Invoke-only secret: set the function to require a JWT (default) so only a
// service-role caller or the scheduler can trigger it.

Deno.serve(async () => {
  const appUrl = Deno.env.get("MARKOBY_APP_URL");
  const cronSecret = Deno.env.get("CRON_SECRET");

  if (!appUrl || !cronSecret) {
    return new Response(
      JSON.stringify({
        ok: false,
        error: "MARKOBY_APP_URL and CRON_SECRET must both be set on this function.",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const target = `${appUrl.replace(/\/$/, "")}/api/cron/checkins`;

  try {
    const res = await fetch(target, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ triggeredBy: "supabase-edge-function" }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.error(`Weekly check-in job returned ${res.status}: ${body.slice(0, 500)}`);
      return new Response(JSON.stringify({ ok: false, status: res.status, body }), {
        status: 502,
        headers: { "Content-Type": "application/json" },
      });
    }
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("Could not reach the check-in endpoint:", err);
    return new Response(
      JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "fetch failed" }),
      { status: 502, headers: { "Content-Type": "application/json" } },
    );
  }
});
