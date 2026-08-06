// Admin "marcar como sensible" toggle — same shape/trust boundary as
// admin-remove-event (see that file's own comment): reached only from
// apps/web's /api/admin/toggle-sensitive route, which verifies the
// caller's real Auth.js Google session + ADMIN_EMAIL match before ever
// calling here. This function trusts the x-admin-secret shared header,
// same "our own server, not the public internet" boundary every Edge
// Function in this repo already relies on. Deployed with
// --no-verify-jwt.
//
// Toggles events.admin_sensitive_marked_at — never writes to
// sensitivity_tags itself, see the migration's own comment
// (20260806060000_add_admin_sensitive_marked_at.sql) for why that stays
// strictly Haiku's own column.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ACTIONS_SECRET = Deno.env.get("ADMIN_ACTIONS_SECRET")!;

type Result = { status: "marked" | "unmarked" | "not_found" | "unauthorized" | "invalid" | "error" };

function jsonResponse(result: Result, httpStatus = 200): Response {
  return new Response(JSON.stringify(result), { status: httpStatus, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_ACTIONS_SECRET) {
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  let body: { eventId?: string };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ status: "invalid" }, 400);
  }

  const eventId = body.eventId?.trim();
  if (!eventId) return jsonResponse({ status: "invalid" }, 400);

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: event, error: fetchError } = await client.from("events").select("id, admin_sensitive_marked_at").eq("id", eventId).maybeSingle();

  if (fetchError) {
    console.error("admin-toggle-sensitive: lookup failed", fetchError);
    return jsonResponse({ status: "error" }, 500);
  }
  if (!event) return jsonResponse({ status: "not_found" }, 404);

  const nowMarking = !event.admin_sensitive_marked_at;
  const { error: updateError } = await client
    .from("events")
    .update({ admin_sensitive_marked_at: nowMarking ? new Date().toISOString() : null })
    .eq("id", eventId);

  if (updateError) {
    console.error("admin-toggle-sensitive: update failed", updateError);
    return jsonResponse({ status: "error" }, 500);
  }

  return jsonResponse({ status: nowMarking ? "marked" : "unmarked" });
});
