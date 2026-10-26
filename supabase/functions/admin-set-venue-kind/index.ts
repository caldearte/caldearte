// Admin "tipo de espacio" setter (2026-10-25, /admin/espacios) — same
// shape/trust boundary as admin-toggle-sensitive (see that file's own
// comment): reached only from apps/web's /api/admin/set-venue-kind route,
// which verifies the caller's real Auth.js Google session + ADMIN_EMAIL
// match before ever calling here. Trusts the x-admin-secret shared
// header. Deployed with --no-verify-jwt.
//
// Writes venues.kind only (20261025120000_add_venue_kind.sql): one of
// the three kinds, or null to put a venue back to "sin clasificar". The
// column's CHECK constraint is the last line of defense; this validates
// first so a bad value is a 400, not a 500.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ADMIN_ACTIONS_SECRET = Deno.env.get("ADMIN_ACTIONS_SECRET")!;

const KINDS = ["institucional", "municipal", "independiente"];

type Result = { status: "updated" | "not_found" | "unauthorized" | "invalid" | "error"; kind?: string | null };

function jsonResponse(result: Result, httpStatus = 200): Response {
  return new Response(JSON.stringify(result), { status: httpStatus, headers: { "content-type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.headers.get("x-admin-secret") !== ADMIN_ACTIONS_SECRET) {
    return jsonResponse({ status: "unauthorized" }, 401);
  }

  let body: { venueId?: string; kind?: string | null };
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ status: "invalid" }, 400);
  }

  const venueId = body.venueId?.trim();
  const kind = body.kind ?? null;
  if (!venueId || (kind !== null && !KINDS.includes(kind))) return jsonResponse({ status: "invalid" }, 400);

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data, error } = await client.from("venues").update({ kind }).eq("id", venueId).select("id, kind");

  if (error) {
    console.error("admin-set-venue-kind: update failed", error);
    return jsonResponse({ status: "error" }, 500);
  }
  if (!data || data.length === 0) return jsonResponse({ status: "not_found" }, 404);

  return jsonResponse({ status: "updated", kind: data[0].kind });
});
