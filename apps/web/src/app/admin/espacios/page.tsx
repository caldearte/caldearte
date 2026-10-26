import AdminPageShell from "@/components/admin/AdminPageShell";
import EspaciosPage from "@/components/admin/EspaciosPage";
import { fetchAdminAnalytics, requireAdminSession } from "@/lib/adminAnalytics";
import { parseKindFilter } from "@/lib/espaciosFilter";
import { ADMIN_REGION_NAMES } from "@/lib/regionNames";

// Venue catalog with an editable kind (Daniel, 2026-10-25) — same auth
// gate + fetch as every /admin page. `?tipo=sin_clasificar` is what the
// Misión page's "espacios sin clasificar" link opens.
export default async function AdminEspaciosPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  await requireAdminSession();
  const { tipo } = await searchParams;

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell title="Espacios — admin" error={result.error} />;
  }

  return (
    <AdminPageShell title="Espacios — admin">
      <EspaciosPage venues={result.venues ?? []} regions={ADMIN_REGION_NAMES} initialKind={parseKindFilter(tipo)} />
    </AdminPageShell>
  );
}
