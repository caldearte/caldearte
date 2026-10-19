// Newsletter double opt-in — confirmation endpoint. Reached indirectly:
// apps/web's /newsletter/confirmar page (server-side) calls this function
// and renders the result as real HTML. This function itself returns JSON,
// never HTML — Supabase Edge Functions silently rewrite a text/html GET
// response's content-type to text/plain (confirmed via Supabase's own
// docs: "HTML content is not supported"), so a browser hitting this
// function directly renders raw source instead of a styled page. That's
// also why apps/web's /api/newsletter/subscribe route links to the
// /newsletter/confirmar page, not to this function's URL, in the
// confirmation email it sends.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// email/adminRegionName ride along only with a first-time "confirmed", for
// apps/web's welcome email (its anon key can't read newsletter_subscribers).
// Only the token holder gets them, and the token was mailed to that same
// address, so this tells the caller nothing they didn't already have.
type Result = {
  status: "confirmed" | "already_confirmed" | "unsubscribed" | "invalid" | "error";
  email?: string;
  adminRegionName?: string;
};

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
    .select("id, email, admin_region_name, confirmed_at, unsubscribed_at")
    .eq("confirm_token", token)
    .maybeSingle();

  if (fetchError) {
    console.error("newsletter-confirm: lookup failed", fetchError);
    return jsonResponse({ status: "error" }, 500);
  }
  if (!subscriber) return jsonResponse({ status: "invalid" }, 404);
  if (subscriber.unsubscribed_at) return jsonResponse({ status: "unsubscribed" });
  if (subscriber.confirmed_at) return jsonResponse({ status: "already_confirmed" });

  // `confirmed_at is null` in the update itself, so two concurrent clicks
  // (a mail scanner prefetching the link while the person clicks it) can't
  // both come back "confirmed" and send two welcome emails.
  const { data: updated, error: updateError } = await client
    .from("newsletter_subscribers")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", subscriber.id)
    .is("confirmed_at", null)
    .select("id");

  if (updateError) {
    console.error("newsletter-confirm: update failed", updateError);
    return jsonResponse({ status: "error" }, 500);
  }

  if (!updated || updated.length === 0) return jsonResponse({ status: "already_confirmed" });

  return jsonResponse({ status: "confirmed", email: subscriber.email, adminRegionName: subscriber.admin_region_name });
});
