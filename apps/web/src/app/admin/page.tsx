import AdminPageShell from "@/components/admin/AdminPageShell";
import MisionDashboard from "@/components/admin/MisionDashboard";
import { fetchAdminAnalytics, requireAdminSession } from "@/lib/adminAnalytics";
import { computeMision, regionCoverage } from "@/lib/misionKpis";
import { ADMIN_REGION_NAMES } from "@/lib/regionNames";

// Deliberately unlinked from Header/Footer/MenuDrawer — same posture as
// /login (see that page's own comment): the only way here is knowing this
// URL exists. This page itself calls auth() directly (via
// requireAdminSession), which forces dynamic rendering — the right
// behavior here, unlike the home page's deliberate caching (see that
// page.tsx's own comment on the Fast Origin Transfer incident): this is
// an admin-only page with no meaningful traffic volume to cache for.
//
// Fetches the admin-analytics Edge Function directly, server-side, with
// the shared x-admin-secret — no intermediate api/admin/* route needed.
// apps/web still never holds a service-role key itself; the secret only
// ever travels server-to-server.
//
// Since 2026-10-25 this is the Misión page (Daniel): KPIs against the
// June 2027 goals, venue kind, coverage by región. It has no period
// toggle and no client JS, so everything is computed here on the server.
export default async function AdminPage() {
  await requireAdminSession();

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell title="Misión — admin" error={result.error} />;
  }

  const now = new Date();
  return (
    <AdminPageShell title="Misión — admin">
      <MisionDashboard mision={computeMision(result, now)} regions={regionCoverage(result.events, ADMIN_REGION_NAMES, now)} />
    </AdminPageShell>
  );
}
