// Newsletter unsubscribe endpoint. Reached indirectly: apps/web's
// /newsletter/baja page (server-side) calls this function and renders the
// result as real HTML — this function itself returns JSON, never HTML,
// same reasoning as newsletter-confirm/index.ts (Supabase Edge Functions
// rewrite a text/html GET response's content-type to text/plain). Reuses
// the subscriber's own confirm_token as the unsubscribe token (one opaque
// value per subscriber is enough) — reached from every weekly digest's
// List-Unsubscribe link, built by apps/curator's lib/notify.ts
// (sendDigestEmail), which now also points at /newsletter/baja.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Result = { status: "unsubscribed" | "already_unsubscribed" | "invalid" | "error" };

function jsonResponse(result: Result, httpStatus = 200): Response {
  return new Response(JSON.stringify(result), { status: httpStatus, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return jsonResponse({ status: "invalid" }, 400);

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: subscriber, error: fetchError } = await client
    .from("newsletter_subscribers")
    .select("id, unsubscribed_at")
    .eq("confirm_token", token)
    .maybeSingle();

  if (fetchError) {
    console.error("newsletter-unsubscribe: lookup failed", fetchError);
    return jsonResponse({ status: "error" }, 500);
  }
  if (!subscriber) return jsonResponse({ status: "invalid" }, 404);
  if (subscriber.unsubscribed_at) return jsonResponse({ status: "already_unsubscribed" });

  const { error: updateError } = await client
    .from("newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", subscriber.id);

  if (updateError) {
    console.error("newsletter-unsubscribe: update failed", updateError);
    return jsonResponse({ status: "error" }, 500);
  }

  return jsonResponse({ status: "unsubscribed" });
});
