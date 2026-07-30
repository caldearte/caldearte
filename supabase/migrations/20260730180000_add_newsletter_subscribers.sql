-- Newsletter feature — weekly digest, double opt-in. See docs/roadmap.md's
-- Phase 1a punch list and docs/data-model.md for the full design.
--
-- One row per subscriber. Double opt-in (confirmed_at starts null) exists
-- to protect caldearte.com's shared Resend sender reputation and filter
-- bad/bot signups — not related to Phase 1b's inbound-mail flow, this is
-- outbound-only (a confirmation link the subscriber clicks, resolved by a
-- Supabase Edge Function, same pattern as curation-escalation-decide).
create table newsletter_subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  city_id uuid not null references regions(id),
  confirm_token text unique not null,
  confirmed_at timestamptz null,
  unsubscribed_at timestamptz null,
  created_at timestamptz not null default now()
);

alter table newsletter_subscribers enable row level security;

-- service_role (the curator's weekly-send module, and the confirm/
-- unsubscribe Edge Functions) gets full access — same explicit grant every
-- other table in this schema needs, PostgREST's service_role has no
-- implicit access (see docs/data-model.md).
grant all on newsletter_subscribers to service_role;

-- anon gets INSERT only — apps/web/src/app/api/newsletter/subscribe writes
-- a new pending row using the anon key (never the service-role key, see
-- apps/web/src/lib/supabase-client.ts's assertAnonRole guard). No SELECT/
-- UPDATE/DELETE grant at all, so a subscriber's row can't be read, listed,
-- or modified by anyone holding only the public anon key — confirming and
-- unsubscribing go through the Edge Functions (service-role) instead,
-- reached via the token in the confirmation/every-digest-email link, never
-- through this table's RLS.
grant insert on newsletter_subscribers to anon;
create policy newsletter_subscribers_anon_insert on newsletter_subscribers
  for insert to anon
  with check (true);
