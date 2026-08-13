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
- **Search:** Tavily (a separate, LLM-oriented search API), not Anthropic's
  own `web_search` tool — a deliberate reversal of the original "no separate
  search service like SerpAPI" stance below. Real comparison showed
  Anthropic's `web_search` returning mostly title/URL with no real content
  and missing social-media coverage entirely, both of which matter directly
  for finding informal/street art events — see
  [region-discovery.md](region-discovery.md) for the full comparison and
  cost data.
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
