// Separate, deferred orchestrator for the Google Alerts bright source —
// same isolation reasoning as headless-discovery/run.ts (MAVI) and
// instagram-discovery/run.ts: a genuinely different fetch mechanism (an
// Atom feed whose entries point to arbitrary, unrelated domains, not one
// consistent site) doesn't fit fetchBrightSources' KnownSource/extractor
// model, and isolating it here means a failure here can never break the
// main run.
//
// Reuses event-discovery/run.ts's curation/insertion pipeline unchanged
// (same curateBrightSourceItems, same insertCandidates dedup) — the only
// new thing here is HOW content gets found (a Google Alert instead of a
// per-comuna search or a known listing page) and mapped to a
// BrightSourceItem.
//
// Cadence: the SHARED 7-day bright_source_fetch_state/isSourceDue (same
// as every KNOWN_SOURCES entry) — unlike Instagram, there's no per-item
// variability to adapt to here (one continuously-updating feed, not many
// independently-paced accounts), so the simpler shared mechanism fits.
// The feed's own URL is the tracked identity, same as MAVI's constant
// listing URL in headless-discovery/run.ts.
import Anthropic from "@anthropic-ai/sdk";
import { recordUsage, getConfigNumber, getCurrentMonthSpend } from "../lib/usage-tracking.js";
import { estimateCostUsd } from "../lib/pricing.js";
import { fetchHtmlPageFallback } from "../event-discovery/sources.js";
import { enrichCandidates, type FetchLike as PageFetchLike } from "../lib/page-fetch.js";
import { fetchGoogleAlertEntries, type GoogleAlertEntry } from "../lib/google-alerts.js";
import { sendGoogleAlertsRunSummaryEmail, type GoogleAlertsRunSummary } from "../lib/notify.js";
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

// Identity tracked in bright_source_fetch_state — the ALERT's identity
// (stable across runs), not the feed URL itself (which embeds a
// Google-account-linked ID we deliberately never write to this public
// repo, see lib/google-alerts.ts's own doc comment) — this string is
// just a bookkeeping key, never fetched.
const GOOGLE_ALERTS_SOURCE_KEY = "google-alerts://inauguracion-de-arte";

// Never a site-specific extractor (every entry is a different domain) —
// a single generic page fetch per entry, same fallback every other
// bright source already uses when it has no configured extractor
// (sources.ts's fetchHtmlPageFallback). Real, measured trade-off: the
// feed's own snippet is too thin to curate reliably on its own (a
// keyword-highlighted one-sentence excerpt), so this fetch happens for
// every entry, not just approved ones — same posture as any source
// with no descriptionExtractor.
async function toBrightSourceItem(entry: GoogleAlertEntry, fetchImpl: PageFetchLike): Promise<BrightSourceItem> {
  let description = entry.snippet || null;
  let imageUrl: string | null = null;

  try {
    const page = await fetchHtmlPageFallback(entry.url, fetchImpl);
    if (page.content) description = page.content;
    imageUrl = page.images[0]?.url ?? null;
  } catch (err) {
    // A single dead/unreachable article link degrades to the feed's own
    // short snippet rather than losing the candidate entirely — Haiku
    // still gets a chance to judge it, just with less context.
    console.warn(`[google-alerts-discovery] failed to fetch article page ${entry.url}: ${(err as Error).message}`);
  }

  return {
    title: entry.title,
    sourceUrl: entry.url,
    imageUrl,
    description,
    locationHint: null,
    rawDateText: description ?? "",
    structuredStartDate: null,
    structuredEndDate: null,
    publishedDate: entry.publishedDate,
    location: null,
    placeName: null,
  };
}

// Reads GOOGLE_ALERTS_FEED_URL itself, internally — kept OUT of run()'s
// own logic so a test-supplied fetchGoogleAlertEntriesFn (a plain no-arg
// function) never depends on that env var being set at all. Real gap
// found writing this file's own integration test: an earlier version
// read the env var directly inside run() and bailed before ever calling
// the injected stub, making the "due" path untestable without a real
// feed URL.
async function fetchGoogleAlertEntriesFromEnv(): Promise<GoogleAlertEntry[]> {
  const feedUrl = process.env.GOOGLE_ALERTS_FEED_URL;
  if (!feedUrl) {
    console.error("[google-alerts-discovery] GOOGLE_ALERTS_FEED_URL not set — skipping this run");
    return [];
  }
  return fetchGoogleAlertEntries(feedUrl);
}

export interface GoogleAlertsRunDeps {
  messagesClient?: MessagesClient;
  fetchGoogleAlertEntriesFn?: () => Promise<GoogleAlertEntry[]>;
  pageFetchFn?: PageFetchLike;
  sendGoogleAlertsRunSummaryEmailFn?: typeof sendGoogleAlertsRunSummaryEmail;
  now?: Date;
}

export async function run(deps: GoogleAlertsRunDeps = {}): Promise<void> {
  const now = deps.now ?? new Date();
  const messagesClient: MessagesClient = deps.messagesClient ?? new Anthropic();
  const fetchGoogleAlertEntriesFn = deps.fetchGoogleAlertEntriesFn ?? fetchGoogleAlertEntriesFromEnv;
  const pageFetchFn = deps.pageFetchFn ?? fetch;

  const fetchState = await loadBrightSourceFetchState();
  const due = isSourceDue(fetchState.get(GOOGLE_ALERTS_SOURCE_KEY), now);

  const summary: GoogleAlertsRunSummary = {
    startedAt: now,
    dueThisRun: due,
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

  if (!due) {
    console.log("[google-alerts-discovery] not due yet (7-day cadence) — nothing to do");
    await (deps.sendGoogleAlertsRunSummaryEmailFn ?? sendGoogleAlertsRunSummaryEmail)(summary);
    return;
  }

  const entries = await fetchGoogleAlertEntriesFn();
  console.log(`[google-alerts-discovery] fetched ${entries.length} feed entry(ies)`);

  if (entries.length > 0) {
    // Pre-curation dedup, same mechanism as every other bright-source
    // loop (docs/region-discovery.md) — skip anything already approved
    // (ever) or rejected (within the rolling window) before it ever
    // reaches Haiku or costs a page fetch.
    const seenKeys = await loadExistingKeys();
    const rejectedSourceUrls = await loadRecentlyRejectedSourceUrls(now);
    const excludedSourceUrls = new Set([...seenKeys.sourceUrls.keys(), ...rejectedSourceUrls]);
    const newEntries = entries.filter((entry) => !excludedSourceUrls.has(entry.url));
    const skipped = entries.length - newEntries.length;
    if (skipped > 0) {
      console.log(`[google-alerts-discovery] ${skipped}/${entries.length} entry(ies) already seen, skipped before fetching/curation`);
    }

    if (newEntries.length > 0) {
      const items = await Promise.all(newEntries.map((entry) => toBrightSourceItem(entry, pageFetchFn)));

      const { candidates, usage } = await curateBrightSourceItems(messagesClient, items, currentMonthLabel(now));

      await recordUsage({ purpose: "event_discovery", model: EVENT_DISCOVERY_MODEL, pipeline: "google_alerts", usage });
      summary.cost.anthropicUsd = estimateCostUsd(EVENT_DISCOVERY_MODEL, usage);
      summary.cost.totalUsd = summary.cost.anthropicUsd;

      const regions = await loadAllRegions();
      await enrichCandidates(candidates, pageFetchFn, now, regions);

      const { insertedCount, outcomes } = await insertCandidates(candidates, regions, seenKeys, now, "google_alerts");

      summary.candidates.total = candidates.length;
      summary.candidates.insertedCount = insertedCount;
      summary.eventGroups.push({
        label: "Google Alerts",
        candidates: candidates.map((c) => toCandidateSummary(c, outcomes.get(c))),
      });
      for (const c of candidates) {
        if (c.status === "approved") summary.candidates.approvedByCuration += 1;
        if (c.status === "rejected") summary.candidates.rejectedByCuration += 1;
        summary.candidates.byMediumType[c.mediumType] = (summary.candidates.byMediumType[c.mediumType] ?? 0) + 1;
        if (c.sensitivityTags.length > 0) summary.candidates.sensitivityTagged += 1;
      }
      console.log(`[google-alerts-discovery] ${insertedCount} new approved event(s) inserted`);
    } else {
      console.log("[google-alerts-discovery] nothing new, skipping curation entirely");
    }
  }

  await recordBrightSourcesFetched([GOOGLE_ALERTS_SOURCE_KEY], now);

  try {
    summary.cost.monthToDateUsd = await getCurrentMonthSpend();
    summary.cost.monthlyBudgetUsd = await getConfigNumber("monthly_budget_usd");
  } catch (err) {
    console.error(`[google-alerts-discovery] failed to compute month-to-date spend for the summary email: ${(err as Error).message}`);
  }

  await (deps.sendGoogleAlertsRunSummaryEmailFn ?? sendGoogleAlertsRunSummaryEmail)(summary);
}
