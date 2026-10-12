/* One-time backfill: give every existing profile a referral code. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
function generateReferralCode(): string {
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let code = "mk";
  for (const b of bytes) code += ALPHABET[b % ALPHABET.length];
  return code;
}

async function updateBatch(
  rows: { id: string }[],
): Promise<void> {
  for (const row of rows) {
    // Try a few times in the (astronomically unlikely) collision case.
    for (let attempt = 0; attempt < 5; attempt++) {
      const { error } = await admin
        .from("profiles")
        .update({ referral_code: generateReferralCode() })
        .eq("id", row.id)
        .is("referral_code", null);
      if (!error) break;
      console.error(`  retry for ${row.id}:`, error.message);
    }
  }
}

async function main() {
  let page = 0;
  const pageSize = 200;
  for (;;) {
    const from = page * pageSize;
    const { data, error } = await admin
      .from("profiles")
      .select("id, referral_code")
      .order("created_at")
      .range(from, from + pageSize - 1);
    if (error) {
      console.error("fetch failed:", error.message);
      process.exit(1);
    }
    if (!data?.length) break;
    const missing = data.filter((r) => !r.referral_code);
    console.log(
      `page ${page + 1}: ${data.length} rows, ${missing.length} need codes`,
    );
    await updateBatch(missing);
    if (data.length < pageSize) break;
    page++;
  }
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .not("referral_code", "is", null);
  console.log("done — profiles with a code now:", count);
}

main();
