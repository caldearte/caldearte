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
// Cadence is adaptive PER ACCOUNT (lib/instagram-fetch-state.ts), not the
// shared 7-day BRIGHT_SOURCE_INTERVAL_MS every other bright source uses
// (event-discovery/run.ts's isSourceDue) — Daniel's explicit request
// (2026-08-13, floor lowered 2026-08-23): a new account starts at 7
// days; a fetch that turns up nothing genuinely new for that account
// pushes it to 14, then 21, then 28 (capped there); a fetch that DOES
// find something new resets it back to 7. Apify is real money per fetch,
// so an account that rarely posts shouldn't be re-fetched on the same
// clock as one that posts weekly.
import Anthropic from "@anthropic-ai/sdk";
import { recordUsage, getConfigNumber, getCurrentMonthSpend } from "../lib/usage-tracking.js";
import { estimateCostUsd } from "../lib/pricing.js";
import { enrichCandidates, type FetchLike as PageFetchLike } from "../lib/page-fetch.js";
import { fetchInstagramPosts } from "../lib/apify-instagram.js";
import { toBrightSourceItem } from "../lib/instagram-item.js";
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
  };

  if (dueAccounts.length === 0) {
    console.log("[instagram-discovery] no accounts due yet (adaptive 7-28 day cadence) — nothing to do");
    await recordRunSummary("instagram", summary.startedAt, summary.candidates, summary.eventGroups, summary.cost);
    await (deps.sendInstagramRunSummaryEmailFn ?? sendInstagramRunSummaryEmail)(summary);
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
  const posts = await fetchInstagramPostsFn(
    dueAccounts.map((a) => a.username),
    onlyPostsNewerThan,
  );
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

  const usernamesWithNewItems = new Set(newItems.map((item) => accountForItem.get(item)?.username).filter((u): u is string => u !== undefined));

  if (newItems.length > 0) {
    // No fixedLocation passed at the batch level — accounts are curated
    // together but each item still carries its own account.location via
    // toBrightSourceItem (only set for accounts with a confirmed fixed
    // venue), same per-item precedence curateBrightSourceItems already
    // gives a source-level `location` value.
    const { candidates, usage } = await curateBrightSourceItems(messagesClient, newItems, currentMonthLabel(now));

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
    console.log("[instagram-discovery] nothing new, skipping curation entirely");
  }

  for (const account of dueAccounts) {
    const state = fetchState.get(instagramAccountProfileUrl(account));
    const next = nextFetchState(state, usernamesWithNewItems.has(account.username));
    await recordInstagramFetchState(account, now, next);
    console.log(
      `[instagram-discovery] ${account.username}: next fetch in ${next.intervalDays} day(s)${next.isInactive ? " — marked inactive, won't be fetched again automatically" : ""}`,
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

  await recordRunSummary("instagram", summary.startedAt, summary.candidates, summary.eventGroups, summary.cost);
  await (deps.sendInstagramRunSummaryEmailFn ?? sendInstagramRunSummaryEmail)(summary);
}
