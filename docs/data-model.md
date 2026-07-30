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
    frontend city picker to group comunas as país -> región -> comuna —
    see apps/web/src/lib/cities.ts's groupCitiesByRegion),
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
  created_at
  -- Auto-deleted ~1 year past run_end_date (or run_start_date/
  -- opening_datetime as fallbacks) — see overview.md's "full exhibition
  -- run" policy. Implemented via the prune_expired_events SQL function,
  -- called from Event Discovery's own weekly run, not a separate cron.
  -- Revised 2026-07-19 (supabase/migrations/20260719060000_prune_expired_events_excludes_approved.sql):
  -- only applies to rejected/pending_review rows now — approved events
  -- are never pruned, since every approved event eventually lands on a
  -- statically generated "Expos anteriores" archive page
  -- (apps/web/src/app/expos-anteriores/[year]/[month]) that must stay
  -- accurate indefinitely for SEO.

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
    run_end_date, sensitivity_tags, source_url — a subset of events'
    columns, `where curation_status = 'approved'` baked directly into the
    view definition. Excludes curation_reasoning, image_storage_path,
    curation_status, public_explanation, created_at, medium_type,
    opening_date_confidence, source.
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
  id, email (unique), city_id (fk to regions — the subscriber's chosen
    comuna, NOT necessarily their geolocated one),
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
| `META_APP_ID` / `META_APP_SECRET` | Phase 4, GitHub Actions secret | not needed until Phase 4 |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | Phase 4, GitHub Actions secret | not needed until Phase 4 |

Security note already discussed: in public repos, Actions secrets are not
exposed to workflows triggered by fork PRs (unless `pull_request_target` is
used — avoid it).
