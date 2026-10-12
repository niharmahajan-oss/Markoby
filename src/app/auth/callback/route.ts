import { NextResponse, type NextRequest } from "next/server";

import { ensureReferralIdentity } from "@/lib/referrals/referrals";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error, data } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user) {
      // Email-confirmation flow: attribution cookie survives to here; write
      // referral identity now (idempotent — signup path may have done it).
      try {
        const refCookie = request.cookies.get("mk_ref")?.value ?? null;
        await ensureReferralIdentity(data.user.id, refCookie);
        if (refCookie) {
          const response = NextResponse.redirect(`${origin}${next}`);
          response.cookies.delete("mk_ref");
          return response;
        }
      } catch (err) {
        console.error("[auth-callback] referral identity setup failed:", err);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/auth/login?error=Could+not+confirm+email.+Try+logging+in.`);
}
