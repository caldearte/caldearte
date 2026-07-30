import Link from "next/link";
import { esCL } from "@/i18n/es-CL";

type Status = "unsubscribed" | "already_unsubscribed" | "invalid" | "error";

// Same pattern as /newsletter/confirmar — the actual mutation happens in
// the newsletter-unsubscribe Edge Function (service-role); this page just
// calls it server-side and renders a real HTML result, since Edge
// Functions can't serve HTML themselves. Reached from every weekly
// digest's List-Unsubscribe link (apps/curator/src/lib/notify.ts).
async function unsubscribe(token: string): Promise<Status> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return "error";

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/newsletter-unsubscribe?token=${encodeURIComponent(token)}`, {
      cache: "no-store",
    });
    const data = (await res.json()) as { status: Status };
    return data.status;
  } catch {
    return "error";
  }
}

export default async function BajaNewsletterPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  const status = token ? await unsubscribe(token) : "invalid";

  const message =
    status === "unsubscribed"
      ? esCL.newsletter.baja.unsubscribed
      : status === "already_unsubscribed"
        ? esCL.newsletter.baja.alreadyUnsubscribed
        : status === "invalid"
          ? esCL.newsletter.baja.invalid
          : esCL.newsletter.baja.error;

  return (
    <main className="min-h-screen w-full bg-white px-4 py-8 md:px-[61px] max-w-[720px] mx-auto text-center">
      <Link href="/" className="text-sm text-muted-gray">
        ← {esCL.appName}
      </Link>
      <h1 className="text-3xl font-black text-heading-gray mt-6 mb-4">{esCL.newsletter.baja.title}</h1>
      <p className="text-sm text-muted-gray">{message}</p>
    </main>
  );
}
