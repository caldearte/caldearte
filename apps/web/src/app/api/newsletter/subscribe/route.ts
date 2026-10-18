import { NextResponse } from "next/server";
import { Resend } from "resend";
import { getSupabaseClient } from "@/lib/supabase-client";
import { clientIp, isWithinRateLimit } from "@/lib/rate-limit";
import { isValidEmail } from "@/lib/email";
import { knownShortRegionName } from "@/lib/regionNames";

// Two separate limits: per-IP catches a script hammering this endpoint;
// per-email specifically stops this route being used to email-bomb a
// third party's inbox with repeated "confirm your subscription" emails
// (the actual real risk this closes off — see the security audit finding
// this fixes). Per-email is looser (legitimate re-subscribes/resends do
// happen) but still bounds it well below "keep emailing someone all day."
const IP_RATE_LIMIT_MAX = 5;
const IP_RATE_LIMIT_WINDOW_SECONDS = 3600;
const EMAIL_RATE_LIMIT_MAX = 3;
const EMAIL_RATE_LIMIT_WINDOW_SECONDS = 86400;

interface SubscribePayload {
  email?: string;
  adminRegionName?: string;
}

// Same look as the Thursday edition itself (apps/curator/src/lib/notify.ts's
// buildDigestHtmlBody, 2026-10-18): sage page, magenta CALDE/ARTE.
// wordmark, the site's slogan. Was a black header with plain text — the
// first email a new subscriber gets didn't look like the brand.
function emailShell(bodyHtml: string): string {
  const lato = "'Lato',Helvetica,Arial,sans-serif";
  return `<!doctype html>
<html lang="es-CL">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link href="https://fonts.googleapis.com/css2?family=Lato:wght@900&display=swap" rel="stylesheet" />
  </head>
  <body style="margin:0;padding:0;background:#d7dfe2;">
    <div style="font-family:Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:28px 20px 32px;background:#d7dfe2;">
      <a href="https://www.caldearte.com" style="display:block;text-decoration:none;color:#ff00fb;font-family:${lato};font-weight:900;font-size:48px;line-height:0.92;">
        <span style="display:block;">CALDE</span>
        <span style="display:block;">ARTE.</span>
      </a>
      <p style="margin:14px 0 24px;color:#3d373d;font-family:${lato};font-weight:900;font-size:20px;">EL ARTE MÁS CERCA</p>
      <div style="background:#fff;border-radius:22px;padding:28px 24px;">
        ${bodyHtml}
      </div>
    </div>
  </body>
</html>`;
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
  const ipAllowed = await isWithinRateLimit(`subscribe-ip:${clientIp(request)}`, IP_RATE_LIMIT_MAX, IP_RATE_LIMIT_WINDOW_SECONDS);
  if (!ipAllowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let payload: SubscribePayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  const email = payload.email?.trim() ?? "";
  const adminRegionName = payload.adminRegionName?.trim() ?? "";

  if (!isValidEmail(email) || adminRegionName.length === 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  // Checked AFTER the format validation above (no point burning a rate-limit
  // slot on garbage input) but BEFORE any DB write or email send — this is
  // the check that actually stops the "email-bomb an arbitrary third party"
  // abuse case, since it's keyed on the target address itself, not the
  // caller's IP.
  const emailAllowed = await isWithinRateLimit(`subscribe-email:${email.toLowerCase()}`, EMAIL_RATE_LIMIT_MAX, EMAIL_RATE_LIMIT_WINDOW_SECONDS);
  if (!emailAllowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
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

  // The región as the rest of the site names it ("Santiago"). Known names
  // only — it comes from the request, and the DB's CHECK constraint is
  // the only other thing standing between it and this email's HTML.
  const regionLabel = knownShortRegionName(adminRegionName) ?? "tu región";

  const resend = new Resend(apiKey);
  const { error: sendError } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: email,
    subject: "Confirma tu suscripción a Caldearte",
    // Same promise as the signup form (2026-10-16 weekend edition): what
    // arrives and when — it used to say "newsletter semanal".
    text: `Un paso más: confirma tu suscripción y cada jueves te llegarán las inauguraciones del fin de semana en ${regionLabel}.\n\n${confirmUrl}\n\nSi no fuiste tú, ignora este correo.`,
    html: emailShell(`
      <h1 style="margin:0 0 12px;font-family:'Lato',Helvetica,Arial,sans-serif;font-weight:900;font-size:24px;line-height:1.15;color:#ff00fb;text-transform:uppercase;">Un paso más</h1>
      <p style="margin:0 0 22px;font-size:16px;color:#3d373d;line-height:1.55;">Confirma tu suscripción y cada jueves te llegarán las inauguraciones del fin de semana en ${regionLabel}.</p>
      <a href="${confirmUrl}" style="display:inline-block;background:#ff00fb;color:#fff;padding:13px 24px;border-radius:999px;text-decoration:none;font-family:'Lato',Helvetica,Arial,sans-serif;font-weight:900;font-size:15px;">Confirmar suscripción</a>
      <p style="margin:24px 0 0;font-size:12px;color:#767f82;">Si no fuiste tú, ignora este correo.</p>
    `),
  });

  if (sendError) {
    console.error("[newsletter/subscribe] confirmation email failed", sendError);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ status: "pending_confirmation" });
}
