// Newsletter re-subscribe endpoint — server-to-server only, called by
// apps/web/src/app/api/newsletter/subscribe/route.ts when its own INSERT
// hits the unique-email conflict (23505). The anon key only has INSERT on
// newsletter_subscribers (see the 20260730180000 migration), so it can't
// tell an active/pending row apart from a previously-unsubscribed one, or
// update either — hence this service-role function.
//
// Real bug this fixes (found 2026-07-30, same day as the entry-modal
// redesign): a visitor who unsubscribed and then tried to re-subscribe
// with the same email always got "ya está suscrita" — the INSERT
// conflicted on the unique email regardless of unsubscribed_at, and the
// subscribe route treated every 23505 as "already active." Now: if the
// existing row is unsubscribed, reset it (fresh confirm_token, region,
// cleared confirmed_at/unsubscribed_at) so double opt-in runs again;
// otherwise it really is already active/pending, so report that as-is.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Result = { status: "resubscribed"; confirmToken: string } | { status: "already_subscribed" | "error" };

function jsonResponse(result: Result, httpStatus = 200): Response {
  return new Response(JSON.stringify(result), { status: httpStatus, headers: { "content-type": "application/json" } });
}

// Real gap found + fixed 2026-07-31 (same live pentest as
// curation-escalation-decide's filter-injection fix): the rate limiting
// added to apps/web's /api/newsletter/subscribe route (migration
// 20260731160000) only lived in that Next.js wrapper. This function has
// its own public URL — this repo's own source, so not actually secret —
// and calling it directly bypasses that limit entirely, on top of
// letting anyone check whether an arbitrary email is a subscriber
// (already_subscribed vs resubscribed) with no limit either. Same
// check_rate_limit function the Next.js route uses; anon/authenticated
// already has EXECUTE on it, and this function's own service-role client
// can call it too.
async function isWithinRateLimit(client: ReturnType<typeof createClient>, bucketKey: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await client.rpc("check_rate_limit", { p_bucket_key: bucketKey, p_max_count: maxCount, p_window_seconds: windowSeconds });
  if (error) {
    console.error("newsletter-resubscribe: check_rate_limit failed — failing open", error);
    return true;
  }
  return data as boolean;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return jsonResponse({ status: "error" }, 405);

  let body: { email?: string; adminRegionName?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ status: "error" }, 400);
  }
  const email = body.email?.trim();
  const adminRegionName = body.adminRegionName?.trim();
  if (!email || !adminRegionName) return jsonResponse({ status: "error" }, 400);

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Same two limits as /api/newsletter/subscribe: per-IP catches a script
  // hammering this endpoint directly, per-email bounds how often any one
  // target's subscription can be reset/enumerated regardless of which IP
  // asks.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const ipAllowed = await isWithinRateLimit(client, `resubscribe-ip:${ip}`, 5, 3600);
  if (!ipAllowed) return jsonResponse({ status: "error" }, 429);
  const emailAllowed = await isWithinRateLimit(client, `resubscribe-email:${email.toLowerCase()}`, 3, 86400);
  if (!emailAllowed) return jsonResponse({ status: "error" }, 429);

  const { data: existing, error: fetchError } = await client
    .from("newsletter_subscribers")
    .select("id, unsubscribed_at")
    .eq("email", email)
    .maybeSingle();

  if (fetchError) {
    console.error("newsletter-resubscribe: lookup failed", fetchError);
    return jsonResponse({ status: "error" }, 500);
  }
  if (!existing) {
    // Shouldn't normally happen (this function is only called after a
    // unique-conflict insert failure), but handle it as a fresh signup.
    const confirmToken = crypto.randomUUID().replaceAll("-", "");
    const { error: insertError } = await client
      .from("newsletter_subscribers")
      .insert({ email, admin_region_name: adminRegionName, confirm_token: confirmToken });
    if (insertError) {
      console.error("newsletter-resubscribe: fallback insert failed", insertError);
      return jsonResponse({ status: "error" }, 500);
    }
    return jsonResponse({ status: "resubscribed", confirmToken });
  }

  if (!existing.unsubscribed_at) {
    return jsonResponse({ status: "already_subscribed" });
  }

  const confirmToken = crypto.randomUUID().replaceAll("-", "");
  const { error: updateError } = await client
    .from("newsletter_subscribers")
    .update({
      admin_region_name: adminRegionName,
      confirm_token: confirmToken,
      confirmed_at: null,
      unsubscribed_at: null,
    })
    .eq("id", existing.id);

  if (updateError) {
    console.error("newsletter-resubscribe: update failed", updateError);
    return jsonResponse({ status: "error" }, 500);
  }

  return jsonResponse({ status: "resubscribed", confirmToken });
});
