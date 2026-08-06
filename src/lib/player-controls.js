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
import { createSegmented } from '../ui/segmented.js';
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

  // Scrubbing lives on the timeline overview band (the single time-nav surface) —
  // there is no separate progress bar in the transport row (FIX 1). The transport
  // keeps play, the ±nudge buttons, the time readout, and the speed control.
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

  // Speed set as ONE compact segmented control (DESIGN §6.11) — the same sliding
  // control the side/result filters use, so all seven rates read as one instrument
  // rather than a row of floating buttons. Behaviour is unchanged: a click sets the
  // rate through the contract; the 'ratechange' event syncs the active segment (so a
  // rate set elsewhere still moves the indicator). setValue with no fromClick never
  // re-fires onChange, so there is no feedback loop.
  const speedSeg = createSegmented({
    ariaLabel: 'Speed',
    value: String(player.rate),
    options: RATES.map((r) => ({ value: String(r), label: `${r}×` })),
    onChange: (v) => player.setRate(Number(v)),
  });
  speedSeg.root.classList.add('speed-seg');
  const paintSpeed = () => speedSeg.setValue(String(player.rate));

  const bar = el(
    'div',
    { class: 'controls' },
    playBtn,
    nudge(-5, '-5s', 'Back 5s (J)'),
    nudge(-1, '-1s', 'Back 1s (←)'),
    nudge(1, '+1s', 'Forward 1s (→)'),
    nudge(5, '+5s', 'Forward 5s (L)'),
    timeLabel,
    speedSeg.root
  );
  container.append(bar);

  const onPlayState = () => setPlayIcon();

  function paintTime() {
    timeLabel.textContent = `${formatTime(player.time)} / ${formatTime(player.duration)}`;
  }

  const offs = [
    player.on('time', paintTime),
    player.on('ready', paintTime),
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
  paintTime();
  paintSpeed();

  return {
    destroy() {
      document.removeEventListener('keydown', onKeyDown);
      for (const off of offs) off();
      bar.remove();
    },
  };
}
