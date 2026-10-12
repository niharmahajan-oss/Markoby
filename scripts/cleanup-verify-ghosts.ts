/* Remove leftover verification artifacts (ghost profiles + their ledger rows). */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);

const GHOST_EMAILS = [
  "ref-verifier-A@test.local",
  "ref-verifier-B@test.local",
  "ref-verifier-A2@test.local",
  "ref-verifier-a2@test.local",
  "verify-referee@test.local",
];

async function main() {
  for (const email of GHOST_EMAILS) {
    const { data: profile } = await admin
      .from("profiles")
      .select("id")
      .eq("email", email)
      .maybeSingle();
    if (!profile) {
      console.log(`${email}: no ghost profile`);
      continue;
    }
    // ledger rows cascade with the profile delete
    const { error: delErr } = await admin
      .from("profiles")
      .delete()
      .eq("id", profile.id);
    console.log(`${email}: deleted (${delErr?.message ?? "ok"})`);

    // also try deleting the auth user if it still exists
    try {
      const { error } = await admin.auth.admin.deleteUser(profile.id);
      console.log(`  auth user: ${error ? error.message : "deleted"}`);
    } catch (err) {
      console.log(`  auth user: already gone`);
    }
  }

  // The synthetic id profile from the first script version.
  const { data: synth } = await admin
    .from("profiles")
    .select("id")
    .eq("id", "00000000-0000-0000-0000-00000000000a")
    .maybeSingle();
  if (synth) {
    const { error } = await admin.from("profiles").delete().eq("id", synth.id);
    console.log("synthetic 000..00a profile: deleted", error?.message ?? "");
  } else {
    console.log("synthetic 000..00a profile: absent");
  }
}

main();
