import { ipAddress } from "@vercel/functions";

// Backs /api/contact, /api/newsletter/subscribe, /api/submit-event and
// /api/track — see the
// check_rate_limit Postgres function (migration 20260731160000) for the
// actual counting logic. `ipAddress()` reads Vercel's own `x-real-ip`
// header, set by Vercel's proxy and not spoofable by the client (unlike
// trusting a bare `x-forwarded-for` from the request) — undefined locally
// (no Vercel proxy in dev), which the caller must handle by falling back
// to a shared bucket rather than skipping the check entirely.
export function clientIp(request: Request): string {
  return ipAddress(request) ?? "unknown";
}

// Fails OPEN (returns true / "allowed") on any error — a rate-limit
// outage must never itself take down contact/signup, only a real abuse
// pattern should. Logged so a persistent failure is still visible.
//
// Goes through the rate-limit Edge Function with the shared
// x-admin-secret, not the check_rate_limit RPC with the anon key: since
// the 2026-11-22 security review (M1) anon can no longer EXECUTE it, so
// nobody holding the anon key can fill a visitor's bucket on purpose.
// The function only accepts the bucket prefixes used here (contact:,
// subscribe-ip:, subscribe-email:, submit-event:, track:).
const RATE_LIMIT_TIMEOUT_MS = 3000;

export async function isWithinRateLimit(bucketKey: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminSecret = process.env.ADMIN_ACTIONS_SECRET;
  if (!supabaseUrl || !adminSecret) {
    console.error("[rate-limit] NEXT_PUBLIC_SUPABASE_URL or ADMIN_ACTIONS_SECRET not set — failing open");
    return true;
  }
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/rate-limit`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-secret": adminSecret },
      body: JSON.stringify({ bucketKey, maxCount, windowSeconds }),
      signal: AbortSignal.timeout(RATE_LIMIT_TIMEOUT_MS),
    });
    const data = (await res.json().catch(() => null)) as { allowed?: boolean } | null;
    if (!res.ok || typeof data?.allowed !== "boolean") {
      console.error(`[rate-limit] rate-limit function answered ${res.status} — failing open`, data);
      return true;
    }
    return data.allowed;
  } catch (err) {
    console.error("[rate-limit] rate-limit function call failed — failing open", err);
    return true;
  }
}
