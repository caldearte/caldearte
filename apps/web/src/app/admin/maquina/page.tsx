import AdminPageShell from "@/components/admin/AdminPageShell";
import MaquinaDashboard from "@/components/admin/MaquinaDashboard";
import { fetchAdminAnalytics, requireAdminSession } from "@/lib/adminAnalytics";

// Fuentes + costos + red de seguridad in one page (Daniel, 2026-10-25);
// replaces /admin/fuentes, /admin/costos and /admin/modelo-sombra. Same
// auth gate + fetch as every /admin page.
export default async function AdminMaquinaPage() {
  await requireAdminSession();

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell title="Máquina — admin" error={result.error} />;
  }

  return (
    <AdminPageShell title="Máquina — admin">
      <MaquinaDashboard data={result} now={new Date()} />
    </AdminPageShell>
  );
}
