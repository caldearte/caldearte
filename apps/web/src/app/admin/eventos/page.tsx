import AdminPageShell from "@/components/admin/AdminPageShell";
import EventosPage from "@/components/admin/EventosPage";
import { fetchAdminAnalytics, requireAdminSession } from "@/lib/adminAnalytics";

// Split out of the main /admin dashboard (Daniel's request, 2026-08-17) —
// same auth gate + fetch as /admin itself, just moves the historical
// event detail (Chile total + one block per región) to its own page so
// /admin can stay a quick current-period summary.
export default async function AdminEventosPage() {
  await requireAdminSession();

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell title="Eventos — admin" error={result.error} />;
  }

  return (
    <AdminPageShell title="Eventos — admin">
      <EventosPage events={result.events} />
    </AdminPageShell>
  );
}
