// Newsletter unsubscribe endpoint. Reused: the subscriber's own
// confirm_token doubles as the unsubscribe token (one opaque value per
// subscriber is enough) — reached from every weekly digest's
// List-Unsubscribe link, built by apps/curator's lib/notify.ts
// (sendDigestEmail). See docs/data-model.md's newsletter_subscribers
// entry for the full design.
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
    .select("id, unsubscribed_at")
    .eq("confirm_token", token)
    .maybeSingle();

  if (fetchError) {
    console.error("newsletter-unsubscribe: lookup failed", fetchError);
    return htmlResponse("<p>Ocurrió un error. Revisa los logs de la función.</p>", 500);
  }
  if (!subscriber) {
    return htmlResponse("<p>Este link no es válido.</p>", 404);
  }
  if (subscriber.unsubscribed_at) {
    return htmlResponse("<h1>✅ Listo</h1><p>Ya estabas dado de baja.</p>");
  }

  const { error: updateError } = await client
    .from("newsletter_subscribers")
    .update({ unsubscribed_at: new Date().toISOString() })
    .eq("id", subscriber.id);

  if (updateError) {
    console.error("newsletter-unsubscribe: update failed", updateError);
    return htmlResponse("<p>Ocurrió un error al dar de baja. Revisa los logs de la función.</p>", 500);
  }

  return htmlResponse("<h1>✅ Listo</h1><p>Te diste de baja del newsletter de Caldearte. No recibirás más correos.</p>");
});
