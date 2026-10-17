-- First-party intent tracking for caldearte.com (2026-10-16). Vercel
-- Analytics counts visits, but ~30% of those are Meta bots and custom
-- events need the Pro plan; what Caldearte's thesis is measured in is
-- attendance, so this counts only the few clicks that show someone means
-- to go: "Cómo llegar", "Agregar al calendario", clicking out to the
-- event's source or a venue/artist Instagram, and a newsletter signup.
--
-- Deliberately anonymous: no IP, no full user agent, no cookie, no visitor
-- or session id — one row is one click, and nothing links two rows to the
-- same person. `country` comes from Vercel's geo header and `device` is a
-- three-value bucket, both derived server-side by
-- apps/web/src/app/api/track/route.ts, which also drops obvious bots
-- before inserting. `referrer_host` is the host the visitor arrived from
-- (document.referrer), so Meta-datacenter traffic (facebook.com from
-- US/SE/IE) can be filtered out in queries.
--
-- `event_id` is not a foreign key on purpose: rejected events get pruned
-- and an approved one can be hard-deleted by hand, and a click count
-- shouldn't block that or disappear with it.
--
-- New table only — nothing existing is read, changed or deleted. Reverting
-- is `drop table web_events`.
create table web_events (
  id uuid primary key default gen_random_uuid(),
  event text not null check (event in ('directions', 'add_to_calendar', 'outbound_source', 'outbound_instagram', 'newsletter_signup')),
  event_id uuid null,
  path text not null check (char_length(path) <= 300),
  referrer_host text null check (char_length(referrer_host) <= 200),
  country text null check (country ~ '^[A-Z]{2}$'),
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  created_at timestamptz not null default now()
);

create index web_events_created_at_idx on web_events (created_at);

alter table web_events enable row level security;

grant all on web_events to service_role;

-- anon gets INSERT only, same posture as newsletter_subscribers: the
-- /api/track route writes with the anon key, and nobody holding that
-- public key can read the rows back. The CHECKs above are what bound a
-- direct PostgREST insert that skips the route.
grant insert on web_events to anon;
create policy web_events_anon_insert on web_events
  for insert to anon
  with check (true);
