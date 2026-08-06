// Tag list for the open video (Step 7, Slice 1): a read-only render of the
// in-memory tag store — the SAME source the timeline reads (CONVENTIONS §9), so
// the two never disagree. Category + term come from the already-loaded taxonomy
// resolved in memory by taxonomy_id (a client-side join; no denormalised copy on
// the tag row, ARCHITECTURE §4.3). Filtering by side + category is client-side
// over the loaded tags (no re-query). Clicking a row seeks via the injected
// onSeek (the §2.4 player contract).
//
// This module owns the whole tag pane header: the roll-shape strip (now the category
// filter — DESIGN §1.4, amended), the side segmented filter, and the count. The strip
// is the ONE place category hue is allowed; the side/count are neutral + side colour.

import { el, clear } from '../../ui/dom.js';
import { fmtClock } from '../../ui/format.js';
import { createSegmented } from '../../ui/segmented.js';
import { allTaxonomy, categoryOf } from './taxonomy.js';
import { categoryCounts } from './roll-shape.js';

// Category display labels (the taxonomy seed's 8 categories). The canonical ORDER
// lives with categoryCounts() in roll-shape.js — the strip iterates that aggregate,
// so the list never re-derives the order.
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
  { onSeek, onSaveDetail, athleteName, opponentName } = {}
) {
  let tags = [];
  let filterSide = 'all'; // 'all' | 'athlete' | 'opponent'
  let filterCategory = 'all'; // 'all' | <category>
  let openTagId = null; // the one tag whose detail editor is expanded (Part A)
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

  const sideLabel = (side) =>
    side === 'opponent' ? opponentName || 'Opponent' : athleteName || 'Athlete';

  // The fixed control header (Part B): the roll-shape strip IS the category filter,
  // over a side segmented control, over the count. The three uppercase filter labels
  // are gone — the strip's own segment labels, the side names + dots, and the count
  // say what they are. Only the scroll region below scrolls; this header stays pinned.
  const stripEl = el('div', { class: 'rollshape' }); // category filter (the strip)
  const dot = (cls) => el('span', { class: `seg-sq ${cls}` });
  // Side filter as a segmented control (§6.11), built ONCE so its indicator animates
  // (never rebuilt on refresh). Side dots are side colour (allowed) — never category.
  const sideSeg = createSegmented({
    ariaLabel: 'Filter by side',
    value: filterSide,
    options: [
      { value: 'all', label: 'All' },
      {
        value: 'athlete',
        node: el('span', { class: 'seg-lbl' }, dot('us'), sideLabel('athlete')),
      },
      {
        value: 'opponent',
        node: el(
          'span',
          { class: 'seg-lbl' },
          dot('them'),
          sideLabel('opponent')
        ),
      },
    ],
    onChange: (v) => setSide(v),
  });
  sideSeg.root.classList.add('taglist-side-seg');
  const countEl = el('div', { class: 'taglist-count' });
  const bodyEl = el('div', { class: 'taglist-body' });
  const headerEl = el(
    'div',
    { class: 'taglist-header' },
    stripEl,
    sideSeg.root,
    countEl
  );
  const scrollEl = el('div', { class: 'taglist-scroll' }, bodyEl);
  clear(container);
  container.append(headerEl, scrollEl);

  const rowsById = new Map(); // id -> { el, tag } for the currently visible rows

  // The roll-shape strip, painted as the category filter. Segments are the one
  // aggregate (categoryCounts, CONVENTIONS §9) sized by share of tags; clicking a
  // segment filters the list to that category, clicking the active one clears it —
  // the SAME client-side filterCategory logic the chip row drove before, no re-query.
  // The active segment stays full; the rest dim, so the filter is unmistakable.
  function buildStrip() {
    clear(stripEl);
    const counts = categoryCounts(tags);
    const total = counts.reduce((sum, c) => sum + c.count, 0);
    if (!total) {
      stripEl.hidden = true; // no tags → no strip (mark the exception; §11)
      return;
    }
    stripEl.hidden = false;
    const bar = el('div', { class: 'rollshape-bar' });
    for (const { category, count } of counts) {
      const label = CAT_LABEL[category] || category;
      const isActive = filterCategory === category;
      const isDim = filterCategory !== 'all' && !isActive;
      const seg = el(
        'button',
        {
          class:
            'rollshape-seg' +
            (isActive ? ' active' : '') +
            (isDim ? ' dim' : ''),
          type: 'button',
          'data-cat': category, // CSS maps data-cat -> the muted category token
          title: `${label}: ${count}`, // full name + count on hover
          'aria-label': `Filter by ${label} (${count})`,
          'aria-pressed': isActive ? 'true' : 'false',
          onclick: () => setCategory(isActive ? 'all' : category),
        },
        el('span', { class: 'rollshape-seg-label', text: label })
      );
      seg.style.flexGrow = String(count); // sized by share of tags
      bar.append(seg);
    }
    const hint = el('div', {
      class: 'rollshape-hint',
      text:
        filterCategory === 'all'
          ? 'Click a segment to filter'
          : 'Click again to clear',
    });
    stripEl.append(bar, hint);
  }

  function setSide(v) {
    filterSide = v;
    openTagId = null; // a filter change may hide the open row
    render(tags); // client-side; no re-query
  }
  function setCategory(v) {
    filterCategory = v;
    openTagId = null;
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

    // "Detail" chip (revealed on hover, DESIGN §6.6) opens the inline editor for
    // this tag. It stops propagation so the row's own click still seeks. The label
    // stays "Detail" and just reads active when open; closing lives in the editor
    // footer (Cancel), so there is no loose second "Close".
    const actions = onSaveDetail
      ? el(
          'div',
          { class: 'taglist-actions' },
          el(
            'button',
            {
              class:
                'taglist-detail-chip' + (openTagId === tag.id ? ' on' : ''),
              type: 'button',
              'aria-expanded': openTagId === tag.id ? 'true' : 'false',
              onclick: (e) => {
                e.stopPropagation();
                openTagId = openTagId === tag.id ? null : tag.id; // one at a time
                render(tags);
              },
            },
            'Detail'
          )
        )
      : null;

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
      ),
      actions
    );
  }

  // Inline detail editor (Part A): result segmented control + note, a plain
  // awaited save via onSaveDetail (NOT the outbox). On failure the values are kept
  // and the error is shown — never a silent revert.
  function editorEl(tag) {
    let pendingResult = tag.result || 'none';
    const resultSeg = createSegmented({
      ariaLabel: 'Result',
      value: pendingResult,
      options: [
        { value: 'scored', label: 'Scored' },
        { value: 'attempted', label: 'Attempted' },
        { value: 'defended', label: 'Defended' },
        { value: 'none', label: 'None' },
      ],
      onChange: (v) => {
        pendingResult = v;
      },
    });
    const noteInput = el('textarea', {
      class: 'taglist-note-input',
      rows: '2',
      placeholder: 'Add a note…',
      'aria-label': 'Note',
    });
    noteInput.value = tag.note || '';

    const status = el('span', {
      class: 'taglist-save-status',
      hidden: 'hidden',
    });
    const saveBtn = el(
      'button',
      { class: 'btn primary', type: 'button' },
      'Save'
    );
    const cancelBtn = el(
      'button',
      {
        class: 'btn ghost',
        type: 'button',
        onclick: () => {
          openTagId = null;
          render(tags);
        },
      },
      'Cancel'
    );

    saveBtn.onclick = async () => {
      status.hidden = false;
      status.classList.remove('error');
      status.textContent = 'Saving…';
      saveBtn.disabled = true;
      const result = pendingResult === 'none' ? null : pendingResult;
      const note = noteInput.value.trim() ? noteInput.value.trim() : null;
      const res = await onSaveDetail(tag.id, { result, note });
      if (res && res.ok) {
        openTagId = null;
        render(tags); // reflects the new badge/note; editor collapses
      } else {
        // Surface the failure; keep the entered values (no silent revert).
        status.textContent =
          res?.error?.message || 'Could not save. Try again.';
        status.classList.add('error');
        saveBtn.disabled = false;
      }
    };

    return el(
      'div',
      { class: 'taglist-editor' },
      el(
        'div',
        { class: 'taglist-field' },
        el('label', { text: 'Result' }),
        el('div', { class: 'taglist-result' }, resultSeg.root)
      ),
      el(
        'div',
        { class: 'taglist-field' },
        el('label', { text: 'Note' }),
        noteInput
      ),
      // Status left; Cancel + Save grouped and right-aligned, Save primary.
      el('div', { class: 'taglist-editor-foot' }, status, cancelBtn, saveBtn)
    );
  }

  function render(next) {
    tags = next || [];
    buildStrip();
    sideSeg.setValue(filterSide); // reflect state; no fromClick → no onChange loop

    const rows = visible();
    // Count: "N tags" at rest; "M of N" once a category is picked, with a graphite
    // chip (§1.4 — never category-coloured) naming it and an × that clears the filter
    // (same as clicking the active segment again). N is the side-filtered total the
    // category narrows, so "3 of 12" reads as "3 in this category, of 12 on this side".
    clear(countEl);
    if (filterCategory === 'all') {
      countEl.textContent = `${rows.length} ${rows.length === 1 ? 'tag' : 'tags'}`;
    } else {
      const sideTotal = tags.filter(
        (t) => filterSide === 'all' || t.side === filterSide
      ).length;
      const label = CAT_LABEL[filterCategory] || filterCategory;
      countEl.append(
        el('span', {
          class: 'taglist-count-n',
          text: `${rows.length} of ${sideTotal}`,
        }),
        el(
          'button',
          {
            class: 'taglist-clear',
            type: 'button',
            title: 'Clear filter',
            'aria-label': `Clear ${label} filter`,
            onclick: () => setCategory('all'),
          },
          el('span', { text: label }),
          el('span', {
            class: 'taglist-clear-x',
            'aria-hidden': 'true',
            text: '×',
          })
        )
      );
    }

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
      const isOpen = onSaveDetail && openTagId === t.id;
      const item = el('div', {
        class: 'taglist-item' + (isOpen ? ' open' : ''),
      });
      item.append(r);
      if (isOpen) item.append(editorEl(t));
      bodyEl.append(item);
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
