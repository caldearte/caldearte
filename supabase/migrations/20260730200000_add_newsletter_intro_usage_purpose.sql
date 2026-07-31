-- Widens api_usage_log's purpose check constraint to also allow
-- 'newsletter_intro' — the newsletter's per-región AI-generated summary
-- (apps/curator/src/newsletter/intro.ts), tracked the same way every
-- other Haiku call in this codebase is (see docs/data-model.md's
-- api_usage_log entry). One Haiku call per active región per week, not
-- per subscriber, so real cost stays negligible.
alter table api_usage_log drop constraint api_usage_log_purpose_check;
alter table api_usage_log
  add constraint api_usage_log_purpose_check
  check (purpose in ('event_discovery', 'newsletter_intro'));
