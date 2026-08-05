import { NextResponse } from "next/server";
import { auth, isAdminSession } from "@/lib/auth";

interface RemoveEventPayload {
  eventId?: string;
  reason?: string;
}

// Only verifies identity/authorization here — the actual privileged write
// happens in the admin-remove-event Edge Function (service-role), the
// same pattern apps/web already uses for privileged Supabase writes (see
// api/newsletter/subscribe's call to newsletter-resubscribe) instead of
// this app holding a service-role key itself (see lib/supabase-client.ts's
// assertAnonRole guard).
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: RemoveEventPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const eventId = payload.eventId?.trim() ?? "";
  if (!eventId) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminSecret = process.env.ADMIN_ACTIONS_SECRET;
  if (!supabaseUrl || !adminSecret) {
    console.error("[admin/remove-event] NEXT_PUBLIC_SUPABASE_URL or ADMIN_ACTIONS_SECRET not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/admin-remove-event`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
    body: JSON.stringify({ eventId, reason: payload.reason?.trim() || null }),
  });

  const data = await res.json().catch(() => ({ status: "error" }));
  return NextResponse.json(data, { status: res.ok ? 200 : 502 });
}
