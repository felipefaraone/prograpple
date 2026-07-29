// App shell: header (brand + who + sign out) and an empty main content area for
// features to mount into. Rendered only when authenticated (see main.js).

import { el } from './dom.js';
import { icon } from './icons.js';

export function renderShell({ email, onSignOut }) {
  const content = el('main', { class: 'main' });

  const header = el(
    'header',
    { class: 'app-header' },
    el('div', { class: 'brand', text: 'ProGrapple' }),
    el('div', { class: 'spacer' }),
    el('span', { class: 'who', text: email }),
    el(
      'button',
      { class: 'btn ghost', type: 'button', onclick: onSignOut },
      icon('signout'),
      'Sign out'
    )
  );

  const root = el('div', { class: 'app' }, header, content);
  return { root, content };
}
