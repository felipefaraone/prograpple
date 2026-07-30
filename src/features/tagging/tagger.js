// Tagging controller for an open video (ARCHITECTURE §3, §5, §9). Owns the drop
// path: side toggle, eight quick-tags, the taxonomy palette, the keyboard, the
// in-memory tag store, the timeline, and the outbox. The <video> is reached only
// through the injected player contract (getPlayer()).

import { el, mount, clear, isTypingTarget } from '../../ui/dom.js';
import { createTimeline } from '../timeline/timeline.js';
import { createTagStore } from './store.js';
import { createOutbox } from './outbox.js';
import { fetchTagsForVideo } from './tags-data.js';
import { resolveQuickTags } from './quick-tags.js';
import { createPalette } from './palette.js';

const SIDES = { athlete: 'Athlete', opponent: 'Opponent' };

export function mountTagger({
  client,
  orgId,
  video,
  getPlayer,
  tagBarContainer,
  timelineContainer,
}) {
  const store = createTagStore();
  let side = 'athlete';

  const timeline = createTimeline(timelineContainer, {
    onSeek: (s) => getPlayer()?.seek(s),
    onDelete: (tag) => removeTag(tag),
  });

  const outbox = createOutbox(client, { onCount: paintUnsaved });

  // --- the drop / delete write path ---------------------------------------
  function drop({ taxonomyId, result }) {
    const player = getPlayer();
    const tag = {
      id: crypto.randomUUID(), // client-side id → idempotent retry (T11)
      org_id: orgId,
      video_id: video.id,
      timestamp_seconds: player ? player.time : 0,
      side,
      taxonomy_id: taxonomyId,
      result: result ?? null,
    };
    store.add(tag); // in-memory first
    timeline.addMarker(tag); // painted before any network call (§3.1)
    outbox.enqueueInsert(tag); // background flush (§3.2)
    return tag;
  }

  function removeTag(tag) {
    store.remove(tag.id);
    timeline.render(store.getAll());
    outbox.enqueueDelete(tag.id);
  }

  // --- side toggle ---------------------------------------------------------
  const sideButtons = {};
  const sideToggle = el('div', {
    class: 'side-toggle',
    role: 'group',
    'aria-label': 'Tag side',
  });
  for (const [value, label] of Object.entries(SIDES)) {
    const btn = el(
      'button',
      {
        class: `side-btn ${value}`,
        type: 'button',
        onclick: () => setSide(value),
      },
      el('span', { class: 'side-dot' }),
      label
    );
    sideButtons[value] = btn;
    sideToggle.append(btn);
  }
  function setSide(value) {
    side = value;
    for (const [v, btn] of Object.entries(sideButtons)) {
      btn.classList.toggle('on', v === side);
    }
  }

  // --- quick-tags ----------------------------------------------------------
  const quickRow = el('div', { class: 'quick-row' });
  let quickByKey = new Map();
  try {
    const quicks = resolveQuickTags(); // throws loudly if the seed disagrees
    for (const q of quicks) {
      quickByKey.set(q.key, q);
      quickRow.append(
        el(
          'button',
          {
            class: 'quick-chip',
            type: 'button',
            title: q.result ? `${q.label} (${q.result})` : q.label,
            onclick: () => drop({ taxonomyId: q.taxonomyId, result: q.result }),
          },
          el('kbd', { text: q.key }),
          el('span', { class: 'qc-label', text: q.label }),
          q.result ? el('span', { class: 'qc-res', text: q.result }) : null
        )
      );
    }
  } catch (err) {
    // Fail loudly — a developer-facing error, never a dead button (§5.3).
    console.error('[quick-tags]', err.message);
    quickRow.append(
      el('div', {
        class: 'notice error',
        text: 'Quick-tags are misconfigured (taxonomy mismatch). See the console.',
      })
    );
  }

  // --- palette -------------------------------------------------------------
  const palette = createPalette({
    onPick: (row) => drop({ taxonomyId: row.id, result: null }),
  });
  const allTagsBtn = el(
    'button',
    { class: 'btn ghost', type: 'button', onclick: () => palette.open() },
    'All tags',
    el('kbd', { text: 'T' })
  );

  // --- unsaved indicator (one, not per tag) --------------------------------
  const unsaved = el('span', { class: 'unsaved', hidden: 'hidden' });
  function paintUnsaved(n) {
    if (n > 0) {
      unsaved.textContent = `${n} unsaved`;
      unsaved.hidden = false;
    } else {
      unsaved.hidden = true;
    }
  }

  // --- assemble the tag bar ------------------------------------------------
  mount(
    tagBarContainer,
    el(
      'div',
      { class: 'tag-bar' },
      el(
        'div',
        { class: 'tag-bar-top' },
        sideToggle,
        allTagsBtn,
        el('span', { class: 'spacer' }),
        unsaved
      ),
      quickRow,
      el('div', {
        class: 'muted tag-hint',
        text: 'Tab side · 1–8 quick-tag · T palette · [ ] prev/next · Alt-click a marker to remove',
      })
    )
  );

  // --- keyboard (§9) — transport keys live in the player module; these are the
  //     tagging keys. Suppressed while typing (e.g. the palette search).
  const onKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;
    const key = event.key;
    if (key === 'Tab') {
      event.preventDefault(); // it is a browser nav key
      setSide(side === 'athlete' ? 'opponent' : 'athlete');
    } else if (key === 't' || key === 'T') {
      event.preventDefault();
      palette.open();
    } else if (key === '[') {
      event.preventDefault();
      const prev = store.prevBefore(getPlayer()?.time ?? 0);
      if (prev) getPlayer()?.seek(prev.timestamp_seconds);
    } else if (key === ']') {
      event.preventDefault();
      const next = store.nextAfter(getPlayer()?.time ?? 0);
      if (next) getPlayer()?.seek(next.timestamp_seconds);
    } else if (key === 'Escape') {
      if (palette.isOpen()) palette.close();
    } else if (key >= '1' && key <= '8') {
      const q = quickByKey.get(key);
      if (q) {
        event.preventDefault();
        drop({ taxonomyId: q.taxonomyId, result: q.result });
      }
    }
  };
  document.addEventListener('keydown', onKeyDown);

  // --- hydrate from the database (same store the drops feed) ----------------
  setSide('athlete');
  timeline.setDuration(getPlayer()?.duration ?? video.duration_seconds);
  (async () => {
    const { data, error } = await fetchTagsForVideo(client, orgId, video.id);
    if (error) return;
    store.set(data);
    timeline.render(store.getAll());
  })();

  return {
    // Called when the player reports its real duration, to reposition markers.
    refreshDuration() {
      timeline.setDuration(getPlayer()?.duration ?? video.duration_seconds);
      timeline.render(store.getAll());
    },
    destroy() {
      document.removeEventListener('keydown', onKeyDown);
      palette.destroy();
      outbox.drain(); // best-effort: let pending inserts/deletes finish
      clear(tagBarContainer);
    },
  };
}
