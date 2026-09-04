import AdminPageShell from "@/components/admin/AdminPageShell";
import ShadowModePage from "@/components/admin/ShadowModePage";
import { fetchAdminAnalytics, requireAdminSession } from "@/lib/adminAnalytics";

// Piloto de comparación de modelos (Daniel, 2026-09-04): métricas del
// modelo sombra (gratis, vía OpenRouter) que corre en paralelo a Haiku en
// fuentes brillantes e Instagram — ver apps/curator/src/lib/model-comparison.ts.
// Mismo patrón que /admin/costos: auth gate + fetch compartido, solo la
// sección de comparación en su propia página.
export default async function AdminModeloSombraPage() {
  await requireAdminSession();

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell title="Modelo sombra — admin" error={result.error} />;
  }

  return (
    <AdminPageShell title="Modelo sombra — admin">
      <ShadowModePage comparisons={result.shadowCurationComparisons} />
    </AdminPageShell>
  );
}
