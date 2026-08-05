// Admin "Quitar" endpoint — soft-removes an approved event from the
// public site (sets events.removed_at/removed_reason). Reached only from
// apps/web's /api/admin/remove-event route, which verifies the caller's
// real Auth.js Google session + ADMIN_EMAIL match BEFORE ever calling
// here (see that route's own comment). This function does not
// independently re-verify who the human is — it trusts the caller is
// apps/web's own trusted server, gated by the ADMIN_ACTIONS_SECRET shared
// secret below, the same "our own server, not the public internet"
// boundary every Edge Function in this repo already relies on. Deployed
// with --no-verify-jwt (matching newsletter-unsubscribe/newsletter-
// resubscribe — none of these functions receive a Supabase JWT from
// their caller, they gate on their own request contents instead).
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ACTIONS_SECRET = Deno.env.get("ADMIN_ACTIONS_SECRET")!;

type Result = { status: "removed" | "already_removed" | "not_found" | "unauthorized" | "invalid" | "error" };

function jsonResponse(result: Result, httpStatus = 200): Response {
  return new Response(JSON.stringify(result), { status: httpStatus, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_ACTIONS_SECRET) {
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  let body: { eventId?: string; reason?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ status: "invalid" }, 400);
  }

  const eventId = body.eventId?.trim();
  if (!eventId) return jsonResponse({ status: "invalid" }, 400);

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: event, error: fetchError } = await client.from("events").select("id, removed_at").eq("id", eventId).maybeSingle();

  if (fetchError) {
    console.error("admin-remove-event: lookup failed", fetchError);
    return jsonResponse({ status: "error" }, 500);
  }
  if (!event) return jsonResponse({ status: "not_found" }, 404);
  if (event.removed_at) return jsonResponse({ status: "already_removed" });

  const { error: updateError } = await client
    .from("events")
    .update({ removed_at: new Date().toISOString(), removed_reason: body.reason ?? null })
    .eq("id", eventId);

  if (updateError) {
    console.error("admin-remove-event: update failed", updateError);
    return jsonResponse({ status: "error" }, 500);
  }

  return jsonResponse({ status: "removed" });
});
