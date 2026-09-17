// Safety net on Haiku's approvals (Daniel, 2026-09-16): the shadow
// pilot's finding was that every wrong approval he removed by hand since
// 2026-09-04 (Falun Gong ×2, circus ×2, Sewell, Los archivos de Gabriela,
// Osvaldo Cáceres) was one the shadow model had rejected, and that it
// never once rejected something Haiku was right to approve — while
// comparing it on the ~85% of posts Haiku rejects produced nothing
// actionable and cost ~$3/month. So the full parallel shadow on the
// Instagram batch is replaced by this: only the items Haiku APPROVED go
// to the second model, with the exact same prompt, and a scope rejection
// from it turns the approval into a rejection before anything is
// inserted. ~20 items a day instead of ~150 (≈ $1/month). Daniel asked
// for no human in the loop ("si minimax rechaza lo quitas no más"), so
// the veto is automatic — but bounded:
//   - only a SCOPE call vetoes. A rejection that carries the code
//     filters' own marker ([FILTRO DE CÓDIGO …]) means the second model
//     approved the event and merely extracted dates/completeness
//     differently — that's not a disagreement about what the event is.
//   - an item the second model returned nothing for (a short chunk, a
//     failed call) keeps Haiku's verdict. The second model's failure
//     never removes anything.
//   - an item with several approved candidates (additionalEvents) is
//     vetoed only if the second model approved NONE of them.
// The veto is recorded the same way any rejection is (rejected_candidates
// with the reasoning, prefixed so it's recognisable, and the second
// model's rejectionAxis so the axis safety net still applies), which also
// keeps the item out of curation on later runs. The comparison row goes
// to shadow_curation_comparisons under its own label so /admin can keep
// counting agreements; the bright-source pipeline keeps its full shadow
// (one call per source, negligible) untouched.
import type { CurateResult, EventCandidate, MessagesClient } from "../event-discovery/discover.js";
import type { BrightSourceItem } from "../event-discovery/extractors.js";
import { runShadowCuration, type ShadowClient } from "./model-comparison.js";

export const SAFETY_NET_LABEL = "instagram_safety_net";
const CODE_FILTER_MARKER = "[FILTRO DE CÓDIGO";

export interface SafetyNetVeto {
  sourceUrl: string;
  reasoning: string;
  rejectionAxis: EventCandidate["rejectionAxis"];
}

// Pure: which of Haiku's approved source URLs the second model rejected
// on scope. Exported for tests.
export function safetyNetVetoes(realCandidates: readonly EventCandidate[], shadowCandidates: readonly EventCandidate[]): SafetyNetVeto[] {
  const approvedUrls = new Set(realCandidates.filter((c) => c.status === "approved" && c.sourceUrl).map((c) => c.sourceUrl as string));
  const vetoes: SafetyNetVeto[] = [];
  for (const sourceUrl of approvedUrls) {
    const shadowForUrl = shadowCandidates.filter((c) => c.sourceUrl === sourceUrl);
    if (shadowForUrl.length === 0) continue;
    if (shadowForUrl.some((c) => c.status === "approved")) continue;
    const scopeRejection = shadowForUrl.find((c) => !c.curationReasoning.includes(CODE_FILTER_MARKER));
    if (!scopeRejection) continue;
    vetoes.push({ sourceUrl, reasoning: scopeRejection.curationReasoning, rejectionAxis: scopeRejection.rejectionAxis });
  }
  return vetoes;
}

// Mutates the vetoed candidates in place (status, reasoning, axis) so the
// existing insert path records them as rejections. Returns how many
// candidates were vetoed. Never throws.
export async function applySafetyNet(
  shadow: ShadowClient,
  candidates: EventCandidate[],
  items: readonly BrightSourceItem[],
  curateFn: (client: MessagesClient, items: BrightSourceItem[]) => Promise<CurateResult>,
): Promise<number> {
  const approved = candidates.filter((c) => c.status === "approved" && c.sourceUrl);
  if (approved.length === 0) return 0;
  const approvedUrls = new Set(approved.map((c) => c.sourceUrl as string));
  const reviewItems = items.filter((item) => approvedUrls.has(item.sourceUrl));
  if (reviewItems.length === 0) return 0;

  let shadowCandidates: EventCandidate[] | null = null;
  await runShadowCuration("instagram", SAFETY_NET_LABEL, shadow, approved, async (client) => {
    const result = await curateFn(client, reviewItems);
    shadowCandidates = result.candidates;
    return result;
  });
  if (!shadowCandidates) {
    console.log(`[instagram-discovery][safety-net] ${shadow.model} returned nothing for ${reviewItems.length} approved item(s) — keeping Haiku's verdicts`);
    return 0;
  }

  const vetoes = safetyNetVetoes(candidates, shadowCandidates);
  let vetoed = 0;
  for (const veto of vetoes) {
    for (const c of candidates) {
      if (c.status !== "approved" || c.sourceUrl !== veto.sourceUrl) continue;
      console.log(`[instagram-discovery][safety-net] veto: "${c.title}" — ${shadow.model}: ${veto.reasoning} (Haiku: ${c.curationReasoning})`);
      c.status = "rejected";
      c.curationReasoning = `[VETO red de seguridad ${shadow.model}] ${veto.reasoning} — Haiku había aprobado: ${c.curationReasoning}`;
      c.rejectionAxis = veto.rejectionAxis;
      vetoed += 1;
    }
  }
  console.log(`[instagram-discovery][safety-net] ${reviewItems.length} approved item(s) reviewed by ${shadow.model}, ${vetoed} candidate(s) vetoed`);
  return vetoed;
}
