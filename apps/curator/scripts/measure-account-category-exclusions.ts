// Phase 1 of the account×category exclusion plan (2026-10-02): a reusable,
// READ-ONLY report — never writes anything — that answers "if we filtered
// out candidates matching category X from account Y before they ever
// reach Haiku, how many real events would we have lost, ever?"
//
// Built after measuring by hand (ad-hoc SQL against discovery_run_summaries)
// that a BLIND keyword filter on taller/concierto/conversatorio/teatro/
// danza/circo/feria costs real events — 22 of 215 Instagram insertions in
// a 45-day window — but almost all of that volume actually comes from a
// small set of accounts that have NEVER once produced a real event in
// that category. This script formalizes that measurement so it can be
// re-run as the account registry grows, instead of re-typing SQL by hand
// each time.
//
// Reads two things:
//   - discovery_run_summaries.raw_summary (entrypoint='instagram'): every
//     candidate Haiku ever saw, with its real verdict (status/outcome).
//   - instagram_source_post_stats: post_url -> source_account, so a
//     candidate's sourceUrl can be attributed to the account that posted
//     it. This table only exists since 2026-09-19 (PR #568) — candidates
//     from before that date can't be attributed and are reported
//     separately as "sin atribuir", never silently dropped or guessed.
//
// Output is a report, nothing else. Turning it into an actual exclusion
// list is Phase 2 — a human-reviewed, static, in-code list (same posture
// as INSTAGRAM_ACCOUNTS/bright sources) — never generated or applied by
// this script automatically.
//
// Not wired into any cron/CI, same "run it yourself, read the output"
// posture as backfill-analytics-attribution.ts:
//
//   node --env-file=../../.env --import tsx scripts/measure-account-category-exclusions.ts
import { getSupabaseClient } from "../src/lib/supabase-client.js";

// Add a category here any time there's a new keyword worth measuring —
// this is the only place that needs to change to extend the analysis.
// These 8 are the ones already measured once by hand (2026-10-02) and
// deliberately left OUT of isCaptionWorthCurating's blind filter because
// of this same real-event risk.
const CATEGORIES = ["taller", "concierto", "charla", "conversatorio", "teatro", "danza", "circo", "feria"];

// Below this many rejections for a given account+category, there isn't
// enough signal to call an account "clean" — could just be luck. This is
// deliberately low; Phase 2's human review is the real safety net, not
// this number — it only decides what's worth a human looking at.
const MIN_SAMPLE_TO_FLAG = 2;

const PAGE_SIZE = 1000;

interface RawCandidate {
  status?: "approved" | "rejected";
  outcome?: string | null;
  title?: string;
  curationReasoning?: string;
  sourceUrl?: string | null;
}

interface FlatCandidate {
  status: "approved" | "rejected";
  outcome: string | null;
  title: string;
  reasoning: string;
  sourceUrl: string | null;
}

// Paginated — discovery_run_summaries already has 30+ instagram rows and
// will keep growing; a plain .select() silently truncates at Supabase's
// default 1000-row page once this history is old enough.
async function loadInstagramCandidates(): Promise<FlatCandidate[]> {
  const client = getSupabaseClient();
  const flat: FlatCandidate[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("discovery_run_summaries")
      .select("raw_summary")
      .eq("entrypoint", "instagram")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch discovery_run_summaries: ${error.message}`);
    if (!data || data.length === 0) break;

    for (const row of data) {
      const rawSummary = row.raw_summary as { eventGroups?: { candidates?: RawCandidate[] }[] } | null;
      for (const group of rawSummary?.eventGroups ?? []) {
        for (const c of group.candidates ?? []) {
          if (!c.status) continue;
          flat.push({
            status: c.status,
            outcome: c.outcome ?? null,
            title: (c.title ?? "").toLowerCase(),
            reasoning: (c.curationReasoning ?? "").toLowerCase(),
            sourceUrl: c.sourceUrl ?? null,
          });
        }
      }
    }
    if (data.length < PAGE_SIZE) break;
  }
  return flat;
}

async function loadAccountByPostUrl(): Promise<Map<string, string>> {
  const client = getSupabaseClient();
  const map = new Map<string, string>();
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await client
      .from("instagram_source_post_stats")
      .select("post_url, source_account")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`Failed to fetch instagram_source_post_stats: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const row of data) map.set(row.post_url, row.source_account);
    if (data.length < PAGE_SIZE) break;
  }
  return map;
}

interface AccountCategoryStats {
  rejected: number;
  insertedReal: number; // status=approved AND outcome=inserted — a genuinely NEW real event
}

function report(category: string, candidates: FlatCandidate[], accountByUrl: Map<string, string>): void {
  const matched = candidates.filter((c) => c.title.includes(category) || c.reasoning.includes(category));
  const byAccount = new Map<string, AccountCategoryStats>();
  const unattributed: AccountCategoryStats = { rejected: 0, insertedReal: 0 };

  for (const c of matched) {
    const account = c.sourceUrl ? accountByUrl.get(c.sourceUrl) : undefined;
    const bucket = account ? (byAccount.get(account) ?? { rejected: 0, insertedReal: 0 }) : unattributed;
    if (c.status === "rejected") bucket.rejected += 1;
    if (c.status === "approved" && c.outcome === "inserted") bucket.insertedReal += 1;
    if (account) byAccount.set(account, bucket);
  }

  const withRealEvents = [...byAccount.entries()].filter(([, s]) => s.insertedReal > 0);
  const safeCandidates = [...byAccount.entries()]
    .filter(([, s]) => s.insertedReal === 0 && s.rejected >= MIN_SAMPLE_TO_FLAG)
    .sort((a, b) => b[1].rejected - a[1].rejected);
  const belowSample = [...byAccount.entries()].filter(([, s]) => s.insertedReal === 0 && s.rejected < MIN_SAMPLE_TO_FLAG);

  console.log(`\n=== "${category}" — ${matched.length} candidato(s) total(es), ${byAccount.size} cuenta(s) atribuida(s) ===`);

  if (withRealEvents.length > 0) {
    console.log(`  NUNCA excluir (produjeron evento(s) real(es)):`);
    for (const [account, s] of withRealEvents) {
      console.log(`    - ${account}: ${s.insertedReal} real(es) insertado(s), ${s.rejected} rechazo(s)`);
    }
  }

  if (safeCandidates.length > 0) {
    const totalRejections = safeCandidates.reduce((n, [, s]) => n + s.rejected, 0);
    console.log(`  Candidatas a exclusión (0 eventos reales, >= ${MIN_SAMPLE_TO_FLAG} rechazos) — ${safeCandidates.length} cuenta(s), ${totalRejections} rechazo(s) evitable(s):`);
    for (const [account, s] of safeCandidates) {
      console.log(`    - ${account}: ${s.rejected} rechazo(s), 0 reales`);
    }
  }

  if (belowSample.length > 0) {
    console.log(`  Bajo el umbral de muestra (< ${MIN_SAMPLE_TO_FLAG} rechazos, no evaluadas aún): ${belowSample.length} cuenta(s)`);
  }

  if (unattributed.rejected > 0 || unattributed.insertedReal > 0) {
    console.log(
      `  ⚠ Sin atribuir (post anterior a 2026-09-19 o fuera de instagram_source_post_stats): ${unattributed.rejected} rechazo(s), ${unattributed.insertedReal} inserción(es) real(es) — NO se puede decidir exclusión sin saber la cuenta`,
    );
  }
}

async function main() {
  console.log("[measure] loading Instagram candidates and post->account attribution...");
  const [candidates, accountByUrl] = await Promise.all([loadInstagramCandidates(), loadAccountByPostUrl()]);
  console.log(`[measure] ${candidates.length} candidate(s) loaded, ${accountByUrl.size} post(s) with known account attribution`);

  for (const category of CATEGORIES) {
    report(category, candidates, accountByUrl);
  }

  console.log("\n[measure] fin del reporte — esto no escribió nada. Pasar los resultados a una lista de exclusión es una decisión humana aparte (Fase 2).");
}

main().catch((err) => {
  console.error("[measure] fatal error:", err);
  process.exitCode = 1;
});
