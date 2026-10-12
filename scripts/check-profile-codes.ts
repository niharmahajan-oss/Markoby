/* Check the signed-in user's profile state (screenshot shows no link). */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

async function main() {
  const { data, error } = await admin.from("profiles").select("id, email, full_name, referral_code, created_at").order("created_at", { ascending: false }).limit(10);
  if (error) { console.error("ERR", error.message); process.exit(1); }
  for (const p of data ?? []) {
    console.log(p.referral_code ? "OK  " : "MISS", p.email, "code=", p.referral_code, "fn=", p.full_name);
  }
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .is("referral_code", null);
  console.log("profiles missing a code:", count ?? 0);
}

main();
