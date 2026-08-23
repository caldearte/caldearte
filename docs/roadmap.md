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
región-based location selector, family-mode content filtering (defaults ON
for first-time visitors), a real contact form, and standard SEO/analytics
basics. See [architecture.md](architecture.md) for the shipped location
selector and geo-detection design, and `apps/web/src/components/` for the
actual component tree.

**"Rediseño 2.0.0" (2026-08-03 through 2026-08-06, PRs #182–#208) fully
shipped and merged to `main`** — a visual and structural overhaul on top of the
July launch, not a separate phase: new event/exposición cards (bento +
list view toggle), a rebuilt 3-step location selector (Zona → Región →
Comuna — simplified further to a single región-only step 2026-08-12, see
architecture.md), a redesigned search panel, `/curatoria` and
`/privacidad` split into their own pages, a per-event page "modo lista"
(stays inside the visitor's current city+week list, with position/prev-
next nav), and — the first genuinely new capability, not just a visual
pass — **admin mode**: real Google sign-in (Auth.js) gating two actions
directly on the live site (soft-remove an event with a reason, correct a
sensitivity-tag miss in either direction), see architecture.md's "Admin
mode" section. This is deliberately narrower than Phase 2.1 below (admin-
only, no `users` table, not visitor-facing) but reuses the same Auth.js/
JWT foundation that phase will eventually build on.

**Fast Origin Transfer incident, 2026-08-06** (PRs #210-211, never
written down here until now — see architecture.md's "Home page: cached
default + client-side personalization" for the full design): a real
usage spike hit 94% of the Vercel Hobby free-tier limit because the home
page read `cookies()`/`headers()` at the top level, forcing every one of
84K requests to render fresh instead of being cached. Fixed by moving
personalization off the initial server render entirely — the cached page
now serves one safe default (Santiago, family mode on), and the client
fetches the visitor's real personalized view only when something might
actually differ from it. **Follow-up bug in that same pattern, found and
fixed 2026-08-08** (PR #223): the location-sharing consent banner
flashed on for every visitor, including ones who'd already answered it,
because the cached default couldn't tell the difference — now suppressed
in the default and resolved independently on the client.

**Small SEO/brand pass, 2026-08-07/08** (PRs #219-222, alongside the
newsletter work above): a Search Console coverage-report review found
zero structured data anywhere on the site — every `/eventos/[id]` page
now emits a `VisualArtsEvent` JSON-LD block (see architecture.md's "SEO:
structured data"). Same review also traced the report's "Not found
(404)" pages to admin-removed events whose permalinks had already been
indexed before removal (expected churn, not a bug — Google drops them on
its next recrawl) and its "Page with redirect" pages to the intentional
apex→www redirect (also expected, not a bug). The placeholder favicon
(a plain dark square, in place since before launch) was also replaced
with the real brand mark — magenta "C" on sage.

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
- **Shipped 2026-07-19, removed 2026-08-12**: "Expos anteriores" — a
  statically generated archive at `/expos-anteriores/[year]/[month]`, one
  page per past calendar month, grouping every approved event under its
  opening month (never repeated across months for multi-month runs).
  Built for SEO: the homepage is fully dynamic and the sitemap previously
  had only 3 URLs, so this was the site's first source of unique,
  indexable, growing content. Had already been dropped from the menu
  earlier; removed outright (route, components, orphaned helper
  functions) by explicit request, in the same pass as the región-selector
  change below — not a side effect of it.
- **Shipped**: Next.js frontend (`apps/web`) showing the calendar, deployed
  on Vercel (Hobby) at `caldearte.com`, with a región-based location
  selector (comuna-level selection removed 2026-08-12, see architecture.md),
  and family-mode content filtering (defaults ON for first-time visitors,
  toggle to see everything) for `sensitivity_tags` content. Also shipped as
  part of the production-launch pass: a real contact form (Resend), a
  `/privacidad` page, RLS tightened to column-restricted views
  (`events_public`/`regions_public`), and IP-geolocation-based default
  location detection (own comuna's región → Santiago if outside Chile).
- Punch list before pushing real distribution/marketing, decided
  2026-07-28 after a UX audit of the live site plus a PO/BA read on
  promotion-readiness — **all items now closed**:
  - **Done 2026-07-30**: ran a real manual audit of the curation policy
    against production data (95 approved events, 28 rejected candidates)
    — found and manually fixed one real cross-source consistency gap, see
    [risks.md](risks.md) item 4 for the full finding.
  - UX fixes found auditing the live site:
    - **Fixed 2026-07-30**: the value-prop tagline ("Calendario de arte
      curado por inteligencia humana potenciada por IA") now also renders
      in `CalendarView.tsx`, right below the Filtros row — it previously
      only lived in `<meta description>` and the footer, nothing stated it
      above the fold. Placed in what was mobile's largest stretch of
      unused whitespace (between Filtros and the first section heading),
      tightening that gap instead of adding a new one.
    - **Decided 2026-07-30, won't fix**: the mobile header still omits the
      week's date range (`Header.tsx`'s `headerSummaryMobile` vs.
      desktop's `headerSummary` — desktop shows "27 de JULIO al 2 de
      AGOSTO," mobile shows neither) — adding it would make the mobile
      header too tall; the current mobile layout reads well as-is.
    - **Fixed 2026-07-30**: split `/privacidad` into two dedicated pages —
      `/curatoria` (the value-prop/editorial-stance copy, `curatoriaText`)
      and a slimmed-down `/privacidad` (just data handling + contact). The
      menu's "Curatoría" item now points at `/curatoria` directly instead
      of a page whose title led with "Privacidad." `/privacidad`'s data
      section also now mentions the Filtros/geolocation cookies added
      since it was last written (previously only listed city + family
      mode). The operational detail in
      [curation-policy.md](curation-policy.md) (the axis-by-axis table)
      stays internal — the public page only carries the same
      already-approved value-prop paragraph it always did.
  - **Shipped 2026-07-30**: the newsletter (weekly digest, opt-in per
    macro-región, double opt-in via Resend) — `newsletter_subscribers`
    table, `/api/newsletter/subscribe` (apps/web, anon-key insert-only),
    two Supabase Edge Functions (`newsletter-confirm`,
    `newsletter-unsubscribe`, service-role, return JSON — Edge Functions
    can't serve HTML, see their own file comments), a new
    `apps/curator/src/newsletter/` module (`send-newsletter` script)
    sending per-subscriber sections (inauguraciones/expos para visitar/en
    otras regiones — see the 2026-08-08 revision below for how this
    settled; "expos nuevas esta semana" existed as a fourth section
    briefly, then was folded back in), omitting any that's empty, and its
    own weekly cron
    (`.github/workflows/weekly-newsletter.yml`, Sunday ~10:27 UTC as of the
    2026-08-23 Monday→Sunday shift below — originally Monday 08:00 UTC;
    minute moved off :00 later the same day, see the cron-congestion note
    further down).
    Deliberately does NOT depend on event-discovery.yml's discovery
    cadence changing — general comuna search stays monthly (an explicit,
    considered decision, see region-discovery.md) while bright-sources
    stays weekly; the digest just summarizes whatever's currently
    approved and running each week, which stays worthwhile thanks to
    multi-week exhibition runs plus the weekly bright-source trickle.
    **Revised same day**: subscription flow rebuilt around
    `NewsletterEntryModal.tsx` (ad-style hero, auto-opens once on first
    visit via `NEWSLETTER_PROMPT_COOKIE`, also reachable anytime via the
    Footer's "Suscríbete al boletín" link) instead of an always-visible
    inline Footer form; scope changed from comuna to macro-región
    (`admin_region_name`, migration
    `20260730190000_newsletter_subscribers_region_scope.sql`) since
    picking 1 of 16 regions is a lighter ask than 1 of 346 comunas;
    `NewsletterStatusModal`'s "confirmed" case reuses the same hero for a
    celebratory first-activation state; added an explicit
    "already_subscribed" outcome (own copy, not folded into generic
    success) since the anon key can't otherwise distinguish a duplicate
    signup from a new one. PRs held for manual review (touches
    `supabase/migrations/` and `.github/workflows/`).
    **Refined 2026-07-31, after reviewing real sends** (PRs #163-172):
    event links now go to caldearte.com's own event page (not the
    original source), grouped by comuna, redesigned as horizontal cards
    matching the site's own card style; added a grounded, per-región
    AI-generated intro (Haiku, cached once per región per send, degrades
    to no intro on any budget/API failure — see
    [curation-policy.md](curation-policy.md)'s fabrication-risk posture,
    same discipline applied here); fixed two real fabrication/consistency
    bugs found in production output (a false "opens this week" claim, and
    two disagreeing exhibition-count figures in the same email — root-
    caused to an ungrounded flat event list and a capped-vs-total count
    mismatch, both fixed deterministically, not by prompt-tuning alone);
    "Expos para visitar" capped at 10 with a "ver todas" link when a
    región has more; explicit empty-state copy instead of silently
    omitting a section; friendlier "5 de agosto" date format instead of
    ISO; unique subject line per week (prevents Gmail conversation-
    threading); and several modal UX fixes (clearer double-opt-in copy,
    lighter mobile backdrop, branded header) from real subscriber
    feedback.
    **"Rediseño 2.0.0" pass on the email itself, 2026-08-07/08** (PRs
    #212-219, `apps/curator/src/lib/notify.ts`/`newsletter/`): the old
    white-on-black template was rebuilt to match the real site's brand
    (magenta wordmark in Lato Black, sage background, white list-style
    event cards mirroring `EventHorizontalListItem`'s real markup, a big header
    with the week range and the subscriber's own región name, responsive
    stacking under ~400px). "Expos nuevas esta semana" removed as its own
    section — a `run_start_date`-this-week event now gets the same
    treatment as any other non-opening event, since an inauguración
    already IS how a new exhibition starts; a separate "nuevas" bucket
    read as confusing, not clarifying. "Expos para visitar" now
    diversifies across comunas when capping at 10 (round-robin, not a
    flat soonest-closing cut, so one comuna's closing-soon cluster can't
    crowd out the rest of the región). "En otras regiones" cap raised
    5 → 10, and its own AI intro went from 1 to 2 paragraphs. The main
    AI intro's voice moved from "editorial redactor" to "art researcher
    talking to a friend" (still grounded to titles/venue/comuna only,
    same anti-fabrication posture) — real-Haiku testing during this pass
    caught two fresh fabrication-adjacent bugs the tone rewrite
    introduced (a made-up región name for an event with no comuna in the
    data, and literal markdown asterisks leaking into the plain-text
    email) and a refusal-on-a-single-item edge case, all fixed with
    explicit prompt rules before shipping. Separately, a real production
    bug was found and fixed: `run()`'s own events query was missing the
    `removed_at` filter that `events_public` (what the site itself reads)
    already applies, so an event manually removed via the admin "Quitar"
    action kept appearing in the newsletter with a permalink that 404s on
    the live site.

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
  **Partially shipped, 2026-08-05, but not this phase**: the Auth.js/JWT
  foundation described above now exists in production (as "admin mode,"
  see the redesign summary above and architecture.md) — but scoped to a
  single hardcoded `ADMIN_EMAIL`, no `users`/`event_marks` tables, and no
  visitor-facing sign-in surface (`/login` is unlinked from the site).
  This phase is still fully unbuilt: general visitor accounts, the
  `users`/`event_marks` schema, and "quiero ir"/"ya la vi" themselves
  remain open work, just with less infrastructure risk than before since
  the session/auth plumbing is already proven in production.
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

- **Weekly security audit — shipped 2026-08-23.** Every Tuesday
  (`.github/workflows/security-audit.yml`), a deterministic/regex-based
  scan of every tracked file for credential-shaped secrets and
  unexpected PII (email/phone, against an allowlist of the repo's own
  known-accepted addresses), plus `pnpm audit` for dependency
  vulnerabilities and a best-effort check of whether GitHub's own
  native secret-scanning/Dependabot alerts are enabled (they aren't
  something this script can turn on itself — that's a repo Settings >
  Code security toggle). Always emails a summary
  (`apps/curator/src/security-audit/run.ts`), even when clean, so a
  missing email is itself a signal something broke. No Anthropic cost —
  regex over an LLM pass, since secrets/PII have a recognizable shape.
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

## Phase 4 — Social distribution (Instagram shipped 2026-08-23; TikTok not started)

- Needs a new piece: flyer-style image generation (card with image + title +
  date + artist) per event.
- Instagram: Business/Creator account + Facebook Page + Meta developer app +
  `instagram_business_content_publish` permission via app review (2–4
  weeks).
- TikTok: Content Posting API, manual app review (2–6 weeks), posts stay
  private until passing audit, requires a demo video and privacy policy.
- Recommendation: submit for review only once the calendar already has real
  events running (better demo, better approval odds).
- **Automated national Feed cadence, 3 content types — idea captured
  2026-08-16, design finalized 2026-08-22** (Daniel's own idea; Camila,
  who handles difusión separately, independently asked the same day
  whether something automatic could be posted). A daily "hoy" post was
  considered and rejected: useful in the moment, but gives no way to
  plan ahead. A single mixed national carousel was also considered and
  rejected: Santiago alone can have dozens of vigente expos, too much for
  one legible carousel. Final design:
  - **Fully automated content is Feed-only, national, thematic — never
    split per región.** Splitting by región was considered and rejected:
    Instagram penalizes posting frequently to the same audience in a
    short window (each new post competes with the previous one's reach
    instead of adding to it — self-cannibalization), so 16 región-specific
    posts/week would very likely reduce total reach below what a handful
    of national posts gets, on top of follower fatigue. Regional depth
    instead goes through **Camila's own manual track** (see below), which
    doesn't compete for the same reach budget.
  - **Three content types, each with its own ordering and repeat rule:**
    - **(A) Inauguraciones** — ordered by **fecha de apertura**,
      ascending (lunes primero). **Repeats across the week deliberately**
      — this is the one type meant to work as a recurring reminder/push,
      not a one-time announcement.
    - **(B) "No te la pierdas"** — expos closing soonest, ordered by
      **fecha de fin**, ascending. **Never repeats an expo within the
      same week** — each appearance during the week must be a different
      closing-soon expo than any shown earlier that week.
    - **(C) Selección/destacadas** — not date-ordered; a quality-curated
      rotation (photo quality, description completeness, how long since
      it last appeared in a post). **Never repeats an expo within the
      same week**, same rule as (B).
    - All three capped at **10 cards per carousel** (Instagram's own
      platform max), with **región diversity enforced within the cap** —
      reusing the same diversity logic already built for the newsletter,
      so Santiago doesn't fill all 10 slots on its own.
    - Every carousel ends on a **fixed static closing slide** ("selección
      parcial, todo en Caldearte" + the link) — generated once as a
      reusable asset, not rendered per post.
  - **Weekly cadence — 6 automated posts/week:**
    - **Sunday** — all three types posted (A + B + C), timed to land the
      day before the week it covers starts (see discovery-cadence change
      below). **Spaced across the day, not back-to-back** — real bug,
      found 2026-08-23: the original single Sunday cron posted all 3
      within the same script run (~1-2 minutes apart), undermining the
      whole point of "no more than 1-2 Feed posts/day" below. Fixed via 3
      separate Sunday crons in `publish-social.yml` (~08:05/11:05/14:05
      Chile time), each forcing exactly one type.
    - **Monday** — (A) only.
    - **Wednesday** — (B) only.
    - **Friday** — (C) only.
    - Kept well under generic Instagram guidance of "no more than 1-2
      Feed posts/day, ~3-5/week for consistency without fatigue" on any
      single day (never more than the Sunday triple), while still
      landing above that weekly ceiling in total — a deliberate tradeoff
      given Caldearte's actual national content volume, revisit if real
      engagement data says otherwise once it's live.
    - **Implementation**: (A) needs no de-dup query — its "repeats are
      fine" rule means the same ascending-by-opening-date query can run
      on both Sunday and Monday with no extra state. (B) and (C) need a
      small log table (event/expo IDs already posted this week, per
      type) so their queries can exclude what's already appeared —
      the one real piece of new state this design needs beyond a plain
      SELECT.
  - **Discovery cadence moved Monday → Sunday, shipped 2026-08-23**
    (event-discovery bright-sources/headless/Instagram/Google-Alerts
    crons + the weekly newsletter, keeping their existing relative
    stagger, all shifted one day earlier) — so a week's events are
    discovered and curated the day *before* that week starts, giving the
    newsletter and the Sunday IG drop a real one-day lead time instead of
    announcing Monday's inauguraciones the same day they happen. Same PR
    also fixed two real bugs found while doing this:
    - `weekBoundsInSantiago` (duplicated in both `newsletter/run.ts` and
      `social-publish/run.ts`) computed "this week" as ending TODAY on a
      Sunday (matching apps/web's own general-purpose week concept,
      correct for site display) — but both of these callers actually
      need "the week starting tomorrow" on a Sunday specifically, since
      that's the week they're announcing. Left uncaught, this would have
      made Sunday's `no_te_la_pierdas` carousel almost always empty
      (`runEndDate` had to fall on the exact send day to pass the old
      `<= week.end` filter) and Sunday's newsletter/inauguraciones would
      have described the week that just ended instead of the one about
      to start. apps/web's own `weekBoundsInSantiago` is untouched —
      correct as-is for its actual use (site-wide "current week" concept).
    - `weekly-newsletter.yml`'s cron had silently drifted out of order:
      set to "1h after headless" (07:00→08:00 UTC) back when headless was
      the last step in the chain, but `instagram-bright-sources.yml`
      (added 2026-08-12) and `google-alerts-bright-source.yml` (added
      2026-08-14) were scheduled after it without ever moving the
      newsletter later — for about 11 days, the newsletter ran AT THE
      SAME TIME as instagram-bright-sources instead of after the full
      chain. Now 1h after google-alerts (~10:27 UTC), the actual last step.
  - **Camila's manual track — decoupled, not built for.** Camila's own
    content (in-depth coverage of one specific expo/inauguración, in-situ
    coverage of an opening night, a Caldearte-the-website feature, etc.)
    is explicitly the kind of depth automation can't produce, and stays
    fully outside this pipeline — she posts it on her own schedule, in
    whatever format she chooses. The one place automation still helps
    her: **regional Stories**. Story Highlights have **no creation API at
    all** (only unofficial scrapers exist for *reading* other accounts'
    highlights, none for creating one or adding a story to it — always a
    manual, in-app drag-into-collection action), and **Story link
    stickers can't be attached via the API either** (the API can publish
    the story image, but the clickable link sticker has to be added by
    hand afterward). So the automated pipeline can still render
    per-región branded images on a schedule and hand Camila a ready-made
    set — she posts/links/organizes them into Stories and Highlights by
    región at her own pace, which sidesteps the Feed reach-cannibalization
    problem entirely (Stories don't compete for Feed reach the same way),
    without needing any of this to be scoped or built as part of the
    automated Feed pipeline itself.
  - **Feed carousel posts publish 100% via the Graph API with no manual
    step** — confirmed working: `@caldearte.oficial` is now a Business
    account linked to the (pre-existing, since-2018) Caldearte Facebook
    Page; the Meta developer app "Caldearte" is created with the
    Instagram API use case, `instagram_business_content_publish` added
    and in "Listo para la prueba" status, @caldearte.oficial added as an
    Instagram tester (invitation accepted), and an access token +
    Instagram Business Account ID generated — all via Standard/tester
    access, deliberately **not** submitted for the full Meta App Review
    (not needed since the app only ever publishes to accounts it already
    administers; submitting for review is now explicitly out of scope
    unless that changes).
  - **All shipped 2026-08-23**: the flyer-image renderer
    (`apps/web/src/lib/social/flyer.tsx` + `/api/social/flyer`, Satori/
    next-og, real vector logo, 3 Figma-matched layouts), the (B)/(C)
    de-dup log table (`social_post_log`), the cron script itself
    (`apps/curator/src/social-publish/`), and the discovery-cadence day
    shift (above). Real posts published and verified end-to-end on all 3
    carousel types against `@caldearte.oficial`. Real bugs found and
    fixed along the way, beyond the two cadence bugs noted above:
    - Instagram's Graph API needs `graph.instagram.com`, not
      `graph.facebook.com`, for tokens issued via the "Instagram API with
      Instagram Login" flow — the wrong host gives a generic, misleading
      "Cannot parse access token" error.
    - A carousel container isn't necessarily ready to publish the instant
      it's created — Instagram processes each item asynchronously, and a
      bigger carousel (10 images) can outrun a naive create-then-publish
      sequence ("Media ID is not available"). Fixed by polling the
      container's own `status_code` until `FINISHED` before publishing.
    - Two distinct WebP-decoding failures: a genuinely-stored `.webp`
      file (Satori/next-og can't determine its size at all) and a CDN
      (Squarespace) auto-negotiating WebP for a URL that ends in `.jpg`
      whenever the request's `Accept` header is permissive — fixed by
      excluding `.webp`-named sources from eligibility and by having the
      flyer route fetch each photo itself with an explicit
      `Accept: image/jpeg,image/png,image/gif` instead of leaving Satori
      to fetch it (and negotiate format) on its own.
    - Instagram-sourced event titles were very often the caption's first
      *sentence* (an invitation), not the exhibition's actual name, which
      is almost always quoted somewhere in the same caption instead —
      fixed by preferring quoted text when present.
    - `diversifyByComuna`'s plain round-robin was technically fair but
      still read as mostly-Santiago once every other comuna's shorter
      supply ran out and every remaining slot backfilled from the one
      comuna with the most candidates — fixed with an optional
      `maxPerComuna` cap (2, for `no_te_la_pierdas`/`destacada` only),
      trading a shorter carousel for real diversity.
    - Comuna-search (Tavily) monthly batch paused the same day, unrelated
      to social distribution but found while auditing this pipeline's
      real output — see region-discovery.md's own note.
    - A carousel item occasionally fails with "Media download has
      failed" (code 9004) on an image URL that had published fine a
      minute earlier in the very same run — Instagram fetches
      `image_url` itself, and that fetch is transiently flaky on their
      end, not a real problem with the image. Fixed by retrying just
      this error code up to 3 times (5s apart) inside
      `createCarouselItem`; other error codes (bad token, malformed
      params) still fail immediately, without retry.

## Phase 5 — Parked / optional, doesn't block anything above

- **Geo/temporal personalization** (moved here 2026-07-28, formerly Phase
  2) — user location detection is already implemented and live
  (2026-07-17, manual + auto-detected selection; comuna-level selection
  replaced by región-level 2026-08-12, see architecture.md — the exact
  "events far within their own comuna's región feel undifferentiated"
  complaint this item used to flag as a future trigger is what actually
  prompted that change, not a hypothetical anymore), which already covers
  most of the practical need this was meant to solve. PostGIS-based
  distance ranking on top of a selected región would be a further, finer-
  grained refinement, not a missing essential — still deprioritized until
  there's a real usage signal asking for it. Geocoding mechanism also not
  yet designed: the original plan cached lat/lng once per venue on the (now-retired)
  `venues` table; with location as freeform text per event, there's no
  venue entity to cache coordinates against — needs a rethink if this is
  ever picked back up.
- **Monetization, generally** — no longer an empty line item: Phase 2.5
  (commission on venue-facilitated sales) is the concrete hypothesis
  already in motion, gated on Phase 2.1–2.4 building real community usage
  first. Anything beyond that stays unexplored until there's organic
  traction to build on.
- **Data-analysis/dashboard on retained event data** — user's own idea
  (2026-07-18): the ~1-year retention policy means a year of curated event
  data keeps accumulating with no current use beyond the live calendar.
  Idea: a data-analysis section (charts/stats) surfacing something
  valuable from that history — which comunas/venues are most active,
  seasonal patterns, curation approve/reject rates, etc. Explicitly not
  decided or scoped — "habría que analizarlo" — needs its own analysis
  pass (what's actually valuable to show, to whom, at what cost) before it
  becomes a real roadmap phase.
