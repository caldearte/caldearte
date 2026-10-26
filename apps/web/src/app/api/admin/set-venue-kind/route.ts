import { NextResponse } from "next/server";
import { auth, isAdminSession } from "@/lib/auth";
import { isVenueKind } from "@/lib/misionKpis";

interface SetVenueKindPayload {
  venueId?: string;
  kind?: string | null;
}

// Only verifies identity/authorization here — the actual privileged write
// happens in the admin-set-venue-kind Edge Function (service-role), same
// pattern as api/admin/toggle-sensitive/route.ts. No cache revalidation:
// venues.kind is private, nothing public renders it.
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: SetVenueKindPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const venueId = payload.venueId?.trim() ?? "";
  const kind = payload.kind ?? null;
  if (!venueId || (kind !== null && !isVenueKind(kind))) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminSecret = process.env.ADMIN_ACTIONS_SECRET;
  if (!supabaseUrl || !adminSecret) {
    console.error("[admin/set-venue-kind] NEXT_PUBLIC_SUPABASE_URL or ADMIN_ACTIONS_SECRET not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/admin-set-venue-kind`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
    body: JSON.stringify({ venueId, kind }),
  });

  const data = await res.json().catch(() => ({ status: "error" }));
  return NextResponse.json(data, { status: res.ok ? 200 : 502 });
}
