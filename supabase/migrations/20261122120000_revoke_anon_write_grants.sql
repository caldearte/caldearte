-- Security review 2026-11-22 (findings A2, M1, M2): close the three things
-- anyone holding the anon key could do straight through PostgREST.
--
-- Must be applied only AFTER apps/web stops using these grants: the
-- rate-limit Edge Function is deployed and the web release that calls it
-- (and sends newsletter signups through newsletter-resubscribe) is live.
-- Applied before that, signups would fail with insert_failed and the rate
-- limits would fail open until the web release lands.
--
-- No data is read, changed or deleted. Reversible: the inverse grants are
-- at the bottom of this file, commented out.

-- A2 — newsletter_subscribers. anon had INSERT on every column, including
-- confirmed_at and confirm_token, so a row could be written already
-- confirmed (straight into Thursday's send) or with a token the writer
-- chose (then confirmed through newsletter-confirm). Every write now goes
-- through the newsletter-resubscribe Edge Function (service role, gated by
-- x-admin-secret), so anon needs no grant at all.
revoke insert on newsletter_subscribers from anon;
drop policy if exists newsletter_subscribers_anon_insert on newsletter_subscribers;

-- M1 — check_rate_limit is SECURITY DEFINER. With EXECUTE for anon, anyone
-- could fill a visitor's bucket on purpose (subscribe-email:<victim>,
-- submit-event:<a gallery's IP>) or flood rate_limit_counters with unique
-- keys. apps/web now calls it through the rate-limit Edge Function with
-- the service role; newsletter-resubscribe already used the service role.
revoke execute on function check_rate_limit(text, integer, integer) from anon, authenticated;

-- M2 — web_events. anon keeps INSERT (apps/web's /api/track writes with
-- the anon key), but only on the columns the route sends, so id and
-- created_at always take their defaults and a row can't be backdated.
revoke insert on web_events from anon;
grant insert (event, event_id, path, referrer_host, country, device) on web_events to anon;

-- Rollback (run by hand only if this has to be undone):
-- grant insert on newsletter_subscribers to anon;
-- create policy newsletter_subscribers_anon_insert on newsletter_subscribers
--   for insert to anon with check (true);
-- grant execute on function check_rate_limit(text, integer, integer) to anon, authenticated;
-- revoke insert (event, event_id, path, referrer_host, country, device) on web_events from anon;
-- grant insert on web_events to anon;
