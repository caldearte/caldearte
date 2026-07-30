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
