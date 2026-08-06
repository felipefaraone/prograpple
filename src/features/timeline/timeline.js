// Timeline (ARCHITECTURE §4.1 / DESIGN §6.5), rebuilt as TWO bands so position is
// never a lie:
//
//   Overview — the whole roll. Every marker sits at its TRUE x, never nudged.
//   Markers whose true positions fall within one marker-footprint of each other
//   collapse into a single, slightly wider cluster marker with a count badge;
//   hovering a cluster lists what is inside it, clicking seeks to its first tag.
//
//   Detail — a 20-second window centred on the playhead, following playback live.
//   The same tags separate naturally here because the window is small. This is
//   where the coach works during a scramble. No new gesture: it just follows.
//
// Both bands keep the two lanes, the lane tints, the side colours and the
// playhead. The lane tints plus the pairing in the room header name the lanes, so
// there is no separate legend line. The public API (setDuration / setPlayhead
// / render / addMarker) is unchanged, so the tagging controller is untouched.

import { el, clear } from '../../ui/dom.js';

// A marker is 4px wide with a 1.5px white halo each side — a ~7px footprint. Two
// markers whose true x-positions fall within that footprint are visually
// indistinguishable, so they collapse into one cluster. The cluster sits at the
// EARLIEST member's true x; no member is ever moved off its timestamp.
const CLUSTER_PX = 7;

// The detail window: 20 seconds, centred on the playhead.
const DETAIL_WINDOW = 20;

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

function sideKeyOf(tag) {
  return tag.side === 'opponent' ? 'opponent' : 'athlete';
}

export function createTimeline(container, { onSeek, onDelete, onChange } = {}) {
  // --- overview band --------------------------------------------------------
  const ovBuffer = el('div', { class: 'tl-buffer' });
  const ovMarkers = el('div', { class: 'tl-markers' });
  const ovPlayhead = el('div', { class: 'tl-playhead' });
  const ovHover = el('div', { class: 'tl-hover-time', text: '0:00' });
  const pop = el('div', { class: 'tl-pop' }); // cluster hover list
  const ovBand = el(
    'div',
    { class: 'tl tl-overview' },
    el('div', { class: 'tl-track' }),
    ovBuffer,
    ovMarkers,
    ovPlayhead,
    ovHover,
    pop
  );

  // --- detail band ----------------------------------------------------------
  const detMarkers = el('div', { class: 'tl-markers' });
  const detPlayhead = el('div', { class: 'tl-playhead tl-detail-playhead' });
  const detBand = el(
    'div',
    { class: 'tl tl-detail' },
    el('div', { class: 'tl-track' }),
    detMarkers,
    detPlayhead
  );

  // Focus-window (the "this is a zoom of the marked region" pattern): a translucent
  // viewport rectangle over the overview marks the 20s slice the detail band shows,
  // and a funnel (two lines + a faint fill) connects the viewport's edges down to
  // the full width of the detail band.
  const viewport = el('div', { class: 'tl-viewport' });
  ovBand.append(viewport);

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const mkSvg = (tag, cls) => {
    const n = document.createElementNS(SVG_NS, tag);
    n.setAttribute('class', cls);
    return n;
  };
  const connectFill = mkSvg('polygon', 'tl-connect-fill');
  const connectL = mkSvg('line', 'tl-connect-line');
  const connectR = mkSvg('line', 'tl-connect-line');
  const connectSvg = mkSvg('svg', 'tl-connect');
  connectSvg.setAttribute('aria-hidden', 'true');
  connectSvg.append(connectFill, connectL, connectR);

  const bands = el(
    'div',
    { class: 'tl-bands' },
    el(
      'div',
      { class: 'tl-row' },
      el('span', { class: 'tl-cap', text: 'Overview' }),
      ovBand
    ),
    el(
      'div',
      { class: 'tl-row' },
      el('span', { class: 'tl-cap', text: 'Detail · 20s' }),
      detBand
    ),
    connectSvg
  );

  clear(container);
  container.append(el('div', { class: 'tl-wrap' }, bands));

  let span = null; // duration in seconds
  let playheadSec = 0;
  let tags = []; // the store snapshot the caller renders
  const detailRecords = []; // { tag, el } — one persistent marker per tag

  function pctFromEvent(band, event) {
    const r = band.getBoundingClientRect();
    if (!r.width) return 0;
    return Math.min(1, Math.max(0, (event.clientX - r.left) / r.width));
  }

  // A leaf marker (single tag): left-click seeks, Alt-click or right-click removes.
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

  // A cluster marker: wider, a count badge, hover lists members, click seeks to
  // the earliest. Positioned at the earliest member's TRUE x.
  function clusterMarker(members, laneKey, xPx) {
    const laneClass = laneKey === 'opponent' ? 'them' : 'us';
    const first = members[0];
    const marker = el(
      'button',
      {
        class: `tl-marker tl-cluster ${laneClass}`,
        type: 'button',
        title: `${members.length} tags near ${formatTime(first.timestamp_seconds)} · click to seek`,
        'aria-label': `${members.length} tags near ${Math.round(first.timestamp_seconds)} seconds`,
        onclick: () => onSeek?.(Number(first.timestamp_seconds)),
      },
      el('span', { class: 'tl-cluster-badge', text: String(members.length) })
    );
    marker.style.left = `${xPx}px`;
    marker.addEventListener('mouseenter', () => showPop(members, xPx));
    marker.addEventListener('mouseleave', hidePop);
    return marker;
  }

  function showPop(members, xPx) {
    clear(pop);
    for (const m of members) {
      pop.append(
        el(
          'div',
          { class: 'tl-pop-row' },
          el('i', {
            class: `tl-pop-dot ${sideKeyOf(m) === 'opponent' ? 'them' : 'us'}`,
          }),
          formatTime(m.timestamp_seconds)
        )
      );
    }
    pop.style.left = `${xPx}px`;
    pop.style.display = 'block';
  }
  function hidePop() {
    pop.style.display = 'none';
  }

  // Overview: true-x placement with pixel clustering, per lane.
  function layoutOverview() {
    clear(ovMarkers);
    hidePop();
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

  // Detail: reposition the persistent per-tag markers inside the 20s window.
  function layoutDetail() {
    const left = playheadSec - DETAIL_WINDOW / 2;
    for (const rec of detailRecords) {
      const t = rec.tag.timestamp_seconds;
      if (t < left || t > left + DETAIL_WINDOW) {
        rec.el.style.display = 'none';
        continue;
      }
      rec.el.style.display = '';
      rec.el.style.left = `${((t - left) / DETAIL_WINDOW) * 100}%`;
    }
  }

  function buildDetail() {
    clear(detMarkers);
    detailRecords.length = 0;
    for (const tag of tags) {
      const m = markerEl(tag);
      m.style.display = 'none';
      detMarkers.append(m);
      detailRecords.push({ tag, el: m });
    }
    layoutDetail();
  }

  // Position the overview viewport rectangle over the current 20s slice and draw
  // the funnel down to the detail band's full width.
  function layoutFocus() {
    if (span) {
      const half = DETAIL_WINDOW / 2;
      const startFrac = Math.min(1, Math.max(0, (playheadSec - half) / span));
      const endFrac = Math.min(1, Math.max(0, (playheadSec + half) / span));
      viewport.style.display = 'block';
      viewport.style.left = `${startFrac * 100}%`;
      viewport.style.width = `${Math.max(0, endFrac - startFrac) * 100}%`;
    } else {
      viewport.style.display = 'none';
    }
    const wrap = bands.getBoundingClientRect();
    if (!wrap.width) return;
    const vp = viewport.getBoundingClientRect();
    const det = detBand.getBoundingClientRect();
    const rx = (v) => v - wrap.left;
    const ry = (v) => v - wrap.top;
    const vlx = rx(vp.left);
    const vrx = rx(vp.right);
    const vby = ry(vp.bottom);
    const dlx = rx(det.left);
    const drx = rx(det.right);
    const dty = ry(det.top);
    connectSvg.setAttribute('width', `${wrap.width}`);
    connectSvg.setAttribute('height', `${wrap.height}`);
    connectSvg.setAttribute('viewBox', `0 0 ${wrap.width} ${wrap.height}`);
    connectL.setAttribute('x1', `${vlx}`);
    connectL.setAttribute('y1', `${vby}`);
    connectL.setAttribute('x2', `${dlx}`);
    connectL.setAttribute('y2', `${dty}`);
    connectR.setAttribute('x1', `${vrx}`);
    connectR.setAttribute('y1', `${vby}`);
    connectR.setAttribute('x2', `${drx}`);
    connectR.setAttribute('y2', `${dty}`);
    connectFill.setAttribute(
      'points',
      `${vlx},${vby} ${vrx},${vby} ${drx},${dty} ${dlx},${dty}`
    );
  }

  // Overview: click empty track to seek; hover shows a time pill.
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

  // Detail: click empty track to seek within the window (the same seek gesture).
  detBand.addEventListener('click', (event) => {
    if (event.target.closest('.tl-marker')) return;
    const left = playheadSec - DETAIL_WINDOW / 2;
    onSeek?.(left + pctFromEvent(detBand, event) * DETAIL_WINDOW);
  });

  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(() => {
      layoutOverview();
      layoutFocus();
    }).observe(bands);
  }

  return {
    setDuration(d) {
      span = Number.isFinite(d) && d > 0 ? d : null;
      layoutOverview();
      layoutDetail();
      layoutFocus();
    },
    setPlayhead(seconds) {
      playheadSec = Number.isFinite(seconds) ? seconds : 0;
      if (span) {
        const pct = Math.min(100, Math.max(0, (playheadSec / span) * 100));
        ovPlayhead.style.left = `${pct}%`;
        ovBuffer.style.width = `${pct}%`;
      }
      layoutDetail();
      layoutFocus();
    },
    render(next) {
      tags = next.slice();
      buildDetail();
      layoutOverview();
      onChange?.();
    },
    // Hot path: append one tag, then re-lay out both bands. Not the DB write path
    // (that is the tagger/outbox); this is display only.
    addMarker(tag) {
      tags.push(tag);
      const m = markerEl(tag);
      m.style.display = 'none';
      detMarkers.append(m);
      detailRecords.push({ tag, el: m });
      layoutDetail();
      layoutOverview();
      onChange?.();
    },
  };
}
