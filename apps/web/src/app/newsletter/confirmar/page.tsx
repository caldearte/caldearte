import { redirect } from "next/navigation";
import type { NewsletterStatus } from "@/components/NewsletterStatusModal";
import { sendWelcomeEmail } from "@/lib/sendWelcomeEmail";
import { welcomeRecipientFrom } from "@/lib/welcomeEmail";

// The actual confirm happens in the newsletter-confirm Edge Function
// (service-role, same trust boundary as the other token-gated functions) —
// this page just calls it server-side, then redirects to the home page
// with the result, where NewsletterStatusModal shows it as a real modal
// instead of a bare status page. Edge Functions can't serve HTML
// themselves (a GET response with content-type text/html gets silently
// rewritten to text/plain by the platform), so this proxy step is
// required either way — landing back on the real site is strictly better
// than a lone confirmation page.
// The function also hands back the subscriber's email and región, only on
// a first-time "confirmed" — this page's anon key can't read
// newsletter_subscribers, and the welcome email needs both.
interface ConfirmResponse {
  status: NewsletterStatus;
  email?: string;
  adminRegionName?: string;
}

async function confirmSubscription(token: string): Promise<ConfirmResponse> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return { status: "error" };

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/newsletter-confirm?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    return (await res.json()) as ConfirmResponse;
  } catch {
    return { status: "error" };
  }
}

export default async function ConfirmarNewsletterPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const result = token ? await confirmSubscription(token) : { status: "invalid" as const };
  // Welcome email (2026-10-18), first confirm only — see
  // welcomeRecipientFrom. Awaited before the redirect: on Vercel, work left
  // running after the response is sent can be cut off.
  const recipient = welcomeRecipientFrom(token, result);
  if (recipient) await sendWelcomeEmail(recipient);
  redirect(`/?newsletter=${result.status}`);
}
