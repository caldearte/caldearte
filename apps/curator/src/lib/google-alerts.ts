// Fetches and parses a Google Alerts Atom feed — evaluated at Daniel's
// request 2026-08-14 (a real "inauguracion de arte" alert he's had
// running for a while, real density confirmed against ~20 days of real
// history: high, geographically diverse, complements the comuna-by-comuna
// Tavily search and every single-site bright source, since it aggregates
// across ALL of Chile's press/institutional coverage at once).
//
// Delivery is set to "Feed RSS" (an Atom feed, despite the name) instead
// of email — a deliberate choice over the alternatives (Gmail API OAuth,
// IMAP with an app password): both of those require reading Daniel's
// actual mailbox, while the RSS feed is a plain, unauthenticated URL —
// same "just fetch a URL" shape as every other bright source, no mailbox
// access, no OAuth consent flow, no credentials at all. The feed URL
// itself is NOT hardcoded here (unlike a public gallery listing page) —
// it embeds a Google-account-linked numeric ID, so it's treated with the
// same caution as a real secret: read from GOOGLE_ALERTS_FEED_URL
// (process.env), never committed to this public repo.
//
// Real, structural difference from every other bright source: each entry
// links to a DIFFERENT, unrelated domain (a different news outlet per
// story) rather than one consistent site — there's no per-site extractor
// to write. See google-alerts-discovery/run.ts for how each entry's real
// article page gets a generic (not site-specific) content fetch.
import { decodeHtmlEntities, collapseWhitespace } from "../event-discovery/extractors.js";

export interface GoogleAlertEntry {
  title: string;
  url: string; // the REAL article URL, already unwrapped from Google's redirect link
  snippet: string; // short, keyword-highlighted excerpt — real but too thin to curate on alone, see run.ts
  publishedDate: string; // YYYY-MM-DD, when Google's crawler found this (not the exhibition's own date)
}

// Google Alerts wraps every real URL in a tracking redirect —
// "https://www.google.com/url?rct=j&sa=t&url=<real-url>&ct=ga&cd=...&usg=..."
// — the real destination lives in the `url` query param. Confirmed
// against the real feed (2026-08-14): every entry uses this exact shape.
function unwrapGoogleRedirectUrl(href: string): string | null {
  try {
    const real = new URL(href).searchParams.get("url");
    return real && real.length > 0 ? real : href;
  } catch {
    return null;
  }
}

// Pure and separately exported so the real feed shape can be verified
// against a captured sample without a live HTTP call — same pattern as
// lib/mavi-headless.ts's parseMaviActivities / lib/apify-instagram.ts's
// parseApifyInstagramPosts.
export function parseGoogleAlertFeed(xml: string): GoogleAlertEntry[] {
  const entries: GoogleAlertEntry[] = [];

  for (const entryMatch of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const block = entryMatch[1];
    const rawTitle = block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1];
    const rawHref = block.match(/<link href="([^"]*)"/)?.[1];
    const rawContent = block.match(/<content[^>]*>([\s\S]*?)<\/content>/)?.[1];
    const rawPublished = block.match(/<published>([^<]*)<\/published>/)?.[1];

    if (!rawTitle || !rawHref || !rawPublished) continue;

    const url = unwrapGoogleRedirectUrl(decodeHtmlEntities(rawHref));
    if (!url) continue;

    entries.push({
      // Double-decode: the raw match is XML-escaped text that is ITSELF
      // HTML ("&lt;b&gt;" -> "<b>") — decode once to reach real HTML,
      // then collapseWhitespace strips the tags and decodes the entities
      // that were escaped a level deeper ("&amp;nbsp;" -> "&nbsp;" -> " ").
      title: collapseWhitespace(decodeHtmlEntities(rawTitle)),
      url,
      snippet: rawContent ? collapseWhitespace(decodeHtmlEntities(rawContent)) : "",
      publishedDate: rawPublished.slice(0, 10),
    });
  }

  return entries;
}

// Never throws — a broken/rate-limited feed must not take down the whole
// google-alerts-discovery run, same defensive posture as every other
// bright-source fetch in this codebase.
export async function fetchGoogleAlertEntries(feedUrl: string): Promise<GoogleAlertEntry[]> {
  try {
    const res = await fetch(feedUrl);
    if (!res.ok) {
      console.error(`[google-alerts-discovery] feed responded ${res.status}`);
      return [];
    }
    return parseGoogleAlertFeed(await res.text());
  } catch (err) {
    console.error(`[google-alerts-discovery] failed to fetch feed: ${(err as Error).message}`);
    return [];
  }
}
