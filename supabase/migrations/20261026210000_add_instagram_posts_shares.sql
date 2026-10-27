-- Shares per published carousel (2026-10-26). Daniel wanted the Instagram
-- "guardar" of our posts as the demand signal for lists/accounts; saves
-- turned out near zero (4 in 31 carousels since 2026-08-26), while a
-- probe run of instagram-insights on the same 30 posts got 25 shares —
-- sending our post to someone is how this audience keeps an opening.
-- Filled by the same weekly cron (instagram-insights/run.ts), asked for
-- in its own /insights call so a post that can't report shares keeps its
-- reach/saved. Nullable for the same reason as the other metrics.
alter table instagram_posts add column shares integer;
