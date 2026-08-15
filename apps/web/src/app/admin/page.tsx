import { redirect } from "next/navigation";
import { auth, isAdminSession } from "@/lib/auth";
import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminMenu from "@/components/admin/AdminMenu";

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
  }>;
}

// Deliberately unlinked from Header/Footer/MenuDrawer — same posture as
// /login (see that page's own comment): the only way here is knowing this
// URL exists. This page itself calls auth() directly (unlike /login,
// which is a client component), which forces dynamic rendering — the
// right behavior here, unlike the home page's deliberate caching (see
// page.tsx's own comment on the Fast Origin Transfer incident): this is
// an admin-only page with no meaningful traffic volume to cache for.
//
// Fetches the admin-analytics Edge Function directly, server-side, with
// the shared x-admin-secret — no intermediate api/admin/* route needed,
// since a server component has no browser boundary to cross the way the
// existing remove-event/toggle-sensitive actions do (triggered by a
// client onClick). apps/web still never holds a service-role key itself;
// the secret only ever travels server-to-server. All bucketing/charting
// interactivity lives in the client AdminDashboard component below,
// operating on this one fetched payload — no re-fetch on toggle change.
export default async function AdminPage() {
  const session = await auth();
  if (!isAdminSession(session)) {
    redirect("/login");
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const adminSecret = process.env.ADMIN_ACTIONS_SECRET;
  if (!supabaseUrl || !adminSecret) {
    return <AdminPageShell error="NEXT_PUBLIC_SUPABASE_URL o ADMIN_ACTIONS_SECRET no configurados." />;
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/admin-analytics`, {
    headers: { "x-admin-secret": adminSecret },
    cache: "no-store",
  });

  if (!res.ok) {
    return <AdminPageShell error={`admin-analytics respondió ${res.status}.`} />;
  }

  const data = (await res.json()) as AdminAnalyticsPayload;

  return (
    <AdminPageShell>
      <AdminDashboard data={data} />
    </AdminPageShell>
  );
}

function AdminPageShell({ children, error }: { children?: React.ReactNode; error?: string }) {
  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <div className="flex items-center justify-between mb-8">
        <h1 className="font-lato font-black leading-none text-brand-magenta text-[28px]">Métricas — admin</h1>
        <AdminMenu />
      </div>
      {error ? <p className="font-geist text-[16px] text-red-700">{error}</p> : children}
    </main>
  );
}
