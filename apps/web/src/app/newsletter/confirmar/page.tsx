import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

type Status = "confirmed" | "already_confirmed" | "unsubscribed" | "invalid" | "error";

// The actual confirm happens in the newsletter-confirm Edge Function
// (service-role, same trust boundary as curation-escalation-decide) —
// this page just calls it server-side and renders a real HTML result.
// Supabase Edge Functions can't serve HTML themselves (a GET response with
// content-type text/html gets silently rewritten to text/plain by the
// platform, so a browser hitting the function URL directly shows raw
// source instead of a page) — see the function's own file comment.
async function confirmSubscription(token: string): Promise<Status> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return "error";

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/newsletter-confirm?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { status: Status };
    return data.status;
  } catch {
    return "error";
  }
}

export default async function ConfirmarNewsletterPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const status = token ? await confirmSubscription(token) : "invalid";

  const message =
    status === "confirmed"
      ? esCL.newsletter.confirmar.confirmed
      : status === "already_confirmed"
        ? esCL.newsletter.confirmar.alreadyConfirmed
        : status === "unsubscribed"
          ? esCL.newsletter.confirmar.unsubscribed
          : status === "invalid"
            ? esCL.newsletter.confirmar.invalid
            : esCL.newsletter.confirmar.error;

  return (
    <main className="min-h-screen w-full bg-white px-4 py-8 md:px-[61px] max-w-[720px] mx-auto text-center">
      <Link href="/" className="text-sm text-muted-gray">
        ← {esCL.appName}
      </Link>
      <h1 className="text-3xl font-black text-heading-gray mt-6 mb-4">{esCL.newsletter.confirmar.title}</h1>
      <p className="text-sm text-muted-gray">{message}</p>
    </main>
  );
}
