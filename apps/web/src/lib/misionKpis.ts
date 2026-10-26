// Misión — the /admin home since 2026-10-25 (Daniel): the handful of
// numbers that say whether Caldearte is doing what it's for, each against
// the goal set for the fundación conversation (June 2027). Everything
// that measures the machine (costs, sources, runs) lives on the other
// /admin pages.
//
// Every tile uses fixed windows ending today, never the old period
// toggle, so a number means the same thing every visit. Shares use the
// last 90 days of openings (past only, today included). The
// venue_kind_share view also counts upcoming openings, so it can read a
// point or two apart.
//
// Pure functions over the admin-analytics payload, same posture as
// audienceSignals.ts — the caller passes `now`, so this is testable.

import { followersSignal, submissionsSignal, subscribersSignal, type AudienceSignal, type SignalSeriesPoint } from "./audienceSignals";

export const MISION_DEADLINE_LABEL = "jun 2027";

// Set in the 2026-10-25 conversation about the fundación: what a donor
// would need to see. A range's low end is the target; the label keeps
// the whole range.
export const MISION_GOALS = {
  followers: { target: 1500, label: "1.500–2.000" },
  subscribers: { target: 300, label: "300–500" },
  events30d: { target: 150, label: "150+ sostenido" },
  outsideRmPct: { target: 50, label: "50%" },
  submissions: { target: 20, label: "20–30" },
} as const;

export const VENUE_KINDS = ["institucional", "municipal", "independiente"] as const;
export type VenueKind = (typeof VENUE_KINDS)[number];

const RM = "Región Metropolitana de Santiago";
const WINDOW_SHORT = 30;
const WINDOW_LONG = 90;
const SERIES_DAYS = 90;

export interface MisionEvent {
  openingDate: string | null;
  adminRegionName: string | null;
  venueId?: string | null;
  venueKind?: string | null;
}

export interface MisionWebEvent {
  createdAt: string;
  country: string | null;
}

export interface MisionKpi extends AudienceSignal {
  format: "count" | "pct";
}

function addDays(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function seriesDays(today: string): string[] {
  const out: string[] = [];
  for (let d = addDays(today, -(SERIES_DAYS - 1)); d <= today; d = addDays(d, 1)) out.push(d);
  return out;
}

function inWindow(date: string | null, end: string, days: number): boolean {
  return date !== null && date <= end && date >= addDays(end, -(days - 1));
}

// A KPI recomputed for every day of the series as if that day were
// today — so the 30-day delta compares like with like.
function rollingKpi(valueOn: (day: string) => number | null, today: string, format: MisionKpi["format"]): MisionKpi {
  const series: SignalSeriesPoint[] = [];
  for (const day of seriesDays(today)) {
    const v = valueOn(day);
    if (v !== null) series.push({ date: day, value: v });
  }
  const value = valueOn(today);
  const before = valueOn(addDays(today, -WINDOW_SHORT));
  return {
    value,
    delta30d: value !== null && before !== null ? round1(value - before) : null,
    sinceStart: null,
    series,
    format,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export function events30dKpi(events: MisionEvent[], now: Date): MisionKpi {
  const today = now.toISOString().slice(0, 10);
  return rollingKpi((day) => events.filter((e) => inWindow(e.openingDate, day, WINDOW_SHORT)).length, today, "count");
}

// Events with no región don't count on either side.
export function outsideRmPctKpi(events: MisionEvent[], now: Date): MisionKpi {
  const today = now.toISOString().slice(0, 10);
  return rollingKpi(
    (day) => {
      const recent = events.filter((e) => e.adminRegionName !== null && inWindow(e.openingDate, day, WINDOW_LONG));
      if (recent.length === 0) return null;
      return round1((100 * recent.filter((e) => e.adminRegionName !== RM).length) / recent.length);
    },
    today,
    "pct",
  );
}

// Intent clicks from Chile (or no geo header) — the Meta datacenter
// traffic comes from abroad, see web_events' migration comment.
export function intentClicksKpi(webEvents: MisionWebEvent[], now: Date): MisionKpi {
  const today = now.toISOString().slice(0, 10);
  const local = webEvents.filter((w) => w.country === null || w.country === "CL").map((w) => w.createdAt.slice(0, 10));
  return rollingKpi((day) => local.filter((d) => inWindow(d, day, WINDOW_SHORT)).length, today, "count");
}

export interface VenueKindShare {
  kind: VenueKind | "sin_clasificar";
  events: number;
  pct: number;
}

export interface VenueKindSummary {
  recent: VenueKindShare[];
  allTime: VenueKindShare[];
  unclassifiedVenues: number;
  independientePct: MisionKpi;
}

function shares(events: MisionEvent[]): VenueKindShare[] {
  const withVenue = events.filter((e) => e.venueId);
  const count = (k: string | null) => withVenue.filter((e) => (e.venueKind ?? null) === k).length;
  const rows: VenueKindShare[] = [...VENUE_KINDS.map((k) => ({ kind: k, events: count(k) })), { kind: "sin_clasificar" as const, events: count(null) }]
    .filter((r) => r.kind !== "sin_clasificar" || r.events > 0)
    .map((r) => ({ ...r, pct: withVenue.length ? round1((100 * r.events) / withVenue.length) : 0 }));
  return rows;
}

export function venueKindSummary(events: MisionEvent[], now: Date): VenueKindSummary {
  const today = now.toISOString().slice(0, 10);
  const recentOn = (day: string) => events.filter((e) => inWindow(e.openingDate, day, WINDOW_LONG));
  const unclassified = new Set(events.filter((e) => e.venueId && !e.venueKind).map((e) => e.venueId));
  return {
    recent: shares(recentOn(today)),
    allTime: shares(events),
    unclassifiedVenues: unclassified.size,
    independientePct: rollingKpi(
      (day) => {
        const recent = recentOn(day).filter((e) => e.venueId);
        if (recent.length === 0) return null;
        return round1((100 * recent.filter((e) => e.venueKind === "independiente").length) / recent.length);
      },
      today,
      "pct",
    ),
  };
}

export interface RegionCoverageRow {
  adminRegionName: string;
  events30d: number;
  events90d: number;
  pct90d: number;
}

export function regionCoverage(events: MisionEvent[], regions: readonly string[], now: Date): RegionCoverageRow[] {
  const today = now.toISOString().slice(0, 10);
  const recent = events.filter((e) => inWindow(e.openingDate, today, WINDOW_LONG));
  const total = recent.filter((e) => e.adminRegionName !== null).length;
  return regions.map((name) => {
    const events90d = recent.filter((e) => e.adminRegionName === name).length;
    return {
      adminRegionName: name,
      events30d: events.filter((e) => e.adminRegionName === name && inWindow(e.openingDate, today, WINDOW_SHORT)).length,
      events90d,
      pct90d: total ? round1((100 * events90d) / total) : 0,
    };
  });
}

export interface MisionData {
  followers: MisionKpi;
  subscribers: MisionKpi;
  events30d: MisionKpi;
  outsideRmPct: MisionKpi;
  submissions: MisionKpi;
  intentClicks: MisionKpi;
  venueKinds: VenueKindSummary;
}

export function computeMision(
  data: {
    events: MisionEvent[];
    instagramAccountSnapshots: Array<{ snapshotDate: string; followersCount: number }>;
    newsletterSubscribers?: Array<{ createdAt: string; confirmedAt: string | null; unsubscribedAt: string | null }>;
    submittedEvents?: Array<{ createdAt: string }>;
    webEvents?: MisionWebEvent[];
  },
  now: Date,
): MisionData {
  return {
    followers: { ...followersSignal(data.instagramAccountSnapshots, now), format: "count" },
    subscribers: { ...subscribersSignal(data.newsletterSubscribers ?? [], now), format: "count" },
    events30d: events30dKpi(data.events, now),
    outsideRmPct: outsideRmPctKpi(data.events, now),
    submissions: { ...submissionsSignal(data.submittedEvents ?? [], now), format: "count" },
    intentClicks: intentClicksKpi(data.webEvents ?? [], now),
    venueKinds: venueKindSummary(data.events, now),
  };
}
