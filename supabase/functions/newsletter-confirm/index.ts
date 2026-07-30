// Newsletter double opt-in — confirmation endpoint. Reached from the
// confirmation link apps/web's /api/newsletter/subscribe route emails
// right after inserting the pending row. See docs/data-model.md's
// newsletter_subscribers entry and docs/roadmap.md's newsletter section
// for the full design.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function htmlResponse(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;">${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = url.searchParams.get("token");
  if (!token) return htmlResponse("<p>Falta el token.</p>", 400);

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: subscriber, error: fetchError } = await client
    .from("newsletter_subscribers")
    .select("id, confirmed_at, unsubscribed_at")
    .eq("confirm_token", token)
    .maybeSingle();

  if (fetchError) {
    console.error("newsletter-confirm: lookup failed", fetchError);
    return htmlResponse("<p>Ocurrió un error. Revisa los logs de la función.</p>", 500);
  }
  if (!subscriber) {
    return htmlResponse("<p>Este link de confirmación no es válido.</p>", 404);
  }
  if (subscriber.unsubscribed_at) {
    return htmlResponse("<p>Esta suscripción ya fue dada de baja.</p>");
  }
  if (subscriber.confirmed_at) {
    return htmlResponse("<h1>✅ Ya estabas suscrito</h1><p>Tu suscripción ya estaba confirmada.</p>");
  }

  const { error: updateError } = await client
    .from("newsletter_subscribers")
    .update({ confirmed_at: new Date().toISOString() })
    .eq("id", subscriber.id);

  if (updateError) {
    console.error("newsletter-confirm: update failed", updateError);
    return htmlResponse("<p>Ocurrió un error al confirmar. Revisa los logs de la función.</p>", 500);
  }

  return htmlResponse("<h1>✅ Listo</h1><p>Tu suscripción al newsletter de Caldearte quedó confirmada.</p>");
});
