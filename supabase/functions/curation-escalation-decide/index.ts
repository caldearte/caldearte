// Cross-source curation conflict escalation — resolution endpoint. First
// Edge Function in this repo. Reached from the two links in the email
// apps/curator's lib/notify.ts sends (sendEscalationEmail) when
// insertCandidates (apps/curator/src/event-discovery/run.ts) detects a
// new candidate whose decision conflicts with an already-decided event
// describing what's likely the same real thing from a different source.
// See docs/curation-policy.md's "Cross-source conflict escalation"
// section for the full design.
//
// Runs with the service_role key (set automatically by the Supabase
// platform for every Edge Function's own env — never touches
// Vercel/apps/web, which explicitly never holds this key, see
// apps/web/src/lib/supabase-client.ts's assertAnonRole guard) — this is
// deliberately the one place in the whole system allowed to bypass RLS
// and flip a `curation_status` outside the normal Event Discovery run.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function htmlResponse(body: string, status = 200): Response {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"></head><body style="font-family:sans-serif;max-width:480px;margin:80px auto;text-align:center;">${body}</body></html>`,
    { status, headers: { "content-type": "text/html; charset=utf-8" } },
  );
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const token = req.method === "POST" ? (await req.formData()).get("token")?.toString() : url.searchParams.get("token");
  if (!token) return htmlResponse("<p>Falta el token.</p>", 400);

  const client = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: escalation, error: fetchError } = await client
    .from("curation_escalations")
    .select("*")
    .or(`accept_token.eq.${token},reject_token.eq.${token}`)
    .is("resolved_at", null)
    .maybeSingle();

  if (fetchError) {
    console.error("curation-escalation-decide: lookup failed", fetchError);
    return htmlResponse("<p>Ocurrió un error. Revisa los logs de la función.</p>", 500);
  }
  if (!escalation) {
    return htmlResponse("<p>Este conflicto ya fue resuelto, o el link ya no es válido.</p>");
  }

  // The action is determined by WHICH token matched, never by a
  // client-supplied query param — a tampered ?action= in the URL can't
  // flip the decision the secret token itself represents.
  const action: "accept" | "reject" = escalation.accept_token === token ? "accept" : "reject";

  // GET only ever shows a confirmation page — it must never itself mutate
  // anything. Real risk this closes off: email link-scanners/prefetchers
  // (Outlook Safe Links, corporate mail gateways) commonly pre-fetch every
  // link in an incoming email via GET before a human ever sees it, which
  // would otherwise silently make this decision — the one place in the
  // whole system a human is specifically meant to weigh in on a real
  // conflict — without a human involved at all. The actual write only
  // happens below, on POST, triggered by the confirmation page's own
  // button click (which a link-prefetcher never does).
  if (req.method !== "POST") {
    const preview =
      action === "accept" ? `usar la versión nueva: "${escapeHtml(escalation.new_title)}"` : `mantener la versión anterior: "${escapeHtml(escalation.existing_title)}"`;
    return htmlResponse(`
      <h1>Confirmar decisión</h1>
      <p>Estás por ${preview}.</p>
      <form method="POST">
        <input type="hidden" name="token" value="${escapeHtml(token)}" />
        <button type="submit" style="font-size:16px;padding:10px 20px;cursor:pointer;">Confirmar</button>
      </form>
    `);
  }

  if (action === "accept") {
    // Apply the NEW candidate's decision.
    if (escalation.new_status === "approved") {
      const { error: insertError } = await client.from("events").insert(escalation.new_candidate_payload);
      if (insertError) {
        console.error("curation-escalation-decide: insert failed", insertError);
        return htmlResponse("<p>Ocurrió un error al insertar el evento. Revisa los logs de la función.</p>", 500);
      }
    } else if (escalation.existing_kind === "approved_event" && escalation.existing_event_id) {
      const { error: updateError } = await client
        .from("events")
        .update({
          curation_status: "rejected",
          curation_reasoning: `${escalation.existing_reasoning} [CORRECCIÓN MANUAL vía escalación ${new Date().toISOString().slice(0, 10)}: conflicto con una fuente distinta que reporta "${escalation.new_title}" — ver curation_escalations.id=${escalation.id}]`,
        })
        .eq("id", escalation.existing_event_id);
      if (updateError) {
        console.error("curation-escalation-decide: update failed", updateError);
        return htmlResponse("<p>Ocurrió un error al actualizar el evento. Revisa los logs de la función.</p>", 500);
      }
    }
    // existing_kind === "rejected_candidate" && new_status === "rejected"
    // never happens — that's not a conflict in the first place (both
    // sides already agree), so run.ts never escalates that combination.
  } else {
    // Keep the OLD decision as-is — just record the new candidate the
    // same way an ordinary rejection would be, so it stops re-triggering
    // this same escalation on a future run. Applies uniformly whether the
    // old side was approved (new candidate would have been approved too,
    // now recorded as rejected instead) or already rejected (new
    // candidate would have been approved, same outcome).
    const { error: upsertError } = await client.from("rejected_candidates").upsert(
      {
        source_url: escalation.new_source_url,
        title: escalation.new_title,
        reason: escalation.new_reasoning,
        created_at: new Date().toISOString(),
      },
      { onConflict: "source_url" },
    );
    if (upsertError) {
      console.error("curation-escalation-decide: reject upsert failed", upsertError);
      return htmlResponse("<p>Ocurrió un error al registrar el rechazo. Revisa los logs de la función.</p>", 500);
    }
  }

  const { error: resolveError } = await client
    .from("curation_escalations")
    .update({ resolved_at: new Date().toISOString(), resolution: action === "accept" ? "accepted" : "rejected" })
    .eq("id", escalation.id);
  if (resolveError) {
    // The actual decision (events/rejected_candidates write above) already
    // succeeded by this point — failing to mark resolved_at only risks a
    // stale-looking escalation row, not a wrong outcome. Logged, not fatal.
    console.error("curation-escalation-decide: failed to mark resolved", resolveError);
  }

  return htmlResponse(
    action === "accept"
      ? `<h1>✅ Listo</h1><p>Se aplicó la versión nueva: "${escapeHtml(escalation.new_title)}".</p>`
      : `<h1>✅ Listo</h1><p>Se mantuvo la versión anterior: "${escapeHtml(escalation.existing_title)}".</p>`,
  );
});
