// Separate, deferred orchestrator for Instagram bright sources — same
// isolation reasoning as headless-discovery/run.ts (MAVI UC): a genuinely
// different fetch mechanism (Apify, not a plain fetch()) deserves its own
// process/workflow rather than folding into event-discovery/run.ts's
// already-tight GitHub Actions budget, AND — specific to this source —
// isolating it makes it trivial to pause or disable entirely without
// touching anything else, worth having given this source's different risk
// profile (third-party scraping of a social platform, vs. plain fetches
// of public listing pages everywhere else).
//
// Reuses event-discovery/run.ts's curation/insertion pipeline unchanged
// (same curateBrightSourceItems, same insertCandidates dedup) — the only
// new thing here is HOW the content gets fetched (Apify, keyed by
// username) and mapped to a BrightSourceItem, not how it gets curated.
//
// No cadence gate at all (lib/instagram-fetch-state.ts), same as every
// other bright source since 2026-08-24 — every account runs on every
// cron fire, the only exception being an account marked inactive (a
// real dormancy concern: a genuinely dead/deleted account shouldn't be
// polled forever). See instagram-fetch-state.ts's own doc comment for
// the full reasoning, including why the earlier escalating ladder
// (7->14->21->28->semestral) was dropped.
import Anthropic from "@anthropic-ai/sdk";
import { recordUsage, getConfigNumber, getCurrentMonthSpend } from "../lib/usage-tracking.js";
import { estimateCostUsd } from "../lib/pricing.js";
import { enrichCandidates, type FetchLike as PageFetchLike } from "../lib/page-fetch.js";
import { fetchInstagramPosts, RESULTS_LIMIT_PER_ACCOUNT, type ApifyInstagramPost } from "../lib/apify-instagram.js";
import { toBrightSourceItem, isCaptionWorthCurating, resolveAccountForPost, dedupeItemsBySourceUrl } from "../lib/instagram-item.js";
import { INSTAGRAM_ACCOUNTS, type InstagramAccountConfig } from "../lib/instagram-accounts.js";
import {
  loadInstagramFetchState,
  isInstagramAccountDue,
  groupAccountsByCutoff,
  nextFetchState,
  recordInstagramFetchState,
  instagramAccountProfileUrl,
} from "../lib/instagram-fetch-state.js";
import { sendInstagramRunSummaryEmail, type InstagramRunSummary } from "../lib/notify.js";
import { recordRunSummary } from "../lib/run-summary-store.js";
import { curateBrightSourceItems, currentMonthLabel, EVENT_DISCOVERY_MODEL, type MessagesClient } from "../event-discovery/discover.js";
import type { BrightSourceItem } from "../event-discovery/extractors.js";
import { insertCandidates, loadAllRegions, loadExistingKeys, loadRecentlyRejectedSourceUrls, toCandidateSummary } from "../event-discovery/run.js";
import { createShadowClient, runShadowCuration, startShadowCuration } from "../lib/model-comparison.js";
import { collabEdgesForPosts, recordInstagramCollabEdges } from "../lib/instagram-collab-edges.js";

export interface InstagramRunDeps {
  messagesClient?: MessagesClient;
  fetchInstagramPostsFn?: typeof fetchInstagramPosts;
  pageFetchFn?: PageFetchLike;
  sendInstagramRunSummaryEmailFn?: typeof sendInstagramRunSummaryEmail;
  now?: Date;
}

export async function run(deps: InstagramRunDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const messagesClient: MessagesClient = deps.messagesClient ?? new Anthropic();
  const shadowClient = createShadowClient();
  const fetchInstagramPostsFn = deps.fetchInstagramPostsFn ?? fetchInstagramPosts;
  const pageFetchFn = deps.pageFetchFn ?? fetch;

  const fetchState = await loadInstagramFetchState(INSTAGRAM_ACCOUNTS);
  const dueAccounts = INSTAGRAM_ACCOUNTS.filter((account) => isInstagramAccountDue(fetchState.get(instagramAccountProfileUrl(account)), now));

  const summary: InstagramRunSummary = {
    startedAt: now,
    sourcesFetched: dueAccounts.map((a) => a.username),
    candidates: {
      total: 0,
      approvedByCuration: 0,
      rejectedByCuration: 0,
      insertedCount: 0,
      byMediumType: {},
      sensitivityTagged: 0,
    },
    eventGroups: [],
    cost: { anthropicUsd: 0, tavilyCredits: 0, tavilyUsd: 0, totalUsd: 0, monthToDateUsd: 0, monthlyBudgetUsd: 0 },
    apifyError: null,
  };

  if (dueAccounts.length === 0) {
    console.log("[instagram-discovery] no accounts due yet (adaptive 7-28 day cadence) — nothing to do");
    await recordRunSummary("instagram", summary.startedAt, summary.candidates, summary.eventGroups, summary.cost);
    // Individual per-pipeline email disabled 2026-08-26 — superseded by
    // the consolidated once-a-day digest (daily-digest/run.ts).
    // deps.sendInstagramRunSummaryEmailFn is kept for tests that still
    // want to assert on the built InstagramRunSummary's contents.
    await (deps.sendInstagramRunSummaryEmailFn ?? (async () => {}))(summary);
    return;
  }

  // One Apify call PER CUTOFF DATE, not one for everyone with the oldest
  // cutoff — see groupAccountsByCutoff for the real re-billing this used
  // to cause. A normal run is still a single call (every account was
  // fetched the same day); new or lagging accounts get their own call
  // with their own window. A group whose call fails is treated exactly
  // like the old whole-run failure, but only for ITS accounts: their
  // fetch state isn't touched (see the loop at the end), the others
  // proceed normally.
  const accountByUsername = new Map(dueAccounts.map((a) => [a.username, a]));
  const posts: ApifyInstagramPost[] = [];
  const fetchedAccounts = new Set<string>();
  const apifyErrors: string[] = [];
  for (const group of groupAccountsByCutoff(dueAccounts, fetchState, now)) {
    const { posts: groupPosts, errorMessage } = await fetchInstagramPostsFn(
      group.accounts.map((a) => a.username),
      group.onlyPostsNewerThan,
    );
    console.log(`[instagram-discovery] fetched ${groupPosts.length} post(s) across ${group.accounts.length} account(s) (cutoff ${group.onlyPostsNewerThan})`);
    if (errorMessage) {
      apifyErrors.push(errorMessage);
      continue;
    }
    posts.push(...groupPosts);
    for (const a of group.accounts) fetchedAccounts.add(a.username);
  }
  const apifyError = apifyErrors.length > 0 ? apifyErrors.join(" | ") : null;
  summary.apifyError = apifyError;

  // A private/deleted account, or one with zero posts in the window,
  // returns nothing for its username rather than throwing — nothing
  // special to handle here beyond just not finding a matching account for
  // an unexpected ownerUsername.
  // Attribution by the requested profile first, author second — see
  // resolveAccountForPost. Collab posts (author ≠ requested account) are
  // counted, not logged one by one: 196 of them in a single run once.
  const rawItems: BrightSourceItem[] = [];
  const accountForItem = new Map<BrightSourceItem, InstagramAccountConfig>();
  let collabPosts = 0;
  for (const post of posts) {
    const account = resolveAccountForPost(post, accountByUsername);
    if (!account) {
      console.warn(`[instagram-discovery] post from unexpected owner "${post.ownerUsername}" (requested: ${post.inputUsername ?? "?"}) — skipping`);
      continue;
    }
    if (post.ownerUsername.toLowerCase() !== account.username.toLowerCase()) collabPosts += 1;
    const item = toBrightSourceItem(post, account);
    rawItems.push(item);
    accountForItem.set(item, account);
  }
  if (collabPosts > 0) {
    console.log(`[instagram-discovery] ${collabPosts}/${rawItems.length} post(s) attributed to the requested account despite a different author (collab/co-authored posts)`);
  }
  // The other half of the collab data: which accounts we DON'T follow
  // co-post with the ones we do. Persisted as a discovery channel
  // (instagram_collab_edges), reviewed by hand — against the full
  // registry, not just the accounts due today, so a co-author we already
  // follow is never recorded as a candidate.
  await recordInstagramCollabEdges(collabEdgesForPosts(posts, new Set(INSTAGRAM_ACCOUNTS.map((a) => a.username.toLowerCase()))));
  // Apify's `resultsLimit` (apify-instagram.ts) hard-caps how many posts
  // it returns per requested profile, regardless of onlyPostsNewerThan —
  // an account whose real per-account count lands exactly on that cap is
  // indistinguishable, from this data alone, between "posted exactly N"
  // and "posted more than N and the rest got silently, permanently
  // dropped" (found 2026-09-15: MAVI UC hit the cap exactly, no way to
  // tell from the run itself whether anything was lost). Not proof of
  // truncation, just the one signal available — surfaced here so a real
  // pattern (an account hitting this often) is visible instead of
  // invisible.
  const rawCountByUsername = new Map<string, number>();
  for (const account of accountForItem.values()) {
    rawCountByUsername.set(account.username, (rawCountByUsername.get(account.username) ?? 0) + 1);
  }
  for (const [username, count] of rawCountByUsername) {
    if (count >= RESULTS_LIMIT_PER_ACCOUNT) {
      console.warn(
        `[instagram-discovery] ${username} returned ${count} raw post(s) this run — at Apify's resultsLimit cap (${RESULTS_LIMIT_PER_ACCOUNT}), older posts may have been silently dropped`,
      );
    }
  }
  // Same post URL twice = a collab between two registered accounts, see
  // dedupeItemsBySourceUrl. Must happen before curation, not after.
  const items = dedupeItemsBySourceUrl(rawItems);
  if (items.length < rawItems.length) {
    console.log(`[instagram-discovery] ${rawItems.length - items.length} duplicate post URL(s) collapsed before curation (collab posts between registered accounts)`);
  }

  // Pre-curation dedup, same mechanism as event-discovery/run.ts's
  // bright-source loop (docs/region-discovery.md) — skip anything
  // already approved (ever) or rejected (within the rolling window)
  // before it ever reaches Haiku. What survives this, per account, is
  // exactly "genuinely new" for the adaptive-cadence escalation below.
  const seenKeys = await loadExistingKeys();
  const rejectedSourceUrls = await loadRecentlyRejectedSourceUrls(now);
  const excludedSourceUrls = new Set([...seenKeys.sourceUrls.keys(), ...rejectedSourceUrls]);
  const newItems = items.filter((item) => !excludedSourceUrls.has(item.sourceUrl));
  const skipped = items.length - newItems.length;
  if (skipped > 0) {
    console.log(`[instagram-discovery] ${skipped}/${items.length} post(s) already seen, skipped before curation`);
  }

  // "Genuinely new" for cadence purposes (usernamesWithNewItems, below)
  // means a new post existed at all — independent of whether its caption
  // is actually worth spending a Haiku call on. An account that only
  // posts book launches is still an ACTIVE account; that's a curation
  // outcome, not a cadence signal.
  const usernamesWithNewItems = new Set(newItems.map((item) => accountForItem.get(item)?.username).filter((u): u is string => u !== undefined));

  // Deterministic pre-Haiku filter (instagram-item.ts) — catches an
  // empty/near-empty caption or an unambiguous book-launch announcement
  // before spending an Anthropic call on something that's rejected every
  // time in practice (see instagram-item.ts's own doc comment for the
  // real rejection reasons that motivated these two specific patterns).
  const curatableItems = newItems.filter((item) => isCaptionWorthCurating(item.description));
  const filteredOut = newItems.length - curatableItems.length;
  if (filteredOut > 0) {
    console.log(`[instagram-discovery] ${filteredOut}/${newItems.length} post(s) filtered out before curation (thin caption or book launch)`);
  }

  if (curatableItems.length > 0) {
    // No fixedLocation passed at the batch level — accounts are curated
    // together but each item still carries its own account.location via
    // toBrightSourceItem (only set for accounts with a confirmed fixed
    // venue), same per-item precedence curateBrightSourceItems already
    // gives a source-level `location` value.
    // Shadow call starts first and runs alongside the real one — see
    // startShadowCuration.
    const shadowRun = shadowClient
      ? startShadowCuration(shadowClient, (client) => curateBrightSourceItems(client, curatableItems, currentMonthLabel(now)))
      : null;
    const { candidates, usage } = await curateBrightSourceItems(messagesClient, curatableItems, currentMonthLabel(now));
    if (shadowClient && shadowRun) {
      await runShadowCuration("instagram", "instagram_batch", shadowClient, candidates, shadowRun);
    }

    await recordUsage({ purpose: "event_discovery", model: EVENT_DISCOVERY_MODEL, pipeline: "instagram", usage });
    summary.cost.anthropicUsd = estimateCostUsd(EVENT_DISCOVERY_MODEL, usage);
    summary.cost.totalUsd = summary.cost.anthropicUsd;

    const regions = await loadAllRegions();
    await enrichCandidates(candidates, pageFetchFn, now, regions);

    const { insertedCount, outcomes } = await insertCandidates(candidates, regions, seenKeys, now, "instagram");

    summary.candidates.total = candidates.length;
    summary.candidates.insertedCount = insertedCount;
    summary.eventGroups.push({
      label: "Instagram",
      candidates: candidates.map((c) => toCandidateSummary(c, outcomes.get(c))),
    });
    for (const c of candidates) {
      if (c.status === "approved") summary.candidates.approvedByCuration += 1;
      if (c.status === "rejected") summary.candidates.rejectedByCuration += 1;
      summary.candidates.byMediumType[c.mediumType] = (summary.candidates.byMediumType[c.mediumType] ?? 0) + 1;
      if (c.sensitivityTags.length > 0) summary.candidates.sensitivityTagged += 1;
    }
    console.log(`[instagram-discovery] ${insertedCount} new approved event(s) inserted`);
  } else {
    console.log("[instagram-discovery] nothing worth curating, skipping curation entirely");
  }

  // Skip entirely when the Apify call itself failed (e.g. the monthly
  // usage limit) — no account was actually checked, so recording a
  // zero-yield check for every one of them would silently erode the
  // dormancy backstop's real ~6-month silence window on an infrastructure
  // outage, not a real quiet account.
  for (const account of dueAccounts.filter((a) => fetchedAccounts.has(a.username))) {
    const state = fetchState.get(instagramAccountProfileUrl(account));
    const next = nextFetchState(state, usernamesWithNewItems.has(account.username));
    await recordInstagramFetchState(account, now, next);
    console.log(
      `[instagram-discovery] ${account.username}: will be checked on the next cron fire${next.isInactive ? " — marked inactive, won't be fetched again automatically" : ""}`,
    );
  }

  try {
    summary.cost.monthToDateUsd = await getCurrentMonthSpend();
    summary.cost.monthlyBudgetUsd = await getConfigNumber("monthly_budget_usd");
  } catch (err) {
    // Ancillary reporting only — every event is already fully saved by
    // this point, same posture as event-discovery/run.ts's own summary
    // try/catch.
    console.error(`[instagram-discovery] failed to compute month-to-date spend for the summary email: ${(err as Error).message}`);
  }

  await recordRunSummary("instagram", summary.startedAt, summary.candidates, summary.eventGroups, summary.cost, { apifyError: summary.apifyError });
  // Individual per-pipeline email disabled 2026-08-26 — superseded by the
  // consolidated once-a-day digest (daily-digest/run.ts). Real bug found
  // 2026-08-30: this call site kept calling the REAL sendInstagramRunSummaryEmail
  // by default, unlike every other pipeline's own run.ts (which all
  // default to a no-op) — Daniel was getting this old-format email (no
  // real Apify cost data, unlike the digest) on every Instagram run
  // despite the digest already covering it. deps.sendInstagramRunSummaryEmailFn
  // is kept for tests that still want to assert on the built
  // InstagramRunSummary's contents.
  await (deps.sendInstagramRunSummaryEmailFn ?? (async () => {}))(summary);
}
