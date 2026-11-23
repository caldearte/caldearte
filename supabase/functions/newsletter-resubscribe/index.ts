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
const ADMIN_ACTIONS_SECRET = Deno.env.get("ADMIN_ACTIONS_SECRET")!;

type Result = { status: "resubscribed"; confirmToken: string } | { status: "already_subscribed" | "error" };

function jsonResponse(result: Result, httpStatus = 200): Response {
  return new Response(JSON.stringify(result), { status: httpStatus, headers: { "content-type": "application/json" } });
}

// Security review 2026-11-22: this function used to be callable by anyone
// (deployed --no-verify-jwt, project URL is public) and it hands back the
// confirm token. POST {email} here, then GET newsletter-confirm?token=...,
// subscribed any third-party address without double opt-in — and put
// people who had unsubscribed back on the list. It now requires the same
// x-admin-secret as the admin-* functions: its only legitimate caller is
// apps/web's /api/newsletter/subscribe, server-side, which already rate-
// limits per IP (Vercel's x-real-ip) and per email before calling here.
// The per-email limit below stays as a second line; the old per-IP limit
// is gone because every call now comes from Vercel's own egress IPs, so it
// throttled real visitors as one shared bucket.
async function isWithinRateLimit(client: ReturnType<typeof createClient>, bucketKey: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await client.rpc("check_rate_limit", { p_bucket_key: bucketKey, p_max_count: maxCount, p_window_seconds: windowSeconds });
  if (error) {
    console.error("newsletter-resubscribe: check_rate_limit failed — failing open", error);
    return true;
  }
  return data as boolean;
}

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_ACTIONS_SECRET) {
    return jsonResponse({ status: "error" }, 401);
  }
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

  // Per-email bound on how often any one address can be reset, whatever
  // the caller (see the comment above isWithinRateLimit).
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
    // A fresh signup: since 2026-11-22 apps/web sends every subscription
    // here instead of inserting with the anon key (security review A2).
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
