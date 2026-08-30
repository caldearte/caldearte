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
import { fetchInstagramPosts } from "../lib/apify-instagram.js";
import { toBrightSourceItem, isCaptionWorthCurating } from "../lib/instagram-item.js";
import { INSTAGRAM_ACCOUNTS, type InstagramAccountConfig } from "../lib/instagram-accounts.js";
import {
  loadInstagramFetchState,
  isInstagramAccountDue,
  accountCutoffDate,
  nextFetchState,
  recordInstagramFetchState,
  instagramAccountProfileUrl,
} from "../lib/instagram-fetch-state.js";
import { sendInstagramRunSummaryEmail, type InstagramRunSummary } from "../lib/notify.js";
import { recordRunSummary } from "../lib/run-summary-store.js";
import { curateBrightSourceItems, currentMonthLabel, EVENT_DISCOVERY_MODEL, type MessagesClient } from "../event-discovery/discover.js";
import type { BrightSourceItem } from "../event-discovery/extractors.js";
import { insertCandidates, loadAllRegions, loadExistingKeys, loadRecentlyRejectedSourceUrls, toCandidateSummary } from "../event-discovery/run.js";

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

  // One Apify call for every due account (see apify-instagram.ts's own
  // doc comment on why): oldest per-account cutoff wins as the single
  // shared onlyPostsNewerThan — a fresher-cadence account's cutoff being
  // slightly earlier than strictly necessary just means a bit more
  // pre-curation dedup work, never a missed or duplicated event.
  const cutoffs = dueAccounts.map((account) => accountCutoffDate(fetchState.get(instagramAccountProfileUrl(account)), now));
  const oldestCutoff = new Date(Math.min(...cutoffs.map((d) => d.getTime())));
  const onlyPostsNewerThan = oldestCutoff.toISOString().slice(0, 10);

  const accountByUsername = new Map(dueAccounts.map((a) => [a.username, a]));
  const { posts, errorMessage: apifyError } = await fetchInstagramPostsFn(
    dueAccounts.map((a) => a.username),
    onlyPostsNewerThan,
  );
  summary.apifyError = apifyError;
  console.log(`[instagram-discovery] fetched ${posts.length} post(s) across ${dueAccounts.length} account(s) (cutoff ${onlyPostsNewerThan})`);

  // A private/deleted account, or one with zero posts in the window,
  // returns nothing for its username rather than throwing — nothing
  // special to handle here beyond just not finding a matching account for
  // an unexpected ownerUsername.
  const items: BrightSourceItem[] = [];
  const accountForItem = new Map<BrightSourceItem, InstagramAccountConfig>();
  for (const post of posts) {
    const account = accountByUsername.get(post.ownerUsername) ?? accountByUsername.get(post.ownerUsername.toLowerCase());
    if (!account) {
      console.warn(`[instagram-discovery] post from unexpected owner "${post.ownerUsername}" — skipping`);
      continue;
    }
    const item = toBrightSourceItem(post, account);
    items.push(item);
    accountForItem.set(item, account);
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
    const { candidates, usage } = await curateBrightSourceItems(messagesClient, curatableItems, currentMonthLabel(now));

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
  for (const account of apifyError ? [] : dueAccounts) {
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
