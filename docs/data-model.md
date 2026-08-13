# Caldearte — Data Model

This reflects the schema as actually deployed to production
(`supabase/migrations/`), not just the original draft — keep it in sync when
migrations change.

## Tables

```
regions (one row per COMUNA despite the table name — 346 Chile rows as of
    2026-07-17, see region-discovery.md for the weekly-batch rollout that
    actually drives search cadence today)
  id, name, country, language, lat, lng, population,
  admin_region_name, admin_region_order, admin_region_numeral (Chilean
    administrative macro-region — e.g. "Región Metropolitana de Santiago"
    — its geographic north-to-south rank (RM at position 7, between V
    Valparaíso and VI O'Higgins — real geography, not the roman-numeral
    order), and its official non-geographic numbering ("RM", "V", "XV"...).
    All three nullable so a future country's comunas can be seeded before
    this data exists for them. Backfilled for all 346 Chile rows in
    20260717030000_add_admin_region_to_regions.sql and
    20260717040000_fix_admin_region_order_add_numeral.sql. Used by the
    frontend to derive the flat 16-región selector list
    (apps/web/src/lib/cities.ts's allAdminRegions) — see architecture.md's
    "User location detection" section for the 2026-08-12 comuna->región
    selection-unit change; groupCitiesByRegion (país -> región -> comuna)
    still exists too, used internally by the picker to sum a región's own
    comunas' event counts),
  expansion_rank (position in the precalculated global population/distance
    ranking — see region-discovery.md for the log-compressed formula; not
    read by the weekly-batch rollout, kept as historical/observational),
  status (not_started | active | saturated | excluded),
  exclusion_reason (nullable; e.g. "OFAC sanctions" for North Korea),
  search_frequency (weekly | monthly),
  consecutive_zero_yield_runs (int, drives the adaptive-cadence logic),
  last_run_at, created_at

events
  id, freeform_location (text, required — the only location concept; there
    is no venue entity),
  title, description, artist,
  run_start_date, run_end_date (the exhibition's actual run, shown for its
    full duration — see overview.md's "full exhibition run" policy; both
    nullable),
  opening_datetime (date, only when a source explicitly confirms a real
    opening night — null otherwise; hour may or may not be real, see
    opening_time_confirmed),
  opening_time_confirmed (boolean, default true) — added 2026-07-20. A
    source can confirm an inauguración DATE without confirming a specific
    HOUR (e.g. arteinformado.com's "Sín-tesis" — "Inauguración: 14 jul de
    2026", no time at all). When false, opening_datetime still holds a
    real instant (midnight America/Santiago, via
    apps/curator/src/lib/opening-time.ts's santiagoWallTimeToUtcIso) but
    it's a placeholder, never a real hour — apps/web's EventCardBase reads
    this flag to show "consulta la hora con el lugar" instead of a
    fabricated hour. Default true preserves the pre-existing invariant for
    every row already in the table (Haiku's own prompt already requires an
    explicit hour before it ever sets opening_datetime at all); only the
    deterministic post-curation regex enrichment can ever set this false,
  opening_date_confidence (alta | baja) — legacy column from before
    run_start_date/run_end_date existed; Event Discovery doesn't set it,
  medium_type (tradicional | intervencion_no_tradicional),
  sensitivity_tags (array: desnudo_erotismo | guerra_violencia |
    memoria_dictadura),
  source (scraped | submitted | discovered — "discovered" is Event
    Discovery's search-based pass; "scraped"/"submitted" are for pipelines
    that don't exist yet in production),
  image_storage_path (reserved for a re-hosted copy, Phase 3 — not written
    yet), image_url (the raw external image URL, so it isn't silently
    dropped in the meantime), source_url,
  curation_status (approved | rejected | pending_review — Event Discovery
    itself only ever writes approved/rejected, see curation-policy.md),
  curation_reasoning (internal, technical, for the curators),
  public_explanation (nullable; only set on automatic rejection of a
    "submitted" event, goes in the reply email),
  removed_at, removed_reason (both nullable, added 2026-08-05) — manual
    admin soft-delete, deliberately separate from curation_status (which
    is pipeline-owned). Set by an admin clicking "Quitar" then picking a
    reason from a submenu (apps/web/src/components/AdminRemoveReasonMenu.tsx,
    gated behind Auth.js + ADMIN_EMAIL, see apps/web/src/lib/auth.ts and
    architecture.md's "Admin mode" section) — never written by Event
    Discovery. removed_reason is a stable short code (convocatoria |
    teatro_tocata | lanzamiento_libro | no_vigente | otro, see
    apps/web/src/i18n/es-CL.ts's cardMenuRemoveReasons), kept for future
    pattern analysis (e.g. if "convocatoria" removals pile up, that's a
    signal Event Discovery should filter that category at the source).
    events_public excludes any row with removed_at set, same as it
    excludes non-approved curation_status.
  admin_sensitive_marked_at (nullable, added 2026-08-06) — manual admin
    correction for sensitivity_tags, deliberately a SEPARATE column
    rather than a write into sensitivity_tags itself (which stays
    exclusively Haiku's own output). Toggled by the same admin menu
    (apps/web/src/components/AdminSensitiveMenuItem.tsx) for either
    direction of the mistake: Haiku missed something sensitive, or
    flagged something that isn't. events_public folds a synthetic
    'marcado_admin' string into its computed sensitivity_tags output
    when this is set (see that view's own entry below) — every existing
    frontend consumer of sensitivity_tags (CardImage's blur,
    filterFamilyMode) already just checks array length/membership, so
    this needed zero frontend prop/type changes to take effect.
  created_at
  -- Auto-deleted ~1 year past run_end_date (or run_start_date/
  -- opening_datetime as fallbacks) — see overview.md's "full exhibition
  -- run" policy. Implemented via the prune_expired_events SQL function,
  -- called from Event Discovery's own weekly run, not a separate cron.
  -- Revised 2026-07-19 (supabase/migrations/20260719060000_prune_expired_events_excludes_approved.sql):
  -- only applies to rejected/pending_review rows now — approved events
  -- are never pruned. Originally justified by the "Expos anteriores"
  -- static archive needing every approved event to stay available
  -- indefinitely for SEO; that archive was removed 2026-08-12 (dropped
  -- from the menu earlier, route+code deleted outright in the same pass
  -- as the región-selector change), but the exclusion itself stayed —
  -- there's no reason to start pruning approved history again just
  -- because the one feature that originally justified it is gone.

system_config
  key (primary key), value, updated_at
  -- editable directly, no redeploy needed. Seeded:
  --   monthly_budget_usd = '10'
  --   max_total_regions = '200' (unread by the weekly-batch rollout, kept
  --     as historical/observational, see region-discovery.md)
  --   weekly_batch_size = '25' (added 2026-07-17; caps each Event
  --     Discovery run to this many comunas, oldest-last_run_at-first — see
  --     region-discovery.md for the ramp-up-to-35 plan)

api_usage_log
  id, created_at,
  purpose (event_discovery),
  model, region_id (fk, nullable),
  input_tokens, output_tokens, cache_creation_input_tokens,
  cache_read_input_tokens, web_search_requests, estimated_cost_usd
  -- self-tracked spend ledger, see region-discovery.md#cost-governance.
  -- web_search_requests was added after the first real run: web search is
  -- billed separately from tokens ($10/1,000 searches) and wasn't tracked
  -- at all before, so isOverBudget() was blind to roughly half of real spend.

events_public, regions_public (views, not tables — created in
    20260717050000_restrict_public_columns_via_views.sql)
  events_public: id, title, artist, description, freeform_location,
    place_name, region_id, image_url, opening_datetime, run_start_date,
    run_end_date, sensitivity_tags, source_url, opening_time_confirmed
    (added 20260720070000) — a subset of events' columns, `where
    curation_status = 'approved' and removed_at is null` baked directly
    into the view definition (the removed_at exclusion added
    20260805070000, alongside the removed_at/removed_reason columns
    themselves). sensitivity_tags here is a CASE expression, not a direct
    column passthrough (added 20260806070000): when
    admin_sensitive_marked_at is set, it's the real column's array with a
    synthetic 'marcado_admin' string appended; otherwise the real column
    unchanged. admin_sensitive_marked_at itself is NOT exposed as its own
    column — the frontend's admin toggle button reads current state from
    that same synthetic tag. (The events table's own CHECK constraint on
    sensitivity_tags only binds writes into that physical column, not this
    view's computed SELECT expression, so the synthetic tag never risks
    violating it.) Excludes curation_reasoning, image_storage_path,
    curation_status, public_explanation, created_at, medium_type,
    opening_date_confidence, source, removed_at, removed_reason,
    admin_sensitive_marked_at.
  regions_public: id, name, country, lat, lng, population,
    admin_region_name, admin_region_order, admin_region_numeral — excludes
    every pipeline-internal column (status, exclusion_reason,
    search_frequency, consecutive_zero_yield_runs, last_run_at,
    expansion_rank, language, created_at).
  -- Why: anon (the public, browser-shipped key) used to have SELECT on
  -- every column of the base events/regions tables — including internal
  -- pipeline bookkeeping never meant to be public, queryable directly via
  -- the Supabase REST API regardless of what the frontend itself chose to
  -- render. anon/authenticated's SELECT grant on the base tables was
  -- revoked entirely; these views (owned by a role that still has table
  -- access, so RLS/grants on the base tables don't block the view itself)
  -- are the only way anon reads events/regions data now. The curator
  -- (service_role) is unaffected — it queries the base tables directly,
  -- bypassing RLS/grants as always.
  -- apps/web/src/lib/events.ts's fetchApprovedEvents queries these views,
  -- not the base tables.

curation_policy (versioned in the repo, not in the DB)

rejected_candidates (added 20260728010000_add_rejected_candidates.sql —
    see region-discovery.md's "Pre-curation dedup for bright sources"
    section for the full rationale)
  id, created_at, source_url (unique), title, reason,
  location, region_id (fk, nullable), anchor_date (nullable — added
    20260730150000_add_curation_escalations.sql specifically so a
    rejected candidate can be matched against a later approved event
    describing the same real thing, or vice versa; kept nullable/
    best-effort, same defensive posture as the rest of this table, see
    its own migration comment on the 2026-07-22 null-location crash)
  -- Rolling ~90-day window, pruned on Event Discovery's own cadence.

newsletter_subscribers (added 20260730180000_add_newsletter_subscribers.sql
    — weekly digest, double opt-in, see docs/roadmap.md's Phase 1a
    newsletter item)
  id, email (unique), admin_region_name (text, NOT a fk — the subscriber's
    chosen macro-región, e.g. "Región Metropolitana de Santiago", matching
    regions.admin_region_name; not necessarily their geolocated one.
    Originally comuna-scoped via a city_id fk to regions(id), changed to
    región-scoped in 20260730190000_newsletter_subscribers_region_scope.sql
    — picking 1 of 16 macro-regions in the entry modal is a lighter ask
    than 1 of 346 comunas, and macro-regions aren't a separate table, just
    this text column already on every regions row, so no new table was
    needed),
  confirm_token (unique, opaque — doubles as the unsubscribe token too,
    one value per subscriber is enough),
  confirmed_at (nullable; null = still pending double opt-in),
  unsubscribed_at (nullable; null = active), created_at
  -- RLS: service_role has full access (the curator's weekly-send module,
  -- and the confirm/unsubscribe Edge Functions). anon has INSERT only —
  -- apps/web/src/app/api/newsletter/subscribe writes the pending row with
  -- the anon key (never service_role, see
  -- apps/web/src/lib/supabase-client.ts's assertAnonRole guard); no
  -- SELECT/UPDATE/DELETE grant at all, so confirming/unsubscribing go
  -- through the Edge Functions (service-role) instead, reached via the
  -- token in the confirmation/every-digest-email link — never through
  -- this table's RLS directly.

curation_escalations (added 20260730150000_add_curation_escalations.sql
    — see region-discovery.md's "Cross-source curation conflict
    escalation" section)
  id, created_at, resolved_at (nullable), resolution (accepted | rejected,
    nullable until resolved),
  existing_kind (approved_event | rejected_candidate),
  existing_event_id, existing_rejected_id (fk, nullable — exactly one set,
    matching existing_kind),
  existing_title, existing_source_url, existing_reasoning (snapshotted as
    plain text — the email/decision shouldn't depend on the referenced
    row surviving unchanged),
  new_title, new_source_url, new_status (approved | rejected),
  new_reasoning, new_candidate_payload (jsonb — the new candidate's full
    insertable field set, used only if accepted and new_status is
    approved),
  accept_token, reject_token (unique, opaque random values — not signed,
    looked up by exact match; each single-use, see the Edge Function that
    resolves them)
  -- One row per detected cross-source conflict, held until a human picks
  -- a side via the email's Accept/Reject links.
```

Field types and constraints (exact `CHECK`s, defaults, nullability) live in
the migration files themselves — this document describes intent and
relationships, not a 1:1 mirror of the SQL.

## Row-level security

All four base tables have RLS enabled.

- `events`: RLS policy exposes rows where `curation_status = 'approved'` —
  pending/rejected events are never visible publicly. As of 2026-07-17,
  `anon`/`authenticated` no longer have a direct `SELECT` grant on this
  table at all — public reads go exclusively through `events_public`
  (above), which re-implements the same row filter in its own `WHERE`
  clause and additionally restricts which columns are exposed.
- `regions`: same story — `anon`/`authenticated` had a full-table
  `SELECT` grant (`using (true)`) until 2026-07-17, now revoked; public
  reads go through `regions_public`.
- `system_config`, `api_usage_log`: no public policy at all, never did —
  internal bookkeeping, accessible only to `service_role`.

All four tables also `GRANT ALL ... TO service_role` explicitly. This was a
real bug found while building the curator: PostgREST's `service_role`
Postgres role gets **no implicit access** — it needs the same explicit
`GRANT`s as any other role. The original schema migration only granted
`anon`/`authenticated` `SELECT` on `venues`/`events` (both existed at the
time) and nothing to `service_role` at all, which would have silently
blocked every read/write the moment real code tried to use `supabase-js`.
Fixed in the cost-governance migration for all tables that existed then.

## Secrets / credentials

| Secret | Lives in | Note |
|---|---|---|
| `ANTHROPIC_API_KEY` | GitHub Actions secret | never in code, never in the frontend |
| `SUPABASE_SERVICE_ROLE_KEY` | GitHub Actions secret | only the curator uses it; never expose to the browser |
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Vercel project env var | the only keys that go to the frontend; browser-safe by design (anon key, RLS-gated) |
| `SUPABASE_ACCESS_TOKEN` | GitHub Actions secret | already in use — authenticates the Supabase CLI in `deploy-migrations.yml` |
| `SUPABASE_DB_PASSWORD` | GitHub Actions secret | already in use — lets `deploy-migrations.yml` run `supabase db push` against production |
| `RESEND_API_KEY` | Vercel project env var (server-only, never `NEXT_PUBLIC_*`) AND GitHub Actions secret | in use since 2026-07-17 for `apps/web/src/app/api/contact/route.ts`'s outbound-only contact-form relay; also in use since 2026-07-30 for `apps/curator`'s run-summary and cross-source-conflict-escalation emails (`lib/notify.ts`), sending from `contacto@caldearte.com` in both cases; also used by the newsletter's confirmation email (`apps/web/src/app/api/newsletter/subscribe/route.ts`) and weekly digest (`apps/curator/src/lib/notify.ts`'s `sendDigestEmail`). |
| ~~`APPROVAL_TOKEN_SECRET`~~ | not needed | originally planned to sign the one-time links behind email approval buttons — the cross-source conflict escalation feature that shipped 2026-07-30 (see region-discovery.md) uses opaque random tokens stored in `curation_escalations` and looked up by exact value instead, same trust model as everything else behind `service_role`-only RLS in this schema. No signing needed. |
| `RESEND_WEBHOOK_SECRET` | Supabase Edge Function secret | verifies inbound-email webhooks (date inquiry, public mailbox) really come from Resend — still Phase 1b, not built |
| `AUTH_SECRET` | Vercel project env var (server-only) AND `apps/web/.env.local` | Auth.js v5's session-encryption secret, generated once via `openssl rand -base64 32`; see architecture.md's "Admin mode" section |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | Vercel project env var (server-only) AND `apps/web/.env.local` | Google OAuth 2.0 client credentials (Google Cloud Console, Testing-mode consent screen, single test user) — the only sign-in provider `/login` offers |
| `ADMIN_EMAIL` | Vercel project env var (server-only) AND `apps/web/.env.local` | the one email compared against a signed-in session to compute `isAdmin` (`apps/web/src/lib/auth.ts`) — never shipped to the client, only the resulting boolean claim is |
| `ADMIN_ACTIONS_SECRET` | Vercel project env var (server-only) AND `apps/web/.env.local`, ALSO a Supabase Edge Function secret (must match) | shared secret between apps/web's admin API routes (`/api/admin/remove-event`, `/api/admin/toggle-sensitive`) and their corresponding Edge Functions — see architecture.md's "Admin mode" section for the full trust chain |
| `META_APP_ID` / `META_APP_SECRET` | Phase 4, GitHub Actions secret | not needed until Phase 4 |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | Phase 4, GitHub Actions secret | not needed until Phase 4 |

Security note already discussed: in public repos, Actions secrets are not
exposed to workflows triggered by fork PRs (unless `pull_request_target` is
used — avoid it).
