import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseClient } from "@/lib/supabase-client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SubscribePayload {
  email?: string;
  cityId?: string;
}

// Writes the pending row with the anon key (never service_role — see
// apps/web/src/lib/supabase-client.ts's assertAnonRole guard), gated by
// newsletter_subscribers' insert-only anon RLS policy (see the
// 20260730180000_add_newsletter_subscribers.sql migration). Sends the
// double opt-in confirmation email itself, same outbound-only Resend
// pattern as apps/web/src/app/api/contact/route.ts.
export async function POST(request: Request) {
  let payload: SubscribePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = payload.email?.trim() ?? "";
  const cityId = payload.cityId?.trim() ?? "";

  if (!EMAIL_PATTERN.test(email) || cityId.length === 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const functionsUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!apiKey || !functionsUrl) {
    console.error("[newsletter/subscribe] RESEND_API_KEY or NEXT_PUBLIC_SUPABASE_URL not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const confirmToken = crypto.randomUUID().replace(/-/g, "");

  const { error: insertError } = await getSupabaseClient()
    .from("newsletter_subscribers")
    .insert({ email, city_id: cityId, confirm_token: confirmToken });

  if (insertError) {
    // A unique-email conflict means this address already has a row (and
    // its own, different confirm_token) — the anon key only has INSERT on
    // this table (see the migration), so there's no way to look up or
    // resend that original token here. Respond as if it worked (same
    // success copy either way, no confirmation email this time) rather
    // than erroring or leaking whether the email is already subscribed.
    if (insertError.code === "23505") {
      return NextResponse.json({ ok: true });
    }
    console.error("[newsletter/subscribe] insert failed", insertError);
    return NextResponse.json({ error: "insert_failed" }, { status: 500 });
  }

  const confirmUrl = `${functionsUrl}/functions/v1/newsletter-confirm?token=${encodeURIComponent(confirmToken)}`;

  const resend = new Resend(apiKey);
  const { error: sendError } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: email,
    subject: "Confirma tu suscripción a Caldearte",
    text: `Para recibir el newsletter semanal de Caldearte, confirma tu suscripción:\n\n${confirmUrl}\n\nSi no fuiste tú, ignora este correo.`,
    html: `<p>Para recibir el newsletter semanal de Caldearte, confirma tu suscripción:</p><p><a href="${confirmUrl}">${confirmUrl}</a></p><p>Si no fuiste tú, ignora este correo.</p>`,
  });

  if (sendError) {
    console.error("[newsletter/subscribe] confirmation email failed", sendError);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
