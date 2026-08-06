// Roll-shape aggregate (Step 7, Slice 2 — Part B): a read-only view of the round's
// "shape" — how this video's tags distribute across categories. The strip that
// paints this lives in the tag list (it is also the category filter now — DESIGN
// §1.4, amended), which is the ONE place category hue is allowed; everywhere else
// category is text. Pure over the already-in-memory tags (no new query, no re-fetch).
//
// categoryCounts() is the SINGLE function that produces the (category, count)
// aggregate (CONVENTIONS §9) — the tag-list strip is its only caller; counts are
// computed nowhere else.

import { allTaxonomy, categoryOf } from './taxonomy.js';

const CAT_ORDER = [
  'position',
  'pass',
  'sweep',
  'takedown',
  'back',
  'legs',
  'submission',
  'event',
];
// The one aggregate: tags -> [{ category, count }] for categories present, in the
// canonical order. Joins taxonomy_id -> category via the in-memory taxonomy.
export function categoryCounts(tags) {
  const index = new Map(allTaxonomy().map((r) => [r.id, r]));
  const counts = new Map();
  for (const t of tags || []) {
    const row = index.get(t.taxonomy_id);
    const cat = row ? row.category : categoryOf(t.taxonomy_id) || 'unknown';
    counts.set(cat, (counts.get(cat) || 0) + 1);
  }
  return CAT_ORDER.filter((c) => counts.has(c)).map((c) => ({
    category: c,
    count: counts.get(c),
  }));
}
