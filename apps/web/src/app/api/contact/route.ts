import { NextResponse } from "next/server";
import { Resend } from "resend";
import { clientIp, isWithinRateLimit } from "@/lib/rate-limit";

const CONTACT_RECIPIENT = "daniel@probablespa.cl";
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// 5 messages/hour/IP — generous for a real visitor, tight enough to stop
// a script from flooding the inbox. See docs on check_rate_limit.
const RATE_LIMIT_MAX = 5;
const RATE_LIMIT_WINDOW_SECONDS = 3600;

interface ContactPayload {
  name?: string;
  email?: string;
  message?: string;
}

// Deliberately minimal: a single outbound-only relay ("visitor writes a
// message -> an email lands in my inbox"), not the full Flow 2 submission
// mailbox (token-correlated replies, inbound webhook parsing) that's still
// correctly deferred to Phase 1b — see docs/roadmap.md. Nothing is stored.
export async function POST(request: Request) {
  const allowed = await isWithinRateLimit(`contact:${clientIp(request)}`, RATE_LIMIT_MAX, RATE_LIMIT_WINDOW_SECONDS);
  if (!allowed) {
    return NextResponse.json({ error: "rate_limited" }, { status: 429 });
  }

  let payload: ContactPayload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  // Strips embedded CR/LF before this ever reaches the email subject/body
  // — Resend's own JSON API almost certainly already rejects header
  // injection server-side, but sanitizing at our own boundary is cheap
  // and doesn't depend on that (same layered-defense posture the rest of
  // this project already uses — real audit finding, 2026-08-17).
  const stripNewlines = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
  const name = stripNewlines(payload.name?.trim() || "Anónimo").slice(0, 200) || "Anónimo";
  const email = payload.email?.trim() ?? "";
  const message = payload.message?.trim() ?? "";

  if (!EMAIL_PATTERN.test(email) || message.length === 0) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    // Fails loudly rather than silently swallowing the message — a missing
    // key means the deploy's env vars aren't set yet (see the launch plan's
    // "what only you can do" list), not a normal runtime condition.
    console.error("[contact] RESEND_API_KEY is not set");
    return NextResponse.json({ error: "not_configured" }, { status: 500 });
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "Caldearte <contacto@caldearte.com>",
    to: CONTACT_RECIPIENT,
    replyTo: email,
    subject: `Caldearte — mensaje de ${name}`,
    text: `De: ${name} <${email}>\n\n${message}`,
  });

  if (error) {
    console.error("[contact] Resend send failed", error);
    return NextResponse.json({ error: "send_failed" }, { status: 502 });
  }

  return NextResponse.json({ ok: true });
}
