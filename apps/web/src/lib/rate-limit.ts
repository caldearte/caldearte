import { ipAddress } from "@vercel/functions";
import { getSupabaseClient } from "./supabase-client";

// Backs both /api/contact and /api/newsletter/subscribe — see the
// check_rate_limit Postgres function (migration 20260731160000) for the
// actual counting logic. `ipAddress()` reads Vercel's own `x-real-ip`
// header, set by Vercel's proxy and not spoofable by the client (unlike
// trusting a bare `x-forwarded-for` from the request) — undefined locally
// (no Vercel proxy in dev), which the caller must handle by falling back
// to a shared bucket rather than skipping the check entirely.
export function clientIp(request: Request): string {
  return ipAddress(request) ?? "unknown";
}

// Fails OPEN (returns true / "allowed") on any DB error — a rate-limit
// outage must never itself take down contact/signup, only a real abuse
// pattern should. Logged so a persistent failure is still visible.
export async function isWithinRateLimit(bucketKey: string, maxCount: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await getSupabaseClient().rpc("check_rate_limit", {
    p_bucket_key: bucketKey,
    p_max_count: maxCount,
    p_window_seconds: windowSeconds,
  });
  if (error) {
    console.error("[rate-limit] check_rate_limit failed — failing open", error);
    return true;
  }
  return data;
}
