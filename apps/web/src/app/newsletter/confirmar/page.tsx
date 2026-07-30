import { redirect } from "next/navigation";
import type { NewsletterStatus } from "@/components/NewsletterStatusModal";

// The actual confirm happens in the newsletter-confirm Edge Function
// (service-role, same trust boundary as curation-escalation-decide) —
// this page just calls it server-side, then redirects to the home page
// with the result, where NewsletterStatusModal shows it as a real modal
// instead of a bare status page. Edge Functions can't serve HTML
// themselves (a GET response with content-type text/html gets silently
// rewritten to text/plain by the platform), so this proxy step is
// required either way — landing back on the real site is strictly better
// than a lone confirmation page.
async function confirmSubscription(token: string): Promise<NewsletterStatus> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return "error";

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/newsletter-confirm?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { status: NewsletterStatus };
    return data.status;
  } catch {
    return "error";
  }
}

export default async function ConfirmarNewsletterPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const status = token ? await confirmSubscription(token) : "invalid";
  redirect(`/?newsletter=${status}`);
}
