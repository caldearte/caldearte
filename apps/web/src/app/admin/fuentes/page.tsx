import AdminPageShell from "@/components/admin/AdminPageShell";
import FuentesPage from "@/components/admin/FuentesPage";
import { fetchAdminAnalytics, requireAdminSession } from "@/lib/adminAnalytics";

// Split out of the main /admin dashboard (Daniel's request, 2026-08-17) —
// same auth gate + fetch as /admin itself, just moves "Fuentes por
// pipeline" and its 3 companion tables to their own page.
export default async function AdminFuentesPage() {
  await requireAdminSession();

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell title="Fuentes — admin" error={result.error} />;
  }

  return (
    <AdminPageShell title="Fuentes — admin">
      <FuentesPage
        events={result.events}
        pipelineComparison={result.pipelineComparison}
        brightSources={result.brightSources}
        instagramSources={result.instagramSources}
        pendingEscalationsCount={result.pendingEscalationsCount}
      />
    </AdminPageShell>
  );
}
