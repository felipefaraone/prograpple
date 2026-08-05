// Tagging controller for an open video (ARCHITECTURE §3, §5, §9). Owns the drop
// path: side toggle, eight quick-tags, the taxonomy palette, the keyboard, the
// in-memory tag store, the timeline, and the outbox. The <video> is reached only
// through the injected player contract (getPlayer()).

import { el, mount, clear, isTypingTarget } from '../../ui/dom.js';
import { createTimeline } from '../timeline/timeline.js';
import { createTagList } from './tag-list.js';
import { createTagStore } from './store.js';
import { createOutbox } from './outbox.js';
import { fetchTagsForVideo } from './tags-data.js';
import { resolveQuickTags } from './quick-tags.js';
import { createPalette } from './palette.js';
import { createShortcutsOverlay } from './shortcuts.js';

// Coach-voice copy under the chips (prototype .tagbar-hint), not a key-binding list.
const COACH_HINT = 'Tags land instantly. Add detail later, only if it helps.';
const DISABLED_HINT = 'Load the video to start tagging.';

export function mountTagger({
  client,
  orgId,
  video,
  getPlayer,
  tagBarContainer,
  timelineContainer,
  tagListContainer,
  athleteName,
  opponentName,
}) {
  const store = createTagStore();
  let side = 'athlete';
  let enabled = false; // no drops until the player has a loaded source (item 10)

  // The right-pane tag list renders from the SAME store as the timeline (one
  // source, CONVENTIONS §9). It re-renders on every tag change via onTagsChanged,
  // so an optimistically-dropped tag appears with no re-fetch.
  const tagList = tagListContainer
    ? createTagList(tagListContainer, {
        onSeek: (s) => getPlayer()?.seek(s),
        athleteName,
        opponentName,
      })
    : null;

  // One "tags changed" handler for every consumer of the store snapshot.
  function onTagsChanged() {
    paintCounts();
    tagList?.render(store.getAll());
  }

  const timeline = createTimeline(timelineContainer, {
    onSeek: (s) => getPlayer()?.seek(s),
    onDelete: (tag) => removeTag(tag),
    onChange: onTagsChanged, // live side counts + tag list, off the same store
    athleteName,
    opponentName,
  });

  const outbox = createOutbox(client, { onCount: paintUnsaved });

  // --- the drop / delete write path (unchanged) ---------------------------
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

  // --- side toggle (names + live counts, prototype active state) ------------
  const SIDE_NAME = {
    athlete: athleteName || 'Athlete',
    opponent: opponentName || 'Opponent',
  };
  const sideButtons = {};
  const countEls = {};
  const sideToggle = el('div', {
    class: 'side-toggle',
    role: 'group',
    'aria-label': 'Tag side',
  });
  for (const value of ['athlete', 'opponent']) {
    const countEl = el('span', { class: 'side-count', text: '0' });
    countEls[value] = countEl;
    const btn = el(
      'button',
      {
        class: `side-btn ${value}`,
        type: 'button',
        onclick: () => setSide(value),
      },
      el('span', { class: 'side-dot' }),
      el('span', { class: 'side-name', text: SIDE_NAME[value] }),
      countEl
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
  function paintCounts() {
    const counts = { athlete: 0, opponent: 0 };
    for (const t of store.getAll()) {
      counts[t.side === 'opponent' ? 'opponent' : 'athlete']++;
    }
    countEls.athlete.textContent = String(counts.athlete);
    countEls.opponent.textContent = String(counts.opponent);
  }

  // --- quick-tags (category-colour dot + label, prototype chip) -------------
  const quickRow = el('div', { class: 'quick-row' });
  const quickByKey = new Map();
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
            onclick: () => {
              if (enabled) drop({ taxonomyId: q.taxonomyId, result: q.result });
            },
          },
          el('span', { class: 'qc-label', text: q.label })
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

  // --- palette + shortcuts overlay -----------------------------------------
  // Auto-pause the video while the palette is open so a coach searching for a term
  // is not tagging blind under moving footage; resume on close ONLY if it was
  // playing when the palette opened (contract-only: pause()/play()/paused). The
  // eight quick-tags never open the palette, so the hot path is untouched.
  let paletteWasPlaying = false;
  const palette = createPalette({
    onPick: (row) => drop({ taxonomyId: row.id, result: null }),
    onOpen: () => {
      const player = getPlayer();
      if (!player) return;
      paletteWasPlaying = !player.paused; // "was it playing" via the contract
      if (paletteWasPlaying) player.pause();
    },
    onClose: () => {
      const player = getPlayer();
      if (player && paletteWasPlaying) player.play(); // resume where it paused
      paletteWasPlaying = false;
    },
  });
  const overlay = createShortcutsOverlay();
  const allTagsBtn = el(
    'button',
    {
      class: 'btn ghost all-tags',
      type: 'button',
      onclick: () => {
        if (enabled) palette.open();
      },
    },
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
  const hint = el('div', { class: 'muted tag-hint', text: DISABLED_HINT });
  const tagBar = el(
    'div',
    { class: 'tag-bar is-disabled' },
    el(
      'div',
      { class: 'tag-bar-top' },
      sideToggle,
      allTagsBtn,
      el('span', { class: 'spacer' }),
      unsaved
    ),
    quickRow,
    hint
  );
  mount(tagBarContainer, tagBar);

  // --- keyboard (§9) — the tagging keys; transport keys live in the player
  //     module. Suppressed while typing (e.g. the palette search). --------------
  const onKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;
    const key = event.key;
    if (key === 'Tab') {
      event.preventDefault(); // it is a browser nav key
      setSide(side === 'athlete' ? 'opponent' : 'athlete');
    } else if (key === '?') {
      event.preventDefault();
      overlay.open();
    } else if (key === 't' || key === 'T') {
      event.preventDefault();
      if (enabled) palette.open();
    } else if (key === '[') {
      event.preventDefault();
      const prev = store.prevBefore(getPlayer()?.time ?? 0);
      if (prev) getPlayer()?.seek(prev.timestamp_seconds);
    } else if (key === ']') {
      event.preventDefault();
      const next = store.nextAfter(getPlayer()?.time ?? 0);
      if (next) getPlayer()?.seek(next.timestamp_seconds);
    } else if (key === 'Escape') {
      if (overlay.isOpen()) overlay.close();
      else if (palette.isOpen()) palette.close();
    } else if (key >= '1' && key <= '8') {
      const q = quickByKey.get(key);
      if (q && enabled) {
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
    timeline.render(store.getAll()); // fires onChange → paintCounts
  })();

  return {
    refreshDuration() {
      timeline.setDuration(getPlayer()?.duration ?? video.duration_seconds);
      timeline.render(store.getAll());
    },
    setPlayhead(seconds) {
      timeline.setPlayhead(seconds);
      tagList?.setCurrent(seconds); // same playhead the timeline uses
    },
    // Enable/disable dropping based on whether the player has a loaded source
    // (item 10): no source → controls unavailable, so no timestamp-0 tag.
    setEnabled(value) {
      enabled = value;
      tagBar.classList.toggle('is-disabled', !value);
      hint.textContent = value ? COACH_HINT : DISABLED_HINT;
    },
    destroy() {
      document.removeEventListener('keydown', onKeyDown);
      palette.destroy();
      overlay.destroy();
      outbox.drain(); // best-effort: let pending inserts/deletes finish
      clear(tagBarContainer);
      if (tagListContainer) clear(tagListContainer);
    },
  };
}
