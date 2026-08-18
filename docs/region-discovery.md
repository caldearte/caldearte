# Caldearte — Region Discovery, Event Discovery & Cost Governance

Which units (cities/comunas) get searched, how Event Discovery searches and
curates them, and the cost-governance system that keeps it bounded. This
document is required reading before touching any of it.

## Event Discovery — Tavily + Haiku, events only, no venues

Event Discovery is implemented and in production
(`apps/curator/src/event-discovery/`). It never produces or touches venues
at all — there is no venue entity in the schema. Events have a `location`
(always freeform text); there is no venue-matching, no venue category
gating, nothing.

### Search: Tavily, not Anthropic's web_search tool

**Why the switch:** real side-by-side comparison showed Anthropic's
`web_search` returning mostly title/URL with no real content, and missing
social media coverage entirely — which matters directly since informal/
street events are often *only* announced on Instagram/Facebook. Tavily's
results include substantial page content (sometimes full article text) and
do surface Instagram/Facebook posts directly, with real dates/addresses in
the result content itself.

**Real API-level finding:** the official `@tavily/core` npm SDK (v0.7.6)
silently drops per-result `images` even when `includeImages`/
`includeImageDescriptions` are requested — confirmed by comparing the SDK's
parsed response against a raw REST call to the same endpoint with identical
parameters, which does return them. Per-result images are the whole point
here (see "Images" below), so the design bypasses the SDK and calls the
REST API directly with plain `fetch`.

**Three fixed queries per unit**, in the region's language, with the
current month/year substituted:
- `inauguracion arte <unidad> <mes año>`
- `exposicion arte <unidad> <mes año>`
- `intervencion artistica <unidad> <mes año>`

Tested empirically whether 2 of the 3 would suffice (reusing already-logged
data, no extra Tavily cost): dropping any one query loses 20-32% of unique
results across real test units, including titles that were genuine,
otherwise-approved candidates. All 3 stay.

**Tavily request parameters** (validated real shape):
`search_depth: "advanced"` (tested `"basic"` manually — noticeably worse
results, not worth the cost difference, which turned out to be
negligible anyway), `country: "chile"` (costs 2 credits instead of 1, but
eliminates wrong-country noise — worth it, see "Location" below),
`max_results: 20` (confirmed via Tavily's own docs: a fixed API ceiling,
not plan-dependent — no paid tier removes it), `start_date` (first day of
the target month), `chunks_per_source: 1`, `exclude_domains` (known bright
sources — see below, avoids paying to re-discover what's fetched directly),
`include_images` + `include_image_descriptions` (both real, load-bearing —
see "Images").

**Cost filter, confirmed with real data:** results with Tavily's own
`score < 0.15` are dropped before ever reaching Haiku. Checked directly
against real logged data (180 raw results, 25 below this threshold) — none
of the 25 ever became a candidate Haiku reported, meaning it was already
ignoring this content on its own. Pure token savings, no observed loss.

**Within-run dedup:** by URL across a unit's 3 queries (the same result
often surfaces under more than one query template — wasteful to send twice
with zero new information), and by normalized title (accents/quotes/
title-subtitle-separator punctuation stripped) across *all* of a run's
curate() calls combined (every unit plus the separate bright-sources pass)
— real duplicates found and fixed this way: "Poética de las aguas"
reported once via a unit's own search and once via a bright source, same
event; and (2026-07-18) "Una metáfora verde - arte, activismo y
solidaridad" vs "Una metáfora verde: arte, activismo y solidaridad", same
event, one source used a hyphen and the other a colon as the
title/subtitle separator.

**Cross-run dedup, before inserting into `events`:** three independent
keys, any one is enough to skip a candidate as a duplicate of something
already in the calendar — normalized title, `sourceUrl`, and (added
2026-07-18) a location+date fingerprint (normalized `location` + either
`openingDatetime`, or `runStartDate`+`runEndDate` when there's no opening).
The third key exists because of a real bug: the same San Felipe exhibition,
posted by 3 different accounts (2 Instagram, 1 Facebook), got 3
differently-punctuated titles ("SALa FEM 2026" / "SAlaFEM2026" / "SalaFEM
2026") and 3 different sourceUrls — evading both existing keys — while
sharing the exact same location and opening time, which the new key
catches instead. See `apps/curator/src/event-discovery/run.ts`'s
`loadExistingKeys`/`insertCandidates` for the full reasoning per key.

### Curation: a single non-agentic Haiku call per unit

No `tools`/`web_search` — the concatenated search-results block *is* the
user message; Haiku only curates what's already given, one plain
`messages.create` call per unit (plus one more for the bright-sources
batch, see below). Applies the shared `ART_SCOPE_POLICY` +
`TEXT_CURATION_POLICY` (`apps/curator/src/lib/curation-policy.ts`, kept in
sync with [curation-policy.md](curation-policy.md)), plus:

- **Excludes convocatorias (open calls) and talleres (workshops)
  explicitly** — neither is an event happening, they're invitations to a
  future submission or a participatory class.
- **Location: whitelist, not blocklist, plus a country-name override.**
  Originally a blocklist of foreign countries — too narrow (misses any
  country not explicitly listed, e.g. an event that only says "Lima", never
  "Perú"). Switched to requiring the location text name a recognizable
  Chilean region/city/comuna (a ~100-entry reference list) or the word
  "Chile" itself — since a real event's whole point is telling people where
  to go, this should hold true ~90%+ of the time and doesn't penalize
  genuinely freeform locations (a plaza, a street corner), only ones that
  never identify anywhere checkable. **Real bug found and fixed:**
  "Recoleta" is both a real Santiago comuna and part of "Centro Cultural
  Recoleta, Buenos Aires, Argentina" — a pure whitelist let 3 real Argentine
  candidates through on a substring match. Fixed by checking an explicit
  foreign-country-name blocklist *first*, as an override, before the
  whitelist — belt and suspenders, not either/or. Also a deterministic
  **code-level backstop**, not just a prompt instruction — the prompt alone
  already failed once (same Recoleta case) before this was added.
- **Date rule: month-level, not day-level.** A candidate is discarded only
  if its run has already fully ended (by `runEndDate`, or `runStartDate` if
  no end is given) in a month *before* the target month — never simply
  because a specific date within the target month has already passed
  relative to today, and never because an opening lands in a later month
  (a real future event found incidentally is still valid). Real bug fixed:
  an August exhibition found via a July search was wrongly rejected for
  "falling outside the searched month" before this rule existed.
- **`status` is binary** (`approved`/`rejected`) — no `pending_review`
  escalation tier in this design (a simplification vs. the venue-era
  design's `ESCALATION_SIGNALS`).
- **Year-less dates from social media, real bug found 2026-07-18:** an
  Instagram reel with no year in its caption ("del 1 al 28 de julio") got
  approved as a July 2026 event — the post itself was from 2025-07-26
  (confirmed by decoding the Instagram shortcode's embedded timestamp),
  Tavily's `start_date` filter didn't catch it (unreliable for Instagram
  specifically, whose crawlable pages don't expose a real publish date),
  and Haiku defaulted the year-less date to the current month/year with no
  way to know better. Fixed with an explicit prompt instruction: for
  social-media sources (Instagram/Facebook/TikTok) giving day/month with no
  year, require some other freshness signal in the text (an explicit year,
  "hoy", "recién inaugurada," etc.) before assuming the current year —
  reject on ambiguity instead of defaulting to "now."
- **Explicit year overridden by the current year anyway, real bug found
  2026-07-18:** a culturaviva.cl page for "Roberto Matta: Del Trazo al
  Objeto" stated "13 de junio **2025**" multiple times, gave a schema.org
  `startDate`/`endDate` of 2025-06-13, and even carried the site's own
  "Este evento ha pasado" badge — yet Haiku still wrote `runStartDate:
  "2026-06-13"` and a fabricated `runEndDate` 3 months out, ignoring every
  signal that the year wasn't the current one. Worse than the year-less
  social-media case above: here the year *was* stated explicitly and got
  overridden anyway. Fixed with a hard rule in the prompt: an explicit year
  in the source always wins over the searched month, and an explicit "ya
  pasó"/"evento finalizado" style badge is a hard rejection regardless of
  how current the day/month looks.

**Output shape** (see [data-model.md](data-model.md)): `title`,
`description`, `artist`,
`runStartDate`/`runEndDate` (the exhibition's actual run), `openingDatetime`
(only when a real opening is confirmed), `mediumType`, `sensitivityTags`,
`curationReasoning`, `imageUrl`, `status`, `location` (freeform, always),
`sourceUrl`.

### Images

Tavily's `includeImages`/`includeImageDescriptions` return per-result image
URLs with alt text when available — real find: Instagram's own
auto-generated alt text is often genuinely descriptive ("Photo by Casa
Cultural Yanulaque... May be an illustration of poster and text that says
'CONFLUENCIAS II...'"), letting Haiku correctly distinguish a real flyer
photo from a profile picture or generic site asset. Filtering, in order:
drop obvious junk by filename (`logo`/`icon`/`favicon`/`footer`/`.svg`),
**require a non-null description** (images without alt text were almost
always unusable noise — profile pictures, generic assets — and this alone
cut token volume roughly 60% with no observed quality loss), cap to 4
images per search result (bright sources are exempt from this cap — their
image URLs are cheap, short, first-party paths, unlike long CDN URLs from
social platforms).

**Vision check (Axis 5) exists as reusable code (`lib/vision-check.ts`) but
is NOT wired into production Event Discovery today.** Its only caller
anywhere in the repo is the standalone PoC
(`apps/curator/scripts/poc-tavily-discover.ts`) — `discover.ts`/`sources.ts`/
`run.ts` never call `runVisionCheck`, so no image (Tavily-sourced or
otherwise) currently gets an Axis-5 explicit-content check before
publishing. Wiring it into production is a deliberate, separate editorial/
cost decision (it could newly reject currently-live events), not done yet.

What's validated so far, in the PoC: measured real cost ~$0.0003-0.0011 per
image — negligible, applying it to every event with an image would barely
move the budget. Two real bugs found and fixed in `defaultImageFetcher`
(shared code, not PoC-specific): (1) some servers append parameters to
`Content-Type` (`image/jpeg;charset=UTF-8`, e.g. `artes.uchile.cl`), which
Anthropic's API rejects outright — fixed by stripping everything after the
first `;`; (2) Instagram's CDN sometimes returns 403 on a direct
server-side fetch (hotlink protection) — not fixed (would need a different
fetch strategy/headers), but the PoC's vision step falls back to the next
available candidate image instead of failing the whole run.

### Prompt caching — implemented, currently inactive

`cache_control` is set on the system prompt in every curate() call. Real
measured result: `cache_write`/`cache_read` both come back 0 on every call
— the system prompt (~600-900 tokens) is below Haiku's minimum cacheable
prefix (2048 tokens), so Anthropic silently skips caching, no premium, no
discount, no-op either way. Not worth padding the prompt artificially to
cross that threshold. Would start working automatically, no code change
needed, if the prompt naturally grows past it later (e.g. if a large
location-reference list gets embedded directly in it).

### Real cost, measured

A full test run (3 units + the bright-sources pass) costs roughly
**$0.10-0.15** in Anthropic spend, plus a handful of Tavily credits (well
under its 1,000/month free tier even at the ~100-unit target scale
discussed below, run once a month). Enabling per-result images roughly
doubled token cost in one measured comparison (~$0.10 → ~$0.20 for the same
3 units) before the description-required image filter brought it back down
close to the original baseline. **Budget ceiling relaxed**: the original
$10/month self-imposed ceiling (see "Cost governance" below) is no longer a
hard cap — the user is comfortable spending up to **$50/month** if quality
justifies it, given real per-run costs are far below that even at
meaningfully larger scale.

### Cadence — weekly batch rollout across all 346 comunas (implemented 2026-07-17)

**Supersedes the earlier "~100 hand-curated units, monthly cadence"
plan below.** All 346 official Chilean comunas are seeded as `regions`
rows (346 total: the original 15 as `status='active'`/`'excluded'`,
the other 331 as `status='not_started'` — cross-checked against a
structured dataset rather than typed from memory, see the
`20260717000000_seed_remaining_chile_comunas_excluded` migration).
`status='not_started'` is distinct from `status='excluded'`:
`'excluded'` is a hard, permanent editorial opt-out (OFAC-style);
`'not_started'` just means "not yet in the batch rotation" — both are
filtered out of `getUnitsDueForRun`'s `.neq('status', 'excluded')`
query only for the former, so `'not_started'` comunas are genuinely
eligible to be picked up.

**Why weekly batches, not one run through everything:** the run is a
**sequential** for-loop, no parallelization (~82s/unit measured) — 346
units sequentially ≈ 7.9 hours, over GitHub Actions' 6-hour default job
timeout. `getUnitsDueForRun` caps each run to `weekly_batch_size`
(`system_config`, no redeploy to change), sorted oldest-`last_run_at`-
first (never-run sorts before any real timestamp) — the same "due"
28-day check as before, just capped and prioritized. This rotates
through every comuna once, then cycles forever with no reset logic: a
comuna that just ran becomes the newest, falls out of the due pool for
28 days, and re-enters it once that elapses.

A comuna's first real run also flips its `status` from `'not_started'`
to `'active'` (`run.ts`'s per-unit loop) — restores real meaning to the
column, which was previously written once at seed time and never
touched again.

**Batch size, chosen to stay inside Tavily's free tier indefinitely:**
`weekly_batch_size × 6 Tavily credits/comuna × ~4.33 weeks/month ≤
1,000` (the free monthly credit allotment) → max ~38/week. **Currently
seeded at 25/week** (ramp-up phase, started 2026-07-17 — validate data
quality on lower-profile comunas before scaling up; see
`system_config`/`supabase/migrations/20260717020000_reclassify_pilot_comunas_not_started.sql`'s
own comment). Target steady-state is **35/week** (a small safety margin
under the ~38 ceiling) once ramp-up looks good — that size completes a
full 346-comuna rotation in **~9.9 weeks (~2.3 months)**, entirely inside
Tavily's free tier, no pay-as-you-go needed. At the current 25/week, a
full rotation takes ~13.8 weeks (~3.2 months) instead — still $0 on
Tavily, just slower. A faster rotation (e.g. 80/week, ~1
month) is possible but requires enabling Tavily pay-as-you-go
(≈$8.61/month overage at that size) — not the default, since bright
sources already refresh every 2 weeks independent of the comuna
rotation (a plain HTTP fetch, zero Tavily cost) and most exhibitions
run well over a month anyway. The real trade-off of a slower rotation:
events *outside* official museums/galleries (pop-ups, one-off
interventions, small independent spaces not yet known as a bright
source) are exactly what a comuna's own direct search is needed for,
and a 2+ month cadence risks missing short-lived ones. Revisit once a
few rotations' worth of real coverage data exists.

**No internal spend-gating code** — `isOverBudget()`/`isOverRegionCap()`
(`apps/curator/src/lib/usage-tracking.ts`) exist but aren't wired into
`run.ts`. The real hard control is Anthropic's own prepaid-credit
model (the API stops working once the loaded balance runs out — no
risk of silent overspend) and, if ever enabled, Tavily's own
dashboard-level pay-as-you-go cap. `isOverRegionCap()`'s query does
count only `'active'`/`'saturated'` (not `'not_started'`) — fixed
2026-07-17 alongside the batch rollout, since counting `'not_started'`
too would have tripped the cap immediately with 331 such rows now
seeded.

### The ~100-unit list — superseded by the above

Earlier plan, kept for history: ~50 Chilean cities as single units,
plus Gran Santiago/Valparaíso/Concepción split by comuna (~34+6+11)
where a single city-level query would blur together genuinely distinct
neighborhood art scenes — roughly 100 units total. Never built; the
all-346-comuna weekly-batch rollout above replaced it before it shipped.

## Fuentes brillantes (bright sources)

A "fuente brillante" is a URL that reliably lists several real events in
one place — fetched **directly** (plain `fetch`, not via Tavily search)
when due (see cadence below), and excluded from regular Tavily searches
for that domain (via `exclude_domains`) so the search budget isn't spent
re-discovering what's already covered directly.

**Per-source 2-week fetch cadence, independent per source** — until
2026-07-17, every known+detected source was fetched on every single run
with no gating at all. Same shape as `regions`' own `last_run_at` +
28-day "due" check (`apps/curator/src/event-discovery/run.ts`'s
`isDueForRun`), but a 14-day interval and keyed by the source's own `url`
in a standalone `bright_source_fetch_state` table (not a column on
`regions` or `detected_sources` — `KNOWN_SOURCES` is hand-curated in
code, not a DB row, so `url` is the only identity both hand-curated and
auto-detected sources share). Records an *attempt*, not just a success —
`fetchBrightSources` already swallows a single source's own fetch failure
(network error, 404, etc.) and logs it rather than throwing, so there's
no separate success/failure signal left by the time the cadence gets
recorded; retrying a broken source every run wastes just as much time as
retrying a working one. `excludeDomains` (what regular per-unit Tavily
search won't surface) stays based on *every* known bright source
regardless of due-state — a domain shouldn't resurface via Tavily search
just because we happen to not be re-fetching it directly this particular
run.

**Two different exclusion lists feed `excludeDomains`, for two different
reasons** — bright-source domains (above), and, as of 2026-07-19,
`KNOWN_LOW_QUALITY_SOURCE_DOMAINS` (`apps/curator/src/lib/
known-exclusions.ts`): domains we never want content from at all, because
their per-event extraction is unreliable (real case: infobae.com's weekly
agenda-cultura roundup bundles many events from multiple countries into
one tangled page — see the "Location" bullet above for the analogous
Recoleta/Buenos Aires bug this same domain also produced). Both lists get
merged into the one `excludeDomains` array passed to Tavily, so it ideally
never returns either kind of domain in the first place (saves the
credits/tokens of a result we'd discard anyway). But Tavily's own
`exclude_domains` isn't perfectly reliable, so `filterKnownExclusions`
still filters the same low-quality domains from whatever Tavily actually
returns — belt and suspenders, same reasoning already applied to the
Recoleta/Argentina location filter.

**Pagination via `additionalPages`** — some listing pages are big enough
that page 1 alone misses real, current events. Real find (2026-07-17):
arteinformado.com's Chile listing isn't sorted chronologically or by
"vigencia" — it's sorted by whatever their editors most recently added,
so page 1 alone missed a real exhibition ("Sín-tesis", Galería NAC) that
only showed up on page 2. `KnownSource.additionalPages?: string[]` lists
extra URLs whose content (same `extractor`) gets fetched and appended
into the SAME single `RawResult` as the primary page — one logical
source, not one per page, so `mergeBrightSources`'s per-domain dedup and
the run's overall "one bright-sources curate() call" shape stay intact.
Kept deliberately small (arteinformado.com: 2 pages of ~423 total) — the
site's own sort order means later pages increasingly return events that
have *already ended* (a real check: page 5 already had events that ended
~2 months before the check date), so fetching many pages would mostly
waste Haiku input tokens on content that gets filtered out downstream
anyway. A failure fetching an *additional* page is logged and skipped,
not fatal to the source — only the primary page's own failure still
fails the whole source, unchanged from before `additionalPages` existed.

**`type` decides how a source is fetched** (`apps/curator/src/lib/known-sources.ts`):
- `"html"` (default) — a plain page fetch.
- `"json-api"` — a REST call, no HTML involved.

**`extractor` (optional, config-driven) decides how per-event structure
gets pulled out of what was fetched** — a registry
(`apps/curator/src/event-discovery/extractors.ts`) instead of one hardcoded
parser function per site. Adding a new bright source with known structure
means writing a config entry, not new parsing code. Two shapes exist so
far, matching the two kinds of structure real bright sources have shown:

- `articleList` — an HTML listing page where each event lives in its own
  repeating block. uchile.cl's config: a `blockRegex` matching each
  `<article class="mod-cal-result__item">`, plus regexes for the
  title+link, date range, and place *within* that block. Extracts `<img
  src/alt>` pairs *before* stripping tags (a real bug — the original crude
  tag-strip threw away real per-exhibition thumbnails that were sitting
  right in the HTML, fixed by pulling images out first), resolves relative
  image URLs against the page's own origin, and — critically — keeps each
  event's own image and individual page URL paired with *that* event, not
  pooled with every other event on the page. A real bug this fixed: the
  original whole-page-flatten approach lost that pairing entirely, so
  Haiku had to blind-match N images to N events from one pooled list and
  got some wrong (confirmed: 3 of 15 in a real run against uchile.cl).
- `wordpressRestApi` — a WordPress REST endpoint, fields named per-site
  (dotted paths in the config, e.g. `meta.link_al_evento`) since a site's
  custom meta-field names aren't a WordPress standard. Example: Parque
  Cultural Valparaíso's events widget is JS-rendered (invisible to a plain
  `fetch` — confirmed the raw HTML response never contains the widget's
  real content anywhere, even though the browser's DevTools shows it after
  JavaScript runs), but the widget itself calls a clean WordPress REST
  endpoint (`/wp-json/wp/v2/events_list`) found via the browser's Network
  tab — hitting that directly gives real, structured title/image/
  description/date fields per event, no guessing required. One real find
  worth noting: its `hora_de_inicio`/`hora_de_termino` fields are the
  *venue's* daily opening hours, not the actual inauguración time — the
  real opening time, when there is one, is only in the free-text
  description field, so Haiku still needs to read that rather than trust
  the structured hour fields blindly.

**A source with no `extractor` configured** — every auto-detected source
today, since the `detected_sources` table only stores the simple `type`
enum, not a full parser config — falls back to a generic whole-page
flatten for `"html"` sources (tags stripped, `<img src/alt>` pulled out
first, same as before this registry existed), or a clear log-and-skip for
a `"json-api"` source nobody's written a config for yet. Upgrading an
auto-detected source to real structured extraction is a manual step: a
human notices it during the periodic `lastReviewedAt` review and adds an
`extractor` entry for it in `known-sources.ts`.

**Curated once per run, separately from any single unit's search** — not
attached to each unit's own prompt. Real bug found and fixed: when
attached to every unit's prompt, Haiku inconsistently decided whether to
report the bright source's content at all (sometimes reported it fully,
sometimes not at all, run to run) — running it through its own dedicated
curate() call makes its yield deterministic instead of depending on which
unit's call happened to surface it.

**Auto-promotion, not manual-only:** a domain (never a social platform —
`instagram.com`/`facebook.com`/`tiktok.com`/`twitter.com`/`x.com`, shared
by thousands of unrelated accounts — and not already known) that
contributes **2+ "complete" events** in one run — image + title + a start
date within the current month — gets auto-added to the `detected_sources`
Supabase table, merged with the hand-curated `KNOWN_SOURCES` list at the
start of every run (a table, not a local JSON file — GitHub Actions
runners are ephemeral, nothing on disk survives between monthly runs). No
source file gets rewritten by the script; `known-sources.ts` stays the
manually-reviewed list, detection just grows a separate table alongside
it. **`description` is deliberately not required** for "complete" — a
real test against arteinformado.com (a
genuinely rich source, 10 real Chilean exhibitions, 2 within the current
month, all with real images) showed Haiku correctly leaves `description`
null when a source only lists structured facts with no prose per event;
requiring it would have disqualified a legitimately good source.

**Known, accepted limitation:** JS-rendered pages whose real content only
exists after client-side execution are invisible both to a plain `fetch`
and, apparently, to Tavily's own indexing (a real test: Tavily searching
"Valparaíso" never surfaced Parque Cultural's JS-only listing page at all).
No algorithm currently discovers these — a human has to notice the real
content in a browser and point to the underlying source (as happened here,
via DevTools → Network tab → the actual JSON endpoint). Tested and
rejected as a general fix: inferring a "parent listing" URL by truncating
an individual event's URL path — doesn't work reliably (confirmed on this
exact site: neither the naive parent path nor Tavily's own top-scored
result for this domain matched where the real content actually lived).
What *does* work automatically, confirmed with a real search: Tavily
sometimes independently finds a different, genuinely scrapable listing
page for the same domain (e.g. a WordPress category-archive page,
`/events/categories/exposicion/`, whose snippet already showed 2+ distinct
exhibitions) — when that happens, the existing domain-based auto-detection
above picks it up on its own, no new engineering needed. The expectation
going forward: most useful bright sources will keep surfacing this way,
supplemented by occasional manual additions when a human notices something
the pipeline structurally can't see (JS-only pages).

**Finding the next one, deliberately manual, not automated:** every regular
per-unit search result gets logged to `raw_search_results` (title, url,
domain, score) — a 7-day rolling window, pruned automatically at the start
of every run, not a permanent archive. `events` can't serve this purpose:
a listing/aggregator page can show up in every search and, if Tavily's
snippet of it is too thin, never produce even one candidate — so it would
never appear there, even though the page itself might be genuinely rich
(found this exact way: `mnba.gob.cl/cartelera`, added as a bright source
after showing up repeatedly in Santiago searches with a weak yield). The
review itself is ad-hoc SQL against this table (group by domain, look for
ones that keep showing up) followed by manually fetching the page and
testing a candidate `extractor` config — same process used for every
bright source added so far, not a new capability. Deliberately not
automated: an LLM inline-generating an extraction regex from raw HTML
during curation would be expensive (full HTML pages are token-heavy) and,
worse, would ship unvetted — every extractor config in `known-sources.ts`
so far was hand-tested against real data before being trusted with no
human in the loop after that.

### Post-curation enrichment: image and opening time (`lib/page-fetch.ts`)

Real bug (found 2026-07-19, manual review): arteinformado.com's listing
page (`daysRegex` above) only ever gives a date **range** per event ("15
jul de 2026 - 22 ago de 2026"), never the specific opening date+time — that
only exists on each event's own detail page, in a structured "Inauguración
: 15 jul de 2026 / 19 a 21 h." line. The pipeline never fetched that page,
so all 10 approved arteinformado.com events in production had
`opening_datetime = null` — confirmed systemic across every event from
that source, not a one-off Haiku miss.

**Fix, deterministic, zero extra Anthropic/Tavily cost:** `enrichCandidates`
(`lib/page-fetch.ts`) runs once per run, on every *approved* `EventCandidate`
regardless of source (bright source or regular per-unit search) whose
`sourceUrl` is still missing an image, or whose `openingDatetime` is still
null AND whose source domain has an opt-in `openingTimeExtractor` regex
configured (`KnownSource.openingTimeExtractor`, `lib/known-sources.ts` —
sibling to `extractor`, not nested inside it, since the opening time lives
on a *different* page than the listing markup `extractor` describes).
Regex-only against the fetched page's collapsed-whitespace text (`lib/
opening-time.ts`'s `extractOpeningDatetime`) — never sent to Haiku, so this
adds no Anthropic tokens; the only new cost is the HTTP fetch itself.

**One fetch per candidate, not two:** a candidate needing both an image and
an opening time gets exactly one `fetchDetailHtml` call, with both
extraction goals run against the same already-fetched HTML — confirmed via
a test asserting the stub fetch is called exactly once for such a
candidate. Fetched in chunks of `ENRICHMENT_CONCURRENCY = 4` (chunked
`Promise.all` batching, no new dependency) rather than fully sequential or
fully unbounded — a deliberately conservative constant given unknown
per-request latency to arbitrary third-party sites, politeness toward
those sites, and headroom under the 346-comuna weekly batch's 6-hour
GitHub Actions ceiling; revisit once real timing data exists.

**Chile-timezone correctness:** the extracted wall-clock time (e.g. "19:00"
in "Inauguración... / 19 a 21 h.") is converted to an absolute UTC instant
via a two-pass `Intl.DateTimeFormat` offset-correction (`lib/
opening-time.ts`'s `santiagoWallTimeToUtcIso`) — no hardcoded UTC offset,
since Chile's DST rule has changed more than once in recent years.

**Caveat, don't skip when adding a new source's `openingTimeExtractor`:**
the regex must be hand-verified against that source's real detail-page
HTML, not just a plain-text example of the expected phrasing — the real
arteinformado.com markup has a `</span>` and `<br/>` sitting between the
"Inauguración" label and the date, invisible in a plain-text mockup of the
phrase, only caught by fetching the real page and checking.

**Year inference (added 2026-07-20, for uchile.cl):** not every source
publishes a year at all — uchile.cl's root domain phrases the opening as
an invitation, "Los esperamos este miércoles 01 de julio a las 18.00h.",
with no year anywhere on the page (checked meta tags too), since it's a
rolling near-term agenda where the year is implicit. `extractOpeningDatetime`
now accepts an optional `referenceDate` (defaults to the real clock at the
call site) and only infers a year when the regex's `year` capture group is
absent: current year, unless that would place the date more than 60 days
in the past relative to `referenceDate`, in which case next year (handles
a December-published page meaning next January). Sources that do publish
a year (arteinformado.com) are unaffected — this only activates when the
regex config genuinely has no `(?<year>...)` group.

**Same root-cause bug as arteinformado.com, different domain
(found 2026-07-20):** `uchile.cl`'s ROOT domain (not `artes.uchile.cl`,
which already had a dedicated entry) had no known-source config, so an
event from Facultad de Arquitectura y Urbanismo's Galería Micromedios
(never surfaced by the Artes-only `artes.uchile.cl` feed) came in via
regular per-comuna Tavily search, which drops per-event links from a
listing page — Haiku fell back to citing the listing page itself as
`sourceUrl` instead of the event's own detail page. Same fix as
arteinformado.com: a dedicated `articleList` extractor (identical config
to `artes.uchile.cl`'s — confirmed the two domains share the exact same
underlying CMS/markup) resolves each event's real per-event href.

**Date-only confirmations, `opening_time_confirmed` (added 2026-07-20):**
found via manual review — arteinformado.com's "Sín-tesis" confirms an
inauguración date ("Inauguración: 14 jul de 2026") with no time at all, a
genuine editorial gap on that source's own page. Before this, a missing
hour made `extractOpeningDatetime` return `null` entirely, silently
dropping the confirmed date — the event only ever showed as an "expo
actual," never as an "inauguración," even though the venue explicitly
confirmed one. Now `extractOpeningDatetime` returns `{ iso, timeConfirmed
}`: when the regex's `hour` group is absent, `iso` holds midnight
America/Santiago (a real instant, via the same `santiagoWallTimeToUtcIso`
used for real hours) and `timeConfirmed` is `false`. The new
`events.opening_time_confirmed` column (see data-model.md) persists this;
`apps/web`'s `EventCardBase` reads it to show "consulta la hora con el
lugar" instead of a fabricated hour.

**Update (found and fixed 2026-07-21): Haiku's own curation had the same
bug, worse.** The note above ("Haiku's own initial curation is
unaffected... its prompt already requires an explicit hour before it ever
sets `opening_datetime` at all") described the bug, not a safe design —
requiring date AND hour together meant a confirmed date with no reported
hour was discarded entirely, not downgraded to `opening_time_confirmed:
false`. Found via a user question ("si hay una inauguración por qué el
discovery no puede conseguir la hora?"); confirmed via
`curation_reasoning ILIKE` search in production, not assumed — 7 events
whose own `curationReasoning` explicitly stated the inauguración date was
confirmed (e.g. "Inauguración de ExpoArte.Co confirmada en reel de
Instagram del 15 de julio 2026") still had `opening_datetime: null`,
purely because Haiku's prompt gave it no way to report "date yes, hour
no." Fixed by extending the same convention the regex path already used:
`buildSystemPrompt` now tells Haiku to report `openingDatetime` +
`openingTimeConfirmed` as two separate fields — date+hour confirmed →
both real values and `openingTimeConfirmed: true`; date confirmed but no
hour → the date with a "00:00" placeholder hour and
`openingTimeConfirmed: false` (never null just for a missing hour, since
the confirmed date alone is real, useful information); no confirmed
inauguración at all → both null/false, unchanged. `parseCandidates`
reads Haiku's `openingTimeConfirmed` directly now, defaulting to `true`
only if Haiku's output omits it or sends a non-boolean (malformed-output
fallback, not the normal path). The past-event/mismatched-month
hallucination warnings already in the prompt (see above) are unchanged —
this only affects the missing-hour case, not the "is this actually an
inauguración" judgment call the user also asked about.

**Follow-on regression from the above, found and fixed same day
(2026-07-21):** the deterministic post-curation re-fetch (`lib/page-fetch.ts`'s
`processCandidate`/`enrichCandidates`, for the 2 known sources with a
registered `openingTimeExtractor` — arteinformado.com, uchile.cl) used to
gate on `c.openingDatetime === null`, since before this fix that was the
only way a date-only confirmation from Haiku could arrive. Once Haiku
started reporting date-only confirmations as a real `openingDatetime` +
`openingTimeConfirmed: false` (immediately above), that gate stopped
firing for exactly this case — the one it exists for. Concretely: a known
source's detail page that actually states the real inauguración hour
would previously get it recovered via regex re-fetch; after the
`openingTimeConfirmed` change and before this fix, it silently kept
Haiku's "00:00, unconfirmed" placeholder instead, even though the real
hour was one fetch away. Fixed by gating on `!c.openingTimeConfirmed`
instead — covers both the original no-confirmation-at-all case (still
paired with `openingDatetime: null`) and the date-only case, without
needing to check `openingDatetime` at all.

**Deterministic freshness backstop, `lib/post-freshness.ts` (added
2026-07-21):** the user asked whether a post-curation re-fetch could
verify a candidate is genuinely a valid, current inauguración and not an
old post re-surfacing — same underlying concern as the timezone/hour bugs
above, but about the YEAR being wrong rather than the hour being missing.
Investigated by sampling 15 real production `sourceUrl`s currently sitting
at `openingTimeConfirmed: false` (fetched for real, not assumed) before
building anything, per this doc's own established practice of validating
regexes against real pages first. Found **7 of 15 (47%) had a real publish
date that didn't match the month Haiku searched for** — worse than an
earlier, narrower measurement that only checked for an explicit wrong year
inside Haiku's own `curationReasoning` text and concluded (incorrectly)
that the two 2026-07-18 hallucination-guard prompt fixes had already
closed this gap. Two real examples the narrower measurement missed
entirely: "Río Cochrane" (a prensaeventos.cl news article whose own
JSON-LD `datePublished` is 2023-07-12, over 3 years before the July 2026
run that surfaced it) and "Lafken Püllü" (an Instagram post about an April
30, 2026 opening, curated into a July 2026 run — same year, 3 months off).

Two independent publish-date signals, found via the same sampling: (1)
standard `datePublished` (JSON-LD) / `article:published_time` meta —
common across CMS-driven sites, and (2) Instagram's `og:description`
caption byline (`"<user> on <Month> <DD>, <YYYY>:"`), which Instagram
emits instead of the standard tags above. Facebook was checked and
exposes neither via a plain fetch — not covered. `extractPublishedDate`
tries both, returning `null` (never treated as stale) when neither is
present, which is the common case.

`isStalePublishYear` deliberately compares **only the year**, not the
month — the sample showed real, legitimate same-year gaps (an exhibition
announced weeks ahead of its own opening, or still running weeks after
it), and month-level comparison would risk rejecting those without more
data to tune a threshold safely. Every confirmed-stale case in the sample
had a different year from the target run; every legitimate case shared
the target year. The "Lafken Püllü" case above (same year, wrong month)
is a known, **documented, unhandled gap** — revisit with more real
same-year-mismatch data before tightening this rule.

Wired into `enrichCandidates`: previously a candidate was only re-fetched
if it needed an image or a known-source opening-time extraction; now
**every approved candidate with a `sourceUrl` is fetched**, since a stale
post can arrive with an image and a confirmed hour just as easily as
without — the freshness check has to run independent of what else needs
enriching. A stale match sets `status: "rejected"` directly in code (same
"belt and suspenders" pattern as the Recoleta foreign-country blocklist
override above), so a stale candidate never reaches `insertCandidates`
regardless of how confident Haiku's own `curationReasoning` was.

**Generic hour recovery, `extractGenericInauguracionHour` (added
2026-07-21):** initially deferred (only 3/6 genuinely valid inauguraciones
in the 15-URL sample had an extractable hour, a 50% hit rate) but revisited
same-day after the freshness backstop above shipped — it fetches the real
page for EVERY approved candidate now regardless, so the network cost this
feature would have added no longer exists, and the user considers a
confirmed hour (not just a confirmed date) core to Caldearte's value.
Zero added Anthropic/Tavily cost either way — purely regex over HTML
already in memory, no extra API calls.

Unlike the 2 known-source configs, this pattern isn't tied to any one
domain's markup — matched against any fetched page — so it needs a safety
net a domain-specific pattern doesn't: the page can mention a date/hour
that has nothing to do with THIS event (a venue's regular opening hours,
a different listed event on the same page). The fix: Haiku already told
us the confirmed DAY and MONTH (just not the hour) — `extractGenericInauguracionHour`
returns whatever day/month/hour it found, and `page-fetch.ts` only trusts
the extracted hour if its day AND month match the date Haiku already
confirmed (`utcIsoToSantiagoDateParts`, opening-time.ts's new inverse of
`santiagoWallTimeToUtcIso`). A mismatch leaves the candidate exactly as it
was — placeholder hour, `openingTimeConfirmed: false` — rather than
attaching an unrelated time. Pattern shape, confirmed against the 2 real
examples in the sample: `"Inauguración: [día,] D de MES[,] HH[:MM]
h/hrs/horas"` (Michel Taverne: "Inauguración: 4 de junio, 19 hrs"; Centex:
"Inauguración: sábado 11 de julio, 12:00 horas").

**"de" made optional (found and fixed 2026-07-21, same day):** ran Event
Discovery manually right after shipping this to check all 4 fixes with
real data. 5 approved candidates landed with a confirmed date and
unconfirmed hour, but the generic extractor recovered 0 — traced it to a
real page (Quilpué, Instagram) whose text read "Inauguración 10 julio
12:00 hrs", no "de" between the day and the month, unlike every example in
the original 15-URL sample (which is why it wasn't caught building this).
Fixed by making "de" optional in the pattern. Same run separately
validated the freshness backstop hard: 17 of the 47 candidates Haiku
itself approved got overridden to `rejected` in code for a real publish
date that didn't match July 2026 — including a 2024 Instagram post
("Casa del Arte", Talca) whose caption read as a perfectly current
"jueves 2 de julio... 19:00 hrs" two years early, and a 2019 utalca.cl
listing page.

**Haiku-set `openingDatetime` timezone bug (found and fixed 2026-07-20):**
found via a user report — a card showed "08:30 hr" for an event whose own
source page said "12:30 hrs" (Factoría Franklin), a suspiciously exact
4-hour gap (America/Santiago is UTC-4). Root cause: `buildSystemPrompt`
asked Haiku for "fecha Y hora exacta" with no format/timezone spec, and
`parseCandidates` wrote Haiku's raw string straight to `opening_datetime`
(a `timestamptz`) with zero conversion — unlike the deterministic regex
path (`lib/opening-time.ts`), which has always correctly converted Chile
wall-clock time to UTC via `santiagoWallTimeToUtcIso`. Whatever timezone
convention Haiku happened to use for its raw string (most likely: local
time with a bare "Z"/no-offset suffix, misread as UTC) silently shifted
every Haiku-set opening hour. Fixed by requiring Haiku to report a plain
"YYYY-MM-DDTHH:mm" (explicitly no "Z", no offset) and having
`parseCandidates` convert it via the newly-exported
`parseLocalDatetimeToUtcIso` (same underlying `santiagoWallTimeToUtcIso`),
mirroring the regex path exactly. A malformed/unparseable string now
degrades to `openingDatetime: null` rather than a silently wrong instant.
Production rows written before this fix may still hold the wrong hour — a
backfill was prepared separately (see the user's own record, not tracked
in this repo) since curator has no production write access via its
tooling here.

**Instagram/Facebook no longer hard-skipped (found and fixed 2026-07-20):**
a product-value audit found ~66% of approved events showing the generic
placeholder instead of a real photo, and traced it to Instagram/Facebook
being ~59% of approved events combined with `fetchDetailHtml` hard-skipping
any social-media `sourceUrl` — a design decision made on the assumption
those pages "need JS/login to render for a plain fetch," never actually
verified. Tested against 9 real production URLs (6 Instagram reels/posts, 3
Facebook posts): a plain fetch, no special headers, no crawler-impersonating
user-agent, reliably returned a working `og:image` for every one — that
assumption held for profile/feed pages, not for individual post/reel
permalinks. `fetchDetailHtml` no longer excludes these domains, so
`enrichCandidates` now recovers an image for them the same way it already
does for every other source. `isSocialMediaUrl` stays exported — still used
by `image-rehost.ts` to know when a recovered `imageUrl` is one of these
signed, short-lived CDN links that needs re-hosting before it rots (see
"Post-curation image re-hosting" below). Same ToS-gray-zone caveat as any
scrape of a site with no official API for this use case — could stop
working without notice if Meta changes markup or tightens bot detection;
not a guaranteed-permanent fix, worth re-verifying if image recovery for
these sources silently drops off in a future run.

### Post-curation image re-hosting (`lib/image-rehost.ts`, added 2026-07-20)

An Instagram/Facebook `imageUrl` — whether it came from Tavily directly or
from the `enrichCandidates` recovery above — is always a signed CDN link
(`scontent.cdninstagram.com`/`fbcdn.net`) that rots within hours to days
(confirmed against real samples: one was already dead a few hours after
capture). `apps/web`'s `resolveCardImage` has always distrusted these
entirely for that reason, always showing the branded placeholder instead.
`insertCandidates` (`event-discovery/run.ts`) now downloads the image at
curation time — while the signed link is still valid — and re-uploads it to
a public `event-images` Supabase Storage bucket
(`supabase/migrations/20260720080000_create_event_images_bucket.sql`),
swapping in the new permanent URL before the row is written. Fails closed
to `null` on any error (bad content-type, oversized body, network/upload
failure) rather than storing a link already known to rot. `resolveCardImage`
now trusts a URL on the same host as `NEXT_PUBLIC_SUPABASE_URL` as a real
photo, while still falling back to the placeholder for a raw, untouched
social CDN link.

**Deliberately scoped, not a full fix**: this only covers events that
already have an `imageUrl` captured (whether via Tavily or the
`enrichCandidates` recovery above) — storage cost was checked before
building (real measured sample sizes 25KB-1.9MB, ~9 re-hostable
Instagram/Facebook events/week at the current batch size project to
roughly 4 years before Supabase Storage's 1GB free tier is reached — no
near-term pressure). Not retroactive: events already approved before this
shipped keep showing their placeholder; the effect only applies going
forward.

**Instagram/Facebook image recovery effectively broken since it shipped,
found and fixed 2026-07-22:** manual review of the 2026-07-22 production
run found only 2 of 29 approved candidates had an image at all — looked
like a bot-blocking issue at first (Instagram's CDN is exactly the kind of
host that blocks datacenter fetches) but wasn't. Root cause:
`extractOgImage`/`extractTwitterImage` (`lib/page-fetch.ts`) captured a
`<meta ... content="...">` attribute's raw HTML value with no entity
decoding — Instagram's CDN URLs are always query-string-heavy (signature
params `oh`/`oe` the CDN needs to authorize the request), and HTML encodes
`&` as `&amp;` inside an attribute value, so every recovered URL came
through with the literal text `&amp;` instead of `&`, corrupting the query
string and losing the signature entirely. Confirmed directly: fetching the
corrupted URL 403s regardless of user-agent or referer; fetching the exact
same URL with `&amp;` decoded back to `&` returns a real JPEG. This bug
predates today — it's been silently starving `image-rehost.ts` of anything
to rehost since Instagram/Facebook detail-page fetching shipped
(2026-07-20), not a regression from this session's other fixes. Fixed with
a small `decodeHtmlEntities` step (`&amp;`, `&quot;`, `&#39;`, `&lt;`,
`&gt;` — only what can plausibly appear inside a URL, not a general
decoder) applied to both extractors' captured value.

## Event Discovery quality audit (2026-07-20)

User-requested audit of a real production run (25 comunas + the `uchile.cl`
bright source, 218 candidates, 90 approved). Four real issues found and
fixed same-day; two more identified but deliberately deferred (see below).

**Fixed:**

- **`isChileanLocation` whitelist drift (`lib/locations.ts`)**: `CHILE_MARKERS`
  was a hand-picked ~100-entry subset, curated once for an earlier, smaller
  rollout list, never kept in sync as `regions` grew to 346 comunas. 14 of
  the 25 comunas in the audited run (Colbún among them) weren't in it at
  all — genuinely Chilean, Haiku-approved events in those comunas got
  force-rejected with `[FILTRO DE CÓDIGO: ubicación no reconocida como
  chilena]`. Fixed by regenerating the comuna portion of the list from a
  full snapshot of `regions` (`select name from regions order by name`,
  346 rows as of 2026-07-20) instead of a hand-maintained subset. Also
  added "Coihaique" (official current spelling) alongside the pre-existing
  "coyhaique" (legacy spelling), covering both. This is a snapshot, not a
  live query — see "Structural gaps, not yet fixed" below for why it can
  still drift again.
- **Duplicate-insertion gap (`lib/event-filters.ts`'s new `normalizeLocation`,
  used by `run.ts`'s `locationDateKey`)**: the same festival (ARTEPUERTO
  2026 / Casaplan, Valparaíso) got inserted 3 times in one run — 3
  different social posts reported the location as "Valparaíso, Chile" vs
  "Valparaíso" vs a venue-prefixed variant, each producing a different
  dedup fingerprint even though `normalizeTitle`-style
  accent/case/whitespace normalization was already applied. Fixed by
  extracting only the first comma-segment (the actual comuna/ciudad,
  per `location`'s own documented meaning) before fingerprinting — a
  trailing ", Chile" or region name is noise that varies source-to-source
  for the same real place.
- **`ART_SCOPE_POLICY` referenced a nonexistent status (`lib/curation-policy.ts`)**:
  told Haiku to use `"pending_review"` for ambiguous artistic-intervention-
  vs-conventional-show calls — but Event Discovery's `status` is strictly
  binary (approved/rejected; see overview.md's "Ambiguous cases... not
  built"). That instruction was unsatisfiable, leaving Haiku with no real
  guidance for the ambiguous case. Likely contributed to two real
  scope-creep approvals found in the same audit ("Conversatorio Quebrada
  Honda", "Catastro Arte Público Constitución" — both literally panel
  talks, approved with reasoning stretching them into "intervención
  artística participativa"). Fixed to say "reject" for the ambiguous case
  instead, matching the default-exclude philosophy the four content axes
  already use, and to explicitly name conversatorios/charlas/mesas
  redondas and generic cultural-heritage days as their own out-of-scope
  category (previously only conventional theater/concerts/dance were
  named explicitly).

**Deliberately not fixed (judgment calls, not bugs):**

- **Institutional-scale festivals classified as visual art** (e.g. "Tianfu
  Festival" — a light-sculpture installation festival, correctly in-scope
  by content even though "Festival" in the title looks concert-adjacent at
  a glance). Confirmed correct on inspection, not touched.

**Also fixed (2026-07-20, same day, as follow-ups):**

- A regression guard for the `CHILE_MARKERS` drift —
  `lib/chile-comunas-snapshot.ts` is a versioned, checked-in snapshot of
  every `regions.name` (346 rows, regenerate by re-running `select name
  from regions order by name;` and pasting the result back in whenever a
  migration adds/renames comunas), and `locations.test.ts` asserts
  `isChileanLocation` covers every name in it. This would have caught the
  Colbún-and-13-others bug before a real run did — but note it's a
  **static snapshot test, not a live query**: this repo has **no CI
  workflow that runs `pnpm test` at all** today (only
  `deploy-migrations.yml` and `event-discovery.yml` exist; the green
  checks on a PR are Vercel's `apps/web` deploy, unrelated to
  `apps/curator`'s test suite) — real production bug found while
  investigating this (2026-07-20): so the test only protects whoever
  happens to run the suite locally, and still needs a human to remember to
  regenerate the snapshot after a `regions` migration. Wiring an actual CI
  test workflow (and/or making this check live-query `regions` instead of
  a snapshot, when Supabase credentials are available — same
  optional-skip pattern already used by `usage-tracking integration`) are
  the natural next steps, not done here.
- **Cross-run fuzzy dedup** (`lib/event-filters.ts`'s new
  `isLikelySameTitle`, used by `run.ts`'s `insertCandidates`): the exact
  `locationDateKey` fingerprint only catches duplicates sharing the exact
  same location AND exact same datetime — two sources reporting the same
  real opening with slightly different exact hours ("19:00" vs "19:30")
  still evaded it even after the location-normalization fix. Added a
  fourth, coarser dedup signal: same normalized location + same calendar
  DAY (not exact time) + title word-overlap (Jaccard) >= 0.6 with at least
  2 shared significant words (generic art-event vocabulary like
  "exposición"/"muestra"/"arte" and bare years are excluded from the word
  sets first, so two genuinely different events don't get merged just for
  sharing generic vocabulary and a comuna). Deliberately conservative on
  both axes (day-level, not a wider date-range tolerance; two-part
  threshold, not Jaccard alone) — a false merge silently drops a real,
  distinct event, which is worse than an occasional missed duplicate.
  Verified against the ARTEPUERTO trio itself: title similarity alone does
  NOT flag any pair of those three real titles (they're genuinely too
  different in wording) — confirming that bug was actually the
  location-string-normalization gap fixed separately, not something title
  similarity could or should have caught.
- **Bare-domain-root `sourceUrl` visibility** (`discover.ts`'s new
  `logBareDomainSourceUrls`): the 2 found (`museoregionalaysen.gob.cl`,
  `culturacopiapo.cl`) are now logged (`[event-discovery] sourceUrl is a
  bare domain root...`) in the workflow's own run logs for manual
  spot-checking — same visibility mechanism `page-fetch.ts`'s own recovery
  logs already use. Still deliberately NOT a hard rejection, for the same
  reason noted originally: some small-comuna cultural centers genuinely
  only have a single-page site where the homepage IS the correct and only
  page, and a blanket path-based heuristic risks false-rejecting those the
  same way the `isChileanLocation` whitelist drift did for real comunas.

**Structural gaps, not yet fixed (candidates for future work):**

- No CI workflow runs `apps/curator`'s test suite at all (see above) —
  worth its own fix, out of scope for this audit.
- Fuzzy dedup (above) is still bounded to a single calendar day and a
  single run's `loadExistingKeys()` snapshot — two sources posting the
  same event more than a day apart (rare, but possible for a slow-to-post
  account) would still both get inserted.

## Manual review follow-up (2026-07-20, same day) — fabricated openingDatetime + MAVI UC

A user manual review of 3 live production events found a more serious
issue than the audit above: **Haiku fabricated `openingDatetime` values
that don't appear anywhere in the source**, not just misread ambiguous
ones. Two unrelated events (both sourced from Instagram, unrelated
comunas) got the exact same fabricated timestamp
(`2026-07-22T23:00:00Z` = 19:00 Chile) — real content: one was a
*registro* (recap, past tense) of a different, already-held inauguración;
the other's real dates ("23 de diciembre al 28 de enero") had nothing to
do with July at all. A third event (MAVI UC's "La llegada de lo blanco")
had a *visita mediada* (guided-tour) date stored as if it were an
inauguración — Haiku's own `curationReasoning` admitted "visita mediada
confirmada," but the field still got written to `opening_datetime`.

**Fixed — prompt hardening (`discover.ts`'s `buildSystemPrompt`):**
`openingDatetime`'s field instruction now explicitly forbids inventing or
"reasonably completing" a date, with the two real failure patterns above
named as negative examples (a past-tense recap post; a real-but-unrelated
date). A new general rule was added for all fields: nothing gets
extracted unless it's literally present in the source text — no
inferring from "similar" events in the same batch.

**Fixed — deterministic backstop for MAVI/UC agenda
(`discover.ts`'s `nullifyOpeningDatetimeForKnownSources`):** regardless of
prompt quality, `openingDatetime` is now force-nulled (not the whole
candidate rejected — the exhibition and its run dates are usually real)
for any candidate whose `sourceUrl` is `mavi.uc.cl` or `uc.cl`/`www.uc.cl`
under `/agenda` — confirmed via manual site investigation (below) that
these domains never publish a real inauguración date.

**Built (2026-07-20, follow-up) — MAVI as a real bright source, via a
separate headless-browser job.** `mavi.uc.cl`'s own exhibition listing
(`/exposiciones-actuales/`) is a client-rendered Next.js app whose data
comes from `api.agenda.uc.cl` (a Strapi API) that returns `403 Forbidden`
to a plain `fetch()` — confirmed unfixable with the curator's normal
fetch-only architecture. Rather than scraping the rendered DOM, a real
Chromium session (Playwright) intercepts the actual JSON response the
page itself receives from that API — richer and far more robust than
regex over rendered HTML, and it already includes everything needed:
title, a full prose description with the real exhibition dates, a direct
S3 image URL, and a slug to build the real per-event
`uc.cl/agenda/actividad/<slug>` URL. The API's own `dates`/`datesBuilder`/
`nextDate` fields are the museum's regular visiting hours (open
Tue-Sun, same shape every week) — confirmed via a real probe against the
live API — and are deliberately never surfaced as a candidate field at
all; real exhibition dates come from the prose description, curated by
Haiku exactly like any other source.

Deliberately scoped to MAVI specifically, not a generic "headless bright
source" framework — only one real case exists today (see
`measure_before_building_infra` in the user's own project conventions);
a second real case would justify generalizing `KnownSource`/`BrightSource`
with a `requiresHeadless` flag, not before.

**Architecture, per the user's own proposed mitigation** (isolates the
timing/fragility cost from the main run entirely):
- `apps/curator/src/lib/mavi-headless.ts` — `fetchMaviActivities()`
  launches headless Chromium, navigates to the listing, intercepts the
  `api.agenda.uc.cl/api/activities` response, and returns clean
  `MaviActivity[]` (title/content/detailUrl/imageUrl/placeName). Never
  throws — a broken API shape or a Playwright launch failure degrades to
  an empty list, same defensive posture as `sources.ts`'s
  `fetchBrightSources`.
- `apps/curator/src/headless-discovery/run.ts` — its own orchestrator,
  **reusing** `event-discovery/discover.ts`'s `curate()` (same hardened
  anti-fabrication prompt, same `nullifyOpeningDatetimeForKnownSources`
  safety net — MAVI's `uc.cl/agenda` sourceUrl triggers it automatically
  even though this path shouldn't need it) and `event-discovery/run.ts`'s
  `insertCandidates`/`loadExistingKeys`/`loadAllRegions` (now exported)
  for dedup/insertion — no curation logic is duplicated, only the fetch
  step differs from the main run.
- `apps/curator/src/headless-index.ts` + the `discover-headless-sources`
  npm script — separate entrypoint.
- `.github/workflows/headless-bright-sources.yml` — separate workflow,
  Monday 07:00 UTC (1h after the main run), no `TAVILY_API_KEY` (this
  flow never searches). Installs Chromium only in this job, never the
  main one.
- `lib/notify.ts`'s `HeadlessRunSummary`/`buildHeadlessSubject`/
  `buildHeadlessBody`/`sendHeadlessRunSummaryEmail` — a sibling to
  `RunSummary`'s own functions (same format/recipient/never-throws
  posture), not a forced reuse: this run has no comunas or per-unit
  failures in the same sense, so `RunSummary`'s shape doesn't fit
  cleanly.
- Reuses `bright_source_fetch_state` and its existing 14-day
  `isSourceDue`/`recordBrightSourcesFetched` cadence mechanism — MAVI's
  listing URL is just another row, no new table/migration needed.

Why Haiku is still necessary despite the API already giving clean,
complete data (a real question raised while building this): the API
solves fetching, not curation. Two things still genuinely need it: (1)
content-sensitivity curation — MAVI can, in principle, host an exhibition
that needs one of the four axes' tags or exclusion, and skipping Haiku
would mean MAVI-sourced events bypass that check entirely, a real
editorial gap, not a formality; (2) the real exhibition dates live in
free-form Spanish prose (the `content` field), not a clean structured
start/end field — the same kind of parsing Haiku already does reliably
for every other source. Dedup does NOT need Haiku at all — that's
`insertCandidates`'s deterministic dedup, unchanged and reused as-is.

## Manual review follow-up (2026-07-22) — verbatim-quote grounding for date/location

A second round of manual review (after the 2026-07-20 one above) found
that the "NUNCA inventes... cita la frase exacta" prompt instruction —
already in place since 2026-07-20 — didn't stop the same underlying
problem. The user hand-checked 6 real approved candidates from a manual
Event Discovery run and found Haiku fabricating **whole events**, not
just misreading ambiguous dates: specific dates/hours, venue names, even
descriptions, with zero basis in the real source text, while writing a
confident-sounding `curationReasoning`. Real cases, each confirmed by
fetching the actual source directly:

1. **"Columna de @rtorrescultura"**: real caption was only "Columna de
   @rtorrescultura para ARTEPUERTO. Gracias Rafael..." — no date, hour, or
   description of any kind. Curated as "Exposición visual de arte
   plástico (grabadores y esculturas) con inauguración confirmada en
   fecha y hora específicas" — entirely invented.
2. **"CineForo Mariposas Verdes"**: real post was a generic 2025
   year-in-review from a real museum (Museo Juan del Corral), published 5
   months before the target month. Zero mention of "Mariposas Verdes" or
   cinema. Whole event invented.
3. **"Inauguración de arte visual" (Curacautín)**: real article was about
   an exhibition **closing** July 3 in Rancagua — Haiku invented
   "Inauguración: 09 de julio del 2026 a las 19:00 horas" and assigned it
   to the wrong comuna entirely.
4. **"Archivo... (exposición virtual)"**: real name "Archivo del relato
   persistente," published in March, closed March 21 — 4 months before
   the target month. Haiku invented a July inauguración with a specific
   venue.
5. **"Intervención artística de Víctor García Cuevas"**: real post was
   about an exhibition in Jaén, **Spain** ("el refugio antiaéreo de la
   Guerra Civil de Jaén") — Haiku assigned it a Chilean comuna anyway.

A free-text instruction alone isn't a verifiable guardrail — Haiku can
(and did) ignore it while sounding confident. Fixed by making it
verifiable: `EventCandidate` gained `dateQuote`/`locationQuote` — Haiku
must copy the literal source phrase backing `openingDatetime`/`location`,
and a new deterministic filter, `enforceGroundedQuotes` (discover.ts,
chained into `curate()` alongside `applyLocationFilter` and friends),
checks that quote actually appears in the real `block` text Haiku was
given (whitespace/case-normalized substring match — no new API call).
`location` has no nullable fallback, so an ungrounded location rejects
the whole candidate (same severity as `enforceSourceUrlInvariant`);
`openingDatetime` is nullable, so an ungrounded date only nulls that
field, keeping the rest of the candidate (mirrors
`nullifyOpeningDatetimeForKnownSources`'s existing "strip the unreliable
part" approach).

**Deliberately fails closed for now**: a quote that's missing and a quote
that's present-but-not-found get the exact same treatment — this version
doesn't try to distinguish a genuine paraphrase from a fabrication, since
that needs semantic judgment a substring check can't give. Two follow-up
options were discussed and explicitly deferred pending real data: (a) a
second, narrow Haiku call limited to the ambiguous "quote present but not
verbatim" bucket, to rescue legitimate paraphrases without spending on
every approved candidate; (b) reinstating a `pending_review` human
escalation tier (previously decided against 2026-07-19 on "0 genuine
escalations" evidence that predates this finding). Neither is built —
measure the real false-rejection rate from production runs first, same
principle as everywhere else in this doc: ship the cheap deterministic
version, build the expensive one only if data justifies it.

**Cross-result contamination, found and fixed same day (2026-07-22),
first production run after `enforceGroundedQuotes` shipped:** the initial
version checked a candidate's quote against the WHOLE block sent to
Haiku, not just the section for its own result — a unit's search
routinely returns several results in one block, and Haiku could cite REAL
text from a DIFFERENT result and misattribute it to an unrelated
candidate. Two confirmed cases in the very first run: "Instalación País:
Chile 2026" (a plain photography post, no date or venue mentioned at all)
got approved with a fabricated Cerrillos, Santiago venue and a specific
July 9 date/time — text that was real, but belonged to a different result
in the same batch, not this one. "Expo Noah Bliazi" got approved citing
`"La inauguración será este jueves a las 19:30 horas..."` as its
`dateQuote` — a real quote, but from an unrelated Puente Alto post about
164 free community workshops, nothing to do with "Noah Bliazi." Fixed by
splitting `block` into per-result sections (mirroring `buildBlock`'s own
`### title\nurl\ncontent` format) and checking each candidate's quotes
only against its own `sourceUrl`'s section — falls back to the whole
block only when a candidate's `sourceUrl` doesn't match any section header
exactly (an aggregator/listing URL, or a URL Haiku composed slightly
differently), so a lookup miss degrades to the previous coarser check
rather than over-rejecting.

**`null` location crashing whole units, found 2026-07-22 (predates the
grounding fix above — confirmed present in the run before it too):** 6 of
25 units in a production run failed with `Cannot read properties of null
(reading 'split')`. Root cause: `insertCandidates` (`run.ts`) computes a
dedup key (`locationDateKey`/`normalizeLocation`, `lib/event-filters.ts`)
and a region match (`matchRegionId`, `lib/locations.ts`) for **every**
candidate in the batch, not just approved ones — a *rejected* candidate
can legitimately have a null `location` (Haiku doesn't always bother
filling it in for an event it's discarding), and neither function guarded
against that, unlike `isChileanLocation` in the same file, which already
had this exact fix from an earlier incident (2026-07-17). One bad
candidate crashed the whole unit's try/catch in `run.ts`, same blast
radius as the sourceUrl/date crashes documented elsewhere in this doc.
Fixed by making both functions null-safe (`| null | undefined` in the
signature, empty string / `null` fallback) — same pattern, not a new one.

**Day-level freshness + date-completeness backstops, added 2026-07-22:**
the user manually audited all 24 candidates approved in the clean-slate
run above and found two more systemic gaps, unrelated to grounding:

1. **`isCurrentOrUpcoming` was month-level, not day-level** (see its own
   doc comment) — an event whose run ended 11+ days ago still passed
   because the search month itself hadn't changed yet. Real examples: an
   exhibition closed January 12, another closed February 6, a "José
   Venturelli" inauguración whose exhibition closed July 11 (11 days
   stale relative to the July 22 run) — all still shown as current.
   Tightened to compare calendar day against `now`, not month. Real
   month-level behavior it does NOT change: an event opening next month,
   found incidentally, still counts as valid — only the "already fully
   over" case got stricter.
2. **New `enforceDateCompleteness` filter**: an approved candidate with
   no confirmed `openingDatetime` AND no complete `runStartDate`+
   `runEndDate` pair has nothing to place it on a calendar. Real case:
   "Salón de Julio 2026," approved with `curationReasoning` itself
   admitting "sin fecha específica confirmada de apertura" and no run
   dates either — a genuinely empty date picture that still got shown.
   An inauguración only needs a confirmed date (the hour can stay
   unconfirmed, per the 2026-07-21 `openingTimeConfirmed` work above);
   an expo with no inauguración needs both ends of its run, not just one.

Both are pure code, no prompt change, chained into `curate()` alongside
the other backstops.

**Known, not fixed here — flagged as a separate, later task:** the same
audit found several approved candidates violating scope rules the prompt
*already* states explicitly (a call-for-submissions/convocatoria, a
non-art "Lego"-style winter activity, a municipal workshops post, a
school "semana de las artes" activity) — a prompt-adherence gap, not a
grounding or date-completeness gap. Revisit with concrete negative
examples from these real cases, same technique as the grounding section
above, once there's a next round scheduled for it.

**Scope-classification prompt tuning, added 2026-07-22 (same-day
follow-up to the note above):** this can't be fixed with a deterministic
code backstop the way grounding/freshness/completeness were — there's no
verifiable fact to check, it's a judgment call about what kind of
activity a post describes. Fixed the only way available: added the 4 real
cases as concrete negative examples directly in `buildSystemPrompt`'s
existing "Excluye también, explícitamente" section (`discover.ts`), next
to where the convocatorias/talleres exclusions they violate already
lived — same technique as every other "found a real case, cite it in the
prompt" fix in this doc.

- Convocatorias: "¡Últimos días para postular a Confluencias!...
  completa el formulario, envía tu portafolio..." got approved as a
  current exhibition despite being a literal call for submissions, even
  though its own title said "exposición colectiva."
- Talleres: a post about "164 talleres gratuitos" from a municipality got
  approved as a specific exhibition's inauguración — the real content
  never described any exhibition at all.
- New category, not previously covered: recreational/commercial
  activities using art-adjacent language that aren't visual art — "Brick
  Fest 2026" (a Lego-brick building activity for winter vacation) got
  approved as a visual-art exhibition.
- School/institutional activities with an art-themed name that aren't
  themselves a specific exhibition/intervention — a school's "semana de
  las artes" got approved as an inauguración; it's a themed week of
  activities, the same class of mistake `ART_SCOPE_POLICY`'s existing
  "generic cultural/heritage days" clause already covers for
  municipal-level events, just not yet illustrated for a school context.

Deliberately did NOT touch `ART_SCOPE_POLICY`/`lib/curation-policy.ts` —
those mirror `docs/overview.md` verbatim (per their own doc comments),
and the convocatorias/talleres exclusions these new examples reinforce
already live directly in `discover.ts`'s own prompt text, not in the
shared policy constants — same split as before this change, not a new
one. Left this PR unmerged for review (same as the grounding PR, #100)
since it changes the curation prompt, even though it doesn't touch
`docs/curation-policy.md` itself.

**Prompt-only fix proved unreliable, escalated to a deterministic filter
the same day (2026-07-22):** re-ran Event Discovery on a clean slate with
the scope-classification examples above already merged. "CONFLUENCIAS
II" — the exact same Instagram post used as the convocatoria negative
example — was approved again, on the very next run, with the real
"¡Últimos días para postular... completa el formulario, envía tu
portafolio" text still sitting right there in its own section of the
block Haiku received. A free-text example is a suggestion Haiku can
still ignore, same lesson as "NUNCA inventes" alone not stopping
fabrication. Escalated with `rejectConvocatorias`/`looksLikeConvocatoria`
(`discover.ts`) — a deterministic keyword check, same "belt and
suspenders" pattern as the Recoleta location override: requires a call-
to-action phrase (`postular`/`postulaciones`/`convocatoria abierta`/
`llamado a artistas`) together with a companion term
(`formulario`/`portafolio`/`bases de la convocatoria`/`plazo... postula`)
in the SAME phrase's vicinity — deliberately not just "postular" alone,
to avoid false-rejecting a real exhibition that merely mentions having
come out of a past convocatoria retrospectively (e.g. "obra seleccionada
en la convocatoria 2025, ahora en exhibición"). Checked against each
candidate's own result section only (reuses `enforceGroundedQuotes`'s
`splitBlockByUrl`), same cross-contamination guard. Self-mergeable — pure
code, no prompt change, same category as the grounding/freshness/
completeness backstops (#101-103), not the prompt-text PRs (#100, #104).

The original design below — a precalculated global population/distance
ranking with automatic expansion on saturation — predates the decision to
use a fixed, hand-curated ~100-unit list (see above) and simplified
monthly-only cadence. It is **not in active use** and won't be built out;
kept here only so the reasoning (particularly the big-city bias problem)
isn't lost if a future automatic-expansion need re-emerges at a much larger
scale than currently planned.

The core problem it solved: a naive `population / distance^k` ranking lets
a big, distant city permanently "jump the queue" ahead of a small town,
which — left uncorrected — would have produced exactly the outcome the
curation policy argues against (implying "art only happens in big cities").
The fix, if ever revived, was a log-compressed score
(`log(population) / distance^k`) plus a diversity quota guaranteeing every
Nth expansion pulls from a low-population queue regardless of raw score.

North Korea remains excluded outright regardless of any ranking (OFAC
sanctions; all of the project's infrastructure — GitHub, Vercel, Supabase,
Anthropic — is US-based). Russia and China have no such sanctions issue but
are expected to perform poorly under Tavily too (weak coverage of Russian/
Chinese-language sources, national firewalls) — not a decision that needs
making until they'd actually come up in a real expansion, which isn't
planned right now anyway.

## Audit-trail simplification: rejected candidates no longer stored (2026-07-23)

**`insertCandidates` now only processes approved candidates —
rejected candidates are no longer written to `events` at all.**
Storing rejected candidates "for audit" was the original intent, but
that auditing never actually happened in the 3+ days of production runs
this session covered (every real audit found this session focused on
approved-but-wrong candidates, never on rejected-but-actually-valid
ones) — and it was the direct cause of the `location: null` crash fixed
earlier today (PR #101): `insertCandidates` ran dedup/region-match code
against every candidate regardless of status, and a rejected candidate
can legitimately have a null `location` Haiku never bothered filling in.
A rejected candidate now just gets a `console.log` line (title +
`curationReasoning`) — visible in the run's own GitHub Actions logs, zero
additional cost (log output isn't separately billed; well within
GitHub's default retention). Consequence: full-run audits of rejected
candidates (like this session's several manual reviews) now need to
happen from the workflow's own logs, not a SQL query — logs are pruned by
GitHub's own retention window, not this project's ~1-year event
retention.

**Known, not fixed here:** `run.test.ts`'s integration fixtures
(`unitCandidates`/`brightCandidates`) were never updated for the
`dateQuote`/`locationQuote` grounding fields added earlier today
(PR #100) — they'd fail grounding if actually run against local Supabase
(this file requires `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY`, so it's
been silently skipped all session, not actually exercised). Fixing it
properly needs the stubbed search content reworked so each fixture's
claimed quotes are literally present in what `searchUnitFn` returns, not
just a placeholder `content: "c"` — flagged as a separate follow-up, not
done as a tangent to today's other changes.

## System prompt trimmed for token cost (2026-07-23)

Measured the prompt directly rather than estimating: **~4,194 → ~3,877
tokens**. After a day of adding real production negative examples
(grounding, convocatorias, scope classification — see the sections
above), the prompt grew large enough to actually cross Haiku's
2048-token minimum cacheable-prefix threshold, which had been a
documented no-op until now. Reviewed each addition for whether it still
needed to be prose Haiku has to be convinced by, versus something a
deterministic code filter already verifies regardless of what the prompt
says:
- The 5 narrated grounding case studies collapsed into one short
  paragraph — `enforceGroundedQuotes` verifies every `dateQuote`/
  `locationQuote` in code now, so the prompt doesn't need to work as hard
  to "convince" Haiku case-by-case; it just needs the rule stated once.
- The convocatoria exclusion's inline example (Confluencias) shortened
  the same way, since `rejectConvocatorias` now backstops it in code too.
- Left the talleres/Brick-Fest/"semana de las artes" examples untouched
  — those 3 categories have **no** code backstop yet, so the prompt is
  still the only defense for them.

Left unmerged for review, same as every other prompt-text change this
session (#100, #104) — even a pure trim changes what Haiku actually sees.

## Manual audit follow-up (2026-07-23) — comuna grounding + Tavily chunk size

First production run after emptying `events` and resetting the weekly
batch (25 comunas, $2.53 total: $1.33 Anthropic + $1.20 Tavily; prompt
caching engaged for real this time — 100k cache-read tokens out of
~1.03M input). Manual audit of all 13 approved events found:

- **Confluencias: El Arte de Crear y Ser Visibles** — the exact event
  that motivated the original convocatoria fix (#104/#105) got approved
  again, with two separate real bugs:
  - **Convocatoria language never reached Haiku or the code filter.**
    `rejectConvocatorias` runs on the same `block` text Haiku sees — it
    can't reject a sentence that was never in its input. Root cause:
    Tavily was configured with `chunks_per_source: 1`, returning only
    one text chunk per source; a long Instagram caption's "La
    convocatoria estará abierta hasta el..." sentence likely fell
    outside that chunk. Confirmed against Tavily's own docs that credit
    cost is determined solely by `search_depth`, not `chunks_per_source`
    or `max_results` — raising it is free in Tavily credits, the only
    real cost is more input tokens sent to Haiku. Bumped
    `chunks_per_source: 1 → 2` in `lib/tavily.ts`; measuring the actual
    Haiku token delta on the next real run rather than guessing further.
  - **Wrong comuna (Antofagasta instead of the real Arica).** The same
    event surfaced under two different comuna searches in one run — in
    one, Haiku correctly hedged that the source ("Casa Cultural
    Yanulaque") was from Arica-associated accounts and it was rejected;
    in the other, `location` was just set to whatever comuna was being
    searched (Antofagasta), with no citation supporting it.
    `enforceGroundedQuotes` didn't catch this because
    `buildSystemPrompt`'s own `locationQuote` instructions allow citing
    just a venue/account name when the source doesn't spell out a comuna
    explicitly — that citation was real and grounded, but the comuna
    Haiku then wrote into `location` was never itself part of it. A
    second, less severe repro of the same bug: "Exposición DESOLACIÓN"
    tagged as Valdivia when the source was really Puerto Montt. 3 of 13
    approved events (~23%) had this exact failure mode.

    Fixed with a new deterministic filter, `enforceLocationMatchesQuote`
    (`discover.ts`), chained right after `applyLocationFilter`: the
    comuna text in `location` must itself be a substring of the
    candidate's own `locationQuote` (accent/case/whitespace-insensitive)
    — otherwise the candidate is rejected. Still allows the legitimate
    account-name case the prompt permits (an account like
    "culturaquilpue" already contains the comuna's own text), it only
    catches a comuna asserted with zero textual support at all. Also
    reinforced `buildSystemPrompt` itself with an explicit instruction
    not to default `location` to the searched comuna, plus this real
    case as a named example — same "prompt AND code, not prompt alone"
    treatment as every other grounding fix this session.

- **Two IG-sourced approved events had `image_url: null`** (previously
  captured successfully for similar posts) — consistent with Instagram's
  already-documented fetch flakiness (see the 2026-07-20/07-22 image-fix
  entries above), not an obviously new regression: 3 of 4 IG-sourced
  approved events this run had no image, 1 succeeded, same intermittent
  pattern as before. Not fixed here.

- **Duplicate-looking title, not an actual duplicate.** "Exposición
  Colectiva SalaFEM2026" appeared rejected under several different
  comuna searches (Renca, Villa Alemana, Vitacura, Viña del Mar, Arauco)
  in the run's logs before being correctly approved once, from San
  Felipe's own search — deduplication worked as intended; the repeated
  title in the logs is expected, not a bug.

- Real Anthropic cost for this run reportedly came in ~$1 higher than
  this doc's own `estimateCostUsd`-based estimate ($1.33) — worth
  reconciling against the Anthropic console's real invoice next time it's
  convenient; not re-derived here since only the user has access to the
  actual billing dashboard.

## Test run on the fix branch + runStartDate/runEndDate grounding (2026-07-23)

Ran Event Discovery again directly on the `fix-comuna-grounding` branch
(via `workflow_dispatch --ref`, without merging) to validate the fixes
above before merging. Real cost: **$2.39** ($1.19 Anthropic + $1.20
Tavily, 24 units) — in line with the previous run, not the blowup a
naive doubling of `chunks_per_source` might suggest. Not a clean
before/after comparison though — the weekly batch rotated to a different
25 comunas with less available content overall (954 Tavily results vs.
1,025), so the two variables (chunks_per_source, comuna set) are
confounded. `enforceLocationMatchesQuote` fired 13 times in this run,
confirming it catches the real pattern (e.g. "Limache y Los Andes
unidos por el arte" recurring with `location` set to Cerrillos — the
comuna being searched, not Limache, the real one — same failure shape
as Confluencias).

Manual audit of this run's 4 newly-approved events found the exact same
fabrication problem as the 2026-07-22 grounding fix, just on a pair of
fields that fix never covered:

- **"Pinacoteca Municipal - Exposición"** — the real source said the
  exhibition closed 2026-05-22; stored with `runEndDate: 2026-07-24`,
  making an already-closed exhibition look currently open.
- **"El Despertar de los Sentidos"** — the real source gives no end date
  at all; stored with a specific `runEndDate` anyway.
- **"Río Simpson Tejido"** — real start date 2026-05-07; stored as
  `runStartDate: 2026-07-01`.
- **"Expo Julio 2026"** — dates the user couldn't find in the post text;
  plausibly grounded in an image description instead (see below), not
  confirmed either way since raw search content isn't persisted.

3 of 4 (75%) had a fabricated run-date field. Root cause: `dateQuote`
(2026-07-22) only ever covered `openingDatetime` — `runStartDate`/
`runEndDate` had zero grounding check, so this was the same failure
mode the original fix addressed, just on fields it never touched.

Fixed by extending the same pattern: two new fields,
`runStartDateQuote`/`runEndDateQuote` (`EventCandidate`, `discover.ts`),
with `buildSystemPrompt` instructed to cite them the same way as
`dateQuote`. `enforceGroundedQuotes` now nulls `runStartDate`/
`runEndDate` independently (each only nulled if ITS OWN quote fails
grounding — an ungrounded end date doesn't discard a grounded start
date), same "keep the rest of the candidate, drop only the unverifiable
part" treatment `dateQuote` already used for `openingDatetime`. Composes
for free with the existing `enforceDateCompleteness` filter downstream:
a candidate that loses both run dates and has no confirmed
`openingDatetime` either now gets rejected there, same as if Haiku had
reported no dates at all.

Confirmed along the way (answering a user question): `buildBlock`
appends each candidate image's Tavily-generated description to the
block Haiku sees (`formatImages`, `discover.ts`) — a real, legitimate
route for a flyer's on-image date text to reach Haiku even when it's
absent from the post's own caption, which a human skimming just the
caption wouldn't see. Not something the new quote fields distinguish
from a fabrication — a fabricated date could equally cite fake "image
description" text — but it does mean "the user can't find the date in
the text" isn't proof of fabrication on its own.

System prompt now measures **~4,334 tokens** (up from ~4,117 after the
comuna-grounding reinforcement, ~3,877 after the #107 trim) — still well
above the 2048-token cache threshold.

## Event Crawler (retired)

An earlier pipeline walked a known `venues` table with Claude Haiku, looking
for new opening announcements at each venue's page. It's been fully removed
from the code and schema — Event Discovery (above) is the only
event-sourcing pipeline now, and it never produces or matches venues. See
git history (`apps/curator/src/event-crawler/`, deleted) for the retired
implementation if it's ever needed for reference.

### No email approval flow yet (not worth building on current evidence)

**Decided:** ambiguous events would land with `events.curation_status =
'pending_review'` and no email — resolved manually in Supabase. The original
design called for an email with two approve/reject buttons (Supabase Edge
Function + one-time token). The original blocker (Resend's paid plan needed
to add `caldearte.com` as a sending domain) is gone — `caldearte.com` is
verified in Resend as of the production launch (2026-07-17/18), used by the
`/contacto` form. But that no longer matters in practice: Event Discovery's
curation call is binary (`approved`/`rejected` only, see
curation-policy.md#human-escalation-for-general-ambiguity-not-currently-implemented) — nothing in
production sets `pending_review` today, and real data (271 events as of
2026-07-18, 0 genuine escalations) shows Haiku's binary call isn't leaving
anything genuinely ambiguous. Parked, not an active line item — see
[roadmap.md](roadmap.md)'s Phase 1a.

### Run-summary email (built, 2026-07-19 — separate from the parked flow above)

Not to be confused with the still-parked approve/reject flow above: after
every run, `apps/curator/src/lib/notify.ts`'s `sendRunSummaryEmail` sends a
report to the project owner — comunas consultadas (including any that
failed and stay due for retry), fuentes brillantes fetched, candidate counts
(approved/rejected by Haiku's curation call, vs. actually inserted — kept as
separate numbers since a candidate can be approved by curation but still
filtered out as stale or a cross-run duplicate before insert), a
`mediumType` breakdown, and an estimated cost for the run. Reuses the
`caldearte.com` domain already verified for `/contacto`, and a separate
`RESEND_API_KEY` GitHub Actions secret (not the same store as `apps/web`'s
Vercel env var of the same name).

**Per-event table (added 2026-07-24):** every `curate()`/
`curateBrightSourceItems()` call's candidates — approved AND rejected — get
mapped to a lean `CandidateSummary` (title, status, location/placeName,
dates, `curationReasoning`, sourceUrl) and grouped into `RunSummary`/
`HeadlessRunSummary`'s `eventGroups: EventGroup[]`, one group per comuna
searched or bright source fetched. `buildHtmlBody`/`buildHeadlessHtmlBody`
render this as one table per group (title links to `sourceUrl`,
`curationReasoning` visible per row) — the point is auditing Haiku's actual
per-event judgment (or a `[FILTRO DE CÓDIGO]`-prefixed code-level rejection,
e.g. the sourceUrl invariant or a stale-year filter) straight from the
email, without pulling GitHub Actions logs. The email is sent as both
`html` and `text` (Resend requires at least one; both are set so a
text-only client still gets the full per-event list, not just a pointer to
the HTML version) — `buildBody`/`buildHeadlessBody`'s plain-text tail now
also lists every candidate, grouped and prefixed `[OK]`/`[RECHAZADO]`.

**Adds no measurable cost:** every figure comes from data the run already
computes — the `usage` object each `curate()` call already returns (cost,
via `estimateCostUsd`, re-run locally with no new API call) and the
`credits` each `searchUnitFn` call already returns (Tavily spend estimate,
at the pay-as-you-go rate of $0.008/credit). The only new cost is one
Resend send per weekly run — negligible against its 100/day free tier.
Ancillary by design (wrapped so a failure building or sending it can never
fail an otherwise-successful run, same posture as `pruneOldRawSearchResults`/
`persistNewBrightSources`) — and it no-ops with a warning, not an error, if
`RESEND_API_KEY` isn't set.

**Ambiguous "✅ Aprobado" badge fixed (2026-08-10, found via the same audit
below):** a candidate approved by curation but then dropped before insert
(stale, or a cross-run duplicate) still showed a plain "✅ Aprobado" badge
in the per-event table — indistinguishable, at a glance, from one that
actually landed on the live site. `CandidateSummary` gained a real
`outcome: "inserted" | "duplicate_skipped" | "replaced" | "escalated" |
"expired" | null` (the same outcome `insertCandidates`/`resolveAndInsertCandidates`
already track internally, now threaded through to the email), and the
badge reads that outcome instead of just `status` — "✅ Aprobado y
agregado" vs. "✅ Aprobado (ya existía)" etc., so the email actually
answers "did this reach the site" without cross-referencing the database.

---

## bright_sources_only manual mode (2026-07-23)

A "just run bright sources" request kept triggering a full run anyway —
`discover-events` has no way to opt out of the next `weekly_batch_size`
due comunas, so a manual bright-sources check/refresh always spent real
Tavily/Haiku cost on a comuna batch nobody asked for.

Added `RunDeps.brightSourcesOnly` (`run.ts`): skips `getUnitsDueForRun`
and the comuna loop entirely (`units = []`), leaving bright sources'
own 14-day due-cadence (`isSourceDue`) completely untouched — it doesn't
force bright sources to run, only removes the comuna batch as a side
effect of checking. Wired through `index.ts` (`BRIGHT_SOURCES_ONLY` env
var) and `event-discovery.yml`'s `workflow_dispatch` as a boolean input
— tick it on a manual run to skip the comuna batch.

To force-refresh bright sources regardless of their own cadence (e.g.
right after adding a new one to `known-sources.ts`), still reset
`bright_source_fetch_state` directly first, same as before — this mode
only removes the comuna-batch side effect, it doesn't add a "force"
knob for bright sources themselves.

**Found along the way:** running this suite against local Supabase for
real (previously silently skipped all session — no `SUPABASE_URL`/
`SUPABASE_SERVICE_ROLE_KEY` set) surfaced that `event-discovery/
run.test.ts` and `headless-discovery/run.test.ts`'s fixtures were never
updated for the 2026-07-22/07-23 grounding fields (`dateQuote`/
`locationQuote`/`runStartDateQuote`/`runEndDateQuote`), plus two
fixtures asserting behavior a later policy change (`enforceDateCompleteness`,
`prune_expired_events`'s approved-events carve-out) had already
superseded — 5 failing tests total, none related to bright-sources-only
itself, all now fixed. Full suite (213 tests) passes clean against real
local Supabase for the first time this session.

## Bright-sources pass crash isolation (2026-07-23)

Real production crash, found testing the mode above with all 8 known
bright sources forced due at once: the single `curate()` call over every
due bright source combined (much larger than any one comuna's block) got
a response truncated mid-JSON by Haiku's own `max_tokens` ceiling.
`parseCandidates`'s throw was never caught — it killed the entire GitHub
Actions run, *after* the comuna batch (25 units) had already succeeded
and spent its own real cost (~$1.10 Anthropic + ~$1.20 Tavily,
confirmed via `api_usage_log`). The bright-sources call's own real cost
was lost too — `recordUsage` only runs on `curate()`'s successful
return, never reached.

The per-unit comuna loop already isolates a bad unit this same way
(2026-07-17) — this was the identical failure shape one level up, on
the one call that combines every bright source into a single block.

Fixed at the root: `curate()` (`discover.ts`) now catches a
`parseCandidates` failure and returns `{ candidates: [], usage }`
instead of throwing — the real usage from the API response is captured
before the parse attempt, so a truncated/malformed response still gets
its cost recorded, it just contributes zero candidates. Also wrapped
the bright-sources block in `run.ts` in the same try/catch the per-unit
loop already has, as defense-in-depth for anything else in that block
(`enrichCandidates`, `insertCandidates`) — not just the parse failure
`curate()` itself now handles.

**Follow-up, same day:** verified the fix in production (`workflow_dispatch`
with `bright_sources_only: true`, all 7 due sources at once) — the run
completed successfully instead of crashing, confirming the isolation
worked. But it also showed the underlying data-loss problem was still
there: the SAME combined block truncated again (arteinformado.com's own
multi-page content alone is sizeable), and because it was still one
`curate()` call over every due source, the truncation lost every due
source's candidates for that run, not just the oversized one's — 0
events inserted despite spending real cost ($0.10, `output_tokens:
16000` hitting the ceiling exactly). Fixed by splitting into one
`curate()` call per bright source (`run.ts`), mirroring the per-unit
comuna loop exactly: each source gets the full `max_tokens` budget to
itself, and a per-source `try/catch` means one truncated/oversized
source only loses its own candidates, not every other due source's.

## Dual cadence: comuna coverage monthly, bright sources weekly (2026-07-23)

Strategy decision, after seeing bright sources deliver 9 clean, real
events for $0.15 total in one run — a much better quality-to-cost ratio
than the broad comuna sweep (Tavily search across social media, noisier,
not necessarily official art venues). Deliberate rebalancing, not a cost
cut: run comuna coverage at a slower, smaller pace, and lean harder on
bright sources (curated, official-venue listings) for the bulk of new
events.

`event-discovery.yml`'s single cron became two, same workflow/job,
distinguished at runtime via `github.event.schedule` (only populated on
a `schedule`-triggered run, not `workflow_dispatch`):
- **1st of the month, 06:00 UTC** — a normal full run. `weekly_batch_size`
  (system_config, name kept as-is — renaming needs a migration, not
  worth it for a label) is still 25; at a monthly cadence instead of
  weekly, the full 346-comuna rotation now takes ~14 months instead of
  ~14 weeks. That's the intended effect, not a side effect.
- **Every Monday, 06:00 UTC** — `bright_sources_only: true`, comuna batch
  skipped entirely. Each bright source's own fetch cadence
  (`BRIGHT_SOURCE_INTERVAL_MS`, `run.ts`) dropped from 14 days to 7 to
  match — halved, so this actually finds something new most weeks
  instead of every other one. `headless-discovery`'s own weekly cron
  (`headless-bright-sources.yml`) needed no change — already weekly, and
  it reuses this same constant.

### Debugging one named bright source: `brightSourceUrlFilter`

Added the same day, prompted directly by wanting arteinformado.com and
parquecultural.cl's real logs after they failed in a production run.
Waiting for a source's own 7-day cadence, or clearing EVERY source's
`bright_source_fetch_state` just to force the one you actually wanted,
were the only options before this.

`RunDeps.brightSourceUrlFilter` (`run.ts`): an array of substrings, each
matched against a bright source's own `url`. When set, it REPLACES the
`isSourceDue` check entirely for the matched set — a source runs
regardless of its own cadence, freshly-fetched or not, and every
unmatched source is skipped (not just deprioritized). Wired through
`event-discovery.yml`'s `workflow_dispatch` as `bright_source_urls`
(comma-separated, e.g. `arteinformado.com,parquecultural.cl`) ->
`BRIGHT_SOURCE_URLS` env var (`index.ts`) -> `brightSourceUrlFilter`.
Setting it also forces `brightSourcesOnly` — there's rarely a reason to
also want the comuna batch while debugging one named source.

### Bright sources get relaxed grounding — they're trusted differently than comuna search

Using `brightSourceUrlFilter` to debug arteinformado.com and
parquecultural.cl directly surfaced that the SAME day's grounding
backstops (`enforceLocationMatchesQuote`, `runStartDateQuote`/
`runEndDateQuote`), designed against free-text/social-media
hallucination risk, were rejecting nearly all of both sources' real
content:

- **arteinformado.com**: 13 of 20 real, in-scope candidates rejected by
  `enforceLocationMatchesQuote`. That filter exists to catch Haiku
  defaulting `location` to the COMUNA BEING SEARCHED with no textual
  support — a per-comuna Tavily concept that doesn't apply to bright
  sources at all (there's no "comuna being searched"). Haiku correctly
  inferred a well-known venue's real comuna from general knowledge (e.g.
  "MAC - Espacio Quinta Normal" -> Santiago) without the page ever
  spelling "Santiago" out in citable text — a legitimate inference the
  filter couldn't tell apart from the failure mode it was built for.
- **parquecultural.cl**: nearly every candidate rejected by
  `runStartDateQuote`/`runEndDateQuote` grounding. Its dates come from
  structured JSON fields (`meta.fecha_de_inicio`/`meta.fecha_de_termino`)
  — already correct before Haiku ever sees them, not guessed from prose.
  Requiring a literal citation anyway for a value the hand-verified
  extractor already parsed defeats the extractor's own purpose.

`curate()` (`discover.ts`) now takes an `{ isBrightSource: boolean }`
option. When set: `enforceLocationMatchesQuote` is skipped entirely
(falls back to plain `applyLocationFilter`'s Chile-or-not check), and
`enforceGroundedQuotes`'s run-date citation requirement is skipped
(`skipRunDateGrounding`) — `openingDatetime`/`location`'s own
`dateQuote`/`locationQuote` grounding (the original 2026-07-22
anti-fabrication check) stays in place for bright sources too, since
that risk doesn't disappear just because the source is curated. Wired
into every bright-source `curate()` call: the per-source loop in
`run.ts`, and `headless-discovery/run.ts`'s MAVI call.

**Also found in the same debug run:** a single arteinformado.com pass
had 9 genuinely different exhibitions opening the same day in the same
MAC wing — same location, same exact opening datetime, completely
unrelated titles. The location+date dedup fingerprint (`run.ts`,
originally added for the San Felipe repost bug, 2026-07-18) blindly
matched WITHIN the same batch and kept only the first, dropping the
other 8 as "duplicates". Fixed by scoping that blind fingerprint check
to cross-run comparison only (against events already stored from a past
run, loaded once via `loadExistingKeys` and never mutated mid-batch) —
sibling candidates within the same run now only dedupe via the existing
title-similarity-aware fuzzy check (`isFuzzyDuplicateTitle`), which
correctly tells "Vestiario" apart from "Materia sensible" while still
catching a real repost with a merely-differently-punctuated title.

### parquecultural.cl's real per-event links, still dropped after the grounding fix (2026-07-24)

Re-ran all bright sources after merging the relaxed-grounding fix above
(#114) to measure the real effect: arteinformado.com went from 2 to 14
new approved events, mnba.gob.cl went from 0 to 4 — the expected result.
parquecultural.cl still produced 0, but for a different, new reason: all
4 real, in-scope candidates ("Operación Colombo", "Puentes", "Hilando
resistencias...", "Una metáfora verde...") were rejected by
`enforceSourceUrlInvariant` for having `sourceUrl: null`, despite the
source's real per-event link (`meta.link_al_evento`) being present,
correct, and distinct per item — confirmed directly against the live API
response.

Root cause: `extractWordpressItems` (`extractors.ts`) built each event's
content line as `- "title" (start a end): description. Más info: link`
— the URL last, after a description field (`meta.extracto_corto`) that
is often long and itself contains embedded field-like text (its own
"Lugar: ..." segment, several dashes for opening hours). That reliably
pushed the trailing URL out of Haiku's attention: every real candidate
came back with `sourceUrl: null` even though the link was right there in
the block. The equivalent `articleList` sources (arteinformado.com,
mnba.gob.cl) also put the URL at the end of the line, but their lines are
much shorter and don't have another field-like segment competing for
attention right before the URL — they never hit this failure.

Fix: moved the link to sit right after the title —
`- "title" — link (start a end): description` — matching the pattern
Haiku already follows reliably everywhere else (`buildBlock`'s own
`### title\nurl\ncontent` convention, and the per-event block header in
general). Not yet re-verified against a real production run (next due
run of this source will confirm) — same "measure before building more
infra" posture as the rest of this doc: if this doesn't fully fix it, the
next step would be to skip Haiku's sourceUrl extraction entirely for
`wordpressRestApi` sources and match candidates back to their known
`meta.link_al_evento` deterministically by title, since the JSON API
already gives us the correct answer without needing Haiku to transcribe
it at all.

## Deterministic fields for bright sources with a real extractor — Haiku only curates (2026-07-24)

The two sections above (relaxed grounding, then the parquecultural.cl
`sourceUrl` position fix) were both patches on the same underlying
problem: three separate production bugs in one week, all caused by asking
Haiku to **retranscribe from free text a fact the code already had
structured**. `extractArticleList`/`extractWordpressItems`
(`extractors.ts`) always parsed an exact title/link/image/date per event
internally — then immediately flattened all of it into one prose line and
discarded the structure, handing Haiku a blob to re-extract from, with
deterministic "grounding" filters bolted on afterward to catch Haiku
mis-transcribing what the code already knew.

The fix: both extractors now return `BrightSourceItem[]` — structured
data — instead of flattened text. A new, much narrower curatorial-only
Haiku call, `curateBrightSourceItems` (`discover.ts`), replaces `curate()`
for any bright source with a real `extractor` config:

- `title`/`sourceUrl`/`imageUrl` never touch Haiku at all — they come
  straight from the extractor, merged back onto Haiku's response by
  **index** (Haiku's per-item JSON output includes `index`, the same
  number the item was shown under in the prompt) rather than by matching
  titles, which was itself a historical dedup bug source (Haiku reliably
  reworded titles across separate calls on identical input).
- `location`/`placeName` are deterministic too for a confirmed
  single-fixed-venue source — `known-sources.ts`'s new `KnownSource.
  fixedLocation` field (set on parquecultural.cl, mnba.gob.cl,
  molinomachmar.cl, and MAVI in `headless-discovery/run.ts`) — since
  there's nothing to infer, the comuna never varies per event. A real
  aggregator (arteinformado.com, uchile.cl root, artes.uchile.cl) has no
  `fixedLocation` and Haiku still resolves location per item, since that
  genuinely requires real-world venue knowledge (e.g. "MAC - Espacio
  Quinta Normal" -> "Santiago") a regex can't have — but even there,
  there's no citation/grounding requirement, since it was never a
  transcription task to begin with, just inference.
- `runStartDate`/`runEndDate` are deterministic wherever the source
  itself gives them exactly (wordpressRestApi's `meta.fecha_de_inicio`/
  `fecha_de_termino`, already YYYY-MM-DD) — the prompt tells Haiku not to
  bother for those items, and the merge step ignores whatever it says
  regardless. `openingDatetime` stays Haiku-derived everywhere (no source
  gives a structured inauguración hour), but now interprets a short,
  already-isolated per-item date phrase instead of hunting through one
  giant shared blob.
- All four grounding-quote fields (`dateQuote`/`locationQuote`/
  `runStartDateQuote`/`runEndDateQuote`) are gone from this path
  entirely — not just skipped by a flag, genuinely never asked for or
  produced. There was never a real fabrication-from-nothing risk here the
  way there is on the comuna/Tavily free-text path (which keeps all of
  this completely unchanged): every field Haiku still touches has real
  source text right behind it, and every field that could be fabricated
  from thin air is no longer something Haiku is asked to report at all.

Net effect: title/link/image/location bugs (all three found this week)
become structurally impossible on this path, not just less likely — the
smaller prompt and JSON schema also cut per-event token cost. `curate()`,
`buildSystemPrompt`, and the comuna/Tavily search path's own grounding
filters are completely untouched — this only replaces the bright-source
loop's call site in `run.ts` and `headless-discovery/run.ts`, and only
for a source with a real `extractor` config (auto-detected sources with
no config yet still fall back to the old `curate()`/`isBrightSource`
path unchanged, same posture `sources.ts`'s `fetchHtmlPageFallback`
always had).

### Real event descriptions, recovered deterministically too (2026-07-24, same day)

Follow-up gap found once event detail pages needed a real description to
show: `extractArticleList` never captured one at all — 5 of the 7 known
sources' LISTING pages simply don't carry prose per event, only title/
dates/place (confirmed by fetching all 5 live pages). Only
molinomachmar.cl's listing page has real description text already
sitting in the block; the other 4 (artes.uchile.cl, uchile.cl root,
mnba.gob.cl, arteinformado.com) do have one, but only on each event's own
DETAIL page — confirmed by fetching real detail pages for each:

- artes.uchile.cl / uchile.cl (same CMS): `<div class="content__description" itemprop="description">`
- mnba.gob.cl: `<div class="text-long">` inside `<div class="body_event">`
- arteinformado.com: `<span class="event-text">`, labeled "Descripción de la Exposición"

Two mechanisms, matching where the text actually lives:

- `ArticleListConfig` (`extractors.ts`) gained an optional
  `descriptionRegex`, set only for molinomachmar.cl — captured directly
  at listing-parse time, no extra fetch.
- A new `lib/description-extract.ts` (`DescriptionConfig`/
  `extractDescription`, mirrors `opening-time.ts`'s pattern — matched
  against RAW html, not pre-collapsed text, since the regex needs the tag
  boundaries intact to find the right chunk before stripping them) plus a
  new `KnownSource.descriptionExtractor` field, set on the other 4
  sources. `page-fetch.ts`'s `enrichCandidates` recovers it during the
  SAME detail-page fetch already done for image/opening-time recovery —
  no new network request, just one more thing read out of a page already
  being fetched.

`wordpressRestApi` (parquecultural.cl) and MAVI already had a real
description from their own structured data — untouched by this.

### Dates go fully deterministic too, after a real regression (2026-07-24, same day)

Testing the deterministic-fields redesign in production surfaced one more
"Haiku doing a mechanical job" case: `daysRegex` captures each source's
raw date text, but nothing ever PARSED it — handed to Haiku as free text
to interpret into `runStartDate`/`runEndDate`. A real batch against
arteinformado.com (~28 items) came back with **every item's dates null**,
despite the raw text being completely unambiguous ("11 jul de 2026 - 11
oct de 2026") — confirmed directly, extracting it with no Haiku involved
at all.

Fixed the same way as everything else in this section: `extractDateRange`
(`extractors.ts`) + a new `ArticleListConfig.dateRangeExtractor`, one
regex per source (formats genuinely differ):

- **artes.uchile.cl / uchile.cl**: `del DD/MM/YYYY al DD/MM/YYYY` — plain
  numeric months, no Spanish month-name table needed for this one.
- **mnba.gob.cl**: the Drupal date field already embeds a real
  machine-readable instant — `<time datetime="2025-07-10T12:00:00Z">` —
  read directly, zero parsing.
- **molinomachmar.cl**: day + 3-letter month in two separate `<span>`s,
  with a single shared year in a sibling element. A single-day event
  (concert/talk, not an exhibition) puts an hour ("18 HRS") in the second
  span instead of a month — the parser correctly fails to resolve that as
  a month and returns `null`, degrading safely (harmless in practice,
  since these get rejected on scope grounds anyway).
- **arteinformado.com**: `DD mon de YYYY - DD mon de YYYY`, 3-letter
  Spanish abbreviations.

`resolveMonthGroup` handles both a plain number and a Spanish 3-letter
abbreviation transparently, so uchile.cl's numeric case and the other
three's named-month case share one parser. Haiku's `runStartDate`/
`runEndDate` instruction in `buildBrightSourceSystemPrompt` is now a rare
fallback (only fires for the handful of items where the regex genuinely
doesn't match — markup drift, an edge-case format) rather than the common
path — reworded accordingly.

### Adding a new bright source: what to determine, every time

Codified here so this doesn't have to be rediscovered per source (it's
been rediscovered piecemeal, in production, several times this week
alone). Before wiring a new `KnownSource` entry, fetch a handful of real
pages from the actual site and determine each of these — write the
answer into the config, not into a comment to revisit later:

1. **Listing shape**: one JSON REST endpoint (`wordpressRestApi`) or an
   HTML page with repeating per-event blocks (`articleList`)? Write
   `blockRegex`/`titleLinkRegex` (or the WP field paths) against real
   markup, not assumed markup.
2. **sourceUrl per event**: does the listing already link to each event's
   own detail page, or only to itself (an aggregator page)? If only
   itself, is there a separate JSON field or `<a>` per item that resolves
   to the real one? This must never end up null or shared across 2+
   approved events (`enforceSourceUrlInvariant`/
   `nullifyAggregatorSourceUrls` catch it if it does, but the goal is a
   correct extractor, not needing that backstop).
3. **Dates**: does the listing give a structured field (JSON date, an
   embedded `<time datetime>` attribute) — read it directly, zero
   parsing. Otherwise, what's the EXACT text format ("11 jul de 2026",
   "11/07/2026", "20 JUN" + separate year, ...)? Write a
   `dateRangeExtractor` regex for it, verified against several real
   entries, not just one. Only fall back to leaving it for Haiku to
   interpret (rare, and now explicitly the exception, not the rule) if
   the format is genuinely too irregular to regex reliably.
4. **Location**: is this a single fixed venue (one comuna, always) or a
   real aggregator (events span multiple comunas/venues)? Fixed venue ->
   `fixedLocation` on the `KnownSource`, zero Haiku involvement.
   Aggregator -> **still don't ask Haiku first** — check the event's own
   DETAIL page for a real address (a schema.org `PostalAddress`/JSON-LD
   `addressLocality` field, an `itemprop="address"` microdata tag, a
   plain "Dirección:" line — confirmed present on every aggregator found
   so far). `locationExtractor` on the `KnownSource` + `lib/locations.ts`'s
   `extractComunaName` pulls out just the real, canonical comuna from
   whatever address text that is (a full street address is fine — it
   matches the same way `matchRegionId` already does, segment by
   segment). Recovered by `page-fetch.ts`'s `enrichCandidates` in the same
   detail-page fetch as description/opening-time, always overriding
   whatever Haiku said. Only fall back to Haiku's own venue-name inference
   (still in the prompt as a safety net) if a source genuinely has no
   parseable address anywhere on its detail page.
5. **Description**: does the LISTING page carry real prose per event
   (rare — only molinomachmar.cl so far), or only the detail page (the
   common case)? Listing prose -> `descriptionRegex` on the
   `ArticleListConfig`, no extra fetch. Detail-page-only ->
   `descriptionExtractor` on the `KnownSource`, recovered by
   `page-fetch.ts`'s `enrichCandidates` during the same fetch already
   done for image/opening-time.
6. **Opening time/hour**: does a detail page ever state an exact
   inauguración hour distinct from the run dates? If so, an
   `openingTimeExtractor` (same detail-page fetch as description
   recovery above).

The throughline: **the only thing Haiku should ever be asked to do for a
bright source is judge whether the content is real, in-scope art** —
title, link, image, dates, and location are all deterministic whenever
the source's own markup/API gives them in ANY parseable form, however
irregular. If a future source turns out to need Haiku for something in
this list, that's a signal the extractor config is incomplete, not that
the field belongs to Haiku.

### Location goes deterministic for aggregators too (2026-07-24, same day)

The user pushed back on the one remaining "Haiku infers this" case
(location on a real aggregator, e.g. arteinformado.com): if the source's
listing/detail markup can be regex'd reliably enough to build an
extractor at all, resolving location shouldn't need Haiku's general
knowledge either. Checked the 3 aggregators' real DETAIL pages (not the
listing — the listing only gives a venue NAME, e.g. "MAC - Espacio Quinta
Normal", never a comuna) and found a real, standardized address on every
one:

- **arteinformado.com**: a genuine schema.org JSON-LD `Event` block —
  `"address":{"@type":"PostalAddress","addressLocality":"Santiago",...}`
  — `addressLocality` is already the exact comuna, no parsing needed
  beyond reading the JSON field.
- **artes.uchile.cl / uchile.cl**: `<address itemprop="address">(...full
  street address ending in ", Santiago, Chile")</address>` — same CMS,
  same microdata tag on both.

New `KnownSource.locationExtractor` (reuses `DescriptionConfig`'s exact
shape — the extraction mechanics are identical: capture raw text off the
detail page, strip tags, decode entities) + a new `lib/locations.ts`
export, `extractComunaName(text, regions)`: refactored out of
`matchRegionId`'s existing segment-by-segment matching (same function
internally, `findMatchingRegion`) to return the region's canonical
`name` instead of its `id` — so a full messy street address resolves to
just "Santiago", not the whole address string, matching this app's
existing short "Comuna"/"Venue, Comuna" display convention rather than
showing a street address on an event card. `page-fetch.ts`'s
`enrichCandidates` recovers it during the same detail-page fetch already
used for description/opening-time, and — unlike those two, which only
fill in a field that's null — **always overrides** whatever
`curateBrightSourceItems` put in `location`, since Haiku's guess was
always meant as a fallback for a source with no working extractor, never
something to trust over the source's own stated address once one exists.
`enrichCandidates` gained a `regions: RegionLike[]` parameter for this
(both `run.ts` call sites already had `regions` loaded before calling
it; `headless-discovery/run.ts` needed its own `loadAllRegions()` call
moved earlier to make it available too).

With this, the only remaining Haiku-derived field for a bright source
with a real extractor is `openingDatetime` — which no source has ever
given structured, on any page, listing or detail.

### New source: museoregionalaysen.gob.cl (2026-07-27) — and a real year-inference bug it exposed

Added at the user's request: Museo Regional de Aysén (Coyhaique), a
national-network regional museum. Same SNPC/Drupal CMS as mnba.gob.cl —
identical block/title/days/place markup, its `articleList` config is a
near-verbatim copy (block regex, title regex, embedded `<time datetime>`
date range, `fixedLocation: { location: "Coyhaique", placeName: "Museo
Regional de Aysén" }`). `/cartelera` (2 real exposiciones at last check,
spanning two on-site venues — Sala Bodega, Cocina de Peones) +
`additionalPages: ["/cartelera/proximos"]` (a real separate view for
not-yet-open exhibitions, empty at last check but the same pagination
pattern as this doc's other multi-page sources).

**Cadence decision, made explicit rather than silently defaulting**: this
source shares the same uniform 7-day `BRIGHT_SOURCE_INTERVAL_MS`
(`event-discovery/run.ts`) as every other bright source, even though a
small regional museum won't update often. Per-source cadence infra already
exists (`bright_source_fetch_state`, keyed by URL) — only a per-source
*override* of the interval doesn't. Deliberately not built now: a fetch
that finds nothing new still costs one HTTP GET (negligible) plus one
`curateBrightSourceItems` call sized to however many items are ON the
page at fetch time (2 today), not to how much is genuinely new — there's
no diff-against-last-run mechanism, so cost scales with listing size, not
staleness. At ~7 known sources and the measured ~$5-9/mo real spend, one
more small-listing source doesn't move the needle enough to justify
adaptive-cadence infrastructure before there's data showing it matters —
same posture as this project's other "measure before building infra"
decisions. Revisit if the bright-source count grows enough that several
near-static sources' redundant weekly Haiku calls become a measurable
fraction of spend.

**Two real, general bugs found and fixed while adding this source (not
specific to it — both were latent for every existing source with the
same shape):**

1. **Title HTML entities never decoded.** `extractArticleList`'s title
   came straight from `collapseWhitespace(rawTitle)`, with no
   `decodeHtmlEntities` pass — unlike image URLs, which already got this
   (mnba.gob.cl's own `&amp;` bug, found earlier). This source's listing
   wraps quoted titles in literal `&quot;` (`Exposición temporal
   &quot;Visiones de Aysén&quot;`), which would have shipped un-decoded
   onto the calendar. Fixed in `extractArticleList` itself, so it applies
   to every `articleList` source, not just this one.
2. **Opening-time year-inference anchored to the wrong "now".** This
   source's inauguración text never states a year ("Inauguración: Jueves
   19 de marzo … Hora: 18:30 h."), same as uchile.cl/artes.uchile.cl.
   `extractOpeningDatetime`'s year-inference (`opening-time.ts`) defaults
   `referenceDate` to the real current clock time — correct when there's
   no other date signal, but for THIS source the exhibition's real year is
   already known independently, from the same source's own
   `dateRangeExtractor` (`structuredStartDate: "2026-03-19"`). Running in
   July (well after March), the inferred year rolled forward to 2027,
   showing a currently-running exhibition's already-past inauguración as
   happening 12 months in the future. Fixed by anchoring
   `extractOpeningDatetime`'s `referenceDate` to the candidate's own
   `runStartDate` when one is already known (`page-fetch.ts`'s
   `processCandidate`) — falls back to the real current time exactly as
   before when `runStartDate` isn't set, so uchile.cl/artes.uchile.cl (no
   structured start date at all) are unaffected. `EnrichCandidateLike`
   gained a `runStartDate` field for this.

### New source: museodeancud.gob.cl (2026-07-27)

Museo Regional de Ancud (Chiloé) — same SNPC/Drupal template as mnba.gob.cl
and museoregionalaysen.gob.cl, confirmed against real fetched HTML: the
`articleList` config (block/title/days/place regexes, embedded `<time
datetime>` date range, `descriptionExtractor` reading the same `text-long`
container) is byte-identical to the other two SNPC sources, just pointed at
this domain. `fixedLocation: { location: "Ancud", placeName: "Museo
Regional de Ancud" }`. `/cartelera` (1 real exposición at last check) +
`additionalPages: ["/cartelera/proximos"]` (empty at last check, same
pattern as the others). No `openingTimeExtractor` — the one detail page
checked never states an inauguración hour, and per this doc's own
escalation checklist, a pattern only gets written once verified against
real markup, not guessed by analogy to the other SNPC sources.

### Candidate sources reviewed and rejected (2026-07-27)

Logged so these don't get re-proposed and re-investigated from scratch —
each was checked against the real live site, not judged from the URL
alone:

- **eldivisadero.cl** (`/_categoria/Cultura/...`) and **aysenahora.cl**
  (`/category/cultura/`) — both real local news outlets (Coyhaique/Aysén),
  not event listings. Sampled ~10 items each: at most 1 genuine visual-art
  exhibition per page, the rest conventional theater, music, dance,
  general regional news mixed into the same "Cultura" category. No
  per-item date/place fields in the listing at all — the event (if any) is
  buried in free-text article prose, which would mean asking Haiku to
  re-derive data the deterministic-fields architecture was built
  specifically to avoid. Institution type (news outlet vs. museum vs.
  municipality) was explicitly NOT the deciding factor here — content
  density and listing structure were.
- **maho.cl/web/blog/** — turned out to be the Municipalidad de Alto
  Hospicio's press blog (not a museum, despite the name reading like one).
  Sampled 10 titles: zero art content (housing handovers, judo medals,
  security operations, a Día del Niño activity). Rejected purely on
  content grounds, not because it's a municipality — a genuinely
  art-active municipal/community/school source would be exactly as valid
  as a gallery (see `overview.md`'s own scope: street interventions,
  community centers, neighborhood associations all count).
- **edicioncero.cl** (`/category/arte-y-cultura/`) — a real Iquique news
  outlet with a dedicated arte-y-cultura category, but effectively
  abandoned: last post in that category is dated 2025-07-03, over a year
  stale as of this review. An inactive feed adds nothing going forward
  regardless of past content quality.
- **diariolongino.cl** — general Tarapacá regional news outlet, no
  dedicated cultura/arte category at all (only nacional, deporte, salud,
  opinión, ciencia-y-tecnología). The handful of culture-adjacent items
  found on the homepage (an orchestra concert, a religious exhibition
  about La Tirana, a children's painting contest) skew out-of-scope or
  borderline; no structured per-item event data anywhere on the site.
- **redmuseosaysen.cl/noticias-red-museos-aysen** — a regional museum
  network's own news page, but built on Wix and rendered entirely
  client-side: a plain fetch returns only the empty page shell, no post
  content or dates anywhere in the raw HTML (confirmed no embedded JSON
  either). Reading it would require the same headless-browser machinery
  built for MAVI (`headless-discovery/`) — a real engineering/cost step
  up, not justified without first confirming the content (a museum
  *network's* news, likely more encuentros/convocatorias than a per-museum
  exhibition calendar) is worth it. If any single member museum has its
  own plain-HTML cartelera page, that's the better target, not the
  network's aggregate news feed.
- **facebook.com/centroculturaldealtohospicioccaho** — confirmed via a
  real headless browser render (not just a plain fetch) that Facebook
  shows at most the single most-recent post before covering the rest of
  the page with a "sign in to see more" modal — a real, deliberate
  anti-scraping wall that a plain fetch OR a JS-rendering headless browser
  both hit equally; this isn't a parsing problem to solve with a better
  extractor. The only real path to a Facebook Page's post history is
  Meta's Graph API (app review, access token) — already flagged in
  `CLAUDE.md` as needing explicit user approval before any work toward it
  (Phase 4).
- **fme.cl** (Fundación Minera Escondida) — `/exposiciones/` is a
  retrospective archive: year filters only go up to 2025 (no 2026), body
  text in past tense, no run dates on any detail page at all. Its two
  `/extension-cultural/sala-de-arte-{antofagasta,san-pedro-atacama}/`
  pages have exactly the right SHAPE (a real fixed gallery, month-range
  exhibition listings, per-item detail pages) but are both explicitly
  headed "...2025" and every listed exhibition's month range is already
  well past by 2026-07-27 — the site hasn't been updated for the 2026
  season yet, and the year lives only in the page-level heading, not per
  item, so there's no deterministic way to tell a stale listing from a
  refreshed one without a human re-check. Worth revisiting once FME
  updates those two pages for 2026 — not rejected on structure, rejected
  on staleness.
- **balmacedartejoven.cl/galerias-baj/** (2026-07-28) — a real, active
  national gallery network (5 sedes: Antofagasta, Valparaíso,
  Metropolitana, Bío Bío, Los Lagos), genuinely different situation from
  every source added this session: the LISTING page carries no date or
  comuna signal at all (title + image + a region-level category tag like
  "Los Lagos"/"Bío Bío", not a comuna), and detail-page dates are
  free-text prose with no consistent phrasing — sampled 5 real detail
  pages: one gave a full date with year ("hasta el 29 de julio de 2026"),
  one gave a date with NO year at all ("hasta el 20 de mayo" — genuinely
  ambiguous without external context), and one had no date anywhere in
  the body text, only the unrelated WordPress publish date. No
  `dateRangeExtractor` regex can reliably parse that inconsistency, unlike
  every other bright source added so far. Building around it would mean a
  new pre-curation mechanism (routing detail-page prose into `rawDateText`
  for Haiku to interpret, not just `description`) plus accepting a real
  residual risk of occasional wrong-year guesses on ambiguous phrasing —
  explicitly decided not worth it (2026-07-28): BAJ's own exhibitions
  already surface through chilecultura.gob.cl (the national aggregator,
  added the same week) with clean structured dates/location, a more
  consistent path to the same real content than scraping BAJ directly.

### New source: mallecoescultura.cl (2026-07-27) — added despite being currently empty

Malleco es Cultura, a regional cultural-tourism portal spanning 8 comunas
(Angol, Collipulli, Lonquimay, Los Sauces, Purén, Renaico, Traiguén,
Victoria). The URLs the user originally pointed at
(`/categoria/exhibicion/`, `/etiqueta/exposicion/`) turned out to be a
retrospective blog archive — past-tense recap posts ("FUE INAUGURADA")
with no per-item date field at all, same shape as the news-outlet sources
rejected the same day. The real target was one layer deeper: the site
runs "The Events Calendar" (Modern Tribe/StellarWP), a real WordPress
events plugin, at `/eventos/`, pre-filterable server-side to just the
"Exposición" category via `/eventos/categoria/exposicion/`. That filter
isn't perfectly clean (the site cross-tags some concerts/talks with
"exposicion" too, confirmed checking its own past-events archive) but
meaningfully narrows what Haiku has to review either way.

**Verified against the plugin's own `/eventos/lista/?eventDisplay=past`
archive** (12 real historical events, confirmed via `extractArticleList`
against the actual production config) since the live upcoming list is
genuinely empty right now ("No hay eventos programados."). Added anyway,
per explicit instruction: a fetch that finds nothing costs one HTTP GET +
zero Haiku tokens, and the source is already wired up the moment a real
exhibition gets scheduled — same reasoning as
museoregionalaysen.gob.cl's low-traffic cadence decision, above.

Config: `blockRegex`/`titleLinkRegex`/`daysRegex`/`placeRegex` against the
plugin's `tribe-events-calendar-list__event` markup; `descriptionRegex`
reads real inline prose already on the listing (no separate detail-page
fetch needed for that field, same as molinomachmar.cl); `locationExtractor`
reads a detail-page `<span class="tribe-locality">` — an aggregator (8
comunas), not `fixedLocation`, but this field is even cleaner than the
other aggregators' full street addresses (already just the bare comuna
name).

**Two general fixes made while verifying, both reusable beyond this one
source:**

1. **`extractImgTags` now prefers `data-src` over `src`.** This site
   lazy-loads images (`src` holds a tiny base64 placeholder, the real URL
   only lives in `data-src`) — the first source this session to actually
   hit that pattern. Preferring `src` unconditionally would have stored
   the placeholder itself as `imageUrl`. Falls back to `src` when there's
   no `data-src`, so every other existing source is unaffected.
2. **`extractDateRange` gained a `dayIso` shorthand.** The Events Calendar
   plugin gives exactly ONE date per event (an inauguración/presentation,
   never a multi-week exhibition run) — no separate end date exists
   anywhere to capture. `dayIso` treats that single day as both
   `runStartDate` and `runEndDate`, satisfying `enforceDateCompleteness`
   honestly instead of leaving the candidate dateless. Reusable for any
   future single-date-event source, not specific to this plugin.

### Pre-curation dedup for bright sources (2026-07-28)

Every bright-source fetch cycle re-pulls its listing in full and, until
now, re-sent EVERY item to Haiku regardless of whether it had already
been curated in a previous run — no "already seen, don't ask again"
step existed anywhere before Haiku. Harmless at the scale of a single
museum's 2-3 exhibitions, but a real, measured cost problem once
chilecultura.gob.cl entered the picture (the Ministerio de las
Culturas' national agenda, ~50 "Artes visuales" events/week — most of
which repeat week to week, since a listing this size barely changes day
to day).

**Scope, deliberately limited to bright sources** (not the comuna/
Tavily path): a comuna search returns genuinely different Tavily
results run to run, so the repeat problem is much smaller there — and
it's exactly the code path that already caused a real production crash
(2026-07-22) from processing a rejected candidate's null `location`
through code that assumed it was always a string, which is why rejected
candidates stopped being stored in `events` at all (see
`run.ts:insertCandidates`'s own comment). Reopening that path for a
comparatively marginal win wasn't worth it.

**New table, `rejected_candidates`** (migration
`20260728010000_add_rejected_candidates.sql`) — separate from `events`,
on purpose: never touches `location`, so it can't reopen the crash class
above, and stays clear of `events`' public views/RLS, which assume every
row there is real approved (or pending_review) content. Just
`source_url` (unique), `title`, `reason`, `created_at`. Rolling ~90-day
window (`REJECTED_CANDIDATE_WINDOW_MS`), pruned on every run alongside
`raw_search_results`/expired events — long enough to skip re-curating a
typically-static listing for a full exhibition cycle, short enough that
an item whose content genuinely changes eventually gets a fresh look
instead of being excluded forever.

**Mechanism**: before a bright source's items ever reach
`curateBrightSourceItems`, they're filtered against
`excludedSourceUrls` — the union of `seenKeys.sourceUrls` (every
`source_url` ever approved into `events`, no time limit at all: if it's
already there, there's never a reason to ask Haiku about it again,
however old) and `loadRecentlyRejectedSourceUrls(now)` (rejections
within the rolling window). Computed once per run, reused across every
due bright source. A source where every item gets filtered out skips
calling Haiku entirely for that pass. Same mechanism in
`headless-discovery/run.ts`'s MAVI call. When a candidate comes back
rejected with a real `sourceUrl`, `insertCandidates` upserts it into
`rejected_candidates` — same defensive posture as the rest of that
function (a failure here logs and moves on, never breaks the run).

### Description recovery moved before curation, not just after (2026-07-28)

Real production case, found testing the dedup mechanism above against
museodeancud.gob.cl: Haiku correctly rejected a genuine, currently-running
exhibition ("Pinceladas de esperanza: los colores del alma") — reasoning:
"sin descripción... no es posible confirmar que sea una exposición real".
This source's LISTING page has no prose at all (only title/dates/place);
the real description only lives on the event's own detail page
(`descriptionExtractor`, known-sources.ts). Description recovery already
existed (`enrichCandidates`'s own description-recovery step, added
2026-07-24) — but that only ever runs AFTER curation, for already-approved
candidates, which only helps a candidate Haiku already said yes to. A
candidate Haiku is on the fence about (or rejects for lack of substance)
never got a second look with real prose.

**Fix**: new `enrichBrightSourceItemDescriptions` (`lib/page-fetch.ts`) —
same `findDescriptionConfig`/`extractDescription` machinery as
`enrichCandidates`'s own description step, but runs on `BrightSourceItem[]`
BEFORE `curateBrightSourceItems`, for every item still in the curation
batch (post-dedup, not just eventually-approved ones). Wired into both
`event-discovery/run.ts`'s bright-source loop and
`headless-discovery/run.ts`'s MAVI call (a no-op there in practice, since
MAVI's description always comes from `activity.content` already — kept
for consistency).

**Real cost/time tradeoff, accepted deliberately**: an eventually-approved
candidate's detail page now gets fetched twice — once here for
description, once more by `enrichCandidates` for image/opening-time/
location. Not worth the added complexity of threading the already-fetched
HTML through to avoid a second GET; Haiku judging real prose instead of a
bare title is worth more than saving one fetch. Image/opening-time/
location recovery deliberately stay post-curation, approved-only — none
of those affect whether Haiku can tell "is this genuinely a visual-art
exhibition," only description does.

### New source: chilecultura.gob.cl (2026-07-28) — national aggregator, first source with clean per-item location

Chile's official national art/culture agenda (Ministerio de las Culturas,
las Artes y el Patrimonio). Unlike every other aggregator so far
(arteinformado.com, uchile.cl root), this one is a real JSON REST API, not
an HTML listing — found by intercepting the live site's own outgoing
request in the browser (`disciplines=4` filters to "Artes visuales";
`discipline_id`/`main_discipline` looked plausible but silently returned
everything unfiltered — `region` uses the site's own internal numbering,
not official Chilean region codes, so left unset for national scope
rather than risk a wrong id). `page_size=100` returns all ~50 filtered
results in one page (`page_count: 1`), no pagination needed.

**Real per-item shape** already gives clean structured fields no other
source has offered together: `start_date`/`end_date` as `YYYY-MM-DD`
(WordPress's own REST fields use `YYYYMMDD` instead — `formatWpDate`,
extractors.ts, now handles both), and `commune`/`venue_name` already
resolved per item — no detail-page fetch or venue-name-to-comuna
inference needed at all, unlike every other aggregator.

**Extended the extractor architecture to carry this** (`BrightSourceItem`,
`WordpressRestConfig`, extractors.ts): two new optional fields,
`location`/`placeName` on the item and `locationField`/`placeNameField`
(dotted paths) on the config. `discover.ts`'s `mergeBrightSourceCandidate`
now prefers `item.location`/`item.placeName` over whatever Haiku's row
says (same precedence tier as `fixedLocation`, which still wins over
everything when set) — and `curateBrightSourceItems` skips asking Haiku
for location at all (`needsLocation: false`) once every item in a batch
already carries its own `item.location`, saving the tokens a location
question would otherwise cost.

**Description field needed real entity decoding**: the API's
`description` is rich HTML (`<p>`, named Spanish entities like `&aacute;`,
`&ntilde;`, `&deg;`, `&ndash;`/`&mdash;`) — a new `htmlToPlainText`
(extractors.ts, `SPANISH_HTML_ENTITIES` table) strips tags and decodes
entities before the text ever reaches Haiku. Verified against all 50 real
fetched items: 0 leftover `&xxx;` artifacts, 0 null locations, 0
unparseable dates.

**Real cost, computed before shipping** (per the project's own
`estimateCostUsd`, run against the actual `buildBrightSourceBlock` text
for all 50 real items): ~21,214 input + ~5,000 output tokens ≈ $0.046/
week ≈ $0.20/month — negligible against the ~$5-9/mo baseline (same
real-fetched-data measurement methodology as the 2026-07-20 cost
analysis, not an estimate).

**Real production bug, found on the very first live run**: crashed
immediately with `items.map is not a function`. `fetchJsonApiSource`
(sources.ts) had always assumed the JSON response body itself is the
items array — true for parquecultural.cl (the only prior
`wordpressRestApi` source), but chilecultura.gob.cl's real response
wraps it instead: `{ total_count, page_count, next, previous, results:
[...] }`. A manually-fetched sample during development had already been
unwrapped (saved as just the `results` array), so this never showed up
until the real API call ran in production. **Fix**: new optional
`resultsField` (dotted path, same idiom as `locationField` etc.) on
`WordpressRestConfig` — `chilecultura.gob.cl`'s config now sets
`resultsField: "results"`; `fetchJsonApiSource` reads the array via a new
`getPath` helper (extractors.ts) instead of assuming the body itself is
one, and throws a clear error (caught by the existing per-source
try/catch, same degrade-one-source-not-the-run posture as any other
bright-source failure) if the resolved value still isn't an array.
Lesson: when a manually-fetched sample gets pre-processed before saving
("just the array, for convenience"), verify the *actual* wire shape
against the real endpoint one more time right before shipping — a
downstream/upstream shape mismatch like this had every unit test passing
while still crashing on the very first real call.

### Cross-source dedup: place_name joins the fingerprint, title similarity gets an overlap-coefficient branch (2026-07-28)

Evaluating `balmacedartejoven.cl` as a candidate bright source surfaced a
real dedup gap: the exact same exhibition is titled completely
differently across sources — "Estado de Posibilidad: Exposición del
Laboratorio I de Artes Visuales" on chilecultura.gob.cl vs. "LAB#1:
«Estado de Posibilidad»" on the venue's own site (an internal lab code
name vs. a full descriptive title). The two share only 2 of 7 total
distinct words (Jaccard ≈ 0.29), well under `isLikelySameTitle`'s
existing 0.6 threshold, so the location+date fuzzy-match bucket
(`titlesByLocationDateOnly`, run.ts) never fired. Testing the actual
overlap ratio between the two sources found only 1 of 4 known BAJ events
had a matching title at all — low, but not zero, and the one match that
existed proved the underlying gap.

**Two changes, both requested explicitly** (comuna+lugar+fecha as the
"harder"/stricter dimensions, título as the deliberately more permissive
one — "un rango aceptable de coincidencia... lo demás es más duro"):

1. **`place_name` joined the fingerprint** (`locationDateKey`/
   `locationDateOnlyKey`, run.ts) — comuna alone is too coarse (many
   venues share a comuna); place_name (normalized the same
   accent/case/quote-insensitive way as title, since venue names get
   punctuated differently across sources too) narrows it to the actual
   venue. Strictly a precision increase on the EXACT fingerprint (more
   fields = fewer accidental collisions, never more) — the tradeoff is
   real but accepted: if two sources genuinely phrase the same venue's
   name differently enough that `normalizeTitle` doesn't unify them, that
   pair won't dedupe. Preferred over losing real, distinct events to a
   false merge.

2. **`isLikelySameTitle` gained an overlap-coefficient branch**
   (`shared.length / min(|wordsA|, |wordsB|)`, alongside the pre-existing
   Jaccard check) — catches exactly the "one title is a terse
   internal-code subset of a longer descriptive one" case (overlap ≈ 0.67
   for the real BAJ pair) that Jaccard structurally can't, since Jaccard
   penalizes the LONGER title's extra words even when the shorter title
   is almost entirely contained in it. Still gated on `shared.length >= 2`
   (unchanged) — verified against the existing ARTEPUERTO regression test
   (a single shared proper noun across genuinely different sub-events)
   that this gate alone, independent of which similarity formula is used,
   is what prevents that false-positive class; a dedicated new test
   confirms a single-word title fully contained in another (overlap =
   1.0) still doesn't qualify without a second shared word.

Also fixed, same commit: the date-only fingerprint used for an exposición
(no `openingDatetime`) only ever included `runStartDate`, silently
dropping `runEndDate` — two different-length runs starting the same day
would have been treated as one. Now uses the full `runStartDate|
runEndDate` pair, matching the run's actual explicit request (inicio+fin
for expos, solo inicio — date-only, hour ignored — for inauguraciones).

Net effect: none of the existing dedup regression tests changed behavior
(same Jaccard threshold, same shared-word floor, place_name only ever
narrows a match, never widens one) — the two changes are additive,
scoped to the exact gap this real case exposed.

`balmacedartejoven.cl` itself was not added as a source in this pass —
this was purely the dedup groundwork it exposed the need for.

### New sources: mamchiloe.cl and centronacionaldearte.cultura.gob.cl (2026-07-28)

Two more real, single-fixed-venue museums added, both `articleList`
sources with `fixedLocation`.

**mamchiloe.cl** (Museo de Arte Moderno de Chiloé, Castro) — genuinely
low-cadence: MAM mounts ONE flagship "Muestra Anual" exhibition per
summer season (real archive since 1989, `/category/muestras_mam/`), so
`/category/hoy/` typically has 0-1 new items per YEAR. Added anyway, same
zero-marginal-cost reasoning as mallecoescultura.cl/
museoregionalaysen.gob.cl. Old-school WordPress "Kubrick"-family theme
(`box-N post-NNNN` blocks) — confirmed the listing page already carries
the FULL post body (real image, complete curatorial text), same posture
as molinomachmar.cl: no separate detail-page fetch needed at all.
`daysRegex` captures the entry's own opening summary line when present
(e.g. "38ª Muestra Anual del MAM Chiloé, desde el 17 de enero al 17 de
junio.") — no year in that phrase, but the post title always states it
(e.g. "2026 MUESTRA ANUAL 38"), which Haiku always sees too; left for
Haiku to interpret given the volume is too low to justify a dedicated
year-stitching regex.

**centronacionaldearte.cultura.gob.cl** (Centro Nacional de Arte
Contemporáneo, Cerrillos) — official Ministerio de las Culturas
institution, real active "Exposiciones" category (2023 through May 2026
at review time). Listing gives a real per-item date, but it's the
PUBLISH date, not the exhibition's own — a `descriptionExtractor`
recovers the actual detail-page body pre-curation (same posture as
uchile.cl/mnba.gob.cl before those got deterministic dates), since the
listing itself carries no prose at all. That body prose states real
exhibition dates but too inconsistently phrased for a dedicated
`dateRangeExtractor` (full "Del 4 de noviembre de 2023 al 5 de mayo
2024" ranges alongside relative ones like "El próximo 30 de mayo a las
12hrs" with no year in that specific phrase) — left for Haiku, which
sees the recovered text alongside the nearby publish-date line and can
resolve the implied year the same way a human reader would.
`titleLinkRegex` needed a lookahead: the visible title lives in its own
`<span>`, separate from the `<a class="mas" href="...">+ Más</a>` link
that carries the URL — the first known-sources.ts config where the link
text isn't the title itself.

**Real bug found building CNAC** (fixed the same commit, general, not
CNAC-specific): `lib/description-extract.ts`'s `decodeHtmlEntities` only
had a named-entity lookup table (`&aacute;` etc.) — CNAC's WordPress
install encodes every accented character and curly quote as a HEX
NUMERIC entity instead (`&#xE1;` for á, `&#x2014;` for an em dash), which
the old decoder silently left undecoded. Fixed generically: numeric
hex/decimal references now resolve by codepoint before the named-entity
table gets a turn — benefits any future source using numeric entities,
not just this one.

### Duplicate handling: the "better" version can now REPLACE the stored one, not just get dropped (2026-07-28)

Real case that prompted this: evaluating mssa.cl (Museo de la Solidaridad
Salvador Allende) as a candidate bright source, all 3 of its currently
running exhibitions turned out to already be in the calendar via
chilecultura.gob.cl — but one of them (`América despierta`) had a WRONG
`run_end_date` (chilecultura said 2026-08-02; MSSA's own detail page,
with a real structured `Fecha de término: 16/08/2026` field, said
2026-08-16). Until now, `insertCandidates`'s dedup only ever SKIPPED a
duplicate — the stale aggregator-sourced row would never get corrected
even once a better version showed up.

**Explicit rule, two tiers, in order** (from the project owner):
1. Whichever side has a **confirmed opening date+time** wins outright — a
   candidate with only a bare date (or nothing) never beats one with the
   real hour, regardless of source.
2. If both tie on that (both confirmed, or neither), the **venue's own
   site wins over an aggregator** merely re-listing it. A true tie (same
   tier on both signals) keeps whatever's already stored.

**Implementation**: `lib/known-sources.ts` gained `isAggregatorSource(url)`
— reuses `fixedLocation`'s absence as the aggregator signal (every
KNOWN_SOURCES entry without one today — artes.uchile.cl, uchile.cl root,
arteinformado.com, mallecoescultura.cl, chilecultura.gob.cl — is already
documented as a genuine multi-venue aggregator; every one WITH
`fixedLocation` is a single venue's own site) rather than a new dedicated
field. `event-discovery/run.ts`'s `SeenKeys` now carries `Map<string,
ExistingEventInfo>` (id, title, sourceUrl, opening fields) instead of
plain `Set<string>`/`string[]`, so a matched duplicate can be looked up
and, when it should win, `UPDATE`d in place by `id` (same row, not a
delete+reinsert) instead of just skipped. `insertCandidates`'s own INSERT
path now also captures the fresh row's real `id` (added `.select("id")`)
so a LATER candidate in the same batch that turns out to be a better
version of THIS one can replace it too, not just rows from past runs.

**Real edge case found writing the tests**: the plain exact-title dedup
signal (the oldest one, predates this session) doesn't know about
place_name/comuna at all — it was never a problem before because two
genuinely different tests' titles never collided, but a REPLACE now
changes the stored title, which can retroactively make two same-batch
candidates share an exact-title match despite having different
place_names. Not fixed here (out of scope for this task, and the
existing location+date fingerprints already cover the realistic
case) — just something to keep in mind if a future duplicate check seems
to fire on title alone when it shouldn't.

### New source: mssa.cl (2026-07-28) — the source whose stale-date problem motivated the REPLACE feature above

Added as a bright source in its own right, not just as the comparison
case that exposed chilecultura.gob.cl's stale `run_end_date`: it's the
ORIGINAL (`fixedLocation`, not an aggregator) for its own exhibitions, so
`isAggregatorSource` now lets it win ties against the national
aggregator going forward, not just this one time.

Two real structural gaps this source needed, neither seen on any prior
source:

1. **The listing page's date text is incomplete, not just informal.**
   `/exposiciones/`'s "actuales" slider (`temporalidad-actuales` class —
   blockRegex matches only this, never the separate "Anteriores"/
   `temporalidad-anteriores` section of dozens of past shows) gives each
   current exhibition only an END date ("Abierta hasta el 2 de agosto
   2026") — no start date anywhere on the listing. Every prior
   `dateRangeExtractor` source gave a full range on the listing itself;
   this is the first one that structurally can't. Left as-is, Haiku would
   see a rawDateText with no start info either, and
   `enforceDateCompleteness` would reject an otherwise-real, currently-
   open exhibition for lacking `runStartDate`.

2. **The detail page has the real answer, cleanly structured** — a
   `Fecha de Inauguración` / `Fecha de inicio` / `Fecha de término` fact
   block, all `DD/MM/YYYY`, confirmed against both sampled exhibitions
   that no hour is ever stated for any of the three. `known-sources.ts`
   gained a new sibling field, `detailDateRangeExtractor` (same
   `DateRangeConfig` shape `dateRangeExtractor` already uses — the
   underlying `extractDateRange` parser is generic over any HTML string,
   listing block or detail page), and `lib/page-fetch.ts`'s pre-curation
   description recovery (`enrichBrightSourceItemDescriptions`) was
   broadened and renamed to `enrichBrightSourceItemDetails`: same single
   detail-page fetch per item, now also runs `extractDateRange` against
   it when `structuredStartDate` is still null, so `runStartDate`/
   `runEndDate` are fully resolved BEFORE curation ever needs to judge
   date completeness. `openingTimeExtractor`'s pattern matches the same
   `DD/MM/YYYY` text (numeric month) — required generalizing
   `lib/opening-time.ts`'s month resolution to accept a plain number, not
   just the Spanish 3-letter abbreviation every prior source used (same
   numeric-or-abbreviation flexibility `extractDateRange`'s
   `resolveMonthGroup` already had).

**Addendum (2026-07-28, same day): mssa.cl is blocked by Cloudflare
specifically for GitHub Actions' IP/ASN.** First production run failed —
`html source https://www.mssa.cl/exposiciones/ responded 403` — but a
plain `curl`/Node `fetch()` from a home IP both return 200 with no special
headers, so it's not a UA/TLS-fingerprint issue. Confirmed via `curl -I`:
mssa.cl sits behind Cloudflare (`server: cloudflare`). Also tested whether
a real headless Chromium (Playwright), launched FROM a GitHub Actions
runner, could get past it (throwaway probe branch, never merged, deleted
after) — still 403, page title "Just a moment..." (Cloudflare's own
JS-challenge interstitial), confirming this is a hard IP/ASN block, not
something a browser can solve. Decided: leave mssa.cl as-is, accept it'll
keep silently failing every ~7-day cadence cycle — same posture as
mamchiloe.cl's unrelated "fetch failed" issue. No paid proxy/relay service
pursued (would need to leave the free tier, which needs explicit sign-off
per the project's own spend-approval rule, `CLAUDE.md`).

### New source: cclm.cl (2026-08-08) — Centro Cultural La Moneda, and a real background-image extraction gap

Evaluated at the user's request. A major, prominent national institution
— stronger than most candidates evaluated so far. Single fixed venue
(multiple internal salas — Sala Pacífico, Sala Andes, Galería de
Patrimonio, etc — `fixedLocation.placeName` stays the museum's own name,
same posture as museoregionalaysen.gob.cl's multi-sala precedent, not
per-sala). WordPress, and a real `exposicion` custom post type exists via
`/wp-json/wp/v2/exposicion` — but its REST fields never include the
exhibition's own run dates (only WordPress's own post date/modified), so
this uses the plain HTML `articleList` path against `/exposiciones/`
instead, not `wordpressRestApi`, despite the REST endpoint existing.

Each exhibition sits in its own `module--asymmetric` wrapper, alternating
left/right layout — two real markup variants for the title `<h3>`/`<a>`
(one with them adjacent, one split across lines), both handled by one
`titleLinkRegex` tolerant of the whitespace either way. The listing's
"calendar" span gives a real per-item date range, but with **three
different separators** across real sampled items ("Agosto 05 / Octubre
11, 2026", "Junio 19 - Nov 01, 2026", "Mayo 07 a Septiembre 27, 2026")
and full Spanish month names rather than the 3-letter abbreviations most
other sources use — the month capture groups only take the first 3
letters, so `resolveMonthGroup`'s existing abbreviation table still
resolves them without needing a new one. One sampled item ("Junio 11,
2026 / mayo, 2027") has no end day stated at all — genuinely too
irregular to regex reliably, correctly left to fall through to null/
Haiku's own interpretation rather than forcing a wrong match.

**Real gap found and fixed generically, not just for this source**: the
thumbnail renders as a CSS `background-image` on a sibling `<figure>`,
not an `<img>` tag — `extractImgTags` (`extractors.ts`) only ever looked
for real `<img>` tags, so this source would have shipped with zero images
otherwise. Gained a background-image `url()` detection pass (unquoted,
single-, and double-quoted forms), appended after real `<img>` results so
no existing source's behavior changes — any future source with the same
CSS-background pattern now benefits too.

**Real bug found building this against the live page**: `blockRegex`'s
lookahead terminator was first guessed as `<section class="section--
partners">`, which never actually appears anywhere on the real page —
with no real terminator, the LAST exhibition's block silently swallowed
the rest of the page (cclm.cl's own trailing undated "Cine en Chile"/
"Viajes en papel" thematic grid, `<article class="box ...">` cards) into
its own non-greedy match. Harmless on this specific page's content
(`titleLinkRegex` only takes the first match per block, so the last real
exhibition still extracted correctly) but a real risk on principle for
any future page shape. Fixed with the actual terminator confirmed
against the live HTML (`<article class="box `, the real point where the
asymmetric list ends) — verified all 6 real listed exhibitions extract
as 6 separate items, not 5.

Description: no prose on the listing itself — recovered from each
detail page's `content__excerpt` div (confirmed against 2 real detail
pages), same "capture the whole prose container" posture as
mnba.gob.cl/museoregionalaysen.gob.cl's `text-long` div. The listing's
"10:15 a 18:45 horas" is the museum's own daily opening hours, not a
per-exhibition inauguración time (same distinction as parquecultural.cl's
`meta.hora_de_inicio`) — no `openingTimeExtractor`, since no confirmed
"Inauguración: `<fecha>` `<hora>`" phrasing was found on either sampled
detail page.

### New source: dieecke.art (2026-08-08) — Die Ecke, a real two-country gallery, and a deterministic scope filter

Evaluated at the user's request. Die Ecke, a real contemporary-art
gallery in Providencia, Santiago. WordPress, real `exhibiciones` custom
post type via `/wp-json/wp/v2/exhibiciones` — same shape as cclm.cl, the
REST API never gives real run dates (only a coarse "year" taxonomy and
WordPress's own post date/modified), so this uses the plain HTML
`articleList` path against `/exhibiciones/` instead.

**Real, important finding: Die Ecke has TWO physical locations, Santiago
AND Barcelona** — not a simple single-comuna source without extra care.
Each listing item states "Sede Santiago" or "Sede Barcelona" right after
its date. A Barcelona exhibition would be genuinely out of scope
(Caldearte is Chile-only, same country-scope precedent as
casablancacentrocultural.com's Perú rejection) — rather than trust
Haiku's own scope judgment to catch a country mismatch, `blockRegex`
itself requires "Sede Santiago" via a lookahead right after the opening
tag, so a Barcelona-sede block never gets captured as an item at all.
Confirmed against the real live page: 1 real Santiago item extracted, 1
real Barcelona item correctly excluded.

Listing markup: `<div class="col-sm-6"><a href="..."><div class=
"exhibicion" style="background-image:url(...)"></div><h2>Title</h2></a>
<p>Artist<br>DD de MES al DD de MES de YYYY<br>Sede X</p></div>` — same
CSS-background-image thumbnail pattern as cclm.cl (its `extractImgTags`
fix applies here unchanged). Dates: "23 de junio al 31 de agosto de
2026" — day + full Spanish month (first 3 letters captured) + "al" + day
+ full month + "de" + a single shared year — clean and consistent across
every sampled item, no irregular cases found this time.

Description: recovered from each detail page's `dieecke-overflow` div,
matching the REST API's own `content.rendered` almost exactly. No
`openingTimeExtractor` — no confirmed "Inauguración: `<fecha>` `<hora>`"
phrasing found on the one sampled detail page.

**Real bug found building this, fixed generically, not dieecke.art-
specific**: `extractors.ts`'s own `decodeHtmlEntities` (used for titles
and image URLs) only ever covered a handful of named entities (`&amp;`/
`&quot;`/`&#39;`/`&lt;`/`&gt;`) — this source's titles use `&#8211;` (a
numeric en-dash reference), which passed through undecoded.
`lib/description-extract.ts` already had the fix for this exact class of
bug (2026-07-28, centronacionaldearte.cultura.gob.cl's numeric entities)
but it had never been backported to this sibling copy — same lesson as
that fix's own comment: a decoding gap found in one copy doesn't
automatically apply to a duplicate. Now both resolve numeric hex/decimal
references generically, benefiting every source's titles/image URLs, not
just this one.

### New source: espacioo.com (2026-08-08) — Espacio O, the first Artlogic source, and a real entity-decoding gap affecting every listing-description source

Evaluated at the user's request. Espacio O, a real gallery in Santiago,
Chile, running on **Artlogic** — a specialized art-gallery site
platform, the first source on this platform (every other source so far
is WordPress-based).

**Real, unresolved caveat**: at evaluation time `/exhibitions/` had ZERO
current exhibitions — the page goes straight to "Pasadas" (past), and
the most recent one had already closed months earlier. Added anyway per
the user's own explicit call. The extractor is built and fully verified
against the real "Pasadas" markup (4 real past items) on the assumption
that a "Current" section — once one exists again — renders with the same
per-item template (reasonable for a templated CMS, but genuinely
unverified; no live current example existed to check). Revisit once this
gallery has a real current show, same posture as fme.cl's own "revisit
once updated" note above.

**Real bug found building this**: the LAST listed item's `<li>` also
carried `class="last"` inserted before `data-width` — a rigid
`<li\s+data-width="\d+">` blockRegex silently dropped it (3 items
instead of 4). Fixed with a more tolerant `<li[^>]*data-width="\d+"
[^>]*>` that allows other attributes/classes anywhere in the tag.

Dates: `<span class="date">DD Mes[ YYYY] - DD Mes YYYY</span>` — the
START year is only stated when it genuinely differs from the end year
(a real cross-year exhibition states both; a same-year one states it
once, at the end). Naming the trailing year `year` (not `endYear`) in
`dateRangeExtractor` is what makes `extractDateRange` correctly fall
back to it for BOTH the start and end date in the same-year case, while
a real explicit `startYear` still wins when present — same shared-year
mechanism molinomachmar.cl already established, just applied to an
optional rather than always-present start year.

**Real bug found and fixed generically, not espacioo.com-specific**:
this source's real listing-level description (`span.description.prose`)
surfaced that `collapseWhitespace` (`extractors.ts`) — used for every
`articleList` field EXCEPT title (daysRegex/placeRegex/descriptionRegex)
— never decoded HTML entities at all, unlike `title`'s own explicit
`decodeHtmlEntities` wrap. Every source using `descriptionRegex` (e.g.
molinomachmar.cl) or `placeRegex` was silently affected, not just this
one. Fixed by having `collapseWhitespace` decode entities itself (strip
tags first, decode after — same order `lib/description-extract.ts`'s own
`stripTagsAndCollapse` already uses). While in there, also consolidated
this file's own separate, now-redundant `SPANISH_HTML_ENTITIES`/
`htmlToPlainText` (added 2026-07-28 for chilecultura.gob.cl's
`wordpressRestApi` descriptions only) into the same `decodeHtmlEntities`
table — one copy instead of two silently drifting ones, closing out the
same "which copy did the fix land in" risk cclm.cl's own numeric-entity
fix flagged the same day.

### New source: galeriapready.cl (2026-08-10) — Galería Patricia Ready, and a real date-source conflict that ruled out openingTimeExtractor

Evaluated at the user's request. Galería Patricia Ready, a real gallery
in Vitacura with two rooms (Sala Ginkgo / Sala Araucaria), running on
Webflow. The listing renders as a "Tabs" widget — one tab per YEAR
(2018–2026) — but Webflow renders every tab's content into the raw HTML
at once (not JS-loaded on click), so a single fetch of `/exhibiciones`
yields all ~67 items across every year, not just the current one.

Deliberately **not** bounded to just the active/current tab: the only
real option found was an unbounded-length lookbehind spanning the whole
page to reject any item appearing after the first tab-pane boundary —
exactly the kind of fragile cleverness this codebase avoids elsewhere.
Accepted as a one-time cost instead: old items get correctly rejected by
Haiku for being years in the past (same as any other real-but-outdated
candidate), and the pre-curation `excludedSourceUrls` cache means every
subsequent weekly run only ever sees genuinely new items.

The listing's own date field is in **English** ("August 26, 2026", "July
22, 2026") — `extractDateRange`'s Spanish-only `ES_MONTH_ABBR` table can't
parse it, so no `dateRangeExtractor` is set; the raw text (with its real,
reliable year) is left as `rawDateText` for Haiku to interpret, backed by
the mandatory quote-grounding check.

**Real inconsistency found, tried and reverted — the reason there's no
`openingTimeExtractor`/`detailDateRangeExtractor` here**: the detail
page's own rich-text write-up states a real "Inauguración: [weekday] DD
de MES HH:MM hrs" / "Exposición abierta hasta: DD de MES" pair — day and
month only, no year, in Spanish — that looked like a clean fit for the
existing `openingTimeExtractor` + its `inferYear` fallback (the same
mechanism uchile.cl's own "esperamos este miércoles..." phrasing already
uses). Built it, verified against 2 real detail pages, and found:

1. The detail page's own inauguración date can flatly **disagree** with
   the listing's own date field for the same exhibition — "Martín Daiber
   - Primavera": the listing said `July 13, 2026`, the detail page said
   `Inauguración: miércoles 10 de junio 18:00 hrs` (June 10 — a full
   month earlier).
2. `inferYear`'s 60-day-past tolerance (tuned for uchile.cl's rolling
   30-day agenda, where an event is never more than a few weeks out)
   rolled that real, currently-running ("En curso") exhibition's June
   opening forward to **2027** when tested against an August reference
   date — a multi-week-long exhibition can easily still be running 60+
   days after its own opening, a materially different temporal profile
   than the rolling-agenda sources this inference was built for.

Given the source's own two fields can disagree, and the shared
year-inference heuristic doesn't fit this gallery's longer exhibition-run
length, deterministically merging them risked writing a confidently-wrong
date into the database. Left the full date interpretation (including
reconciling the listing-vs-detail-page discrepancy) to Haiku instead,
backed by the same grounding check that already catches fabrication —
safer than a deterministic path that can silently corrupt a real date.

Description: recovered from the detail page's `<div class="w-richtext">`
block, cut off right before "Contacto prensa" (present on every real
write-up, absent on an announced-but-not-yet-written-up one). Real bug
found building this: anchoring the terminator to `<p>` immediately before
the text broke silently on "Martín Daiber - Primavera" specifically,
because that page wraps "Contacto prensa:" in `<strong>` while others
don't — some paragraphs also lead with a zero-width joiner (‍). Fixed by
matching "Contacto prensa" directly, without anchoring to the preceding
tag. **Known, unfixed limitation**: this same richtext block also
contains the artist's full biography/CV and contact info with no HTML
boundary separating it from the exhibition's own description — the
recovered text is real, not fabricated, but includes more than a strict
"exhibition description" would.

### New source: aninatgaleria.org (2026-08-10) — Aninat Galería, and a listing timestamp that turned out to be the wrong date entirely

Evaluated at the user's request, same session as galeriapready.cl above.
Aninat Galería, a real gallery in Vitacura, running on Squarespace (a
"summary block" gallery grid). Markup is unusually convenient: the
item's image-link anchor carries both the real title (`data-title="..."`,
HTML-entity-encoded) and the detail-page href in one tag, so the whole
block/title/link extraction collapses into a single anchor tag — no
separate title-link hunting needed.

**Real trap found and avoided**: the listing's own `<time datetime="...">`
looked exactly like mnba.gob.cl/mallecoescultura.cl's reliable `dayIso`
shorthand (`<time class="summary-metadata-item summary-metadata-item--date"
datetime="2026-08-05">5 de agosto de 2026</time>`) — clean, machine-
readable, textbook shape. Cross-checking against the exhibition's own
detail page proved it's wrong: "Magdalena Correa | KOS" listed
`datetime="2026-08-05"` on the gallery grid, but its own detail page
states in real prose "La inauguración se realizará el jueves 13 de agosto
a las 18:30 horas" — 8 days later. The listing timestamp is the
Squarespace BLOG POST's publish date, not the exhibition's own date. Had
this been trusted, every exhibition on this source would have shipped a
systematically wrong date. No daysRegex/dateRangeExtractor at all —
Haiku sees no listing-level date signal, deliberately: exposing the
misleading timestamp risked Haiku confidently confirming the WRONG date
itself, which would then skip `enrichCandidates`' own
`openingTimeExtractor` recovery entirely (that only runs when
`!c.openingTimeConfirmed`).

**Also tried and reverted, a second real finding**: built an
`openingTimeExtractor` for the detail page's real "inaugurará ... el
[weekday] DD de MES a las HH:MM horas" sentence — verified the pattern
itself works against 2 real pages, correctly resolving the CURRENT
exhibition's year via `inferYear`. But this source's shows run on a
roughly monthly cadence, and testing an OLDER, already-closed item (a
March opening, tested against an August reference date — the realistic
shape of the FIRST run, which curates every item on the page at once
regardless of age) showed `inferYear`'s 60-day-past tolerance rolling it
forward a full YEAR, to 2027 — turning a genuinely past, closed
exhibition into what looks like a real upcoming one. Worse than
galeriapready.cl's own `inferYear` finding above (a real quote silently
landing on the wrong year for a still-open show): here it risked
fabricating an entirely fake future event on the live site. Reverted —
no `openingTimeExtractor` at all. The real "inaugurará..." sentence still
reaches Haiku, just via `descriptionExtractor` below rather than a
dedicated recovery mechanism proven unsafe for this source's cadence.

**Worth remembering generically**: `inferYear`'s 60-day tolerance is
tuned for rolling-agenda sources (uchile.cl) where nothing is ever more
than a few weeks out — don't reuse it uncritically for a source whose
first run curates a full historical backlog at once, since an old item
can land arbitrarily far in the past relative to the run date.

Description: the detail page's real prose is split across MULTIPLE
Squarespace text blocks interleaved with image blocks (a short
title-header block first, THEN the block with the real "inauguración..."
sentence, THEN more prose) — no single div wraps just "the description".
Captured from the first `data-sqsp-text-block-content` marker through to
`BlogItem-share` (a stable end-of-article marker, confirmed present on
every sampled page), sweeping in every interleaved block — image tags
contribute no stray text once stripped, so this is safe. Same known,
unfixed limitation as galeriapready.cl: also includes the artist's full
bio, not just the exhibition write-up.

### New source: estacionmapocho.cl (2026-08-10) — Centro Cultural Estación Mapocho, a coarse-but-genuine listing date, and a third confirmation of the same inconsistent-phrasing pattern

Evaluated at the user's request, same session as the two sources above.
A dedicated "Artes Visuales" listing (`?page_id=16`, not a mixed cultura
category) — good density: 5 of 6 sampled items were real exhibitions,
only 1 a workshop ("Escuela de Arte Textil Ad Llallín"), which Haiku's
own scope judgment should catch on its own merits like any other
real-but-out-of-scope candidate. Custom WordPress theme.

Only page 1 of the listing's pagination (7 pages total) is fetched —
deliberately not walking all 7 the way artes.uchile.cl's
`additionalPages` does for its own rolling agenda: items are roughly
chronological, and page 1 alone already covered 6 months of real shows
(Jan-Jun 2026 at evaluation time) — matches this project's posture
against pulling in a full historical archive when a source's own
default ordering already surfaces what's current (contrast
galeriapready.cl above, whose Webflow tabs render every year at once
with no such natural bound).

The listing gives a real title, image, and a coarse `MM/YYYY` month
field — cross-checked against 2 real detail pages and confirmed
genuine (NOT a repeat of aninatgaleria.org's blog-publish-date trap):
"Sueños" listed `03/2026`, its detail page opens "En marzo, el Centro
Cultural Estación Mapocho recibe... — Del 12 de marzo al 24 de mayo";
"Kadogo..." listed `01/2026`, detail page confirms a January-into-March
run ("hasta el 8 de marzo"). Left as `rawDateText` only — a month alone
can't build a real day-precision ISO date without fabricating a day.

**No openingTimeExtractor/detailDateRangeExtractor — the third real
instance this session of the same inconsistent-phrasing pattern.**
Sampled 4 real detail pages: no "Inauguración: fecha hora" phrasing on
any of them (consistent with an unrelated real finding from the SAME
day's audit — a Tavily-discovered candidate from this exact domain,
"Tiempo entre puntadas," whose own Haiku curation reasoning already
noted "inauguración el 8 de agosto sin hora exacta"). The real
day-level date text does exist next to a calendar icon
(`<div class="w90">`), but its phrasing is genuinely inconsistent
across items — a full "Del D de MES al D de MES" range for one
exhibition, just "hasta el D de MES" (no start at all) for another —
the same class of cross-item inconsistency that already ruled out a
dateRangeExtractor for galeriapready.cl and an openingTimeExtractor for
aninatgaleria.org, both earlier the same session. Rather than risk a
pattern that silently mishandles whichever shape it wasn't built
against, that real day-level text is folded into `descriptionExtractor`
instead, so Haiku still sees and can ground a quote from it —
interpretation, not extraction, absorbs the shape variance.

Description: captured from the calendar-icon row through the end of the
real prose block (`<div class="w40">`, confirmed to hold ONLY the
curatorial write-up — no nested divs, no artist-bio bleed the way
galeriapready.cl/aninatgaleria.org both have, a genuinely cleaner source
on this front). Harmless real noise: the page duplicates this same
location/date/hours block for a mobile layout variant, so the captured
text repeats the date fragment twice — doesn't affect grounding, Haiku
isn't confused by the same true fact stated twice.

### New source: factoriasantarosa.cl (2026-08-10) — Factoría Santa Rosa, and a genuinely fully-deterministic date recovery

Evaluated at the user's request, same session as the three sources
above. WordPress + Elementor + JetEngine — a genuinely clean, fully
structured source, unlike galeriapready.cl/aninatgaleria.org/
estacionmapocho.cl above, all three of which had to leave date
interpretation to Haiku after finding real per-item inconsistencies.
This one has neither problem: the listing has zero date info at all
(nothing to mistake for a real one), and the detail page's date fields
are fully structured, machine-readable, and consistent across every
sampled item (4 real detail pages checked, including one —
"diga-queer-con-la-lengua-afuera" — with a genuinely empty end-date
field, which the extractor correctly returns null for rather than
guessing at a range).

Listing markup: two adjacent JetEngine widgets share the same href —
an image-link anchor immediately followed by a title-link anchor,
captured as one block spanning both (same "single anchor pair, shared
href" shape as aninatgaleria.org's own listing). All 26 items live on
one page (no pagination) — NOT chronologically ordered (a 2024
exhibition appeared near the top, ahead of a 2025 one), so every item
gets curated on the first run; acceptable at this size (unlike
galeriapready.cl's ~67-item, 9-tab archive).

**Real, fully deterministic date recovery** (`detailDateRangeExtractor`,
matching mssa.cl's own precedent): the detail page has explicit
"Inicio"/"Termino" labels next to `DD-MM-YYYY` values in a
`jet-listing-dynamic-field__content` div. Deliberately does NOT anchor
on the "Inicio" label text itself — real bug found building this: the
site's own nav menu also has a link literally labeled "Inicio" ("Home"
in Spanish), which a label-anchored regex matched first, on the wrong
occurrence. Fixed by anchoring on two CONSECUTIVE
`jet-listing-dynamic-field__content` values matching the `DD-MM-YYYY`
shape instead — safe because the description field (recovered
separately) uses the exact same CSS class but never starts with a bare
date-shaped string (it opens with a `<p>` tag), so there's no risk of
either field bleeding into the other.

Description: recovered from that same `jet-listing-dynamic-field__content`
class, disambiguated from the date fields by anchoring on the preceding
"Descripción" heading — real prose, cleanly bounded, no bio-bleed the
way galeriapready.cl/aninatgaleria.org both have.

### New source: centex.cultura.gob.cl (2026-08-10) — Centex, a real density tradeoff the user accepted, and a description bound that needed real nesting-depth thinking

Evaluated at the user's request, same session as the four sources above.
Centex, Valparaíso, part of the Ministerio de las Culturas — same
WordPress theme family as centronacionaldearte.cultura.gob.cl (CNAC,
added 2026-07-28).

**Real density tradeoff, flagged and accepted**: of 12 sampled posts in
the "muestras-y-exposiciones" category, only ~7-8 were genuine exhibition
announcements/recaps — the rest were coverage of a graphic-arts fair
(Feria Sobreimpresiones), a crafts fair (Feria de Artes y Oficios), an
interview about that fair, and a recap of a school group visiting an
already-covered exhibition. Presented this to the user before building
the extractor (mirroring the aecid.es/CCE Santiago rejection earlier the
same session, which failed a similar but worse density check — 2-3/12);
user confirmed "agrega" — Haiku's own scope judgment is relied on to
filter the fair/interview/recap noise, same posture as any other source
with imperfect density.

No date field at all captured from the listing: `b2fecha` is confirmed
to be the post's PUBLISH date, not the exhibition's — cross-checked
directly, same trap as aninatgaleria.org's `<time>`: "Centex inaugura
exposición póstuma de Juan Castillo" listed a July 5 publish date while
its own detail page states the real opening as "sábado 11 de julio" —
days later, same post.

**No openingTimeExtractor either — a fourth same-session confirmation of
the inconsistent-phrasing pattern**: one detail page has a clean
`*Inauguración: sábado 11 de julio, 12:00 horas` line; a second sampled
page has an entirely different shape with no "Inauguración" label at all
("Desde este martes 4 y hasta el domingo 9 de agosto permanecerá
abierta..."). Left to Haiku+grounding via descriptionExtractor, same as
galeriapready.cl/aninatgaleria.org/estacionmapocho.cl above.

Description: the real article body is NOT safely boundable by a simple
"first closing `</div>`" rule — real testing found genuinely NESTED
`<div>` blocks inside the prose itself (embedded `wp-block-media-text`
image-with-caption blocks mid-article), so that naive bound would cut
real content off far too early. Regex can't track arbitrary nesting
depth, so this was bounded instead on the reliable `</main>` tag that
closes the whole content area on every sampled page — confirmed (via a
manual nesting-depth count) to land at exactly the real end-of-article
point without ever sweeping into the site-wide footer/address block
just outside `</main>`.

### New source: museoschile.gob.cl/cartelera/red-nacional (2026-08-10) — a national multi-discipline aggregator with a real deterministic scope filter, and a genuine lookahead-scope bug

Evaluated at the user's request, same session as the sources above (and
several rejected candidates that day). Red Nacional de Museos
(Ministerio de las Culturas) — a national aggregator spanning many
individual SNPC/Drupal-platform museum sites, the same underlying
CMS/template already known from mnba.gob.cl, museoregionalaysen.gob.cl,
and museodeancud.gob.cl. This specific "Red Nacional" view mixes
disciplines, though — natural history, zoology, anthropology, and
general archives alongside actual visual-art exhibitions, since it
aggregates every museum in the national network, not just art ones.

**Real, deterministic scope filter — not left to Haiku**: each item
carries its own genuine, structured `field--name-field-tematica` tag
("Ciencia", "Zoología", "Antropología", "Ciencias Naturales", "Archivos",
"Artes visuales", "Exposición" — 7 distinct values sampled, 4 of 10
sampled items "Artes visuales"/"Exposición"). `blockRegex` requires the
tematica to be "Artes visuales" or the generic "Exposición" via a
positive lookahead (same technique as dieecke.art's country-scope
filter) — a real "Micromundos, ciencia y arte en tus manos" (tagged
"Ciencia") and "Mariposas y Polillas, Colores en Movimiento" (tagged
"Zoología") are both correctly excluded before ever reaching Haiku,
rather than trusting its own scope judgment to catch obviously
out-of-discipline content downstream.

**Real bug found and fixed building this filter**: the first version's
lookahead scanned forward UNBOUNDED — it matched if "Artes
visuales"/"Exposición" appeared ANYWHERE later in the entire remaining
document, including inside a completely different, LATER item's own
block, not just the current one. Against the real page this barely
filtered anything (an early Ciencia/Zoología item still passed as long
as some later item in the feed happened to be real art — 6 items passed
instead of the correct 4). Fixed by bounding the lookahead to stop at
the next `<div class="views-row">`, so it only matches tematica text
belonging to the CURRENT item. A test with two items (Zoología first,
Artes visuales second) catches a regression to the unbounded version
immediately.

**Real, fully deterministic date range** — the cleanest of any source
added this session: `<time>DD/MesCompleto/YYYY</time> hasta el
<time>DD/MesCompleto/YYYY</time>`, full Spanish month names, always both
start and end present, consistent across every sampled item — no
inconsistent-phrasing problem here at all, unlike
galeriapready.cl/aninatgaleria.org/estacionmapocho.cl/
centex.cultura.gob.cl earlier the same session.

No `fixedLocation` — a genuine multi-institution, multi-comuna aggregator
(Valparaíso, Santiago, ...), same posture as
arteinformado.com/chilecultura.gob.cl. Each item does carry a real
per-item address (`field--name-field-direccion`), captured via
`placeRegex` as real, grounded text for Haiku's own comuna judgment.

**Known overlap, not a bug**: Museo Nacional de Bellas Artes items (e.g.
"Roberto Matta. Abrir la mirada") appear both here AND via the existing
dedicated mnba.gob.cl source — same real sourceUrl on both, so the
existing cross-run dedup collapses them into one row. The real
incremental value of this source is the OTHER institutions it surfaces
that don't have their own dedicated entry yet (confirmed: Biblioteca
Nacional). No `descriptionExtractor` — the listing itself already gives
title + full real date range + real address, and a shared detail-page
description container wasn't found consistently across the different
institutions' own sites in the time spent looking. Only the first page
(`?page=0`) is fetched, no `additionalPages`.

### New source: fundaciongasco.cl (2026-08-10) — Sala GASCO Arte Contemporáneo, and the cleanest source of the whole session

Evaluated at the user's request. Sala GASCO Arte Contemporáneo, Santiago
Centro (metro Plaza de Armas). WordPress with a real dedicated
"exposicion" custom post type and a genuine "Temporada Actual" (current
season) archive view — small (3 items at eval time) but fully in-scope,
no density or discipline filtering needed at all.

Listing gives real title/artist/image plus only a coarse "Mon YYYY" date
(e.g. "Mar 2026") — left as `rawDateText`, not structurally parsed (a
bare month+year can't build a real day without fabricating one, same
reasoning as estacionmapocho.cl's own MM/YYYY field earlier the same
session).

**Real, fully deterministic date recovery** (`detailDateRangeExtractor`,
matching mssa.cl/factoriasantarosa.cl's own precedent): the detail page
has an explicit `<li><span class="key">Fecha:</span> <span
class="value">DD/MM/YYYY - DD/MM/YYYY</span></li>` spec line — clean,
confirmed consistent across all 3 sampled items with no per-item
phrasing variance found. Description: `<div class="col-right">` on the
detail page holds only the real curatorial write-up, confirmed no nested
divs (same "first closing `</div>`" safety as mnba.gob.cl's own
descriptionExtractor).

### New source: aldeaencuentro.cl (2026-08-10) — GAE, a genuinely dateless source, and two generic bugs found building it

Evaluated at the user's request. GAE — Galería Aldea del Encuentro, La
Reina, Santiago (Corporación Aldea del Encuentro). Real, dedicated
"Catálogos GAE" category — good density, 10/10 sampled posts were
genuine, distinct visual-art exhibitions with substantial curatorial
write-ups.

**No date extractor at all — searched extensively, found none to
trust.** The listing's own post date is a WordPress publish date with no
cross-validation either way (unlike aninatgaleria.org, where a real
contradiction PROVED the field wrong — here there's simply no explicit
exhibition date anywhere to compare it against). Also checked the site's
"Próximas actividades" category hoping for real day-precision dates: it
does have clean, deterministic emoji-labeled fields ("📅 15 de agosto 🕚
11:00 a 13:00 hrs 📍 Galería GAE"), but that's a general activities feed
(festivals, tournaments, convocatorias, one-off workshops) — the one
art-adjacent item found there was a 2-hour companion workshop to an
exhibition, not the exhibition's own run dates. No page states an
exhibition's actual open/close dates. Left entirely to Haiku, grounded
by the real, substantial description recovered from the detail page.

Description: `<div class="post-body-inner">`. Real trap found building
this: the bare string "post-body-inner" ALSO appears as a CSS selector
in the page's own `<style>` block in `<head>` — an unanchored search
finds that wrong, earlier occurrence. Anchored on the actual `class="post-
body-inner"` attribute usage instead, which closes cleanly with no
nested divs once anchored correctly (the false match earlier made it
look like there were nested divs sweeping to the site footer, when the
real content div was clean all along).

**Real bug found and fixed generically, not aldeaencuentro.cl-specific
(1 of 2)**: `extractImgTags` only ever checked `data-src` for a
lazy-loaded image URL. This site's theme (Sneeit) uses `data-s` instead
(`src=""`, no `data-src`, real URL only in `data-s`). Added as a second
precedence tier.

**Real bug found and fixed generically (2 of 2)**: `isJunkImage`
(discover.ts) rejected a real, correctly-recovered exhibition image —
`Baner-catalogo.jpg` — because its old plain substring check for "logo"
matched inside "catalogo" (a common Spanish word, "catálogo"). Fixed
with a word-boundary check instead of `.includes("logo")`. First attempt
used `\blogo\b`, which still false-positived on the accented form —
JS regex `\b`/`\w` only understand ASCII letters, so "á" isn't treated
as a letter and a boundary gets read right before "logo" in "Catálogo"
anyway. Fixed properly with Unicode-aware lookaround,
`(?<!\p{L})logo(?!\p{L})` with the `u` flag — still catches real logo
files (`site-logo.png`, `logo.svg`), no longer false-positives on
`catalogo`/`catálogo` in either accented or unaccented form.

### New source: isabelcroxattogaleria.com (2026-08-10) — a real scope problem solved by finding a deterministic filter, and a lookahead-vs-lookbehind lesson

Evaluated at the user's request. Isabel Croxatto Galería, Santiago —
Artlogic (same platform as espacioo.com), but a much more active gallery
(87 total items vs. espacioo.com's 4).

**Real scope problem, presented to the user before building**: this
listing represents the gallery's ARTISTS wherever their work shows, not
just the gallery's own space — international venues genuinely appear
("PROXYCO Gallery | New York", "La Embajada | Madrid", "ZAZ Corner |
Times Square, New York"), alongside pure online/virtual shows ("Virtual
Exhibition", "Online Exclusive") and items whose "subtitle" field isn't
even a venue at all (curator/writer credits: "Curator | Leonardo Casas",
"Text | César Gabler"). No single reliable per-item field distinguishes
Chile-physical from international/virtual/credit-only — unlike Die
Ecke's clean "Sede Santiago" marker, there's no consistent
country/format label to positive-match on.

**Real, deterministic scope filter found when the user asked "can this
be filtered before Haiku sees it?"**: the page is organized into three
named sections via real container IDs —
`id="exhibitions-grid-current"`, `id="exhibitions-grid-past"`,
`id="exhibitions-grid-online"` — same sectioning convention as mssa.cl's
own "actuales"/"anteriores" split. Scoping to CURRENT only solves both
problems at once: it excludes 85 of 87 items as historical noise AND, in
practice, excludes the international/virtual residue too (both sampled
CURRENT items were real, current, plausibly-Chile shows) — since CURRENT
is specifically what the gallery is now actively promoting. The small
residual risk (a CURRENT item happening to be international) is left to
Haiku's own country-scope check, same backstop every other
non-fixedLocation aggregator source already relies on.

**Real regex lesson**: a per-item bounded lookahead (checking only the
gap between an item's own anchor and its own `<h2>` — the
museoschile.gob.cl technique) can't see a GLOBAL section boundary that
sits BEFORE later items' own anchors, not inside their own block. First
attempt matched 60 items instead of 2 — completely failed to exclude
PAST, since the boundary marker sits before each PAST item's anchor
tag, never between an item's own anchor and its own title. Fixed with an
unbounded negative LOOKBEHIND instead —
`(?<!exhibitions-grid-past[\s\S]*)` before the block — asserting no
PAST-section marker has appeared ANYWHERE earlier in the whole document,
which is exactly what "still inside CURRENT" means. Confirmed fast in
practice (~10ms against the full ~440KB page) despite being
unbounded-length — worth revisiting for galeriapready.cl's own
unsolved tab-boundary problem sometime, since that was ruled out earlier
the same session as "too fragile" without actually testing this exact
technique.

No `dateRangeExtractor` (English month names, same reason as
galeriapready.cl — left as `rawDateText`). No `fixedLocation` — a
genuine mixed-venue source even within CURRENT (own space + partner
venues); real per-item subtitle text captured via `placeRegex` when
present. No detail-page description fetch — the listing's own truncated
excerpt is accepted as sufficient, same posture as espacioo.com.

### New source: noticias.udec.cl/categoria/cultura (2026-08-13) — a general strategy for noisy news-category sources: measure a keyword prefilter against real history before adding

Evaluated at the user's request. Universidad de Concepción's institutional
news portal, "Cultura" category — a genuinely different shape from every
other bright source added so far: not a curated events/exhibitions feed
(unlike parquecultural.cl/chilecultura.gob.cl, both already event-only
APIs), but a general-interest news category mixing theater, orchestra/
choir, cinema, literature, sports, and institutional news in with the
real visual-art exhibitions. Raw density measured against 30 recent
posts: only ~17% were real, in-scope exhibitions — sending everything to
Haiku would mean rejecting ~5 of every 6 items, every run, forever.

**The general strategy, proposed by the user and now the playbook for any
future source with this same problem**: before adding a noisy
news-category source, pull a FULL YEAR of its real history (here: 200
real posts via the WordPress REST API, `per_page=100&page=1/2` — a
one-time evaluation query, never repeated once the source is live; the
actual `KNOWN_SOURCES` entry uses `per_page=20`, sized to the real
posting cadence measured in that same pull, not the evaluation sample
size) and test a deterministic keyword prefilter against ALL of it,
measuring real precision and recall before committing to anything:

1. Try tags/categories first (a built-in discipline filter, if the CMS
   has one) — checked here first (`Exposición`, `Galería Tránsitos
   Visuales` tags existed) but both were abandoned since 2023/April 2025,
   missing every real recent exhibition. Dead end for this source, but
   worth checking first every time — museoschile.gob.cl's `tematica`
   field and chilecultura.gob.cl's `disciplines=4` param are the cases
   where this DID work and no keyword heuristic was even needed.
2. With no reliable structured filter, build a keyword `includeFilter`
   (new `WordpressRestConfig` field, `extractors.ts`) and test it against
   the full real history: `exposici[oó]n(es)?` alone caught 27/200 posts
   at ~93% precision (nearly every hit was a genuine exhibition); adding
   whole-word `arte` (word-boundary regex — NOT a bare substring match,
   which would false-positive on `cuarteto`/`aparte`/`departamento`)
   raised recall by catching real exhibitions that never say the word
   "exposición" (e.g. "Un lugar habitual", textile art) at the cost of
   more noise (concerts, theater, podcasts also mention "arte" via venue
   names like "Casa del Arte").
3. Scan the NON-matching remainder for anything that looks like a missed
   exhibition (`muestra|galería|pinacoteca|obras de|fotografía|escultura
   |pintura|dibujo|cerámica|inaugura`-style heuristic scan, by hand, over
   the rejects) — found one real, confirmed miss this way ("Lorena
   Villablanca expone en Cecal UdeC…", which used neither "exposición"
   nor "arte"). Added `expon(e|en|ga)`/`exhib` to close it. Final
   4-pattern filter: 48/200 posts (24% of raw volume), a measured
   false-negative rate of ~1 in 30 — good enough to ship, not chased to
   zero.

This is NOT a scope decision and doesn't touch curation logic at all —
Haiku still judges every item that passes the filter with the exact same
criteria as any other source; `includeFilter` only decides what volume
reaches Haiku in the first place, same spirit as the density-vs-cost
trade-off already accepted explicitly for centex.cultura.gob.cl (~58-67%
density, no filter available there) but solved differently here because
a real filter turned out to exist.

**Real downstream finding, same run, fixed same day**: two of the real
exhibitions this filter correctly surfaced (`enforceDateCompleteness`,
discover.ts) still got rejected — both had a confirmed **closing** date
stated in prose ("permanecerá abierta hasta el 23 de septiembre") but no
confirmed **opening** date anywhere in the article (institutional news
here tends to report an inauguración as already-happened history,
without ever stating exactly when). Current policy requires either a
confirmed `openingDatetime` or a complete `runStartDate`+`runEndDate`
pair — an end date with no start satisfies neither. Mirror case of the
2026-08-13 `isCurrentOrUpcoming` grace-window fix (opening confirmed, no
end), but solved differently per Daniel's explicit call: rather than a
grace window, backfill the missing `runStartDate` from the SOURCE POST'S
OWN publish date — real, already-known data (a new
`WordpressRestConfig.publishedDateField` → `BrightSourceItem.publishedDate`
→ `discover.ts`'s `fillRunStartFromPublishedDate`, which only fires when
`runStartDate` is genuinely missing, a real `runEndDate` exists, and the
publish date doesn't land after it). Not a fabricated date — the article
is reporting the show as already open around when it was published, a
defensible approximation, not an invented one. Verified against real
data: both exhibitions ("Un lugar habitual", "Exposición aborda la
historia y protección de la niñez…") now insert correctly, with the
`[FILTRO DE CÓDIGO]` tag left in `curation_reasoning` for transparency.

### Cross-source dedup: two more real gaps found by a manual curation audit (2026-07-29)

A user-requested audit against real production data (`docs/roadmap.md`'s
Phase 1a punch list) found 8 exhibitions at the same physical MAC -
Quinta Normal venue duplicated — 16 rows instead of 8, one copy from
arteinformado.com and one from uchile.cl. Two independent, stacked bugs,
both in `event-discovery/run.ts`'s cross-run fuzzy dedup
(`titlesByLocationDateOnly`, `locationDateOnlyKey`):

1. **The fuzzy bucket required an EXACT placeName string match to even
   compare titles.** arteinformado.com calls the venue "MAC - Museo de
   Arte Contemporáneo", uchile.cl calls it "MAC - Quinta Normal" — same
   real venue, worded differently, so the two rows never landed in the
   same bucket and `isLikelySameTitle` never got a chance to compare
   "Vestiario" against "Exposición 'Vestiario' en el Museo de Arte
   Contemporáneo". Fixed by dropping placeName from the bucket KEY
   (comuna + date only, same posture as before place_name was ever added)
   but not from the dedup DECISION — a new `placeNamesLikelySame`
   (`lib/event-filters.ts`) checks it leniently instead (≥1 shared
   significant word after stripping the same generic venue-type
   vocabulary `isLikelySameTitle` already strips — "mac" alone is enough
   to connect the two spellings above). Deliberately a lower bar than
   title matching's ≥2-shared-word floor: short venue names would
   otherwise never clear it. Still required alongside a real title match,
   not instead of one — dropping placeName from the bucket key with NO
   placeName check anywhere would have reopened the exact false-merge
   case `place_name` was added to prevent in the first place (two
   *different* venues sharing a comuna, a near-identical title, same day
   — this file's own existing test seeds exactly that scenario).
2. **The date-only bucket key prioritized `openingDatetime` over the
   run-date range** — found immediately after fixing (1), writing the
   regression test: the two real duplicate rows had IDENTICAL
   `run_start_date`/`run_end_date`, but only the arteinformado.com copy
   also had a confirmed `openingDatetime`. With opening-date prioritized,
   the two rows' date-only fingerprints came out as `"2026-04-24"`
   (opening day) vs. `"2026-04-25|2026-08-23"` (run range) — different
   buckets, so (1)'s fix alone still couldn't have caught them. Flipped
   the priority: prefer the run-date range when both `runStartDate` AND
   `runEndDate` are present, fall back to `openingDatetime` only for a
   candidate with no separately-stated run range at all (a bare
   inauguración). `locationDateKey` (the STRICT exact-match tier) keeps
   its original opening-date-first priority unchanged — only the fuzzy
   bucket's coarser key changed.

`ExistingEventInfo` gained a `placeName` field to make (1) possible —
every construction site (`loadExistingKeys`'s `toInfo`, the REPLACE and
fresh-insert paths) now carries it through.

**Production cleanup**: the 16 duplicate rows found were resolved by hand
via the existing tier-1 rule (confirmed opening wins) — all 8
arteinformado.com copies had one, none of the 8 uchile.cl copies did, so
the 8 uchile.cl rows were deleted directly (not a code path, a one-time
manual SQL cleanup after the audit).

### `nullifyAggregatorSourceUrls` silently dropped ~13 real Universidad de Chile exhibitions every run (2026-08-10)

Found via a user-requested audit of a real production run. The heuristic
(`discover.ts`) nulls a candidate's `sourceUrl` whenever 2+ approved
candidates in the same batch share it — meant to catch a bright-source
page whose markup lacks a per-event parser (Haiku only had one shared
listing URL to cite, no way to point at each event's own page). But
`artes.uchile.cl`/`uchile.cl` are a rolling 30-day agenda that lists the
SAME real exhibition once per day it's still open — each repeated block's
`titleLinkRegex` correctly resolves the identical, correct per-event
detail page, not a collision. The old version nulled that legitimately-
shared URL anyway (2+ occurrences alone was treated as proof of a
collision), which then made `enforceSourceUrlInvariant` reject every one
of those candidates — silently, since `rejected_candidates` only records
a row when `sourceUrl` is non-null, so this didn't even show up as a
visible rejection anywhere.

**Fix**: only null the shared URL when the candidates sharing it report
DIFFERENT titles (`normalizeTitle`-compared) — the actual signal that a
page hosts multiple distinct events, not just a shared URL by itself. The
same real title repeated under the same URL is the same event reported
multiple times, not an aggregator collision; the existing cross-run dedup
(`run.ts`) already collapses the repeats into one insert once the URL
survives.

## New source: Instagram via Apify, an isolated pipeline for many independently-paced accounts (2026-08-12)

Instagram itself blocks anonymous/headless fetch (bio + ~1 post, then a
hard login wall — same shape already confirmed for Facebook). After
evaluating Meta's Graph API (requires Business/Creator accounts — doesn't
fit informal, self-convened art spaces), third-party scraping services,
and a standalone scraper, the decision (with Daniel) was **Apify**
(`apify-client`, actor `apify/instagram-post-scraper`), with an explicit
policy: only public accounts, never private (both an editorial decision
and a real technical limit — the actor never logs in, so it can't reach a
private account at all).

**Architecture: its own pipeline, not a `KnownSource`** — same precedent
as MAVI (`mavi-headless.ts`) and Google Alerts, for two reasons. Technical:
`KnownSource`/`knownSourceDomain` (`lib/known-sources.ts`) dedupes by bare
hostname, so two Instagram accounts under `instagram.com` would collide
there — rather than patch that bug to force Instagram in, it lives in its
own list, indexed by `username`. Risk-shaped: keeping this isolated makes
the whole source trivially pausable/disableable without touching anything
else, given its different risk profile (third-party scraping of a
platform that actively blocks it) versus a plain site fetch.

**Files**: `lib/instagram-accounts.ts` (the hardcoded, documented account
list — `{username, note, addedAt, fixedLocation?}`, same "note" convention
as `KnownSource`), `lib/apify-instagram.ts` (the Apify wrapper — one
`apify-client` call per run covering ALL due accounts at once, not one
call per account), `lib/instagram-item.ts` (maps `ApifyInstagramPost` →
the shared `BrightSourceItem` shape, so `curateBrightSourceItems`
(`discover.ts`) judges every post with the exact same scope/date criteria
as any other bright source — no new prompt), `instagram-discovery/run.ts`
(orchestrator), `instagram-index.ts` (entrypoint),
`.github/workflows/instagram-bright-sources.yml` (its own cron, Monday
08:00 UTC — offset from the main run and the other bright-source crons).

**`fixedLocation`** (`{location, placeName}` on an account's config) — set
only when the account is confirmed to operate from a single fixed
physical venue (verified via WebSearch when the address/comuna is
ambiguous); left unset for accounts that promote activities across
several different venues (a university department, a multi-venue
institution), so Haiku infers the location per-post instead, same posture
as a real aggregator. When set, it's NOT a hint — `instagram-item.ts`
assigns it directly to every post from that account, overriding whatever
Haiku might otherwise infer; setting it for a multi-venue account would
silently mislabel posts about a different real venue.

**Per-account adaptive cadence** (unlike Google Alerts' single shared
7-day feed) — each account gets its own `bright_source_fetch_state` row,
escalating 14 → 21 → 28 days when a fetch turns up nothing new, resetting
to 14 when it does. Necessary because account posting frequency varies
wildly (some post daily, some monthly) and a shared fixed interval would
either waste Apify calls on quiet accounts or miss active ones.

**Evaluation playbook for adding a new account** (used ~40 times
2026-08-14, see the entry below): fetch 5-6 real recent posts (no date
filter) via a throwaway script, check (a) how many are genuinely the
account's own (`ownerUsername` match — tagged/reposted content from OTHER
accounts is expected noise, already filtered by `instagram-discovery/
run.ts`), (b) content-type mix (clean exhibition-opening announcements
vs. workshops/talks/convocatorias/institutional-news/recaps — all
correctly rejected by Haiku's existing scope judgment already, proven
repeatedly), (c) date completeness, (d) single-fixed-venue vs. touring/
multi-venue for the `fixedLocation` call. Reject outright for: dead (no
real post in the past year or so), a commercial sales gallery or auction
house (no exhibitions, just product/lot listings), a workshop mislabeled
as a "galería", wrong country, or a pure content/criticism account that
doesn't itself host events.

### Cross-source dedup: same venue + same season dates isn't always the same event (2026-08-12)

A user-requested audit found two more real, distinct MAC - Parque
Forestal exhibitions ("Obras extraordinarias", "El ángel de la historia"
de Eugenio Téllez, both artes.uchile.cl) silently dropped as "duplicates"
of an earlier-inserted third one ("Nazca/Sudamericana") — all three
genuinely different shows, sharing only the fact that MAC runs a whole
"temporada" where several exhibitions open and close on the same
institutional dates (11 jul → 11 oct 2026). Two independent dedup tiers
in `run.ts` both had the same underlying vulnerability:

1. **`seen.locationDates`** (the STRICT location+date fingerprint,
   scoped to events already stored from a PAST run — see the 2026-07-23
   comment above it) treated an exact venue+date match as sufficient
   proof of "same event," no title check at all. Fine when only one real
   event can plausibly hold a given venue+date combo; false when a venue
   runs several concurrent shows on the same season dates. Fixed:
   `seen.locationDates` is now list-valued (`Map<string,
   ExistingEventInfo[]>`, since one venue+date combo can legitimately
   hold several real events) and requires `isLikelySameTitle` too, same
   posture the fuzzy tier already had.
2. **The fuzzy tier itself** (`titlesByLocationDateOnly`) has the exact
   same vulnerability for a subtler reason: `isLikelySameTitle` alone
   isn't safe here, because uchile.cl/artes.uchile.cl bakes the venue's
   own name straight into every title ("Exposición 'X' en el MAC Parque
   Forestal") — that shared venue-name text alone is enough to pass the
   ≥2-shared-word/Jaccard-or-overlap threshold even for two completely
   unrelated exhibitions, confirmed directly: `isLikelySameTitle` returns
   `true` for "Nazca/Sudamericana" vs. "Obras extraordinarias" once both
   titles carry "... en el MAC Parque Forestal".

**Fix**: new `isLikelySameTitleIgnoringPlaceName(a, b, placeName)`
(`lib/event-filters.ts`) strips `placeName`'s own significant words from
both titles before running the same Jaccard-or-overlap comparison
`isLikelySameTitle` already uses — both dedup tiers now call this instead
of plain `isLikelySameTitle`. The San Felipe case that originally
motivated the strict fingerprint tier (2026-07-18, three differently-
punctuated titles for the same real event, no venue name embedded in any
of them) still passes fine, confirmed by a regression test — this closes
a real gap without reopening that one.

## New source: Google Alerts ("inauguracion de arte"), a real free discovery channel (2026-08-14)

Daniel had a personal Google Alert ("inauguracion de arte", Chile-scoped)
running for a while — evaluated at his request against ~20 real days of
its own history (both the daily email digest and its own "ver más" full
history page). Real density: far higher than any single bright source
added this month, with genuine national geographic spread (Arica,
Iquique, Temuco, Los Andes, Valparaíso, Concepción, Punta Arenas...) in
ONE feed, complementing both the comuna-by-comuna Tavily search (25/week
batch) and every single-site bright source.

**Delivery method, deliberately not email**: two alternatives considered
first — Gmail API (OAuth2, reusing the same Google Cloud project already
used for admin login) and IMAP (an app password) — both require reading
Daniel's actual mailbox. Switching the alert's own delivery to **RSS
feed** instead avoids that entirely: it's a plain, unauthenticated URL,
same "just fetch it" shape as every other bright source, no mailbox
access, no OAuth consent flow. The feed URL itself embeds a
Google-account-linked numeric ID, so — unlike a public gallery listing
page — it's treated with the same caution as a real secret:
`GOOGLE_ALERTS_FEED_URL` (env var / GitHub Actions secret), never
hardcoded into `known-sources.ts` (this repo is public).

**Real, structural difference from every other bright source**: each
entry links to a DIFFERENT, unrelated domain — a different news outlet
per story, not one consistent site. No per-site extractor is possible.
Own isolated pipeline (`google-alerts-discovery/`), same precedent as
MAVI/Instagram, reusing the curation/insertion pipeline unchanged.

**Feed shape** (`lib/google-alerts.ts`, real Atom XML, not the RSS 2.0 the
"Feed RSS" label implies): each `<entry>` gives a title, a Google
tracking-redirect link (the real article URL lives in its own `url` query
param — needs unwrapping), a short keyword-highlighted snippet (too thin
to curate reliably alone), and `<published>` (when Google's crawler found
it, not the exhibition's own date). Double HTML-entity-escaping found and
handled: the raw `<content>` text is XML-escaped around text that's
ITSELF HTML (`&lt;b&gt;` for a keyword-bold tag), so it needs one decode
pass before the usual tag-strip-and-decode (`collapseWhitespace`) can
run — `decodeHtmlEntities` exported for this specific reuse.

**No per-site description extractor is possible** (every entry, a
different domain) — reuses `sources.ts`'s existing generic
whole-page-flatten fallback (`fetchHtmlPageFallback`, already what every
extractor-less bright source falls back to) for every entry, not just
approved ones, since the feed's own snippet alone isn't enough to curate
on. Exported and given an injectable `fetchImpl` parameter (defaulting to
the real `fetch`, every other existing caller unaffected) specifically so
this new orchestrator's own tests don't need real network calls.

**No images from the feed at all** — same generic page fetch recovers one
via `filterKnownSourceImages(extractImgTags(...))`, same mechanism.

**Cadence**: the SHARED 7-day `bright_source_fetch_state`/`isSourceDue`
— unlike Instagram (many independently-paced accounts needing per-item
adaptive cadence), this is one continuously-updating feed, so the simpler
shared mechanism fits without modification. The feed's own identity is
tracked as a fixed key string (`google-alerts://inauguracion-de-arte`),
never the feed URL itself (keeps the personal-data-adjacent URL out of
any logged/stored value beyond the runtime env var).

**Real end-to-end verification** (local Supabase, real feed, real
Anthropic curation, 2026-08-14): 7 entries fetched, 1 article blocked the
plain fetch (403, degraded gracefully to the feed's own snippet rather
than losing the candidate), 2 genuine exhibitions inserted (ArtePuerto
2026, Valparaíso; a CONAF photography exhibition, Iquique). Also
confirmed, incidentally, that this new source correctly triggers
curation-policy.md's institutional-religious-venue exclusion (a Vatican
Dicastery-organized triennial, rejected) with zero source-specific code —
same shared curation pipeline as everything else.

## Instagram accounts: 17 added, 5 real bugs found in one evaluation session (2026-08-14)

Following the playbook above, ~40 Daniel-proposed usernames evaluated in
one session; 17 added (`instagram-accounts.ts`): mugupla, mamchiloe,
arte_uah, institutodearte.pucv, casavaras, liquenlab_magallanes,
casa_arpa, valpocultura, espaciovilches, galerialasala, omagaleriarte,
artequin, factoriasantarosa (Instagram, ALONGSIDE the existing
factoriasantarosa.cl bright source — same real venue via two mechanisms,
cross-source dedup handles the overlap), galeriamacchina,
galeria_gabriela_mistral, espacio_o (Instagram, alongside espacioo.com,
same reasoning), mssachile. Rejected candidates and why (dead, commercial/
auction/workshop-not-gallery, wrong country, low density) are NOT
repeated here — full list lives in memory
(`project_instagram_accounts_evaluated_2026_08_14`), not this doc, since
"why we didn't add X" doesn't inform future engineering decisions the way
a real bug does.

**Bug 1 — `publishedDate` never backfilled for Instagram.**
`fillRunStartFromPublishedDate` (`discover.ts`) — backfills a missing
`runStartDate` from a real, non-fabricated `BrightSourceItem.publishedDate`
when only a closing date is confirmed — existed for `noticias.udec.cl`
(WordPress `date` field) but `instagram-item.ts` never populated
`publishedDate` at all. Found via factor__f's real "Formas de habitar la
materia" post (closing date confirmed, no opening date anywhere). Fixed
by mapping it from `ApifyInstagramPost.timestamp`.

**Bugs 2-3 — informal-caption dedup gaps, two iterations, one real
regression caught.** `isLikelySameTitle`'s jaccard/overlap ratio, tuned
for consistent aggregator titles, is too strict for two differently-
worded social captions about the same real opening (found via factor__f's
"BOTÁNICA": 2 posts → 2 DB rows). A first fix (new `titlesByLocationDateOnly`
+ "≥1 shared word, no ratio" tier) missed a second, related case
(hifas.galeria's "Cartografía del Fuego": the backfilled `runStartDate`
from bug 1 differed per-post, so even the coarser date bucket didn't
match) — fixed by adding `titlesByPlaceName` (keyed on placeName alone)
matching on `runEndDate` equality instead. Dropping the ≥1-word floor
(not just the ratio) then broke a PRE-EXISTING regression test (MAC -
Parque Forestal, see 2026-08-12 above) — traced to the fixture prefix
`__test__` surviving tokenization as a "shared word," proving the ≥1-word
threshold was unsafely weak in general, not just for that test artifact.
Final: `isLikelySameTitleWithoutRatio` (`lib/event-filters.ts`), restored
≥2-shared-word floor, new `sameVenueMatch` dedup tier in `run.ts`.

**Bug 4 — a real production-severity crash: UTF-16 surrogate-pair
truncation.** Found via mugupla's emoji-dense captions. Plain
`.slice(0, TITLE_MAX_LENGTH)` truncates by UTF-16 code UNIT, not
character — landing mid-surrogate-pair produces a lone unpaired
surrogate, which the Anthropic API's JSON parser rejects outright (400,
"no low surrogate in string"). Uncaught, this killed the ENTIRE batch
curation call, not just the one bad candidate — every other due
account's results in the same run, lost. Fixed with `truncateSafely`
(`extractors.ts`, spread-operator code-point iteration, can't split a
surrogate pair), applied in `instagram-item.ts`'s title truncation and
(same latent risk, found proactively) `sources.ts`'s 4000-char
whole-page-flatten fallback (used by Google Alerts and any
extractor-less source).

**Bug 5 — "Chiloé" not recognized as a Chilean location.**
`isChileanLocation`'s whitelist (`lib/locations.ts`) had every comuna and
region name but not "Chiloé" itself — a real provincia, not a comuna, so
never in the `regions`-table snapshot the list was generated from.
mamchiloe's own museum caption self-identifies as "Chiloé" (matching its
username), so a real, complete, dated exhibition got code-rejected as
"not Chilean." Fixed by adding "chiloe" to `CHILE_MARKERS` — safe since
that list only decides Chilean-or-not, not which comuna (`matchRegionId`
stays comuna-only, `region_id` correctly stays null rather than
fabricating a comuna).

**Bug 6 — a decorative first line collapsed every title to the same
string.** institutodearte.pucv's captions all open with a lone "•" before
the real title; `toBrightSourceItem`'s "first line" title extraction took
that literal "•" as the title for every single post — useless in the UI,
and worse, it caused a false title-exact-match dedup collision between
two genuinely different real exhibitions (Hiperia, Cómo ordenar un
miedo), silently dropping one. Fixed: `instagram-item.ts` now takes the
first line containing at least one letter/digit (Unicode-aware), not the
literal first line.

**A known, deliberately UNFIXED gap — MSSA's "highlight post" pattern.**
Museums that post several content-marketing highlights about individual
rooms/artworks within ONE running exhibition, each with genuinely
disjoint captions (0-1 shared significant words pairwise, since
"exposición" itself is a stopword), produce multiple DB rows for the same
real exhibition despite an identical placeName + exact `runEndDate`.
Structurally indistinguishable, by word-overlap alone, from the MAC -
Parque Forestal regression case above (two genuinely DIFFERENT
exhibitions sharing a venue's season dates) — any fix relaxing the title
check for an exact venue+date match would directly reopen that
regression. Documented in `run.ts` next to `sameVenueMatch` as an
accepted, bounded cost (a duplicate real listing is noise, not
fabrication; a moderator can merge via the admin "Quitar" action) rather
than risking the known-good regression guard. Confirmed live in
production the same day: MSSA's real "América despierta" exhibition
produced 3 separate rows in one run.

## Instagram accounts: 10 added in one session, no new pipeline bugs (2026-08-18)

A different session shape than 2026-08-14 above: ~28 Daniel-proposed
usernames evaluated one at a time in chat, following the same playbook
(fetch 5-6 real recent posts, no date filter, via a throwaway script),
but purely a curation/evaluation pass — no code changes to the discovery
pipeline itself this time.

**10 added** (`instagram-accounts.ts`): studio_globo_urbano (multi-venue,
Galería Condell + Tienda Makers), wall.galeriataller (Talca),
casona_lagoslira (Santiago), colinagaleria (Colina, municipal),
galeriauct (Temuco, Universidad Católica), centroamigosdelarte (Talca —
second real space confirmed in that comuna alongside wall.galeriataller),
casadelartediegorivera (Puerto Montt), loica_arte (Valparaíso),
valparaisocasaarte (Valparaíso), fundacioncultural561 (Ovalle). Also
completed a pending quality audit on atacama_artgallery (added 2026-08-13,
had not yet had its first real production run) — confirmed real: not a
fixed gallery but a touring themed exhibition organized by Activo
Festival.

**A recurring evidence pattern, distinct from the 2026-08-14 batch**:
several of today's additions had ZERO qualifying posts in their own feed
within the sampled window — the evidence came entirely from OTHER
accounts (artists, curators, partner organizations) tagging or mentioning
the venue with real dates. `casona_lagoslira` and `casadelartediegorivera`
are the clearest cases — added anyway given independently-confirmed real
exhibitions, but flagged in their own notes as an operational risk worth
watching: if the venue's own feed genuinely posts rarely, per-account
Apify fetches keyed on that `username` may under-deliver relative to what
the venue actually hosts. Revisit after a few real production runs.

**Two handles failed to resolve** (`extension_utalca`, `vinvulacion_ufro`,
and later `fencuentrosur`) — Apify's actor silently fell back to
unrelated content (once, traceable to hashtag-adjacent fallback content)
rather than erroring cleanly, for what's most likely a wrong/mistyped
handle or a private/deleted account. Worth a real fix if this recurs:
today it was caught only by manually noticing the returned `ownerUsername`
never matched the requested account.

**Verified same-day in production** (`workflow_dispatch` run of
`instagram-bright-sources.yml`, real cost $0.022): 3 of the 10 new
accounts (studio_globo_urbano, wall.galeriataller) already had due,
curatable content — both real exhibitions evaluated in chat ("REFUGIO",
"MURMULLOS") were approved and inserted on the very first fetch, exactly
matching the manual evaluation.

**On "artesanía" as a scope question, left open**: one candidate
(artesaniasdechile) sits genuinely on the boundary between crafts/
artisanry and fine-art exhibitions — checked both `curation-policy.md`
and `overview.md`, neither takes a position either way. Not added,
pending an explicit editorial call from Daniel.

## Cross-source curation conflict escalation (2026-07-30)

A **different** kind of gap than the dedup fixes above — found by a
user-requested manual audit specifically testing the five sensitivity
axes (`docs/curation-policy.md`) against real production data, not the
scope/format axis the earlier audits covered. The same real exhibition
("Existen otros mundos, pero están en este", MAC Quinta Normal) was
simultaneously **approved** (via arteinformado.com's vague description)
and correctly **rejected** under the Religion axis (via uchile.cl's more
detailed one, which mentioned explicit religious/mythological imagery
arteinformado.com's copy never surfaced). Not a classifier bug — Haiku
applied the axis correctly whenever it actually saw the disqualifying
text — but a structural gap: nothing ever compared a new candidate
against an EXISTING decision on likely the same real event from a
different `source_url`.

**Design, decided with the user**: when `insertCandidates` is about to
record a decision that conflicts with an existing one on a likely-same
real event (similar title + same `region_id` + anchor dates within
**±30 days**, different `source_url`), hold both and email the site owner
instead of silently applying either. The existing/older decision stays
untouched until resolved.

**Schema** (migration `20260730150000_add_curation_escalations.sql`):
- `rejected_candidates` gained `location`/`region_id`/`anchor_date`
  (nullable, best-effort — same defensive posture as the rest of that
  table, see its own migration comment on the 2026-07-22 null-location
  crash) — it never carried a location/date signal before this, needed
  here specifically so a rejected candidate can be matched against a
  later approved event, or vice versa.
- New table `curation_escalations` — one row per detected conflict,
  denormalized (both sides' title/source/reasoning snapshotted as plain
  text, plus the new candidate's full insertable payload as JSONB) so the
  email and eventual decision don't depend on either referenced row
  surviving unchanged. Two opaque random tokens per row (`accept_token`/
  `reject_token`), each single-use.

**Detection** (`event-discovery/run.ts`, new `findConflictingApprovedEvent`/
`findConflictingRejectedCandidate`, `isWithinAnchorWindow` in
`lib/event-filters.ts`): runs at the top of `insertCandidates`'s loop, for
every candidate with a real `sourceUrl`, checking only the OPPOSITE
existing status (an approved candidate is checked against rejected
candidates, and vice versa — same-status "conflicts" aren't conflicts,
today's ordinary dedup already handles those). A candidate about to be
approved that would need image rehosting gets it done immediately when
escalated too, not deferred until a human clicks Accept — a signed
Instagram/Facebook CDN link can rot within hours, and resolution may take
days.

**Notification** (`lib/notify.ts`'s `sendEscalationEmail`, same
ancillary/never-throws posture as the run-summary emails) — both
versions' title, source link, and full reasoning, plus Accept ("usar la
versión nueva") and Reject ("mantener la anterior") links.

**Confirmed 2026-08-17, real gap found during an audit**: the DETECTION
and resolution machinery below is fully built and working, but
`sendEscalationEmail` shares the same `RESEND_API_KEY`-not-set no-op
every other curator email hits (real production run logs consistently
show it as unset) — conflicts were accumulating with genuinely zero
visibility anywhere (7 real, unresolved rows found by querying the table
directly). `/admin/fuentes` now shows a bare pending count (see
[architecture.md](architecture.md#admin-analytics-dashboard)) — no
detail/action view yet, just visibility that these exist.

**Resolution**: `supabase/functions/curation-escalation-decide` — the
project's first Edge Function, reached directly from the email (no
inbound email parsing, no webhook — just two GET links, same "link to our
own endpoint" pattern already used elsewhere, much simpler than Phase
1b's original inbound-mail design). Runs with the service_role key
(Supabase's own platform-provided env for every Edge Function — never
touches Vercel/apps/web, which explicitly never holds this key, see
`apps/web/src/lib/supabase-client.ts`'s `assertAnonRole` guard). The
action is determined by WHICH token matched (`accept_token` vs.
`reject_token`), never by a client-supplied query param, so a tampered
URL can't flip the decision. Accept applies the new candidate's decision
(inserts into `events` if approved; flips the existing `events` row to
`rejected` if not). Reject keeps the old decision and just records the
new candidate into `rejected_candidates` so it stops re-triggering the
same escalation on a future run.

**Production fix applied by hand** (2026-07-30, before this pipeline fix
existed): the "Existen otros mundos" row's `curation_status` was manually
flipped to `rejected` directly via SQL — not deleted, reasoning field
kept with an appended correction note.

## Cost governance

A self-tracked ledger keeps both processes bounded, without depending on
Anthropic's billing API.

### The self-tracked ledger

- **`system_config`** table — plain key/value config, editable directly (no
  redeploy needed): `monthly_budget_usd`, `max_total_regions = 200`.
  **Ceiling relaxed:** the original $10/month figure is no longer a hard
  cap — up to **$50/month** is acceptable if real event quality/coverage
  justifies it, confirmed against real measured Event Discovery costs (see
  above) that stay far under that even at meaningfully larger scale.
- **`api_usage_log`** table — one row per paid Anthropic call: model,
  purpose, token counts (including cache read/write), estimated cost from a
  hardcoded per-model $/Mtok table (`apps/curator/src/lib/pricing.ts`).
  **Tavily spend is not tracked here** — it's a separate provider/billing
  relationship, tracked on Tavily's own dashboard instead of force-fit into
  a schema built around Anthropic's pricing shape.
- `apps/curator/src/lib/usage-tracking.ts` exposes `recordUsage()`,
  `getCurrentMonthSpend()`, `getConfigNumber()`, `isOverBudget()`, and
  `isOverRegionCap()` — any future code touching Anthropic spend should
  route through these.

### What happens when the ceiling is hit

Hitting `monthly_budget_usd` blocks **new region activation only** — under
the simplified, fixed ~100-unit design above, this specific mechanism is
less relevant (there's no automatic expansion to block), but the ledger and
ceiling still apply generally as a spend guardrail. Raising the ceiling is a
one-line SQL update, no redeploy required.
`apps/curator/src/lib/notify.ts` opens a GitHub issue (labeled
`budget-alert`, deduplicated) the moment the ceiling is hit.

### Cost-reduction techniques

- **Tavily's own `score < 0.15` filter** — dropped before reaching Haiku,
  confirmed zero observed event loss against real logged data.
- **Image filtering** (require alt text, cap per result, drop obvious
  chrome) — cut token volume roughly 60% in a real before/after comparison
  with no observed quality loss.
- **Bright sources curated once per run, not once per unit** — avoids
  paying to re-curate the same aggregator's content N times, one per unit,
  which was the original (wasteful, and inconsistent — see above) design.
- **Prompt caching** — implemented on Event Discovery's system prompt via
  `cache_control`, currently a no-op (prompt is under Haiku's 2048-token
  minimum cacheable prefix — see above). Not worth padding the prompt
  artificially just to cross that threshold.

**Deferred: the Batch API** (50% discount on tokens only — doesn't apply to
Tavily's separate billing, and adds real complexity, submit-then-poll
instead of a single synchronous call). Worth revisiting only once real
volume at the ~100-unit scale justifies it.

### Real cost, measured (Event Discovery, current Tavily+Haiku design)

A full PoC run (3 test units + the bright-sources pass): **~$0.10-0.15** in
Anthropic spend per run, plus Tavily credits comfortably inside its free
1,000/month tier even projected out to ~100 units run once a month. See
"Real cost, measured" under Event Discovery above for the fuller breakdown,
including the image-token-cost tradeoff and why prompt caching doesn't
apply yet.

