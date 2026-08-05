// Roll-shape summary strip (Step 7, Slice 2 — Part B): a read-only aggregate of
// the round's "shape" — how this video's tags distribute across categories. This
// is the ONE place category hue is allowed (DESIGN §1.4); everywhere else category
// is text. Pure over the already-in-memory tags (no new query, no re-fetch).
//
// categoryCounts() is the SINGLE function that produces the (category, count)
// aggregate (CONVENTIONS §9) — the strip is its only caller; counts are computed
// nowhere else.

import { el, clear } from '../../ui/dom.js';
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
const CAT_LABEL = {
  position: 'Position',
  pass: 'Pass',
  sweep: 'Sweep',
  takedown: 'Takedown',
  back: 'Back',
  legs: 'Legs',
  submission: 'Submission',
  event: 'Event',
};

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

export function createRollShape(container) {
  clear(container);

  function render(tags) {
    clear(container);
    const counts = categoryCounts(tags);
    const total = counts.reduce((sum, c) => sum + c.count, 0);

    // Zero tags → no strip at all (mark the exception, not the empty state; §11).
    if (!total) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    const bar = el('div', { class: 'rollshape-bar' });
    const legend = el('div', { class: 'rollshape-legend' });
    for (const { category, count } of counts) {
      const label = CAT_LABEL[category] || category;
      const seg = el('div', {
        class: 'rollshape-seg',
        'data-cat': category, // CSS maps data-cat -> the muted category token
        title: `${label}: ${count}`,
        'aria-label': `${label}: ${count}`,
      });
      seg.style.flexGrow = String(count); // sized by share of tags
      bar.append(seg);

      legend.append(
        el(
          'span',
          { class: 'rollshape-key' },
          el('i', { class: 'rollshape-sw', 'data-cat': category }),
          el('span', { text: `${label} ${count}` })
        )
      );
    }

    container.append(
      el('div', { class: 'rollshape-title', text: 'Roll shape' }),
      bar,
      legend
    );
  }

  return { render };
}
