// Tag list for the open video (Step 7, Slice 1): a read-only render of the
// in-memory tag store — the SAME source the timeline reads (CONVENTIONS §9), so
// the two never disagree. Category + term come from the already-loaded taxonomy
// resolved in memory by taxonomy_id (a client-side join; no denormalised copy on
// the tag row, ARCHITECTURE §4.3). Filtering by side + category is client-side
// over the loaded tags (no re-query). Clicking a row seeks via the injected
// onSeek (the §2.4 player contract).
//
// Out of scope for this slice (Slice 2): editing result/note, the roll-shape strip.

import { el, clear } from '../../ui/dom.js';
import { fmtClock } from '../../ui/format.js';
import { allTaxonomy, categoryOf } from './taxonomy.js';

// Canonical category order + display labels (the taxonomy seed's 8 categories).
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
const RESULT_LABEL = {
  scored: 'Scored',
  attempted: 'Attempted',
  defended: 'Defended',
};

export function createTagList(
  container,
  { onSeek, athleteName, opponentName } = {}
) {
  let tags = [];
  let filterSide = 'all'; // 'all' | 'athlete' | 'opponent'
  let filterCategory = 'all'; // 'all' | <category>
  let taxIndex = null;

  // taxonomy_id -> { term, category }, resolved from the in-memory taxonomy. Built
  // lazily and rebuilt if the taxonomy was not loaded yet at first render.
  function taxOf(id) {
    if (!taxIndex || taxIndex.size === 0) {
      taxIndex = new Map(allTaxonomy().map((r) => [r.id, r]));
    }
    const row = taxIndex.get(id);
    return {
      term: row ? row.term : 'Unknown tag',
      category: row ? row.category : categoryOf(id) || 'unknown',
    };
  }

  const filtersEl = el('div', { class: 'taglist-filters' });
  const countEl = el('div', { class: 'taglist-count' });
  const bodyEl = el('div', { class: 'taglist-body' });
  clear(container);
  container.append(filtersEl, countEl, bodyEl);

  const rowsById = new Map(); // id -> { el, tag } for the currently visible rows

  const sideLabel = (side) =>
    side === 'opponent' ? opponentName || 'Opponent' : athleteName || 'Athlete';

  function presentCategories() {
    const set = new Set();
    for (const t of tags) set.add(taxOf(t.taxonomy_id).category);
    return CAT_ORDER.filter((c) => set.has(c));
  }

  function chip(label, active, onClick) {
    return el(
      'button',
      {
        class: 'taglist-chip' + (active ? ' on' : ''),
        type: 'button',
        onclick: onClick,
      },
      label
    );
  }

  function renderFilters() {
    clear(filtersEl);
    const sideRow = el(
      'div',
      { class: 'taglist-chiprow' },
      chip('All', filterSide === 'all', () => setSide('all')),
      chip(sideLabel('athlete'), filterSide === 'athlete', () =>
        setSide('athlete')
      ),
      chip(sideLabel('opponent'), filterSide === 'opponent', () =>
        setSide('opponent')
      )
    );
    filtersEl.append(sideRow);

    // Only categories that actually have tags in THIS video.
    const cats = presentCategories();
    if (cats.length) {
      const catRow = el(
        'div',
        { class: 'taglist-chiprow' },
        chip('All', filterCategory === 'all', () => setCategory('all'))
      );
      for (const c of cats) {
        catRow.append(
          chip(CAT_LABEL[c] || c, filterCategory === c, () => setCategory(c))
        );
      }
      filtersEl.append(catRow);
    }
  }

  function setSide(v) {
    filterSide = v;
    render(tags); // client-side; no re-query
  }
  function setCategory(v) {
    filterCategory = v;
    render(tags); // client-side; no re-query
  }

  function visible() {
    return tags.filter((t) => {
      if (filterSide !== 'all' && t.side !== filterSide) return false;
      if (
        filterCategory !== 'all' &&
        taxOf(t.taxonomy_id).category !== filterCategory
      ) {
        return false;
      }
      return true;
    });
  }

  function resultBadge(result) {
    if (!result) return null; // no badge when result is null (§1.5)
    const scored = result === 'scored';
    return el('span', {
      class: 'res-badge ' + (scored ? 'res-scored' : 'res-neutral'),
      text: RESULT_LABEL[result] || result,
    });
  }

  function rowEl(tag) {
    const { term, category } = taxOf(tag.taxonomy_id);
    const seek = () => onSeek?.(Number(tag.timestamp_seconds));

    const meta = el(
      'div',
      { class: 'taglist-meta' },
      el('span', { text: CAT_LABEL[category] || category })
    );
    const badge = resultBadge(tag.result);
    if (badge) meta.append(badge);
    if (tag.note)
      meta.append(el('span', { class: 'taglist-note', text: tag.note }));

    return el(
      'div',
      {
        class: 'taglist-row',
        role: 'button',
        tabindex: '0',
        onclick: seek,
        onkeydown: (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            seek();
          }
        },
      },
      el('span', {
        class: 'taglist-time',
        text: fmtClock(Number(tag.timestamp_seconds)),
      }),
      el('span', {
        class: 'taglist-bar ' + (tag.side === 'opponent' ? 'them' : 'us'),
      }),
      el(
        'div',
        { class: 'taglist-main' },
        el('div', { class: 'taglist-label', text: term }),
        meta
      )
    );
  }

  function render(next) {
    tags = next || [];
    renderFilters();
    const rows = visible();
    countEl.textContent = `${rows.length} ${rows.length === 1 ? 'tag' : 'tags'}`;

    clear(bodyEl);
    rowsById.clear();

    if (!tags.length) {
      bodyEl.append(
        el(
          'div',
          { class: 'taglist-empty' },
          el('div', { class: 'taglist-empty-title', text: 'No tags yet' }),
          el('div', { text: 'Drop one as the video plays.' })
        )
      );
      return;
    }
    if (!rows.length) {
      bodyEl.append(
        el(
          'div',
          { class: 'taglist-empty' },
          el('div', { text: 'No tags match these filters.' })
        )
      );
      return;
    }
    for (const t of rows) {
      const r = rowEl(t);
      rowsById.set(t.id, { el: r, tag: t });
      bodyEl.append(r);
    }
  }

  // Highlight the row for the current playhead time — the last visible tag at or
  // before `time`. Uses the same playhead the timeline uses (forwarded by the
  // tagger), not a second source. Light class toggle only, no rebuild.
  function setCurrent(time) {
    let currentId = null;
    for (const [id, { tag }] of rowsById) {
      if (Number(tag.timestamp_seconds) <= time + 1e-4) currentId = id;
    }
    for (const [id, { el: rEl }] of rowsById) {
      rEl.classList.toggle('current', id === currentId);
    }
  }

  return { render, setCurrent };
}
