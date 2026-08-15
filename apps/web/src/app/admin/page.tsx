import { redirect } from "next/navigation";
import { auth, isAdminSession } from "@/lib/auth";
import EventMetricsChart from "@/components/admin/EventMetricsChart";
import SourceComparisonTable from "@/components/admin/SourceComparisonTable";
import OutOfScopeTrends from "@/components/admin/OutOfScopeTrends";

export interface AdminAnalyticsPayload {
  weeks: number;
  generatedAt: string;
  eventMetrics: Array<{ week: string; inauguraciones: number; expos: number }>;
  pipelineComparison: Array<{
    pipeline: string;
    accepted: number;
    rejected: number;
    avgCostUsdPerEvent: number | null;
    totalCostUsd: number;
    approvalRate: number | null;
  }>;
  deadSourceAlerts: Array<{ url: string; lastFetchedAt: string | null; intervalDays: number | null; possiblyDead: boolean }>;
  regionCoverage: Array<{ regionName: string; count: number }>;
  outOfScopeTrends: Array<{ month: string; categories: Record<string, number> }>;
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
// the secret only ever travels server-to-server.
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

  const res = await fetch(`${supabaseUrl}/functions/v1/admin-analytics?weeks=12`, {
    headers: { "x-admin-secret": adminSecret },
    cache: "no-store",
  });

  if (!res.ok) {
    return <AdminPageShell error={`admin-analytics respondió ${res.status}.`} />;
  }

  const data = (await res.json()) as AdminAnalyticsPayload;

  return (
    <AdminPageShell>
      <section className="mb-12">
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Eventos por semana</h2>
        <EventMetricsChart data={data.eventMetrics} />
      </section>

      <section className="mb-12">
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Fuentes / pipelines</h2>
        <SourceComparisonTable comparison={data.pipelineComparison} deadSourceAlerts={data.deadSourceAlerts} regionCoverage={data.regionCoverage} />
      </section>

      <section>
        <h2 className="font-fragment-mono uppercase text-[18px] text-text-primary mb-4">Señales fuera de alcance</h2>
        <p className="font-geist text-[14px] text-text-primary/70 mb-4">
          Evidencia interna, no pública — acumulando datos para una futura decisión sobre ampliar el alcance de Caldearte
          (convocatorias, talleres, etc.).
        </p>
        <OutOfScopeTrends trends={data.outOfScopeTrends} />
      </section>
    </AdminPageShell>
  );
}

function AdminPageShell({ children, error }: { children?: React.ReactNode; error?: string }) {
  return (
    <main className="min-h-screen w-full bg-surface-sage px-[20px] py-8 md:px-[61px] max-w-[1280px] mx-auto">
      <h1 className="font-lato font-black leading-none text-brand-magenta text-[28px] mb-8">Métricas — admin</h1>
      {error ? <p className="font-geist text-[16px] text-red-700">{error}</p> : children}
    </main>
  );
}
