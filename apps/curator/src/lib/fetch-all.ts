// Supabase/PostgREST caps every response at `max_rows` (1000) and says
// nothing when it truncates: a plain `.select()` over a table that has
// grown past that returns the first 1000 rows (in no stated order) as if
// it were all of them. Real bug, found 2026-10-07: loadRecentlyRejectedSourceUrls
// read rejected_candidates (3,703 rows in the 90-day window) with a plain
// select, so only ~1,000 rejected URLs were ever excluded before curation
// and ~65% of every web run's Haiku spend re-judged items already judged.
//
// Callers pass the query as a function of the row range and MUST order by
// a unique column so pages don't overlap or skip.
const PAGE_SIZE = 1000;

export interface PageResult<T> {
  data: T[] | null;
  error: { message: string } | null;
}

export async function fetchAllRows<T>(fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await fetchPage(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}
