-- Real gap found 2026-08-15 building the admin analytics dashboard: an
-- Instagram post's own permalink (instagram.com/p/<shortcode>/) never
-- embeds which of the ~27 tracked accounts posted it, so a per-account
-- "is this specific account dead" check was impossible from source_url
-- alone — domain-level yield (instagram.com as a whole) hid every
-- individual account's silence behind any other account's activity.
-- Daniel's explicit request: capture the account itself. Populated by
-- apps/curator/src/lib/instagram-item.ts (account.username) for
-- Instagram; null for every other pipeline (comuna search, web bright
-- sources, Google Alerts, MAVI headless — none of those have an
-- "account" concept distinct from the source itself).
alter table events add column source_account text;
alter table rejected_candidates add column source_account text;
alter table out_of_scope_signals add column source_account text;

create index events_source_account_idx on events (source_account);
create index rejected_candidates_source_account_idx on rejected_candidates (source_account);
