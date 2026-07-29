// App shell: header (brand + nav + who + sign out) and an empty main content area
// for features to mount into. Rendered only when authenticated (see main.js).

import { el } from './dom.js';
import { icon } from './icons.js';

// nav: [{ id, label, iconName, onSelect }]. Returns { root, content, setActive }.
export function renderShell({ email, onSignOut, nav = [] }) {
  const content = el('main', { class: 'main' });

  const navButtons = new Map();
  const navBar = el('nav', { class: 'app-nav' });
  for (const item of nav) {
    const btn = el(
      'button',
      {
        class: 'nav-btn',
        type: 'button',
        onclick: () => {
          setActive(item.id);
          item.onSelect();
        },
      },
      item.iconName ? icon(item.iconName) : null,
      item.label
    );
    navButtons.set(item.id, btn);
    navBar.append(btn);
  }

  function setActive(id) {
    for (const [key, btn] of navButtons) btn.classList.toggle('on', key === id);
  }

  const header = el(
    'header',
    { class: 'app-header' },
    el('div', { class: 'brand', text: 'ProGrapple' }),
    navBar,
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
  return { root, content, setActive };
}
