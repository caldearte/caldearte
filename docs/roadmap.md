# Caldearte — Roadmap

## Current status: Phase 1a substantially done — live in production

Done: pnpm workspace, core schema deployed to production
(`regions`/`events`), auto-deploy pipeline for migrations
(`deploy-migrations.yml`), all 346 Chilean comunas seeded, cost-governance
system shipped (`system_config`/`api_usage_log`, budget ceiling, region cap,
change-detection foundation).

Event Discovery (Tavily + Haiku, fuentes brillantes, see
[region-discovery.md](region-discovery.md)) is implemented and in production
(`apps/curator/src/event-discovery/`) — it's the only event-sourcing
pipeline. It writes every event's location as freeform text; there is no
venue entity. The earlier venue-based design (a separate "Event Crawler"
that revisited known venues, plus the `venues` table itself) has been
retired — it was left disconnected after the pivot (nothing fed it new
venues) and has been fully removed from the code and schema, not just
deprecated.

**Frontend (`apps/web`) is built and live** at `caldearte.com` (Vercel
Hobby, launched 2026-07-17/18) — the design decisions this section used to
describe as blocking are resolved and shipped: the full calendar view,
región-grouped city picker, family-mode content filtering (defaults ON for
first-time visitors), a real contact form, and standard SEO/analytics
basics. See [architecture.md](architecture.md) for the shipped city-picker
and geo-detection design, and `apps/web/src/components/` for the actual
component tree.

## Phase 0 — Definition (complete)

Closed out the initial project brief, moved into a dedicated repo.

## Phase 1a — Core loop (no inbound-mail flows yet)

- Event Discovery covers all 346 official Chilean comunas via a weekly
  rotating batch (`weekly_batch_size` comunas/run, oldest-`last_run_at`-
  first, cycling forever — **implemented 2026-07-17**), replacing the
  earlier "~100 hand-curated units, monthly cadence" plan before it
  shipped. Currently ramping up at 25/week, target steady-state 35/week
  (stays inside Tavily's free tier indefinitely) — see
  [region-discovery.md](region-discovery.md) for the batch sizing and cost
  breakdown.
- Search via Tavily (not Anthropic's `web_search`), curated by Claude
  Haiku 4.5 — no venue matching, every event has a freeform `location`.
  Includes a "fuentes brillantes" mechanism (known-rich sources fetched
  directly, auto-detected + manually grown) — see region-discovery.md.
- Claude Haiku 4.5 evaluates each candidate event against the five curation
  axes, picks the featured image, and runs the Axis 5 vision check (explicit
  aggression) plus `sensitivity_tags` tagging.
- Ambiguous cases → originally designed as an email with two buttons
  (include/don't include) via a Supabase Edge Function with a one-time-use
  token, landing ambiguous events as `pending_review` in the meantime.
  **Neither half is built**, and real production data (2026-07-18: 271
  total events, 163 approved, 106 rejected, 2 `pending_review` — those 2
  are stale rows from 2026-07-16, before the binary-only design, not live
  escalations) shows Haiku's binary approve/reject call isn't leaving
  anything genuinely stuck in the middle. **Likely not worth building** —
  keep as a parked idea, not an active line item, unless real ambiguous
  cases start showing up as the comuna rollout scales past its current
  ramp-up. See
  [region-discovery.md](region-discovery.md#no-email-approval-flow-yet-cost-driven-not-a-design-gap).
- Writes land in Supabase (Postgres).
- **Decided:** the calendar shows an exhibition for its full run (start to
  end), not just an opening night — opening nights remain the most
  highlighted moment when confirmed, but their absence is no longer a
  reason to exclude an otherwise-real, currently-running exhibition (see
  [overview.md](overview.md)). Retention: **~1 year** past an exhibition's
  end date (revised from an original 1-month-past-opening figure).
  **Implemented 2026-07-18**: a `prune_expired_events` SQL function
  (`supabase/migrations/20260718050000_add_prune_expired_events.sql`)
  deletes events where `coalesce(run_end_date, run_start_date,
  opening_datetime::date)` is more than a year old, called from
  `run.ts` on Event Discovery's existing weekly cadence — same posture as
  the `raw_search_results` pruning, no separate cron needed. **Revised
  2026-07-19**: approved events are now excluded from this pruning
  entirely (`supabase/migrations/20260719060000_prune_expired_events_excludes_approved.sql`)
  — the new "Expos anteriores" archive (below) needs every approved
  event's data to stay available indefinitely.
- **Shipped 2026-07-19**: "Expos anteriores" — a statically generated
  archive at `/expos-anteriores/[year]/[month]`, one page per past
  calendar month, grouping every approved event under its opening month
  (never repeated across months for multi-month runs). Built for SEO: the
  homepage is fully dynamic and the sitemap previously had only 3 URLs, so
  this is the site's first source of unique, indexable, growing content.
  Linked from the homepage next to "EXPOS ACTUALES". Includes a search box
  and a filter drawer (date range, lugar, comuna) scoped to the viewed
  month only.
- **Shipped**: Next.js frontend (`apps/web`) showing the calendar, deployed
  on Vercel (Hobby) at `caldearte.com`, with a región-grouped city picker,
  and family-mode content filtering (defaults ON for first-time visitors,
  toggle to see everything) for `sensitivity_tags` content. Also shipped as
  part of the production-launch pass: a real contact form (Resend), a
  `/privacidad` page, RLS tightened to column-restricted views
  (`events_public`/`regions_public`), and IP-geolocation-based default city
  detection (own comuna → same región → Santiago if outside Chile).
- Still open within Phase 1a — the punch list before pushing real
  distribution/marketing, decided 2026-07-28 after a UX audit of the live
  site plus a PO/BA read on promotion-readiness:
  - Running a real manual audit of the curation policy against the
    production data that's now accumulated (flagged in
    [risks.md](risks.md)).
  - UX fixes found auditing the live site: the value-prop tagline ("Calendario
    de arte curado por inteligencia humana potenciada por IA") only lives in
    the `<meta description>` and the footer — nothing states it above the
    fold; the mobile header drops the vigente date-range entirely (`Header.tsx`'s
    `headerSummaryMobile` vs. desktop's `headerSummary` — desktop shows "27 de
    JULIO al 2 de AGOSTO," mobile shows neither); the "Curatoria" menu item
    lands on a page whose title leads with "Privacidad" before "curatoría."
  - Retomar el newsletter (weekly digest, opt-in per comuna, double
    opt-in via Resend — full flow already designed in an earlier planning
    session, deliberately deferred 2026-07-21 until post-image-fix data
    quality was confirmed, which it now has been) — this is the core
    loop's first retention mechanism, worth shipping before or alongside
    any real promotion push, otherwise one-time traffic has no reason to
    come back on its own.

## Phase 1b — Inbound-mail flows

Two distinct flows, both needing Resend's *inbound* email (someone emails
*us* and our backend reacts), not just outbound sending like the
`/contacto` form already ships:

- **Flow 1 — automatic opening-date inquiry**: when Event Discovery finds
  an event with no confirmed date/time, auto-email the source (venue,
  gallery) asking them to confirm it, then parse their reply and update
  the row. Needs a unique token per outbound email so an inbound reply can
  be matched back to the right event, a webhook endpoint to receive
  Resend's "new email arrived" callback, and signature verification on
  that webhook (so a spoofed request can't get treated as a real reply).
- **Flow 2 — public submission mailbox**: a dedicated email address
  anyone can write to about an event we're missing, parsed and turned into
  a real `pending_review`-ish row automatically. **Partly superseded
  already**: the `/contacto` form shipped 2026-07-17/18 covers the same
  underlying need (a visitor telling us about something) with a much
  simpler outbound-only relay — no inbound parsing, no reply-correlation.
  Worth deciding whether Flow 2 specifically is still needed, or whether
  `/contacto` is "good enough" and only Flow 1 remains a real gap.
- Both were split from 1a specifically because of that inbound-email
  complexity (token correlation, webhook signature verification, `ngrok`
  to receive real webhook calls during local dev) — none of that was
  worth blocking the simpler core loop (scrape → curate → display) on.

## Phase 1c — Expanding beyond Chile (superseded design, see below)

- **Superseded:** originally planned as automatic global expansion via a
  precalculated population/distance ranking, growing a venue list in the
  background. There is no venue list anymore, and the
  ranking/automatic-expansion machinery isn't in active use — see
  [region-discovery.md](region-discovery.md#ranking--expansion-superseded-kept-for-historical-reference).
  Expanding beyond Chile's 346-comuna weekly-batch rollout is planned as a
  manual, deliberate step once that rollout is validated at full scale,
  not an automatic background process — no rebuilt design exists yet for
  what comes after Chile.
- **Copy convention for the next country's locale**: real bug (found
  2026-07-19) — `es-CL.ts` had several strings written in Rioplatense
  voseo instead of Chilean Spanish, an easy mistake since Spanish variants
  read as superficially similar. When a second country ships (es-AR,
  es-CO, ...), that locale file needs its own verified dialect/modismos,
  not a copy of `es-CL.ts`'s phrasing — see the header comment in
  [es-CL.ts](../apps/web/src/i18n/es-CL.ts) for the full note.

## Phase 2 — Community

**Renamed 2026-07-28** — this phase used to be "geo/temporal
personalization"; that content moved to Phase 5 (still low priority, no
real signal it's needed).

Caldearte today is a one-way calendar: we find events, curate them, show
them. The strategic bet is that the real differentiator isn't the
calendar itself (any aggregator can list dates) — it's becoming the place
where Chile's visual-art community leaves its own trace: what they went
to, what they thought, eventually what they'd buy. Positioning reference:
Letterboxd for film, Untappd for beer — the curated database is the entry
point, the community layer built on top is what people actually come
back for.

Five sub-phases, each a deliberate prerequisite for the next — none of
this gets built speculatively all at once; each stage needs real usage
signal before the next one is worth the investment, same "measure before
building infra" discipline the rest of this project has followed.

- **2.1 — Accounts + private "quiero ir" / "ya la vi" per exposición.**
  Needs real login, not just cookies (the existing city/family-mode
  preference cookies aren't enough for cross-session, potentially
  cross-device state). **Decided 2026-07-28**: Google OAuth via
  [Auth.js](https://authjs.dev), staged — Google-only first (fastest to
  ship, zero email-deliverability risk, no new inbound-email complexity:
  a magic-link alternative, if added later, is outbound-only, same
  "link to our own GET endpoint" pattern as the newsletter's double
  opt-in, NOT Phase 1b's inbound-parsing complexity). JWT session
  strategy (no separate sessions table) keeps the schema to just `users`
  + an `event_marks` table (`user_id`, `event_id`, `mark_type`: `quiero_ir`
  | `visitada`). "Quiero ir" is still fundamentally calendar logic — a
  personal to-do list; "ya la vi" is the one that starts being genuinely
  new, and gives the "Expos anteriores" archive a second, personal reason
  to exist beyond SEO.
- **2.2 — Public profile.** "Lo que Fulano ha visto" — tests the social/
  identity angle cheaply, before any moderation surface exists.
- **2.3 — Rating + short review per exposición.** First real
  user-generated content Caldearte has to moderate — scoped narrowly
  (text only, tied to an exposición we already curated) to keep the
  moderation surface small while this gets validated.
- **2.4 — Per-artwork detail, self-served by the venue/artist, not
  crowdsourced from visitors.** Two real problems ruled out visitor-
  submitted photos: (1) no source publishes structured per-artwork data
  (title/image/price/legend) for a temporary exhibition the way sources
  already do for the exhibition itself, so this can't be extracted
  top-down like Event Discovery does — it has to be entered by whoever
  actually has the rights to it; (2) a visitor's photo of someone else's
  artwork is a real copyright exposure, not just a moderation-quality
  question. Self-service by the venue/artist solves both: they own the
  rights, and they're the authoritative source for the real title/price/
  legend. **Only works once 2.1–2.3 have built a real audience** — a
  self-service upload tool with no eyeballs behind it has no reason for a
  gallery to bother. Needs a lightweight identity-verification step
  before a venue can claim/enrich "their" exposición (domain-based proof
  of control — same idea as Google Business Profile's verification, not
  the payment-based KYC below) — free for any venue that verifies,
  regardless of size, so a street intervention or a community space has
  the same access as an established museum. Verification/access to
  participate is never gated behind payment — that would recreate the
  same big-venue-vs-small-venue inequity the curation policy already
  deliberately avoids; only optional extras (visibility, analytics) get
  monetized, per 2.5.
- **2.5 — Commission on sales, only when a sale actually happens.**
  Nobody pays to list or participate — only a venue that sells something
  through Caldearte pays a percentage, same alignment-of-incentive logic
  as a real gallery's own commission model. Two shapes, deliberately
  starting with the cheaper one: **(a) referral model first** — Caldearte
  connects buyer↔venue ("quiero comprar esta obra"), the actual sale and
  payment happen off-platform, the venue self-reports and pays commission
  after the fact (weaker enforcement, but zero payment infrastructure to
  build — the right way to validate whether demand for this even exists).
  **(b) Full marketplace later, only if (a) validates demand** — Caldearte
  processes payment directly (Webpay/Mercado Pago), takes its cut,
  forwards the rest — real payment infrastructure, refund/dispute policy,
  likely needs real legal/accounting input before launch, a genuinely
  different category of build than anything else in this roadmap. A
  buyer's personal "adquisiciones" (collection) can ship as a lightweight
  self-declared mark (same mechanism as "quiero ir"/"ya la vi") well
  before any of this — an automatic, verified version only makes sense
  once real transactions actually flow through (b).

## Phase 3 — Image pipeline, hardening

- Download and re-host images in Supabase Storage (don't depend on external
  URLs that break). **Still worth doing, lower urgency than originally
  framed**: the ~1-year retention policy and "stop showing past-date
  events" behavior shrink the exposure window, but don't eliminate the
  underlying risk — a source image can still change or break while an
  exhibition is actively showing (weeks to months, not just a single day),
  and there's a separate reliability/security angle (hotlinking external
  URLs with no control over what they later serve) already flagged in
  [risks.md](risks.md), independent of how long we retain the row.
- General vision-based quality control on the chosen image before saving —
  beyond the Axis 5 explicit-aggression check (brought forward to Phase 1),
  this adds general validation that "this is actually the artwork/flyer, not
  a banner or logo."

## Phase 4 — Social distribution (Instagram / TikTok)

- Needs a new piece: flyer-style image generation (card with image + title +
  date + artist) per event.
- Instagram: Business/Creator account + Facebook Page + Meta developer app +
  `instagram_business_content_publish` permission via app review (2–4
  weeks).
- TikTok: Content Posting API, manual app review (2–6 weeks), posts stay
  private until passing audit, requires a demo video and privacy policy.
- Recommendation: submit for review only once the calendar already has real
  events running (better demo, better approval odds).

## Phase 5 — Parked / optional, doesn't block anything above

- **Geo/temporal personalization** (moved here 2026-07-28, formerly Phase
  2) — user city detection is already implemented and live (2026-07-17,
  manual + auto-detected comuna selection), which already covers most of
  the practical need this was meant to solve. PostGIS-based distance
  ranking on top would be a marginal refinement, not a missing essential
  — deprioritized until there's a real usage signal (e.g. users in a
  large región complaining events far within their own comuna's región
  feel undifferentiated). Geocoding mechanism also not yet designed: the
  original plan cached lat/lng once per venue on the (now-retired)
  `venues` table; with location as freeform text per event, there's no
  venue entity to cache coordinates against — needs a rethink if this is
  ever picked back up.
- **Monetization, generally** — no longer an empty line item: Phase 2.5
  (commission on venue-facilitated sales) is the concrete hypothesis
  already in motion, gated on Phase 2.1–2.4 building real community usage
  first. Anything beyond that stays unexplored until there's organic
  traction to build on.
