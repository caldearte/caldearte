import AdminPageShell from "@/components/admin/AdminPageShell";
import CostosPage from "@/components/admin/CostosPage";
import { fetchAdminAnalytics, requireAdminSession } from "@/lib/adminAnalytics";

// Split out of the main /admin dashboard (Daniel's request, 2026-08-16)
// — same auth gate + fetch as /admin itself (see lib/adminAnalytics.ts),
// just renders the cost-history section on its own page instead of a
// long scroll on the main dashboard.
export default async function AdminCostosPage() {
  await requireAdminSession();

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell title="Costos — admin" error={result.error} />;
  }

  return (
    <AdminPageShell title="Costos — admin">
      <CostosPage anthropicCostByDay={result.anthropicCostByDay} apifyCostByDay={result.apifyCostByDay} />
    </AdminPageShell>
  );
}
