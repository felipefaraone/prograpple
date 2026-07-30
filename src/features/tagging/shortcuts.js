// Shortcuts overlay (prototype's kbd-card). `?` opens, `Esc` closes; mounts at the
// app root (CONVENTIONS §11). Content reflects the shortcuts that actually exist in
// src today — the copy tells the truth (no clip keys yet; number keys are quick-tags,
// not side select), while the layout matches the prototype.

import { el } from '../../ui/dom.js';

const ROWS = [
  ['Space', 'Play / pause'],
  ['← / →', 'Step ∓1s'],
  ['J / L', 'Step ∓5s'],
  ['Tab', 'Switch athlete / opponent'],
  ['1 … 8', 'Drop a quick tag'],
  ['T', 'Open the tag palette'],
  ['[ / ]', 'Previous / next tag'],
  ['?', 'This overlay'],
  ['Esc', 'Close palette / overlay'],
];

export function createShortcutsOverlay() {
  let open = false;

  const table = el('table', {});
  for (const [keys, desc] of ROWS) {
    const keyCell = el('td', {});
    keys.split(' / ').forEach((k, i) => {
      if (i > 0) keyCell.append(' ');
      keyCell.append(el('kbd', { text: k }));
    });
    table.append(el('tr', {}, keyCell, el('td', { text: desc })));
  }

  const card = el(
    'div',
    { class: 'kbd-card', role: 'dialog', 'aria-label': 'Keyboard shortcuts' },
    el('h4', { text: 'Shortcuts' }),
    table,
    // Speeds are buttons, not keys, documented here so the set (incl. 0.25×) is discoverable.
    el('div', {
      class: 'kbd-note',
      text: 'Playback speed 0.25× to 2×. Buttons under the video.',
    }),
    el('div', { class: 'kbd-foot', text: 'Esc closes' })
  );
  const scrim = el('div', {
    class: 'kbd-scrim',
    onclick: (e) => {
      if (e.target === scrim) close();
    },
  });
  scrim.append(card);

  function openOverlay() {
    if (open) return;
    open = true;
    document.body.append(scrim);
  }
  function close() {
    if (!open) return;
    open = false;
    scrim.remove();
  }

  return {
    open: openOverlay,
    close,
    isOpen: () => open,
    destroy: close,
  };
}
