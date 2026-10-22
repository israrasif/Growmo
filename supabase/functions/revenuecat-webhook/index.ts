// supabase/functions/revenuecat-webhook/index.ts
// Receives RevenueCat webhooks and keeps `user_plans` in sync.
// Setup:
//   1. supabase secrets set REVENUECAT_WEBHOOK_AUTH="<a long random string>"
//   2. RevenueCat dashboard -> Integrations -> Webhooks: URL = this function's URL,
//      "Authorization header value" = the exact same string.
//   3. supabase/config.toml: [functions.revenuecat-webhook] verify_jwt = false  (RevenueCat has no Supabase login)
import { createClient } from "npm:@supabase/supabase-js@2";

const ENTITLEMENT = "plus"; // must match the entitlement identifier in RevenueCat

// Events that give (or extend) access.
const GRANT = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
]);
// CANCELLATION and BILLING_ISSUE do not remove access: it lasts until the EXPIRATION event.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return reply({ error: "Method not allowed" }, 405);

  // 1. Is this really RevenueCat?
  const expected = Deno.env.get("REVENUECAT_WEBHOOK_AUTH");
  if (!expected || req.headers.get("Authorization") !== expected) {
    return reply({ error: "Unauthorized" }, 401);
  }

  try {
    const { event } = await req.json();
    const type: string | undefined = event?.type;
    if (!type || type === "TEST") return reply({ ok: true, ignored: type ?? "no type" });

    // 2. Only our Plus entitlement, and only real (non-anonymous) users.
    const entitlements: string[] = event.entitlement_ids ?? [];
    if (!entitlements.includes(ENTITLEMENT)) return reply({ ok: true, ignored: "other entitlement" });

    const userId: string = event.app_user_id ?? "";
    if (!UUID.test(userId)) return reply({ ok: true, ignored: "anonymous user" });

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // 3. Work out the new plan.
    const expiresMs: number | null = event.expiration_at_ms ?? null;
    let row: { user_id: string; plan: string; expires_at: string | null; is_trial: boolean } | null = null;

    if (GRANT.has(type)) {
      row = {
        user_id: userId,
        plan: "plus",
        expires_at: expiresMs ? new Date(expiresMs).toISOString() : null,
        is_trial: event.period_type === "TRIAL",
      };
    } else if (type === "EXPIRATION") {
      // Ignore a stale expiration that arrives after the user already renewed.
      if (expiresMs && expiresMs > Date.now() + 60_000) return reply({ ok: true, ignored: "stale expiration" });
      row = { user_id: userId, plan: "free", expires_at: null, is_trial: false };
    }

    if (!row) return reply({ ok: true, ignored: type });

    // 4. Save. (Assumes user_plans has a unique user_id column.)
    const { error } = await admin.from("user_plans").upsert(row, { onConflict: "user_id" });
    if (error) {
      console.error("user_plans upsert failed", error);
      return reply({ error: "db" }, 500); // non-200 makes RevenueCat retry
    }

    return reply({ ok: true, type, plan: row.plan });
  } catch (e) {
    console.error(e);
    return reply({ error: "Bad request" }, 400);
  }
});