// Timeline component (ARCHITECTURE §4.1 layout). Renders from a tags array — the
// caller passes the in-memory store's snapshot, which is seeded from the database
// on open and mutated on every drop, so both the initial/reload render and the
// live drop render read the same single source (CONVENTIONS §9).
//
// render(tags) does a full rebuild (hydrate / reload / after delete). addMarker(tag)
// appends ONE marker for the hot path, so keypress-to-paint stays O(1) regardless
// of how many tags already exist. Both build markers through the same markerEl()
// so the two paths cannot diverge.

import { el, clear } from '../../ui/dom.js';

export function createTimeline(container, { onSeek, onDelete } = {}) {
  const athleteLane = el('div', { class: 'tl-lane athlete' });
  const opponentLane = el('div', { class: 'tl-lane opponent' });
  const track = el(
    'div',
    { class: 'timeline' },
    athleteLane,
    el('div', { class: 'tl-line' }),
    opponentLane
  );
  const emptyNote = el('div', {
    class: 'tl-empty muted',
    text: 'No tags yet.',
  });
  clear(container);
  container.append(track, emptyNote);

  let span = null; // video duration, for positioning

  function markerEl(tag) {
    const marker = el('button', {
      class: 'tl-marker',
      type: 'button',
      title: `Seek to ${Math.round(tag.timestamp_seconds)}s · right-click or Alt-click to remove`,
      'aria-label': `Tag at ${Math.round(tag.timestamp_seconds)} seconds`,
      // Left-click seeks (§7); Alt-click or right-click removes a mis-drop (§3.1).
      onclick: (event) => {
        if (event.altKey) onDelete?.(tag);
        else onSeek?.(Number(tag.timestamp_seconds));
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        onDelete?.(tag);
      },
    });
    if (span != null && span > 0) {
      const pct = Math.min(
        100,
        Math.max(0, (Number(tag.timestamp_seconds) / span) * 100)
      );
      marker.style.left = `${pct}%`;
    }
    return marker;
  }

  function laneFor(tag) {
    return tag.side === 'opponent' ? opponentLane : athleteLane;
  }

  function refreshEmpty() {
    const count =
      athleteLane.childElementCount + opponentLane.childElementCount;
    emptyNote.hidden = count > 0;
  }

  return {
    setDuration(d) {
      span = Number.isFinite(d) && d > 0 ? d : null;
    },
    render(tags) {
      clear(athleteLane);
      clear(opponentLane);
      for (const tag of tags) laneFor(tag).append(markerEl(tag));
      refreshEmpty();
    },
    // Hot path: append a single marker (§3.1).
    addMarker(tag) {
      laneFor(tag).append(markerEl(tag));
      refreshEmpty();
    },
  };
}
