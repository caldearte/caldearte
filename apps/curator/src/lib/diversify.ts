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
export function diversifyByComuna<T extends { comunaName: string | null }>(events: T[], cap: number): T[] {
  const buckets = new Map<string, T[]>();
  for (const e of events) {
    const key = e.comunaName ?? "__none__";
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key)!.push(e);
  }
  const bucketKeys = Array.from(buckets.keys());
  const result: T[] = [];
  for (let round = 0; result.length < cap; round++) {
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
