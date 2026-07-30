// The one paging helper (ARCHITECTURE §6.2, CONVENTIONS §8). Every list query
// routes through here so the row-ceiling discipline is enforced by construction:
//
//   - PostgREST silently truncates at 1000 rows with no error. Without ORDER BY
//     the dropped rows are the most recently inserted ones.
//   - So: two explicit .order() calls (the meaningful field, then id as a total-
//     ordering tiebreaker), explicit pagination in blocks, and a safety cap on
//     iterations. Returns {data, error} to drop in where a single query was.
//
// The query is rebuilt each page because a PostgREST builder is single-use.

export async function fetchAllPaged(
  client,
  {
    table,
    columns = '*',
    eq = {},
    is = {}, // { column: value } → .is() (e.g. archived_at: null for the Active view)
    notNull = [], // [column] → .not(column, 'is', null) (e.g. the Archived view)
    orderColumn,
    ascending = true,
    tiebreak = 'id',
    pageSize = 1000,
    maxPages = 10,
  }
) {
  if (!orderColumn) {
    return {
      data: null,
      error: new Error('fetchAllPaged requires an explicit orderColumn'),
    };
  }

  const all = [];
  for (let page = 0, from = 0; page < maxPages; page++, from += pageSize) {
    let query = client.from(table).select(columns);
    for (const [column, value] of Object.entries(eq)) {
      query = query.eq(column, value);
    }
    for (const [column, value] of Object.entries(is)) {
      query = query.is(column, value);
    }
    for (const column of notNull) {
      query = query.not(column, 'is', null);
    }
    query = query
      .order(orderColumn, { ascending })
      .order(tiebreak, { ascending: true })
      .range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) return { data: null, error };

    all.push(...(data || []));
    if (!data || data.length < pageSize) return { data: all, error: null };
  }

  // Hit the safety cap — return what we have rather than looping unbounded.
  return { data: all, error: null };
}
