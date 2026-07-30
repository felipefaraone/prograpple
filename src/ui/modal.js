// Modal helper (mock anatomy + CONVENTIONS §11): mounts at the app root, Esc and
// backdrop close, and the destructive action is never focused on open.
//
// openModal({ title, body, foot, initialFocus, onClose }):
//   - body / foot are elements the caller builds.
//   - initialFocus (optional) is the element to focus on open; if omitted, the
//     close (✕) button is focused — never a destructive button.
// Returns { close }.

import { el } from './dom.js';
import { icon } from './icons.js';

export function openModal({ title, body, foot, initialFocus, onClose }) {
  const scrim = el('div', { class: 'scrim' });
  const closeBtn = el(
    'button',
    {
      class: 'modal-x',
      type: 'button',
      'aria-label': 'Close',
      onclick: () => close(),
    },
    icon('x')
  );
  const modal = el(
    'div',
    {
      class: 'modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-label': title,
    },
    el('div', { class: 'modal-head' }, el('h2', { text: title }), closeBtn),
    el('div', { class: 'modal-body' }, body),
    foot ? el('div', { class: 'modal-foot' }, foot) : null
  );
  scrim.append(modal);

  const onKey = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };
  scrim.addEventListener('mousedown', (event) => {
    if (event.target === scrim) close();
  });

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    scrim.remove();
    onClose?.();
  }

  document.body.append(scrim);
  document.addEventListener('keydown', onKey);
  // Focus something safe — never the destructive action.
  (initialFocus || closeBtn).focus();

  return { close };
}
