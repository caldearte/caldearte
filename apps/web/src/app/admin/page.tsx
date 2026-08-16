import AdminDashboard from "@/components/admin/AdminDashboard";
import AdminPageShell from "@/components/admin/AdminPageShell";
import { fetchAdminAnalytics, requireAdminSession, type AdminAnalyticsPayload } from "@/lib/adminAnalytics";

// Deliberately unlinked from Header/Footer/MenuDrawer — same posture as
// /login (see that page's own comment): the only way here is knowing this
// URL exists. This page itself calls auth() directly (via
// requireAdminSession), which forces dynamic rendering — the right
// behavior here, unlike the home page's deliberate caching (see that
// page.tsx's own comment on the Fast Origin Transfer incident): this is
// an admin-only page with no meaningful traffic volume to cache for.
//
// Fetches the admin-analytics Edge Function directly, server-side, with
// the shared x-admin-secret — no intermediate api/admin/* route needed,
// since a server component has no browser boundary to cross the way the
// existing remove-event/toggle-sensitive actions do (triggered by a
// client onClick). apps/web still never holds a service-role key itself;
// the secret only ever travels server-to-server. All bucketing/charting
// interactivity lives in the client AdminDashboard component below,
// operating on this one fetched payload — no re-fetch on toggle change.
export default async function AdminPage() {
  await requireAdminSession();

  const result = await fetchAdminAnalytics();
  if ("error" in result) {
    return <AdminPageShell error={result.error} />;
  }
  const data: AdminAnalyticsPayload = result;

  return (
    <AdminPageShell>
      <AdminDashboard data={data} />
    </AdminPageShell>
  );
}
