// supabase/functions/delete-account/index.ts
// Permanently deletes the signed-in user's account: their photos, their rows in every table, then the login itself.
// The app calls it with supabase.functions.invoke("delete-account"). Keep the default JWT check on: only a signed-in
// user can reach this, and it only ever deletes that user's own data.
// Deploy: supabase functions deploy delete-account
import { createClient } from "npm:@supabase/supabase-js@2";

const BUCKET = "hair-photos";
// Every table that holds a user's data (all have a user_id column). Add new tables here when you create them.
const TABLES = [
  "session_activities", // before sessions
  "sessions",
  "activities",
  "massage_sessions",
  "daily_logs",
  "quiz_results",
  "vault_photos",
  "user_settings",
  "scans",
  "onboarding_answers",
  "user_plans",
];

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

// Every file under a folder, including sub-folders (the bucket stores files as <user id>/vault/..., <user id>/...)
async function listFiles(
  admin: ReturnType<typeof createClient>,
  prefix: string,
): Promise<string[]> {
  const files: string[] = [];
  const folders = [prefix];
  while (folders.length > 0) {
    const dir = folders.pop()!;
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await admin.storage
        .from(BUCKET)
        .list(dir, { limit: 100, offset });
      if (error) throw error;
      if (!data || data.length === 0) break;
      for (const item of data) {
        const path = `${dir}/${item.name}`;
        if (item.id === null)
          folders.push(path); // a folder
        else files.push(path);
      }
      if (data.length < 100) break;
    }
  }
  return files;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  // 1. Who is asking?
  const url = Deno.env.get("SUPABASE_URL")!;
  const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: {
      headers: { Authorization: req.headers.get("Authorization") ?? "" },
    },
  });
  const { data: auth, error: authError } = await userClient.auth.getUser();
  const userId = auth.user?.id;
  if (authError || !userId) return reply({ error: "Not signed in" }, 401);

  const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    // 2. Photos
    const files = await listFiles(admin, userId);
    for (let i = 0; i < files.length; i += 100) {
      const { error } = await admin.storage
        .from(BUCKET)
        .remove(files.slice(i, i + 100));
      if (error) throw error;
    }

    // 3. Rows. A table that does not exist is skipped; any other error stops here so the person can try again
    //    (their login is only deleted once everything else is gone).
    for (const table of TABLES) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      if (error && error.code !== "PGRST205" && error.code !== "42P01") {
        console.error(`delete from ${table} failed`, error);
        return reply({ error: `Could not delete ${table}` }, 500);
      }
    }

    // 4. The login itself
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
    if (deleteError) {
      console.error("deleteUser failed", deleteError);
      return reply({ error: "Could not delete the account" }, 500);
    }

    return reply({ ok: true });
  } catch (e) {
    console.error(e);
    return reply({ error: "Something went wrong" }, 500);
  }
});
