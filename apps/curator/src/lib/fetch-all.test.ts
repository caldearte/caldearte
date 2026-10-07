import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchAllRows } from "./fetch-all.js";

function fakeTable(total: number) {
  const calls: Array<[number, number]> = [];
  const fetchPage = async (from: number, to: number) => {
    calls.push([from, to]);
    const data: number[] = [];
    for (let i = from; i <= to && i < total; i++) data.push(i);
    return { data, error: null };
  };
  return { fetchPage, calls };
}

test("fetchAllRows reads every page of a table larger than the 1000-row cap", async () => {
  const { fetchPage, calls } = fakeTable(2500);
  const rows = await fetchAllRows(fetchPage);
  assert.equal(rows.length, 2500);
  assert.equal(new Set(rows).size, 2500, "no row twice, none skipped");
  assert.deepEqual(calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test("fetchAllRows stops after one page for a small table, and after an empty page when the total is an exact multiple of the page size", async () => {
  const small = fakeTable(37);
  assert.equal((await fetchAllRows(small.fetchPage)).length, 37);
  assert.equal(small.calls.length, 1);

  const exact = fakeTable(2000);
  assert.equal((await fetchAllRows(exact.fetchPage)).length, 2000);
  assert.equal(exact.calls.length, 3, "a full page is not proof there is nothing after it");
});

test("fetchAllRows surfaces a failing page instead of returning a partial list", async () => {
  const fetchPage = async (from: number) => (from === 0 ? { data: Array.from({ length: 1000 }, (_, i) => i), error: null } : { data: null, error: { message: "boom" } });
  await assert.rejects(() => fetchAllRows(fetchPage), /boom/);
});
