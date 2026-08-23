// Round-robins across comunas (each comuna's own items kept in their
// incoming order) so a capped list favors breadth across the región
// instead of letting one comuna with many candidates crowd out everything
// else. Comuna order follows each comuna's own first appearance in the
// input, i.e. still roughly whatever order the caller pre-sorted by
// (soonest-closing-first, etc). Originally newsletter/run.ts-only
// (2026-08-08, user request: "ojalá de distintas comunas"); extracted here
// 2026-08-22 when the social-publish pipeline needed the exact same
// behavior for its own carousels — same reasoning applies nationwide, not
// just within one región.
// maxPerComuna (default unlimited, same as before it existed) caps how
// many items ANY single comuna can contribute, regardless of how many
// rounds run — round IS each bucket's own per-comuna index, so bounding
// the round loop bounds every bucket identically. Added 2026-08-23,
// social-publish only: without it, once every OTHER comuna's (usually
// short) supply ran out, every remaining round only had Santiago left to
// pull from, so a nationwide list still ended up mostly Santiago — real
// complaint from Daniel after reviewing a real "no te la pierdas" post.
// Trades a shorter carousel for real diversity instead of backfilling
// with repeats from the same comuna once others are exhausted.
export function diversifyByComuna<T extends { comunaName: string | null }>(events: T[], cap: number, maxPerComuna = Infinity): T[] {
  const buckets = new Map<string, T[]>();
  for (const e of events) {
    const key = e.comunaName ?? "__none__";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }
  const bucketKeys = Array.from(buckets.keys());
  const result: T[] = [];
  for (let round = 0; round < maxPerComuna && result.length < cap; round++) {
    let addedInRound = false;
    for (const key of bucketKeys) {
      const bucket = buckets.get(key)!;
      if (round < bucket.length) {
        result.push(bucket[round]);
        addedInRound = true;
        if (result.length >= cap) break;
      }
    }
    if (!addedInRound) break;
  }
  return result;
}
