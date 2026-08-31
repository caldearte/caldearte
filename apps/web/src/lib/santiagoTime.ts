// DST-safe "Chile wall-clock -> UTC instant" conversion, needed here
// because the "agrega tu expo" form's <input type="datetime-local">
// collects a plain local time with no offset, same shape Haiku reports in
// apps/curator/src/event-discovery/discover.ts's openingDatetime. Ported
// verbatim from apps/curator/src/lib/opening-time.ts's
// santiagoWallTimeToUtcIso/parseLocalDatetimeToUtcIso — a stable Intl-based
// algorithm, not editorial policy, so a second copy here doesn't carry the
// same drift risk @caldearte/curation-policy was extracted to avoid.
function santiagoWallTimeToUtcIso(year: number, month0: number, day: number, hour: number, minute: number): string {
  const guess = new Date(Date.UTC(year, month0, day, hour, minute));

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(guess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const santiagoHour = get("hour") % 24;
  const santiagoAsUtc = Date.UTC(get("year"), get("month") - 1, get("day"), santiagoHour, get("minute"));

  const correctionMs = guess.getTime() - santiagoAsUtc;
  return new Date(guess.getTime() + correctionMs).toISOString();
}

const LOCAL_DATETIME_PATTERN = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

export function parseLocalDatetimeToUtcIso(localDatetime: string): string | null {
  const match = localDatetime.match(LOCAL_DATETIME_PATTERN);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match;
  const y = Number(year);
  const mo = Number(month);
  const d = Number(day);
  const h = Number(hour);
  const mi = Number(minute);
  if ([y, mo, d, h, mi].some((n) => Number.isNaN(n))) return null;
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  return santiagoWallTimeToUtcIso(y, mo - 1, d, h, mi);
}
