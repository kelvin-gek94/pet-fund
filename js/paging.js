// Supabase returns at most 1000 rows per request; keep asking until a short page comes back.
export async function fetchAllPages(fetchPage, pageSize = 1000) {
  const all = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}
