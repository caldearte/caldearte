// Rate-limit check for apps/web's public routes (/api/contact,
// /api/newsletter/subscribe, /api/submit-event, /api/track). Server-to-
// server only: gated by the same x-admin-secret as the admin-* functions,
// deployed with --no-verify-jwt.
//
// Why a function and not the check_rate_limit RPC with the anon key, as
// before: security review 2026-11-22 (findings M1/M2). check_rate_limit is
// SECURITY DEFINER, and while anon could EXECUTE it, anyone holding the
// anon key could fill someone else's bucket on purpose
// (subscribe-email:<victim>, submit-event:<a gallery's IP>) or flood
// rate_limit_counters with unique keys. The paired migration revokes anon/
// authenticated EXECUTE; this function calls it with the service role
// instead, and only accepts the bucket prefixes apps/web actually uses.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ACTIONS_SECRET = Deno.env.get("ADMIN_ACTIONS_SECRET")!;

const ALLOWED_PREFIXES = ["contact:", "subscribe-ip:", "subscribe-email:", "submit-event:", "track:"];
const MAX_KEY_LENGTH = 400;
const MAX_WINDOW_SECONDS = 86400; // check_rate_limit's own cleanup drops rows older than a day

type Result = { allowed: boolean } | { error: "unauthorized" | "invalid" | "error" };

function jsonResponse(result: Result, httpStatus = 200): Response {
  return new Response(JSON.stringify(result), { status: httpStatus, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_ACTIONS_SECRET) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }
  if (req.method !== "POST") return jsonResponse({ error: "invalid" }, 405);

  let body: { bucketKey?: unknown; maxCount?: unknown; windowSeconds?: unknown };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: "invalid" }, 400);
  }

  const { bucketKey, maxCount, windowSeconds } = body;
  if (
    typeof bucketKey !== "string" ||
    bucketKey.length > MAX_KEY_LENGTH ||
    !ALLOWED_PREFIXES.some((p) => bucketKey.startsWith(p)) ||
    !Number.isInteger(maxCount) ||
    (maxCount as number) < 1 ||
    !Number.isInteger(windowSeconds) ||
    (windowSeconds as number) < 1 ||
    (windowSeconds as number) > MAX_WINDOW_SECONDS
  ) {
    return jsonResponse({ error: "invalid" }, 400);
  }

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await client.rpc("check_rate_limit", {
    p_bucket_key: bucketKey,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("rate-limit: check_rate_limit failed", error);
    return jsonResponse({ error: "error" }, 500);
  }
  return jsonResponse({ allowed: data === true });
});
