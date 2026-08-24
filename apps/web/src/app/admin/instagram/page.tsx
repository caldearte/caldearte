import AdminPageShell from "@/components/admin/AdminPageShell";
import InstagramPage from "@/components/admin/InstagramPage";
import { fetchAdminAnalytics, requireAdminSession } from "@/lib/adminAnalytics";

// Sección dedicada de Instagram (Daniel 2026-08-24) — mismo patrón que
// /admin/eventos y /admin/fuentes: auth gate + fetch server-side, detalle
// interactivo en un client component propio.
export default async function AdminInstagramPage() {
  await requireAdminSession();

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell title="Instagram — admin" error={result.error} />;
  }

  return (
    <AdminPageShell title="Instagram — admin">
      <InstagramPage instagramPosts={result.instagramPosts} instagramAccountSnapshots={result.instagramAccountSnapshots} />
    </AdminPageShell>
  );
}
