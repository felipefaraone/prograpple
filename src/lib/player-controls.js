// Transport UI for the player (ARCHITECTURE §2.4 controls + §9 keyboard). Part of
// the player module: it drives the player ONLY through its public contract
// (togglePlay / seek / nudge / setRate / on), never the <video> element. That is
// why feature code stays free of raw element access.
//
// Keys wired now (transport only — tagging keys arrive with tagging): Space
// play/pause, ← → ∓1s, J L ∓5s. Every shortcut is suppressed while focus is in an
// input, textarea, select or contenteditable.

import { el } from '../ui/dom.js';
import { icon } from '../ui/icons.js';
import { RATES } from './player.js';

function formatTime(seconds) {
  if (!Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isTypingTarget(target) {
  if (!target) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable === true
  );
}

export function mountControls({ player, container }) {
  const playBtn = el('button', {
    class: 'ctl-btn play',
    type: 'button',
    'aria-label': 'Play',
    title: 'Play / pause (Space)',
    onclick: () => player.togglePlay(),
  });
  const setPlayIcon = () => {
    playBtn.replaceChildren(
      icon(player.paused ? 'play' : 'pause', { size: 18 })
    );
    playBtn.setAttribute('aria-label', player.paused ? 'Play' : 'Pause');
  };

  // Custom scrubber (DESIGN §6.5 playhead spec): a graphite fill on a gray rail
  // with a graphite knob ringed in white. It tracks the pointer continuously
  // through a drag (the native range only jumped to the release point) and grows
  // a ring while playing. Graphite + white only — no new hue.
  const fill = el('div', { class: 'scrub-fill' });
  const knob = el('div', { class: 'scrub-knob' });
  const scrub = el(
    'div',
    {
      class: 'scrub',
      role: 'slider',
      tabindex: '0',
      'aria-label': 'Seek',
      'aria-valuemin': '0',
      'aria-valuenow': '0',
    },
    el('div', { class: 'scrub-rail' }),
    fill,
    knob
  );
  let scrubbing = false;

  const clampPct = (p) => Math.min(1, Math.max(0, p));
  const durationOf = () =>
    Number.isFinite(player.duration) ? player.duration : 0;
  function pctFromClientX(clientX) {
    const r = scrub.getBoundingClientRect();
    return r.width ? clampPct((clientX - r.left) / r.width) : 0;
  }
  function paintScrub(pct) {
    const p = clampPct(pct) * 100;
    fill.style.width = `${p}%`;
    knob.style.left = `${p}%`;
  }
  // Move the handle and readout immediately, then seek — so the coach sees where
  // they are landing during the drag, not only on release.
  function seekToClientX(clientX) {
    const dur = durationOf();
    const p = pctFromClientX(clientX);
    const t = p * dur;
    paintScrub(p);
    scrub.setAttribute('aria-valuenow', String(Math.round(t)));
    timeLabel.textContent = `${formatTime(t)} / ${formatTime(dur)}`;
    player.seek(t);
  }
  // Drag tracking is bound to the WINDOW for the duration of a drag, so the knob
  // follows the pointer continuously even if it leaves the scrubber and even if
  // pointer capture is unavailable. This is the fix: the earlier version relied on
  // capture alone, which can silently drop moves — the knob then only jumped on
  // release. Window listeners guarantee a move on every pointermove.
  const onMove = (event) => {
    if (scrubbing) seekToClientX(event.clientX);
  };
  const endScrub = (event) => {
    if (!scrubbing) return;
    scrubbing = false;
    scrub.classList.remove('dragging');
    try {
      scrub.releasePointerCapture?.(event.pointerId);
    } catch {
      /* was never captured */
    }
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', endScrub);
    window.removeEventListener('pointercancel', endScrub);
  };
  scrub.addEventListener('pointerdown', (event) => {
    event.preventDefault(); // no text-selection / focus quirks mid-drag
    scrubbing = true;
    scrub.classList.add('dragging');
    scrub.focus?.();
    seekToClientX(event.clientX); // paint the knob first, before any capture call
    try {
      scrub.setPointerCapture?.(event.pointerId);
    } catch {
      /* capture optional — window listeners carry the drag regardless */
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', endScrub);
    window.addEventListener('pointercancel', endScrub);
  });
  // Keyboard seek; stopPropagation so the global transport keys do not also fire.
  scrub.addEventListener('keydown', (event) => {
    let handled = true;
    switch (event.key) {
      case 'ArrowLeft':
        player.nudge(-1);
        break;
      case 'ArrowRight':
        player.nudge(1);
        break;
      case 'Home':
        player.seek(0);
        break;
      case 'End':
        player.seek(durationOf());
        break;
      default:
        handled = false;
    }
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  });

  const timeLabel = el('span', { class: 'ctl-time', text: '0:00 / 0:00' });

  const nudge = (delta, label, title) =>
    el(
      'button',
      {
        class: 'ctl-btn',
        type: 'button',
        title,
        onclick: () => player.nudge(delta),
      },
      label
    );

  const speedGroup = el('div', {
    class: 'speed-group',
    role: 'group',
    'aria-label': 'Speed',
  });
  const speedButtons = RATES.map((r) => {
    const btn = el(
      'button',
      { class: 'speed', type: 'button', onclick: () => player.setRate(r) },
      `${r}×`
    );
    btn.dataset.rate = String(r);
    speedGroup.append(btn);
    return btn;
  });
  const paintSpeed = () => {
    for (const btn of speedButtons) {
      btn.classList.toggle('on', Number(btn.dataset.rate) === player.rate);
    }
  };

  const bar = el(
    'div',
    { class: 'controls' },
    playBtn,
    nudge(-5, '-5s', 'Back 5s (J)'),
    nudge(-1, '-1s', 'Back 1s (←)'),
    nudge(1, '+1s', 'Forward 1s (→)'),
    nudge(5, '+5s', 'Forward 5s (L)'),
    scrub,
    timeLabel,
    speedGroup
  );
  container.append(bar);

  // The playing state grows the knob's ring (§4 micro scale, in CSS). No hue.
  const setPlayState = () => scrub.classList.toggle('playing', !player.paused);
  const onPlayState = () => {
    setPlayIcon();
    setPlayState();
  };

  function paintTime() {
    if (!scrubbing) {
      const dur = durationOf();
      paintScrub(dur > 0 ? (player.time || 0) / dur : 0);
      scrub.setAttribute('aria-valuenow', String(Math.round(player.time || 0)));
    }
    timeLabel.textContent = `${formatTime(player.time)} / ${formatTime(player.duration)}`;
  }
  function paintDuration() {
    scrub.setAttribute('aria-valuemax', String(durationOf()));
    paintTime();
  }

  const offs = [
    player.on('time', paintTime),
    player.on('ready', paintDuration),
    player.on('play', onPlayState),
    player.on('pause', onPlayState),
    player.on('ended', onPlayState),
    player.on('ratechange', paintSpeed),
  ];

  const onKeyDown = (event) => {
    if (isTypingTarget(event.target)) return;
    switch (event.key) {
      case ' ':
        event.preventDefault();
        player.togglePlay();
        break;
      case 'ArrowLeft':
        event.preventDefault();
        player.nudge(-1);
        break;
      case 'ArrowRight':
        event.preventDefault();
        player.nudge(1);
        break;
      case 'j':
      case 'J':
        player.nudge(-5);
        break;
      case 'l':
      case 'L':
        player.nudge(5);
        break;
      default:
        break;
    }
  };
  document.addEventListener('keydown', onKeyDown);

  setPlayIcon();
  setPlayState();
  paintDuration();
  paintSpeed();

  return {
    destroy() {
      document.removeEventListener('keydown', onKeyDown);
      for (const off of offs) off();
      bar.remove();
    },
  };
}
