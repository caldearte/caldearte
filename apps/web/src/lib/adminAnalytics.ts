import { redirect } from "next/navigation";
import { auth, isAdminSession } from "@/lib/auth";

export interface AdminAnalyticsPayload {
  generatedAt: string;
  events: Array<{
    openingDate: string | null;
    runStart: string | null;
    runEnd: string | null;
    adminRegionName: string | null;
    pipeline: string | null;
  }>;
  outOfScopeSignals: Array<{
    createdAt: string;
    category: string;
    pipeline: string | null;
    adminRegionName: string | null;
  }>;
  pipelineComparison: Array<{
    pipeline: string;
    accepted: number;
    rejected: number;
    avgCostUsdPerEvent: number | null;
    totalCostUsd: number;
    approvalRate: number | null;
  }>;
  brightSources: Array<{
    url: string;
    lastFetchedAt: string | null;
    intervalDays: number | null;
    accepted: number;
    rejected: number;
    possiblyDead: boolean;
  }>;
  instagramSources: Array<{
    username: string;
    lastFetchedAt: string | null;
    intervalDays: number | null;
    accepted: number;
    rejected: number;
    possiblyDead: boolean;
    isInactive: boolean;
    consecutiveZeroYieldAtCap: number;
  }>;
  anthropicCostByDay: Array<{ date: string; amountUsd: number }>;
  apifyCostByDay: Array<{ date: string; amountUsd: number }>;
  // Real cross-source conflicts sitting unreviewed — the email half of
  // this flow (accept/reject tokens) was never wired up. A bare count,
  // no detail view yet (real gap found 2026-08-17, see FuentesPage.tsx).
  pendingEscalationsCount: number;
  // "Cobertura" — last 90 days, one row per curator run, real outcome
  // funnel per run (see run-summary-store.ts). Real gap found
  // 2026-08-17: this data was already computed every run, it just fed a
  // summary email whose Resend half was never wired up.
  discoveryRunSummaries: Array<{
    entrypoint: "event_discovery" | "headless" | "instagram" | "google_alerts";
    startedAt: string;
    candidatesTotal: number;
    approvedByCuration: number;
    rejectedByCuration: number;
    insertedCount: number;
    replacedCount: number;
    duplicateSkippedCount: number;
    escalatedCount: number;
    expiredCount: number;
    insertFailedCount: number;
    costUsd: number;
  }>;
}

// Shared by every /admin/* page — same auth gate + fetch, extracted
// 2026-08-16 when the cost history chart moved to its own /admin/costos
// route so both pages didn't duplicate this boilerplate. Deliberately
// server-only (redirect(), env vars, the shared x-admin-secret) — never
// import this from a client component.
export async function requireAdminSession(): Promise<void> {
  const session = await auth();
  if (!isAdminSession(session)) {
    redirect("/login");
  }
}

export async function fetchAdminAnalytics(): Promise<AdminAnalyticsPayload | { error: string }> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminSecret = process.env.ADMIN_ACTIONS_SECRET;
  if (!supabaseUrl || !adminSecret) {
    return { error: "NEXT_PUBLIC_SUPABASE_URL o ADMIN_ACTIONS_SECRET no configurados." };
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/admin-analytics`, {
    headers: { "x-admin-secret": adminSecret },
    cache: "no-store",
  });

  if (!res.ok) {
    return { error: `admin-analytics respondió ${res.status}.` };
  }

  return (await res.json()) as AdminAnalyticsPayload;
}
