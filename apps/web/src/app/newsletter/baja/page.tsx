import { redirect } from "next/navigation";
import type { NewsletterStatus } from "@/components/NewsletterStatusModal";

// Same pattern as /newsletter/confirmar — the actual mutation happens in
// the newsletter-unsubscribe Edge Function (service-role); this page just
// calls it server-side and redirects to the home page with the result,
// where NewsletterStatusModal renders it as a real modal. Reached from
// every weekly digest's List-Unsubscribe link
// (apps/curator/src/lib/notify.ts).
async function unsubscribe(token: string): Promise<NewsletterStatus> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return "error";

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/newsletter-unsubscribe?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { status: NewsletterStatus };
    return data.status;
  } catch {
    return "error";
  }
}

export default async function BajaNewsletterPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const status = token ? await unsubscribe(token) : "invalid";
  redirect(`/?newsletter=${status}`);
}
