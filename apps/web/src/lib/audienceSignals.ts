// Señales de uso — the three numbers that say whether anyone uses
// Caldearte, as opposed to whether the machine works (Daniel,
// 2026-09-14): Instagram followers, confirmed newsletter subscribers, and
// exhibitions venues submitted themselves through /agrega-tu-expo. They
// are the gate for every "next phase" decision — leaving the free tiers,
// building the community layer, expanding to a second country, and
// whether Caldearte could ever earn Camila and Daniel anything — so they
// sit at the very top of /admin, framed as momentum: value now, change
// over a fixed 30-day window (independent of the page's period toggle,
// which would make a "delta" read differently every time it's flipped),
// and a cumulative sparkline over the last 90 days so a flat line reads
// as flat.
//
// Pure functions over the row-level payload the admin-analytics Edge
// Function ships, same posture as adminAnalyticsBucketing.ts — no fetch,
// no Date.now() inside (the caller passes `now`) so this is testable.

export interface SignalSeriesPoint {
  date: string; // YYYY-MM-DD
  value: number;
}

export interface AudienceSignal {
  value: number | null;
  // value now minus value 30 days ago; null when there's no data old
  // enough to compare against (a brand-new series shouldn't fake a "+N").
  delta30d: number | null;
  // Fallback for a series younger than 30 days: growth since its first
  // data point, and when that was — "+54 desde el 24 ago" says more than
  // "sin datos". null when there's no data at all.
  sinceStart: { delta: number; date: string } | null;
  series: SignalSeriesPoint[];
}

export interface AudienceSignals {
  followers: AudienceSignal;
  subscribers: AudienceSignal;
  submissions: AudienceSignal;
}

export const SIGNAL_WINDOW_DAYS = 30;
export const SIGNAL_SERIES_DAYS = 90;

function dayOnly(iso: string): string {
  return iso.slice(0, 10);
}

function addDays(dateYmd: string, days: number): string {
  const d = new Date(`${dateYmd}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function enumerateDays(from: string, to: string): string[] {
  const out: string[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}

// A count that only ever moves on discrete dated events (a signup, a
// submission, an unsubscribe): the value on any day is the number of
// "+1" events on or before it minus the "-1" events on or before it.
function cumulativeSeries(increments: string[], decrements: string[], days: string[]): SignalSeriesPoint[] {
  const inc = [...increments].sort();
  const dec = [...decrements].sort();
  let i = 0;
  let j = 0;
  let value = 0;
  return days.map((date) => {
    while (i < inc.length && inc[i] <= date) {
      value += 1;
      i += 1;
    }
    while (j < dec.length && dec[j] <= date) {
      value -= 1;
      j += 1;
    }
    return { date, value };
  });
}

function valueAt(series: SignalSeriesPoint[], date: string): number | null {
  let found: number | null = null;
  for (const p of series) {
    if (p.date <= date) found = p.value;
    else break;
  }
  return found;
}

function signalFromCumulative(increments: string[], decrements: string[], now: Date): AudienceSignal {
  const today = dayOnly(now.toISOString());
  const from = addDays(today, -(SIGNAL_SERIES_DAYS - 1));
  const all = [...increments, ...decrements].sort();
  const earliest = all[0] ?? null;
  // Series over the window, but the running total must start from the
  // full history, not from the window's first day.
  const series = cumulativeSeries(increments, decrements, enumerateDays(from, today));
  const value = series[series.length - 1]?.value ?? 0;
  const comparisonDate = addDays(today, -SIGNAL_WINDOW_DAYS);
  // No data old enough → no delta. Otherwise compare against the
  // running total as of exactly 30 days ago (which may be 0 — a series
  // that started 10 days ago with 3 signups is a genuine +3).
  const delta30d = earliest !== null && earliest <= comparisonDate ? value - (valueAt(cumulativeSeries(increments, decrements, enumerateDays(earliest, comparisonDate)), comparisonDate) ?? 0) : null;
  // For an event-driven count the series starts at 0 by definition, so
  // "since start" is simply the value itself.
  const sinceStart = earliest !== null ? { delta: value, date: earliest } : null;
  return { value, delta30d, sinceStart, series };
}

// Followers are sampled, not event-driven: the series is whatever
// snapshots exist (weekly, from instagram-insights), carried forward
// day by day so the sparkline is a step line rather than sparse dots.
export function followersSignal(snapshots: Array<{ snapshotDate: string; followersCount: number }>, now: Date): AudienceSignal {
  const sorted = [...snapshots].sort((a, b) => (a.snapshotDate < b.snapshotDate ? -1 : 1));
  if (sorted.length === 0) return { value: null, delta30d: null, sinceStart: null, series: [] };
  const today = dayOnly(now.toISOString());
  const from = addDays(today, -(SIGNAL_SERIES_DAYS - 1));
  const latestAtOrBefore = (date: string): number | null => {
    let found: number | null = null;
    for (const s of sorted) {
      if (s.snapshotDate <= date) found = s.followersCount;
      else break;
    }
    return found;
  };
  const series: SignalSeriesPoint[] = [];
  for (const date of enumerateDays(from, today)) {
    const v = latestAtOrBefore(date);
    if (v !== null) series.push({ date, value: v });
  }
  const value = sorted[sorted.length - 1].followersCount;
  const baseline = latestAtOrBefore(addDays(today, -SIGNAL_WINDOW_DAYS));
  const first = sorted[0];
  return {
    value,
    delta30d: baseline !== null ? value - baseline : null,
    sinceStart: { delta: value - first.followersCount, date: first.snapshotDate },
    series,
  };
}

// Confirmed and not unsubscribed — an unconfirmed signup is not a
// reader. A subscriber counts from the day they confirmed, not the day
// they typed their address.
export function subscribersSignal(
  rows: Array<{ createdAt: string; confirmedAt: string | null; unsubscribedAt: string | null }>,
  now: Date,
): AudienceSignal {
  const confirmed = rows.filter((r) => r.confirmedAt !== null);
  return signalFromCumulative(
    confirmed.map((r) => dayOnly(r.confirmedAt as string)),
    confirmed.filter((r) => r.unsubscribedAt !== null).map((r) => dayOnly(r.unsubscribedAt as string)),
    now,
  );
}

// Every submission counts, removed or not — see the Edge Function's
// comment: the signal is that a venue reached out.
export function submissionsSignal(rows: Array<{ createdAt: string }>, now: Date): AudienceSignal {
  return signalFromCumulative(
    rows.map((r) => dayOnly(r.createdAt)),
    [],
    now,
  );
}

export function computeAudienceSignals(
  data: {
    instagramAccountSnapshots: Array<{ snapshotDate: string; followersCount: number }>;
    newsletterSubscribers?: Array<{ createdAt: string; confirmedAt: string | null; unsubscribedAt: string | null }>;
    submittedEvents?: Array<{ createdAt: string }>;
  },
  now: Date,
): AudienceSignals {
  return {
    followers: followersSignal(data.instagramAccountSnapshots, now),
    subscribers: subscribersSignal(data.newsletterSubscribers ?? [], now),
    submissions: submissionsSignal(data.submittedEvents ?? [], now),
  };
}
