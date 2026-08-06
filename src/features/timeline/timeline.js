// Timeline (ARCHITECTURE §4.1 / DESIGN §6.5): a single OVERVIEW band for the whole
// roll. Every marker sits at its TRUE x, never nudged. Markers whose true positions
// fall within one marker-footprint of each other collapse into a single, slightly
// wider CLUSTER marker with a count badge.
//
// "Read the tags that sit close together" is on demand: hovering or focusing a
// cluster badge opens a small popover listing its tags (timestamp + side + term),
// each row seeking to that tag. The popover mounts at the app ROOT, never inside the
// band's clip box (CONVENTIONS §11), so it is never cut off. This replaces the old
// permanent 20s detail band — same information, only when asked for.
//
// The two lanes (athlete --us-soft top, opponent --them-soft bottom), the lane
// tints, the side colours and the playhead are unchanged. The public API
// (setDuration / setPlayhead / render / addMarker) is unchanged, so the tagging
// controller is untouched.

import { el, clear } from '../../ui/dom.js';
import { allTaxonomy } from '../tagging/taxonomy.js';

// A marker is 4px wide with a 1.5px white halo each side — a ~7px footprint. Two
// markers whose true x-positions fall within that footprint are visually
// indistinguishable, so they collapse into one cluster. The cluster sits at the
// EARLIEST member's true x; no member is ever moved off its timestamp.
const CLUSTER_PX = 7;

// Grace window when the pointer leaves a badge/popover, so a diagonal move from the
// badge onto the popover does not dismiss it before it is reached.
const POP_GRACE_MS = 140;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function sideKeyOf(tag) {
  return tag.side === 'opponent' ? 'opponent' : 'athlete';
}

// taxonomy_id -> term, resolved from the already-in-memory taxonomy (the SAME source
// the tag list joins against; no fetch, no query). Built lazily and rebuilt if the
// taxonomy was not loaded yet at first use.
let termIndex = null;
function termOf(taxonomyId) {
  if (!termIndex || termIndex.size === 0) {
    termIndex = new Map(allTaxonomy().map((r) => [r.id, r.term]));
  }
  return termIndex.get(taxonomyId) || 'Unknown tag';
}

export function createTimeline(container, { onSeek, onDelete, onChange } = {}) {
  // --- overview band (the single timeline) ----------------------------------
  const ovBuffer = el('div', { class: 'tl-buffer' });
  const ovMarkers = el('div', { class: 'tl-markers' });
  const ovPlayhead = el('div', { class: 'tl-playhead' });
  const ovHover = el('div', { class: 'tl-hover-time', text: '0:00' });
  const ovBand = el(
    'div',
    { class: 'tl tl-overview' },
    el('div', { class: 'tl-track' }),
    ovBuffer,
    ovMarkers,
    ovPlayhead,
    ovHover
  );

  const bands = el(
    'div',
    { class: 'tl-bands' },
    el(
      'div',
      { class: 'tl-row' },
      el('span', { class: 'tl-cap', text: 'Overview' }),
      ovBand
    )
  );

  clear(container);
  container.append(el('div', { class: 'tl-wrap' }, bands));

  let span = null; // duration in seconds
  let playheadSec = 0;
  let tags = []; // the store snapshot the caller renders

  function pctFromEvent(band, event) {
    const r = band.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
  }

  // --- cluster popover (mounts at the app ROOT, CONVENTIONS §11) -------------
  // One at a time. Built on open, appended to document.body, removed on close — so
  // when closed it holds no DOM and leaks nothing across renders/instances.
  let popEl = null;
  let popRows = [];
  let popIndex = -1;
  let anchorBadge = null;
  let closeTimer = null;

  function cancelClose() {
    if (closeTimer) {
      clearTimeout(closeTimer);
      closeTimer = null;
    }
  }
  function scheduleClose() {
    cancelClose();
    closeTimer = setTimeout(closePopover, POP_GRACE_MS);
  }
  function closePopover() {
    cancelClose();
    if (!popEl) return;
    popEl.remove();
    popEl = null;
    popRows = [];
    popIndex = -1;
    anchorBadge = null;
    window.removeEventListener('scroll', closePopover, true);
    document.removeEventListener('keydown', onPopKey, true);
  }

  // Place the fixed popover: centred over the badge, opening ABOVE it, flipping BELOW
  // when there is not enough room above. Clamped to the viewport; the caret tracks
  // the badge centre. Coordinates are viewport-relative (getBoundingClientRect +
  // position:fixed), so no offset math against scroll position is needed.
  function positionPopover() {
    if (!popEl || !anchorBadge) return;
    const b = anchorBadge.getBoundingClientRect();
    const p = popEl.getBoundingClientRect();
    const GAP = 8;
    const MARGIN = 8;
    const cx = b.left + b.width / 2;
    let left = cx - p.width / 2;
    left = Math.min(
      window.innerWidth - MARGIN - p.width,
      Math.max(MARGIN, left)
    );
    const flip = b.top - GAP - p.height < MARGIN; // no room above → open below
    const top = flip ? b.bottom + GAP : b.top - GAP - p.height;
    popEl.style.left = `${left}px`;
    popEl.style.top = `${top}px`;
    popEl.classList.toggle('flip', flip);
    const caret = popEl.querySelector('.tl-cluster-pop-caret');
    if (caret) {
      const caretX = Math.min(p.width - 12, Math.max(12, cx - left));
      caret.style.left = `${caretX}px`;
    }
  }

  function onPopKey(event) {
    if (!popEl) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      const badge = anchorBadge;
      closePopover();
      badge?.focus(); // return focus to where the coach was
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!popRows.length) return;
      popIndex =
        event.key === 'ArrowDown'
          ? (popIndex + 1) % popRows.length
          : (popIndex - 1 + popRows.length) % popRows.length;
      popRows[popIndex].focus();
    }
    // Enter/Space on a focused row fires the button's native click (seek + close).
  }

  function openPopover(members, badge, focusFirst) {
    // Re-entering the same badge while it is open: just keep it open (no rebuild,
    // no flicker).
    if (popEl && anchorBadge === badge) {
      cancelClose();
      return;
    }
    closePopover(); // enforce one-at-a-time
    anchorBadge = badge;
    const list = el('div', { class: 'tl-cluster-pop-list' });
    popRows = members.map((m) => {
      const row = el(
        'button',
        {
          class: 'tl-cluster-pop-row',
          type: 'button',
          role: 'menuitem',
          tabindex: '-1',
          onclick: () => {
            onSeek?.(Number(m.timestamp_seconds));
            closePopover();
          },
        },
        el('span', {
          class: 'tl-cluster-pop-time',
          text: formatTime(m.timestamp_seconds),
        }),
        el('i', {
          class: `tl-cluster-pop-dot ${sideKeyOf(m) === 'opponent' ? 'them' : 'us'}`,
        }),
        el('span', {
          class: 'tl-cluster-pop-term',
          text: termOf(m.taxonomy_id),
        })
      );
      list.append(row);
      return row;
    });
    popEl = el(
      'div',
      { class: 'tl-cluster-pop', role: 'menu' },
      el('div', { class: 'tl-cluster-pop-caret', 'aria-hidden': 'true' }),
      list
    );
    // Keep it open while the pointer is over it; leaving starts the grace close.
    popEl.addEventListener('mouseenter', cancelClose);
    popEl.addEventListener('mouseleave', scheduleClose);
    document.body.append(popEl);
    positionPopover();
    window.addEventListener('scroll', closePopover, true);
    document.addEventListener('keydown', onPopKey, true);
    if (focusFirst && popRows.length) {
      popIndex = 0;
      popRows[0].focus();
    }
  }

  // A leaf marker (single tag): left-click seeks, Alt-click or right-click removes.
  // Unchanged — the popover is only for cluster badges.
  function markerEl(tag, extraClass = '') {
    const laneClass = sideKeyOf(tag) === 'opponent' ? 'them' : 'us';
    return el('button', {
      class: `tl-marker ${laneClass}${extraClass ? ` ${extraClass}` : ''}`,
      type: 'button',
      title: `Seek to ${formatTime(tag.timestamp_seconds)} · Alt-click or right-click to remove`,
      'aria-label': `Tag at ${Math.round(tag.timestamp_seconds)} seconds`,
      onclick: (event) => {
        if (event.altKey) onDelete?.(tag);
        else onSeek?.(Number(tag.timestamp_seconds));
      },
      oncontextmenu: (event) => {
        event.preventDefault();
        onDelete?.(tag);
      },
    });
  }

  // A cluster marker (2+ tags): wider, a count badge. Hover / focus / activate opens
  // the root popover listing its members; each member seeks. Positioned at the
  // earliest member's TRUE x (clustering is unchanged).
  function clusterMarker(members, laneKey, xPx) {
    const laneClass = laneKey === 'opponent' ? 'them' : 'us';
    const first = members[0];
    const marker = el(
      'button',
      {
        class: `tl-marker tl-cluster ${laneClass}`,
        type: 'button',
        title: `${members.length} tags near ${formatTime(first.timestamp_seconds)}`,
        'aria-label': `${members.length} tags near ${Math.round(first.timestamp_seconds)} seconds — open list`,
        'aria-haspopup': 'menu',
        onclick: () => openPopover(members, marker, false),
        onkeydown: (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault(); // open the list instead of the default activation
            openPopover(members, marker, true);
          }
        },
      },
      el('span', { class: 'tl-cluster-badge', text: String(members.length) })
    );
    marker.style.left = `${xPx}px`;
    marker.addEventListener('mouseenter', () =>
      openPopover(members, marker, false)
    );
    marker.addEventListener('mouseleave', scheduleClose);
    return marker;
  }

  // Overview: true-x placement with pixel clustering, per lane. (Algorithm unchanged.)
  function layoutOverview() {
    closePopover(); // markers are about to be rebuilt; the anchor would go stale
    clear(ovMarkers);
    if (!span) return;
    const width = ovBand.clientWidth || 1;
    for (const laneKey of ['athlete', 'opponent']) {
      const laneTags = tags
        .filter((t) => sideKeyOf(t) === laneKey)
        .sort(
          (a, b) =>
            a.timestamp_seconds - b.timestamp_seconds ||
            (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        );
      let i = 0;
      while (i < laneTags.length) {
        const anchor = laneTags[i];
        const anchorX = (anchor.timestamp_seconds / span) * width;
        const members = [anchor];
        let j = i + 1;
        while (
          j < laneTags.length &&
          (laneTags[j].timestamp_seconds / span) * width <= anchorX + CLUSTER_PX
        ) {
          members.push(laneTags[j]);
          j++;
        }
        if (members.length === 1) {
          const m = markerEl(anchor);
          m.style.left = `${anchorX}px`;
          ovMarkers.append(m);
        } else {
          ovMarkers.append(clusterMarker(members, laneKey, anchorX));
        }
        i = j;
      }
    }
  }

  // Overview: click empty track to seek; hover shows a time pill. (Unchanged — the
  // scrub/seek handlers are left exactly as they were; only cluster hover was added.)
  ovBand.addEventListener('click', (event) => {
    if (event.target.closest('.tl-marker')) return;
    if (span) onSeek?.(pctFromEvent(ovBand, event) * span);
  });
  ovBand.addEventListener('mousemove', (event) => {
    const p = pctFromEvent(ovBand, event);
    ovHover.style.display = 'block';
    ovHover.style.left = `${p * 100}%`;
    ovHover.textContent = formatTime(p * (span || 0));
  });
  ovBand.addEventListener('mouseleave', () => {
    ovHover.style.display = 'none';
  });

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      layoutOverview();
    }).observe(bands);
  }

  return {
    setDuration(d) {
      span = Number.isFinite(d) && d > 0 ? d : null;
      layoutOverview();
    },
    setPlayhead(seconds) {
      playheadSec = Number.isFinite(seconds) ? seconds : 0;
      if (span) {
        const pct = Math.min(100, Math.max(0, (playheadSec / span) * 100));
        ovPlayhead.style.left = `${pct}%`;
        ovBuffer.style.width = `${pct}%`;
      }
    },
    render(next) {
      tags = next.slice();
      layoutOverview();
      onChange?.();
    },
    // Hot path: append one tag, then re-lay out the overview. Not the DB write path
    // (that is the tagger/outbox); this is display only.
    addMarker(tag) {
      tags.push(tag);
      layoutOverview();
      onChange?.();
    },
  };
}
