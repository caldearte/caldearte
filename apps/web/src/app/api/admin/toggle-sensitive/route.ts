import { NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { auth, isAdminSession } from "@/lib/auth";
import { APPROVED_EVENTS_CACHE_TAG } from "@/lib/events";

interface ToggleSensitivePayload {
  eventId?: string;
}

// Only verifies identity/authorization here — the actual privileged write
// happens in the admin-toggle-sensitive Edge Function (service-role),
// same pattern as api/admin/remove-event/route.ts.
export async function POST(request: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  if (!isAdminSession(session)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  let payload: ToggleSensitivePayload;
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
    console.error("[admin/toggle-sensitive] NEXT_PUBLIC_SUPABASE_URL or ADMIN_ACTIONS_SECRET not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/admin-toggle-sensitive`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
    body: JSON.stringify({ eventId }),
  });

  const data = await res.json().catch(() => ({ status: "error" }));
  // { expire: 0 }: immediate expiration, same reasoning as
  // api/admin/remove-event/route.ts.
  // Pages now keep their HTML for an hour (home) or a day (fichas), and
  // a tag on unstable_cache data isn't guaranteed to reach the page entry
  // that rendered it — so purge every page too. Admin actions are rare;
  // each page just regenerates on its next visit.
  if (res.ok) {
    revalidateTag(APPROVED_EVENTS_CACHE_TAG, { expire: 0 });
    revalidatePath("/", "layout");
  }
  return NextResponse.json(data, { status: res.ok ? 200 : 502 });
}
