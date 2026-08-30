# Caldearte — Architecture

## Stack

- **Monorepo:** lightweight pnpm workspace (`apps/web`, `apps/curator`,
  `packages/shared-types`, `packages/curation-policy`).
- **Frontend:** Next.js on Vercel Hobby (free; non-commercial use only — see
  "Free-tier posture" below).
- **Backend/data:** Supabase (Postgres + PostGIS + Storage + Edge Functions),
  free tier while volume stays low.
- **Automation:** GitHub Actions (public repo, standard runners are free and
  unlimited) for the curator's cron jobs.
- **AI:** Claude Haiku 4.5 via the Anthropic API for all curation — text
  axes, image selection, and the Axis 5 vision check — across both Event
  Discovery and the Event Crawler. Originally Sonnet was used for Event
  Discovery on the assumption bigger-model judgment was needed there; real
  side-by-side testing showed Haiku reaching identical classification
  decisions at roughly a quarter of the cost — see
  [region-discovery.md](region-discovery.md).
- **Search:** two sources feed Event Discovery today, both cheap and
  actually productive — **bright sources** (known-rich venue/gallery sites,
  fetched directly) and **Instagram via Apify** (`apify-client`, actor
  `apify/instagram-post-scraper`). The general per-comuna **Tavily**
  search (a separate, LLM-oriented search API, chosen over Anthropic's own
  `web_search` tool for its social-media coverage) is still in the
  codebase but its cron has been **paused since 2026-08-23** — months of
  runs produced zero real events (approved or rejected) at a measured
  ~$16.48 in Haiku spend plus Tavily credits, while bright-source and
  Instagram cost cents per run and work. See
  [region-discovery.md](region-discovery.md) for the full comparison, the
  pause rationale, and cost data.
- **Email:** Resend (free tier, 3,000/month) for approval and inbound-mail
  flows (Phase 1b).
- **Geocoding:** no external service — `nearestCityIdByCoords`
  (`apps/web/src/lib/cities.ts`) matches a lat/lng (from Vercel's IP
  headers or the browser's own Geolocation API) against each comuna's
  already-seeded centroid coordinates
  (`20260730005132_backfill_region_coordinates.sql`) via plain haversine
  distance, capped at 50km before falling back to the coarser name-only
  match. Nominatim was evaluated early on but never actually wired in —
  no per-venue geocoding is needed since location stays freeform text,
  and the one remaining coordinate need (visitor-side "which comuna am I
  near") is fully covered by matching against Chile's own fixed,
  already-known 346 comuna centroids.

## Free-tier posture: upgrade reactively, not preemptively

Standing policy for all third-party services (Supabase, Vercel, Resend): stay
on the free tier by default, and upgrade only once an actual limit is hit in
production — not ahead of time based on projected growth.

If a real limit is hit: Vercel Pro is $20/month per seat and, at this
project's expected volume, its included usage credit alone covers roughly
50–80x the Hobby image-transformation cap before any additional overage — so
crossing into Pro, if it ever happens, is a small and predictable cost, not
an open-ended one.

The same "build visibility, don't pay ahead of need" philosophy governs
Anthropic API spend specifically — see
[region-discovery.md](region-discovery.md#cost-governance) for the
self-tracked $10/month ceiling.

## Admin mode

**Shipped 2026-08-05/06.** A single-admin (not multi-user) tooling layer,
built as the first real consumer of the Auth.js decision in
[roadmap.md](roadmap.md#phase-2--community)'s Phase 2.1 — but scoped
narrowly to admin-only actions, NOT the general visitor accounts
("quiero ir"/"ya la vi") that phase still describes as unbuilt. When 2.1
eventually ships real user accounts, only the session/JWT plumbing below
gets reused; there is no `users` table yet and none of this exposes
sign-in to regular visitors.

- **Auth.js v5** (`next-auth@5`), Google OAuth provider only, JWT session
  strategy, no database adapter, no `users` table
  (`apps/web/src/lib/auth.ts`). A `jwt`/`session` callback compares the
  signed-in email against `ADMIN_EMAIL` (server-side only) and attaches
  the result as an `isAdmin` claim on the session
  (`apps/web/src/next-auth.d.ts` module augmentation) — the raw email
  comparison itself never reaches the client, only the boolean.
  `isAdminSession(session)` is the one place that check lives, reused by
  every admin API route.
- **`/login`** (`apps/web/src/app/login/page.tsx`) is the ONLY sign-in
  surface on the whole site — never linked from the header, footer, or
  menu drawer, and disallowed in `robots.ts`. Reaching it means typing
  the URL directly. Framed to visitors as "estamos construyendo las
  cuentas de usuario" (the real, forward-looking Phase 2.1 framing) since
  anyone can technically sign in with their own Google account — signing
  in without being the admin just grants no extra capability, per the
  `isAdmin` gate above.
- **`useIsAdmin()`** (`apps/web/src/lib/useIsAdmin.ts`) — client hook
  gating which admin UI renders at all. Purely a UX convenience; the real
  enforcement is server-side (below), so this hook being wrong/bypassed
  client-side grants no actual access.
- **Admin action pattern** — every privileged write goes through the same
  three-step chain, first established for "Quitar" (soft-remove) and
  reused as-is for "Marcar como sensible" (toggle):
  1. Browser → a Next.js API route under `apps/web/src/app/api/admin/*`
     that calls `auth()` + `isAdminSession()` and 401s/403s before doing
     anything else.
  2. That route forwards the request to a Supabase Edge Function
     (`supabase/functions/admin-*`), authenticated by a shared
     `x-admin-secret` header matching `ADMIN_ACTIONS_SECRET` — the same
     "our own server, not the public internet" trust boundary every Edge
     Function in this repo already relies on (see `newsletter-confirm`/
     `newsletter-unsubscribe`). Deployed with `--no-verify-jwt`, since
     none of these functions receive a Supabase JWT from their caller.
  3. The Edge Function holds `SUPABASE_SERVICE_ROLE_KEY` and does the
     actual privileged write. `apps/web`'s own `lib/supabase-client.ts`
     never holds the service-role key (`assertAnonRole` guard) — this
     three-step indirection is what keeps that invariant intact while
     still letting an admin action reach past RLS.
  Both shipped actions soft-modify a row rather than hard-deleting or
  overwriting pipeline-owned columns — see data-model.md's `removed_at`/
  `removed_reason`/`admin_sensitive_marked_at` entries for why each stays
  a separate column from the AI-owned ones (`curation_status`,
  `sensitivity_tags`).

## Admin analytics dashboard

**Built 2026-08-15 through 2026-08-17**, on top of the same
`isAdminSession`/`ADMIN_EMAIL` gate as Admin mode above, but a distinct
read-only reporting layer, not another privileged-write action — no
`api/admin/*` route needed (see `AdminPageShell`/`requireAdminSession`
below), and no `x-admin-secret` reaches the browser (fetched server-side
only).

**Data flow**: one Supabase Edge Function, `admin-analytics`
(`supabase/functions/admin-analytics/index.ts`), ships lightweight
ROW-LEVEL data (events, `rejected_candidates`, cost logs, etc. —
un-aggregated) in one response, authenticated by the same shared
`x-admin-secret` pattern the privileged-write actions use. Every
`/admin/*` page's own React Server Component calls
`requireAdminSession()` + `fetchAdminAnalytics()`
(`apps/web/src/lib/adminAnalytics.ts`) once, then hands the whole
payload to a client component. All bucketing (week/month/year/total) and
filtering happens **client-side**
(`apps/web/src/lib/adminAnalyticsBucketing.ts`'s `bucketLabel`/
`sumFlowByPeriod`/`countActiveByPeriod`/`sumAmountByPeriod`/
`isEventInPeriod`) — no re-fetch when a visitor toggles granularity, and
the Edge Function never needs a separate query per time window.

**Four pages, split 2026-08-17** (originally one long `/admin` page):
- **`/admin`** — a quick CURRENT-period-only summary, not a historical
  view (`GranularityToggle`'s `hideTotal` prop hides "Total" here
  specifically — "período actual" has no meaningful all-time reading).
  In order: **Costos** (one executive line — effective cost this period,
  Apify's free tier called out separately, see Cost governance above),
  **Chile — eventos** (stacked bar: inauguraciones vs. exposiciones
  activas, plus the period's real DISTINCT event total —
  `isEventInPeriod` dedupes an event that's both at once, rather than
  summing the two bars), **Chile — regiones** (2 donut charts — Santiago
  vs. resto, and the full 16-región breakdown — first `PieChart` usage in
  the repo), **Fuentes** (same stacked-bar component as Chile — eventos,
  reused generically — grouped by fuente instead of by
  inauguración/exposición), **Señales fuera de alcance**
  (`OutOfScopeTrends`, full historical view, not period-scoped).
- **`/admin/eventos`** — the historical event detail that used to live on
  `/admin` itself: one `EventosPeriodBlock` for "Chile — total" plus one
  per región (all 16, always, north→south order — a región with zero
  events stays visible rather than disappearing, same posture as the
  public site's CityPicker). Each block is a chart+table pair
  (`EventosChart`/`EventosDetailTable`) with a hover-sync interaction
  that combines two patterns that used to be separate: the "you are here"
  reference line defaults to the CURRENT period (not hover-only), moves
  to whatever row is hovered in the table, and reverts to the current
  period on mouseleave — the table's detail rows also auto-scroll into
  view on mount/granularity change, so the current period is visible
  without manual scrolling.
- **`/admin/fuentes`** — per-fuente detail: `FuentesPorPipelineChart` +
  `SourceComparisonTable` (chart left, table right), `BrightSourcesTable`/
  `InstagramSourcesTable` (per-source yield + a `possiblyDead` heuristic),
  a pending-curation-conflicts count (see `curation_escalations` below),
  and `CoberturaTable` (see "Cobertura por corrida" below).
- **`/admin/costos`** — Anthropic + Apify cost history, `TotalCostChart`/
  `CostHistoryChart`/`CostTable`, same hover-sync `ReferenceLine` pattern
  as `/admin/eventos` (hover-only here, no current-period default — see
  Cost governance above for the Apify free-tier split this table/chart
  both apply).

**Pipeline grouping, not raw pipeline values** (`pipelineGrouping.ts`,
2026-08-17): `bright_source` and `headless` (MAVI — a single website
source scraped via headless browser, not a genuinely distinct discovery
mechanism from the other web sources) both display as **"Web"**
everywhere in this dashboard — `groupPipelineLabel`/
`mergePipelineComparison` are the one shared place this merge happens,
reused by every chart/table that groups by fuente, so `/admin`'s summary
and `/admin/fuentes`' detail can never drift into showing MAVI two
different ways (a real inconsistency found and fixed the same day it was
introduced). `comuna_search` (Tavily-based comuna search, disabled since
the bright-sources pivot — see Event Discovery above) keeps its own row
wherever pipelines are compared, but its label is suffixed
**"— inactiva"** (`pipelineLabels.ts`) so a permanent 0/0 row reads as
"off on purpose," not broken.

**Cobertura por corrida** (`discovery_run_summaries` table, migration
`20260817120000_add_discovery_run_summaries.sql`) — every curator
entrypoint (`event_discovery`/`headless`/`instagram`/`google_alerts`)
already computed a rich per-run summary object every run
(`apps/curator/src/lib/notify.ts`'s `RunSummary` and its 3 siblings,
including the real per-candidate `outcome` —
`inserted`/`replaced`/`duplicate_skipped`/`escalated`/`expired`/
`insert_failed`, distinct from Haiku's own approved/rejected verdict) —
it just fed a summary email whose Resend half was never actually
configured in production (`RESEND_API_KEY` reads as unset in every real
run's own logs), so the object was built and discarded every time.
`recordRunSummary` (`apps/curator/src/lib/run-summary-store.ts`)
persists a compact, typed projection of that same object regardless of
whether the email sends — full original object kept in a `raw_summary`
jsonb column for anything not promoted to its own column yet, same
"ship raw, aggregate client-side" posture the rest of this dashboard
uses. Surfaced in `/admin/fuentes` as `CoberturaTable`, last 90 days,
most recent first — the first place this data has ever been visible
outside ephemeral GitHub Actions logs.

**Pending curation-conflict count** — `curation_escalations`
(see "Cross-source curation conflict escalation" in
[region-discovery.md](region-discovery.md)) rows with `resolved_at is
null` are counted (`pendingEscalationsCount` in the Edge Function
payload) and shown as a plain line in `/admin/fuentes` when non-zero — no
detail view yet, just visibility. Confirmed 2026-08-17: the escalation
DETECTION and resolution machinery (`findConflictingApprovedEvent`/
`findConflictingRejectedCandidate`, the `curation-escalation-decide` Edge
Function) is fully built and working, but `sendEscalationEmail` shares
the same `RESEND_API_KEY`-not-set no-op as every other curator email —
conflicts were accumulating (7 real, unresolved rows found during a
2026-08-17 audit) with genuinely zero visibility anywhere until this
count.

## User location detection: región, not comuna

**Chosen approach: Vercel's native IP geolocation as a silent default (SSR) +
a manual región selector as a cookie-persisted override. The Browser
Geolocation API is an optional enhancement, not the default.**

**Selection unit changed from comuna to región, 2026-08-12** (real
feedback: picking "Santiago" as a comuna hid real events in Vitacura,
Providencia, etc. — comunas within Región Metropolitana that are
realistically visitable the same day; separating them by comuna felt
arbitrary). The site's own location-selection cookie is now a **región**
slug (16 real Chilean admin regions), not one of the 346 comunas — a
comuna's own name is still shown next to its venue on every card
(`useEventCardActions.ts`'s `venueLine`, via `deriveComuna`/
`displayNameForCity`), it's just no longer the thing being filtered/
selected. This is the same architecture the newsletter already used
(región-scoped subscriptions, comuna kept only as a display detail on
each digest item) — the site's own navigation just hadn't caught up to it
until now.

Key finding (unchanged): Vercel injects IP-geolocation headers
(`x-vercel-ip-city`, country, region, approximate lat/lng) on every
request to Vercel Functions/Edge Middleware, for free, with no external
service call, available in SSR. This makes contracting a third-party
IP-geolocation service unnecessary: the ones evaluated (ipapi.co,
ipinfo.io) are either not production-viable on their free tier, or their
free tier only gives country-level precision, not city.

Actual implementation:

1. `resolveCityPickerContext` (`apps/web/src/lib/cityPickerContext.ts`,
   extracted 2026-08-06 once both the home page and the event detail page
   needed the exact same location-resolution + picker-sidebar-data logic
   — a server-only function, reads `cookies()`/`headers()` directly, no
   edge middleware) is the single place a visitor's active región gets
   resolved, for every page that needs it. It still resolves a comuna
   internally too (`cityId`) — geolocation and comuna-level dedup/display
   logic both still work at comuna granularity — but that comuna is only
   ever used to DERIVE the visitor's admin región, never exposed as a
   separate selection.
2. If a `caldearte_region` cookie is set, it wins — validated against the
   real 16-región list (`allAdminRegions(regions)`, deduped from all 346
   seeded comunas' own `admin_region_name`). The old comuna-level
   `caldearte_city` cookie is no longer written or read anywhere;
   `CITY_COOKIE` stays defined in `lib/cookies.ts` only so a stray old
   cookie value from before this change doesn't collide with anything —
   a returning visitor just resolves through step 3 below once, same as
   any fresh visitor.
3. With no `caldearte_region` cookie, the visitor's región is derived from
   `resolveDefaultCityId` (`apps/web/src/lib/cities.ts`, unchanged) — the
   IP-geolocated comuna's own admin región wins; with no geo signal at
   all, falls back to Región Metropolitana de Santiago.
4. **The manual location selector** (`CityPickerPanel.tsx`) — collapsed
   2026-08-12 from a 3-step wizard (Zona → Región → Comuna, shipped
   2026-08-03) down to a **single step**: a flat, scrollable list of all
   16 regions (same `max-h` + `overflow-y-auto` pattern the old step-3
   comuna list used, since 16 regions plus badges still don't all fit on
   one mobile screen). Selecting a región sets `caldearte_region` client-
   side, taking precedence over IP resolution on every later visit. Every
   región stays visible regardless of whether it currently has an event
   (unlike the old per-comuna list, which only ever listed comunas with
   something to show) — a whole región disappearing from the map would
   read as "this part of Chile doesn't exist," the same reasoning that
   used to keep the now-removed 5 zonas always visible. Search inside the
   picker still matches a comuna's own name (e.g. typing "Vitacura"), but
   resolves and selects that comuna's parent región, not the comuna
   itself — there's no comuna-level selection left anywhere in the picker.
5. Browser Geolocation API as an optional action ("Usar ubicación exacta")
   is still built and opt-in only (`requestPreciseCityId`,
   `PRECISE_CITY_COOKIE`, still comuna-level internally since lat/lng
   naturally resolves to a comuna centroid first) — never automatic,
   surfaced inside the picker and via `GeoLocationChangedBanner`'s own
   silent re-check, which now compares at RÉGIÓN level too (moving
   between two comunas in the same región no longer re-triggers the
   "tu ubicación cambió" prompt — the whole point of the comuna→región
   change was that this shouldn't matter).
6. `/privacidad` (`apps/web/src/app/privacidad/page.tsx`) explains IP-based
   location inference in plain terms, without tying it to an account or
   storing it beyond the preference cookie.

Limitation to keep in mind: IP geolocation doesn't work on `localhost` in
development — the geo headers are absent there, so location resolution
always falls through to Región Metropolitana de Santiago locally; real
geo-detection only happens on an actual Vercel deploy.

**"Expos Anteriores" removed, 2026-08-12** — the statically generated
past-events archive (`/expos-anteriores/[year]/[month]`, shipped
2026-07-19) had already been dropped from the menu earlier; the route,
components, and now-orphaned helper functions (`listArchiveMonths`,
`eventsForMonth`, `isArchivableMonth`, `monthBounds`, `fmtMonthYear`) were
deleted outright in the same pass as the región selector change, per an
explicit request rather than as a side effect of it. `events` retention
(~1 year past close, approved rows never pruned) is unaffected — see
data-model.md, whose own comment explaining *why* approved rows are
exempt needed a matching update since it used to cite this archive as the
reason.

Sources: [Vercel — geolocation IP headers](https://vercel.com/kb/guide/geo-ip-headers-geolocation-vercel-functions), [ipapi.co pricing](https://ipapi.co/pricing/), [IPinfo pricing](https://ipinfo.io/pricing), [IPinfo Lite](https://ipinfo.io/lite).

## Home page: cached default + client-side personalization

**Real incident that forced this (2026-08-06): a Fast Origin Transfer
spike hit 94% of Vercel's Hobby free-tier limit.** Root cause: the home
page (`app/page.tsx`) used to call `cookies()`/`headers()` directly at the
top level to resolve a visitor's real city/family-mode/etc — either of
those forces Next.js to render the route fresh, from scratch, on *every*
single request, no caching possible. At real traffic volume that was
84K uncached requests to one route in the period that tripped the usage
warning. Never documented until this note (2026-08-08) — this section
exists specifically to close that gap.

**Fix, still in place**: `page.tsx` now calls neither `cookies()`,
`headers()`, nor reads `searchParams` — it computes exactly ONE default
view (`computeHomeViewModel` with `EMPTY_COOKIE_READER`: Región
Metropolitana de Santiago, the current week, family mode ON — the same
fallback a cookie-less first-time visitor already got) and lets Next.js
serve that from cache/ISR (`revalidate = 60`) to most visitors.
Personalization moves to the client: `HomeClient.tsx` reads the visitor's
real cookies/URL params in a `useEffect` after the cached HTML has
already painted, and — only when `hasPersonalizationSignal` finds
something that could differ from the default (a región cookie,
family-mode-off, `?semana=`/`?newsletter=`, etc.) — fetches
`/api/home-data` (same `computeHomeViewModel`
computation, real `cookies()`/`headers()`, just a small JSON response
instead of a full page render) and swaps the personalized view in.

**The default must always be the safe-to-flash-briefly state, never the
one that needs correcting-away-from.** Family mode ON is safe (worst
case: a visitor whose real preference is OFF briefly sees the
*more*-filtered view, never less). This same principle has a real
counter-example, found and fixed 2026-08-08: `showGeoConsentPrompt` in
the cached default came back `true` for every visitor (an empty cookie
reader always reads as "cookie absent"), so the location-sharing banner
flashed on for everyone — including visitors who'd already answered it —
then vanished once the personalization fetch loaded the real answer.
Fixed two ways at once: the cached default now forces
`showGeoConsentPrompt: false` (never flash content that might be
unwanted), and `HomeClient.tsx` runs a *second*, independent `useEffect`
that checks the real cookie directly on mount — independent of
`hasPersonalizationSignal`/`refresh()`, because a genuinely fresh visitor
has no cookies at all, so that fetch never fires, and the banner still
needs to appear for them. Lesson for anything added to this cached
default later: ask which direction is safe to flash, and if hiding
something is the safe direction, don't rely on the personalization fetch
alone to reveal it — a zero-cookie visitor may never trigger that fetch.

## SEO: structured data

**Added 2026-08-08** (a Search Console coverage audit found zero
structured data anywhere on the site): every `/eventos/[id]` page now
emits a `VisualArtsEvent` JSON-LD block (`lib/eventJsonLd.ts`) — the
schema.org subtype for exhibitions (no `ExhibitionEvent` type exists).
Same anti-fabrication posture as the rest of the app: dates come from
`activeRange()` (the same "full run" range every other feature already
derives from `openingDatetime`/`runStartDate`/`runEndDate`, date-only,
never a fabricated hour), and `image` is included only when
`resolveCardImage` confirms a real photo — never one of the generic
domain/city placeholders. Beyond enabling Google's event rich results,
this also gives AI answer engines that ground on schema.org markup a
structured, unambiguous source instead of having to infer date/place
from prose.

## Mobile performance/accessibility audit (2026-08-17/18)

A real Lighthouse report the user ran locally (mobile: Performance 76,
Accessibility 87) triggered a focused pass, verified against a second
mobile report afterward (97/92) and against production directly.

**Image optimization was fully off** (`next.config.ts`'s
`images.unoptimized: true`) on the premise that event photos come from
"unknown domains, no fixed allowlist possible." Checked against
production data and found false: `bright_source` (the dominant non-
Instagram pipeline) draws from only ~20 distinct hostnames total — a
small, hand-curated set, since each bright source is registered in code
one at a time. Replaced with an explicit `remotePatterns` allowlist (the
verified real hostnames + the Supabase Storage host) — a new bright
source whose images live on a not-yet-listed host now 400s loudly until
added, an intentional tripwire. `minimumCacheTTL` raised from the 4-hour
default to 90 days (`7776000`) — event photos never change at the same
URL once curated, and with Vercel's monthly quota reset, 90 days keeps
every calendar month at the "new content only" floor instead of paying
for repeat re-transformations of the same photo under real traffic.

**A real regression, found by the user within hours of the image-
optimization change going live**: `InauguracionBentoCard`'s image panel
combines `flex-1` (flex-basis: 0%) with an explicit `h-[220px]` — on
mobile (`flex-col` stacking), flex-basis wins over the height property
per the CSS flexbox spec, collapsing the panel to 0px tall. A plain
`<img>` used to mask this (its own intrinsic size fed back into layout
as a backstop); switching `CardImage` to `next/image`'s `fill` mode
(`position: absolute`, out of flow) removed that backstop, and the
collapse became visible — photos disappeared from "Inauguraciones de la
semana" on mobile. Fixed with `min-h-[220px] md:min-h-[500px]` alongside
the existing `h-`, which isn't subject to the same flex-basis override.
Lesson: `flex-1` + a fixed height on a flex item is a latent trap the
moment anything inside stops being a normal-flow, intrinsically-sized
element — worth a second look anywhere else that combination appears.

**The home page's client JS bundle carried the full
`@supabase/supabase-js` SDK** (~78KB gzip) for every anonymous visitor —
not because of `next-auth` (a real but wrong initial hypothesis; that
chunk is only ~4.6KB gzip), but because two value (not type-only)
imports dragged `events.ts` — and its `getSupabaseClient` — into the
client: `useNewsletterSubscribe.ts` called the SDK directly from the
browser just to read `regions_public`, and `SearchPanel.tsx` imported
pure filter/sort functions from the same module that also exports the
server-only `fetchApprovedEvents`. Fixed by (1) replacing the SDK call
with a plain `fetch()` against Supabase's REST endpoint, and (2)
splitting the ~20 pure, client-safe utilities (filtering/sorting/
grouping over an already-fetched `EventRecord[]`) out of `events.ts`
into a new `event-utils.ts` that never imports `getSupabaseClient`/
`unstable_cache` — `events.ts` now holds only the DB-fetching surface,
server-only by construction of the module boundary, not by discipline of
who happens to call it. Also broke a preexisting circular import
(`cities.ts` ↔ `events.ts`, via `sumCounts`). Verified against a real
production build (`next build` + `next start`): the 299KB/78KB-gzip
chunk disappears entirely from the home page's served chunk list; total
home JS drops from ~282KB to ~223KB gzip.

## Second Vercel free-tier incident (2026-08-28): ISR Writes + Fast Origin Transfer, and dropping `/eventos/[id]`'s "list mode"

Two Vercel usage warnings hit the same day: **ISR Writes** at 196K/200K
(2026-08-27/28) and **Fast Origin Transfer** exceeded at 12.68/10GB. Both
traced back to real code, not noise — and unlike the 2026-08-06 incident
above (home page only), this one implicated a second route.

**ISR Writes fix**: `app/page.tsx`'s `revalidate` and
`fetchApprovedEvents`'s own `unstable_cache` window (`lib/events.ts`) both
bumped 60s → 600s. Real content (curation/discovery) changes at most a
few times a day, never per-minute, so 60s was regenerating the cache far
more often than the underlying data could possibly have changed.

**Fast Origin Transfer fix — the bigger one**: `/eventos/[id]`'s "list
mode" (added 2026-08-06, PR #203 — position-in-list indicator, prev/next
navigation, a full región+semana picker in a sticky top nav, the
visitor's own current Inauguraciones/Exposiciones lists at the bottom)
read `cookies()`/`headers()` to personalize all of that, which forces
Next.js to render fresh on *every single request* — no ISR, no cache,
ever. That was fine at low traffic; once the Instagram launch
(2026-08-23) started sending real volume straight to individual event
pages, and since `robots.ts` allows `/eventos/*` freely for crawlers too,
this became the real driver of the Fast Origin Transfer spike.

Rebuilding list mode as a client-side-personalized fetch (the same
`HomeClient`/`api/home-data` pattern the home page already uses above)
was seriously considered, but rejected: list mode touches nearly the
whole page (top nav, position indicator, two full sections), so the
"flash of standalone-then-list-mode" on every load would have been far
more visually disruptive than home's own equivalent (which only nudges
counts/filters within an already-settled layout). The user's call
(2026-08-28): **drop list mode entirely.** `EventPageTopNav.tsx`,
`EventPageCityPicker.tsx`, and the `/api/eventos/go-to-city` route were
deleted outright. In its place, `/eventos/[id]` now computes a small,
fully deterministic teaser — up to 4 other current exposiciones in the
same región, same result for every visitor, no cookies — so the page is
cache-eligible again: `generateStaticParams` + `revalidate = 600` flips
it from `ƒ` (dynamic, on-demand) to `●` (SSG via `generateStaticParams`)
in `next build`'s own route table. Verified live in production with
`curl -sI` against real event URLs: `x-vercel-cache: PRERENDER` on first
hit, `HIT` with incrementing `age` afterward.

PRs: #438 (ISR Writes), #439 (Fast Origin Transfer / list-mode removal).

## Cron watchdog (2026-08-28)

Same day, a separate but related discovery: GitHub Actions' `schedule`
trigger is documented as "best effort" and can silently skip firing
during high platform load — confirmed empirically when `publish-social.yml`,
`daily-digest.yml`, and `apify-usage-snapshot.yml` all missed their
expected UTC firing time, with `daily-digest.yml` (merged two days
earlier) never having fired even once. GitHub's own status page showed no
reported outage at the time.

`.github/workflows/cron-watchdog.yml` (PR #440) now runs every 4 hours
and, for each of the repo's 10 scheduled workflows, checks how long it's
been since that workflow's last *completed* run (any trigger type, not
just `schedule` — so a previous watchdog-issued dispatch also "clears"
the gap and the watchdog never re-triggers something it already caught
up). If the gap exceeds that workflow's own `max_gap_hours` (real cadence
+ a generous buffer), it re-dispatches it via `workflow_dispatch`, using
only the default `GITHUB_TOKEN` (`permissions: actions: write` — no new
secret needed to dispatch other workflows in the same repo). Self-heals
future silent misses without needing manual intervention.

**Real bug, 2026-08-29 to 2026-08-30 (PR #454):** the watchdog itself was
silently broken for over a day — every single run failed. Root cause: its
`gh api ".../runs" -f status=... -f per_page=...` calls omitted `-X GET`,
and the `gh` CLI version on the runner image defaults to `POST` whenever
any `-f` field flag is present, not `GET`. There's no POST endpoint for
listing runs, so every check 404'd immediately. Fixed by adding `-X GET`
explicitly to all three `gh api` calls. Caught only because Daniel noticed
the watchdog's own failure emails — a good argument for the watchdog
itself someday having a second-order check, but none exists yet.
