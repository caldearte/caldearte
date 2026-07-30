import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseClient } from "@/lib/supabase-client";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SubscribePayload {
  email?: string;
  adminRegionName?: string;
}

function emailShell(bodyHtml: string): string {
  return `<div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:520px;margin:0 auto;">
    <div style="background:#1c1c1c;padding:28px 32px;border-radius:12px 12px 0 0;">
      <p style="margin:0;color:#fff;font-size:22px;font-weight:800;letter-spacing:0.02em;">CALDEARTE</p>
    </div>
    <div style="background:#fdf6e3;padding:32px;border-radius:0 0 12px 12px;">
      ${bodyHtml}
    </div>
    <p style="text-align:center;color:#999;font-size:12px;margin-top:20px;">Calendario de arte curado por inteligencia humana potenciada por IA</p>
  </div>`;
}

// Calls the newsletter-resubscribe Edge Function (service-role) when our
// own anon-key INSERT hits a unique-email conflict — the anon key can't
// tell an active row apart from a previously-unsubscribed one, or update
// either, so a real "I unsubscribed, let me back in" attempt needs
// service-role to actually reset the row. See that function's own file
// comment for the bug this fixes.
async function tryResubscribe(email: string, adminRegionName: string): Promise<{ confirmToken: string } | { alreadySubscribed: true } | null> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/newsletter-resubscribe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, adminRegionName }),
    });
    const data = (await res.json()) as { status: string; confirmToken?: string };
    if (data.status === "resubscribed" && data.confirmToken) return { confirmToken: data.confirmToken };
    if (data.status === "already_subscribed") return { alreadySubscribed: true };
    return null;
  } catch {
    return null;
  }
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
  const adminRegionName = payload.adminRegionName?.trim() ?? "";

  if (!EMAIL_PATTERN.test(email) || adminRegionName.length === 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[newsletter/subscribe] RESEND_API_KEY not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  let confirmToken = crypto.randomUUID().replace(/-/g, "");

  const { error: insertError } = await getSupabaseClient()
    .from("newsletter_subscribers")
    .insert({ email, admin_region_name: adminRegionName, confirm_token: confirmToken });

  if (insertError) {
    if (insertError.code === "23505") {
      const resubscribed = await tryResubscribe(email, adminRegionName);
      if (resubscribed && "alreadySubscribed" in resubscribed) {
        return NextResponse.json({ status: "already_subscribed" });
      }
      if (resubscribed) {
        confirmToken = resubscribed.confirmToken;
      } else {
        console.error("[newsletter/subscribe] resubscribe attempt failed");
        return NextResponse.json({ error: "insert_failed" }, { status: 500 });
      }
    } else {
      console.error("[newsletter/subscribe] insert failed", insertError);
      return NextResponse.json({ error: "insert_failed" }, { status: 500 });
    }
  }

  // Points at our own page, not the Edge Function's URL directly — Supabase
  // Edge Functions can't serve real HTML (see newsletter-confirm's own file
  // comment), so /newsletter/confirmar calls the function server-side and
  // renders a proper page instead.
  const confirmUrl = `https://www.caldearte.com/newsletter/confirmar?token=${encodeURIComponent(confirmToken)}`;

  const resend = new Resend(apiKey);
  const { error: sendError } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: email,
    subject: "Confirma tu suscripción a Caldearte",
    text: `Para recibir el newsletter semanal de Caldearte, confirma tu suscripción:\n\n${confirmUrl}\n\nSi no fuiste tú, ignora este correo.`,
    html: emailShell(`
      <h1 style="margin:0 0 12px;font-size:20px;color:#1c1c1c;">Un paso más</h1>
      <p style="margin:0 0 20px;font-size:14px;color:#555;line-height:1.5;">Confirma tu suscripción para empezar a recibir la semana en arte, cada lunes.</p>
      <a href="${confirmUrl}" style="display:inline-block;background:#1c1c1c;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px;">Confirmar suscripción</a>
      <p style="margin:24px 0 0;font-size:12px;color:#999;">Si no fuiste tú, ignora este correo.</p>
    `),
  });

  if (sendError) {
    console.error("[newsletter/subscribe] confirmation email failed", sendError);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ status: "pending_confirmation" });
}
