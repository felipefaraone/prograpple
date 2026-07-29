// Timeline container (ARCHITECTURE §4.1 layout, §6 read discipline). Renders from
// PERSISTED tags for the open video — athlete tags above the line, opponent below,
// click a marker to seek. There are no tags yet, so it shows its empty state; that
// is correct. It reads from the database via the paging helper, never a hardcoded
// array (CONVENTIONS §11 "nothing scenographic"). Tag WRITING arrives with tagging.

import { el, mount } from '../../ui/dom.js';
import { fetchAllPaged } from '../../lib/paged.js';

const TAG_COLS = 'id, org_id, video_id, timestamp_seconds, side, taxonomy_id';

export async function renderTimeline(
  container,
  { client, orgId, videoId, duration, onSeek }
) {
  mount(container, el('div', { class: 'muted', text: 'Loading timeline…' }));

  const { data, error } = await fetchAllPaged(client, {
    table: 'tags',
    columns: TAG_COLS,
    eq: { org_id: orgId, video_id: videoId },
    orderColumn: 'timestamp_seconds',
    ascending: true,
    tiebreak: 'id',
  });

  if (error) {
    mount(
      container,
      el('div', { class: 'notice error', text: 'Could not load the timeline.' })
    );
    return;
  }

  const track = el(
    'div',
    { class: 'timeline' },
    el('div', { class: 'tl-lane athlete' }),
    el('div', { class: 'tl-line' }),
    el('div', { class: 'tl-lane opponent' })
  );

  if (!data.length) {
    // Explicit empty state — no fabricated markers.
    mount(
      container,
      el(
        'div',
        {},
        track,
        el('div', { class: 'tl-empty muted', text: 'No tags yet.' })
      )
    );
    return;
  }

  const span = Number.isFinite(duration) && duration > 0 ? duration : null;
  const athleteLane = track.querySelector('.tl-lane.athlete');
  const opponentLane = track.querySelector('.tl-lane.opponent');

  for (const tag of data) {
    const lane = tag.side === 'opponent' ? opponentLane : athleteLane;
    const marker = el('button', {
      class: 'tl-marker',
      type: 'button',
      title: `Seek to ${tag.timestamp_seconds}s`,
      'aria-label': `Seek to ${tag.timestamp_seconds} seconds`,
      onclick: () => onSeek?.(Number(tag.timestamp_seconds)),
    });
    if (span != null) {
      const pct = Math.min(
        100,
        Math.max(0, (Number(tag.timestamp_seconds) / span) * 100)
      );
      marker.style.left = `${pct}%`;
    }
    lane.append(marker);
  }

  mount(container, track);
}
