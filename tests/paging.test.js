import { test, assertEqual, assertDeep } from './harness.js';
import { fetchAllPages } from '../js/paging.js';

// Fake server that caps every response at `cap` rows, like Supabase's max-rows.
function fakeServer(total, cap) {
  const rows = Array.from({ length: total }, (_, i) => i);
  const calls = [];
  const fetchPage = async (from, to) => { calls.push([from, to]); return rows.slice(from, Math.min(to + 1, from + cap)); };
  return { fetchPage, calls };
}

test('fetchAllPages gets every row past the 1000 cap', async () => {
  const s = fakeServer(2500, 1000);
  const rows = await fetchAllPages(s.fetchPage, 1000);
  assertEqual(rows.length, 2500);
  assertEqual(rows[2499], 2499);
  assertDeep(s.calls, [[0, 999], [1000, 1999], [2000, 2999]]);
});

test('fetchAllPages handles an exact multiple and empty tables', async () => {
  assertEqual((await fetchAllPages(fakeServer(2000, 1000).fetchPage, 1000)).length, 2000);
  assertEqual((await fetchAllPages(fakeServer(0, 1000).fetchPage, 1000)).length, 0);
});
