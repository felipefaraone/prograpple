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

  const scrub = el('input', {
    class: 'scrub',
    type: 'range',
    min: '0',
    max: '0',
    step: '0.05',
    value: '0',
    'aria-label': 'Seek',
  });
  let scrubbing = false;
  scrub.addEventListener('pointerdown', () => (scrubbing = true));
  scrub.addEventListener('pointerup', () => (scrubbing = false));
  scrub.addEventListener('input', () => player.seek(Number(scrub.value)));

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

  function paintTime() {
    if (!scrubbing) scrub.value = String(player.time || 0);
    timeLabel.textContent = `${formatTime(player.time)} / ${formatTime(player.duration)}`;
  }
  function paintDuration() {
    scrub.max = String(Number.isFinite(player.duration) ? player.duration : 0);
    paintTime();
  }

  const offs = [
    player.on('time', paintTime),
    player.on('ready', paintDuration),
    player.on('play', setPlayIcon),
    player.on('pause', setPlayIcon),
    player.on('ended', setPlayIcon),
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
