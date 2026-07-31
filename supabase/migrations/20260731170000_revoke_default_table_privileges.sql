-- Security audit finding, hardening pass (2026-07-31): every table in
-- this schema carries Supabase's default template grant — SELECT,
-- INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER — to `anon` and
-- `authenticated`, applied automatically when each table was created,
-- unless a migration explicitly revoked it. Only `events`/`regions` ever
-- had SELECT explicitly revoked (20260717050000); nothing else did.
--
-- Verified live against production: RLS actually blocks every read/write
-- attempt on these tables today (confirmed by hand — SELECT, INSERT,
-- UPDATE, DELETE on newsletter_subscribers/system_config/
-- curation_escalations/api_usage_log all correctly rejected). So this
-- isn't an active exposure. But it means RLS is the ONLY thing standing
-- between the public anon key and full read/write/delete access to every
-- internal table — no second layer. If a future migration ever adds a
-- policy that's broader than intended, or RLS gets disabled by mistake
-- on any of these, the underlying grant is already there waiting.
--
-- Fixed properly, not just patched: revoke ALL privileges on ALL tables
-- in the public schema from anon/authenticated, then re-grant back only
-- the exact narrow set every earlier migration actually intended (traced
-- from every `grant ... to anon` statement in this migrations folder).
-- Also changes the DEFAULT for any table created from now on, so this
-- can't quietly recur the next time a migration adds a table and simply
-- forgets to think about anon/authenticated access.
revoke all on all tables in schema public from anon, authenticated;

alter default privileges for role postgres in schema public
  revoke all on tables from anon, authenticated;

-- Re-grant exactly what's actually used today:
grant select on events_public to anon, authenticated;
grant select on regions_public to anon, authenticated;
grant insert on newsletter_subscribers to anon;
