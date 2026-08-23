import AdminPageShell from "@/components/admin/AdminPageShell";
import CadenciaPage from "@/components/admin/CadenciaPage";
import { fetchAdminAnalytics, requireAdminSession } from "@/lib/adminAnalytics";

// Cadencia adaptativa de Instagram — nueva sección 2026-08-23 (Daniel,
// tras bajar el piso de 14 a 7 días): cuántas cuentas hay en cada tramo
// de la escalera y con qué calidad. Mismo auth gate + fetch que el resto
// de /admin/*.
export default async function AdminCadenciaPage() {
  await requireAdminSession();

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell title="Cadencia — admin" error={result.error} />;
  }

  return (
    <AdminPageShell title="Cadencia — admin">
      <CadenciaPage instagramSources={result.instagramSources} />
    </AdminPageShell>
  );
}
