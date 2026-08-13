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
// bright_source_fetch_state (the same table/7-day cadence every other
// bright source already uses) is keyed by each account's own profile URL
// — one row per account, so a newly-added account is due immediately
// while an already-fetched one waits out its own cadence, independent of
// its neighbors.
import Anthropic from "@anthropic-ai/sdk";
import { recordUsage, getConfigNumber, getCurrentMonthSpend } from "../lib/usage-tracking.js";
import { estimateCostUsd } from "../lib/pricing.js";
import { enrichCandidates, type FetchLike as PageFetchLike } from "../lib/page-fetch.js";
import { fetchInstagramPosts } from "../lib/apify-instagram.js";
import { toBrightSourceItem } from "../lib/instagram-item.js";
import { INSTAGRAM_ACCOUNTS, type InstagramAccountConfig } from "../lib/instagram-accounts.js";
import { sendInstagramRunSummaryEmail, type InstagramRunSummary } from "../lib/notify.js";
import { curateBrightSourceItems, currentMonthLabel, EVENT_DISCOVERY_MODEL, type MessagesClient } from "../event-discovery/discover.js";
import type { BrightSourceItem } from "../event-discovery/extractors.js";
import {
  insertCandidates,
  loadAllRegions,
  loadBrightSourceFetchState,
  loadExistingKeys,
  loadRecentlyRejectedSourceUrls,
  isSourceDue,
  recordBrightSourcesFetched,
  toCandidateSummary,
} from "../event-discovery/run.js";

function accountProfileUrl(account: InstagramAccountConfig): string {
  return `https://www.instagram.com/${account.username}/`;
}

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

  const fetchState = await loadBrightSourceFetchState();
  const dueAccounts = INSTAGRAM_ACCOUNTS.filter((account) => isSourceDue(fetchState.get(accountProfileUrl(account)), now));

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
    console.log("[instagram-discovery] no accounts due yet (7-day cadence) — nothing to do");
    await (deps.sendInstagramRunSummaryEmailFn ?? sendInstagramRunSummaryEmail)(summary);
    return;
  }

  const accountByUsername = new Map(dueAccounts.map((a) => [a.username, a]));
  const posts = await fetchInstagramPostsFn(
    dueAccounts.map((a) => a.username),
    now,
  );
  console.log(`[instagram-discovery] fetched ${posts.length} post(s) across ${dueAccounts.length} account(s)`);

  if (posts.length > 0) {
    // A private/deleted account returns no posts for its username rather
    // than throwing — nothing special to handle here beyond just not
    // finding a matching account for an unexpected ownerUsername.
    const items: BrightSourceItem[] = posts
      .map((post) => {
        const account = accountByUsername.get(post.ownerUsername) ?? accountByUsername.get(post.ownerUsername.toLowerCase());
        if (!account) {
          console.warn(`[instagram-discovery] post from unexpected owner "${post.ownerUsername}" — skipping`);
          return null;
        }
        return toBrightSourceItem(post, account);
      })
      .filter((item): item is BrightSourceItem => item !== null);

    // Pre-curation dedup, same mechanism as event-discovery/run.ts's
    // bright-source loop (docs/region-discovery.md) — skip anything
    // already approved (ever) or rejected (within the rolling window)
    // before it ever reaches Haiku.
    const seenKeys = await loadExistingKeys();
    const rejectedSourceUrls = await loadRecentlyRejectedSourceUrls(now);
    const excludedSourceUrls = new Set([...seenKeys.sourceUrls.keys(), ...rejectedSourceUrls]);
    const newItems = items.filter((item) => !excludedSourceUrls.has(item.sourceUrl));
    const skipped = items.length - newItems.length;
    if (skipped > 0) {
      console.log(`[instagram-discovery] ${skipped}/${items.length} post(s) already seen, skipped before curation`);
    }

    if (newItems.length > 0) {
      // No fixedLocation passed at the batch level — accounts are curated
      // together but each item still carries its own account.location via
      // toBrightSourceItem (only set for accounts with a confirmed
      // fixed venue), same per-item precedence curateBrightSourceItems
      // already gives a source-level `location` value.
      const { candidates, usage } = await curateBrightSourceItems(messagesClient, newItems, currentMonthLabel(now));

      await recordUsage({ purpose: "event_discovery", model: EVENT_DISCOVERY_MODEL, usage });
      summary.cost.anthropicUsd = estimateCostUsd(EVENT_DISCOVERY_MODEL, usage);
      summary.cost.totalUsd = summary.cost.anthropicUsd;

      const regions = await loadAllRegions();
      await enrichCandidates(candidates, pageFetchFn, now, regions);

      const { insertedCount, outcomes } = await insertCandidates(candidates, regions, seenKeys, now);

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
  }

  await recordBrightSourcesFetched(
    dueAccounts.map((a) => accountProfileUrl(a)),
    now,
  );

  try {
    summary.cost.monthToDateUsd = await getCurrentMonthSpend();
    summary.cost.monthlyBudgetUsd = await getConfigNumber("monthly_budget_usd");
  } catch (err) {
    // Ancillary reporting only — every event is already fully saved by
    // this point, same posture as event-discovery/run.ts's own summary
    // try/catch.
    console.error(`[instagram-discovery] failed to compute month-to-date spend for the summary email: ${(err as Error).message}`);
  }

  await (deps.sendInstagramRunSummaryEmailFn ?? sendInstagramRunSummaryEmail)(summary);
}
