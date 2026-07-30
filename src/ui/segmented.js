// Animated segmented control (DESIGN §4 standard scale, §6.11). ONE sliding
// indicator that moves under the active segment on a 200ms transition. Built once
// and reused across list refreshes — the control is never rebuilt, so the
// indicator actually animates instead of the whole thing being torn down and
// re-created (which is why the old per-render markup "glitched").
//
// createSegmented({ options, value, onChange, ariaLabel })
//   options: [{ value, label, node? }]   node overrides label (glyphs, a count)
// Returns { root, buttons: Map(value -> button), setValue(v), get value }.

import { el } from './dom.js';

export function createSegmented({
  options = [],
  value,
  onChange,
  ariaLabel,
} = {}) {
  let current = value ?? options[0]?.value;
  const n = Math.max(1, options.length);

  const indicator = el('div', {
    class: 'seg-indicator',
    'aria-hidden': 'true',
  });
  const root = el('div', {
    class: 'seg',
    role: 'tablist',
    'aria-label': ariaLabel || null,
  });
  root.style.setProperty('--seg-n', String(n));
  root.append(indicator);

  const buttons = new Map();
  for (const opt of options) {
    const btn = el(
      'button',
      {
        class: 'seg-btn',
        type: 'button',
        role: 'tab',
        'aria-selected': String(opt.value === current),
        onclick: () => setValue(opt.value, true),
      },
      opt.node || opt.label
    );
    buttons.set(opt.value, btn);
    root.append(btn);
  }

  function paint() {
    const idx = Math.max(
      0,
      options.findIndex((o) => o.value === current)
    );
    indicator.style.transform = `translateX(${idx * 100}%)`;
    for (const [v, btn] of buttons) {
      const on = v === current;
      btn.classList.toggle('on', on);
      btn.setAttribute('aria-selected', String(on));
    }
  }

  function setValue(v, fromClick = false) {
    if (v === current) return;
    current = v;
    paint();
    if (fromClick) onChange?.(v);
  }

  paint();
  return {
    root,
    buttons,
    setValue,
    get value() {
      return current;
    },
  };
}
