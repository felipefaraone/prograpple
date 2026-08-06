// App shell: a light left sidebar (DESIGN §6.2 — furniture, not chrome with hue)
// + a content region. Structure follows the LE reference: wordmark row with the
// collapse toggle on its right, nav grouped under an uppercase section label, a
// spacer, and a footer account row (avatar + name + caret) that opens an account
// popover mounted at the app root (CONVENTIONS §11). Rendered when authenticated.

import { el } from './dom.js';
import { icon, logo } from './icons.js';

// Best-effort display name from an email: the local part up to the first dot or
// plus, first letter capitalised. Not a substitute for a real name field.
function deriveName(email) {
  const local = (email || '').split('@')[0] || '';
  const first = local.split(/[.+]/)[0] || local;
  return first ? first.charAt(0).toUpperCase() + first.slice(1) : email || '';
}

// nav: [{ id, label, iconName, onSelect }].
// Returns { root, content, setActive, setCollapsed }.
export function renderShell({ email, onSignOut, nav = [], onToggle, onLogo }) {
  const content = el('main', { class: 'main' });

  // Wordmark: logo mark + "ProGrapple". Collapsed shows the mark only. It is a real
  // control (button semantics, focusable, keyboard-activatable) that goes home —
  // reusing the caller's navigate-to-list action; no new routing (FIX 6).
  const wordmark = el(
    'button',
    {
      class: 'sb-wordmark',
      type: 'button',
      'aria-label': 'ProGrapple — go to Videos',
      title: 'Go to Videos',
      onclick: () => onLogo?.(),
    },
    el('span', { class: 'sb-mark' }, logo({ size: 22 })),
    el('span', { class: 'sb-word', text: 'ProGrapple' })
  );

  const toggle = el(
    'button',
    {
      class: 'sb-toggle',
      type: 'button',
      'aria-label': 'Collapse sidebar',
      'aria-expanded': 'true',
      onclick: onToggle,
    },
    icon('panel-left')
  );

  // Nav under one uppercase group label. "Workspace" = the surfaces where the
  // coach does their primary work (roster + footage); Phase-2 derived/analysis
  // modules form their own group, leaving this label accurate.
  const navButtons = new Map();
  const navList = el('div', { class: 'sb-nav' });
  for (const item of nav) {
    const btn = el(
      'button',
      {
        class: 'sb-nav-item',
        type: 'button',
        title: item.label,
        onclick: () => {
          setActive(item.id);
          item.onSelect();
        },
      },
      item.iconName ? icon(item.iconName) : null,
      el('span', { class: 'sb-label', text: item.label })
    );
    navButtons.set(item.id, btn);
    navList.append(btn);
  }
  const navGroup = el(
    'div',
    { class: 'sb-group' },
    el('div', { class: 'sb-group-label', text: 'Workspace' }),
    navList
  );
  function setActive(id) {
    for (const [key, btn] of navButtons) btn.classList.toggle('on', key === id);
  }

  // Identity derived from the email: an avatar initial + a display name taken from
  // the local part before any dot or plus, first letter capitalised
  // ("felipe.faraone+prograpple@gmail.com" -> "Felipe"). A real display name would
  // need a schema field (Phase 2); this is the best derivation from current data.
  const initial = (email || '?').trim().charAt(0).toUpperCase() || '?';
  const displayName = deriveName(email);

  // Account popover — mounted at the app root, anchored to the footer. The full
  // email lives in its header (there is room here); the footer row shows only the
  // short identity. Sign out is the only item it needs now (CONVENTIONS §11).
  let menuOpen = false;
  const accountMenu = el(
    'div',
    { class: 'account-menu', role: 'menu' },
    el(
      'div',
      { class: 'account-head' },
      el('span', { class: 'sb-avatar', text: initial }),
      el('span', { class: 'account-email', text: email, title: email })
    ),
    el(
      'button',
      {
        class: 'account-item',
        type: 'button',
        role: 'menuitem',
        onclick: () => {
          closeMenu();
          onSignOut();
        },
      },
      icon('signout'),
      'Sign out'
    )
  );
  const menuBackdrop = el('div', {
    class: 'account-backdrop',
    onclick: () => closeMenu(),
  });
  const onMenuKey = (event) => {
    if (event.key === 'Escape') closeMenu();
  };
  function openMenu() {
    if (menuOpen) return;
    menuOpen = true;
    document.body.append(menuBackdrop, accountMenu);
    const r = accountBtn.getBoundingClientRect();
    accountMenu.style.left = `${r.left}px`;
    accountMenu.style.bottom = `${window.innerHeight - r.top + 6}px`;
    accountMenu.style.minWidth = `${Math.max(r.width, 160)}px`;
    accountBtn.setAttribute('aria-expanded', 'true');
    document.addEventListener('keydown', onMenuKey);
  }
  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    accountMenu.remove();
    menuBackdrop.remove();
    accountBtn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onMenuKey);
  }

  const accountBtn = el(
    'button',
    {
      class: 'sb-account',
      type: 'button',
      'aria-haspopup': 'menu',
      'aria-expanded': 'false',
      title: email,
      onclick: () => (menuOpen ? closeMenu() : openMenu()),
    },
    el('span', { class: 'sb-avatar', text: initial }),
    el('span', { class: 'sb-account-name', text: displayName }),
    icon('chevron-down')
  );

  const sidebar = el(
    'aside',
    { class: 'sidebar' },
    el('div', { class: 'sb-top' }, wordmark, toggle),
    navGroup,
    el('div', { class: 'sb-spacer' }),
    el('div', { class: 'sb-foot' }, accountBtn)
  );

  function setCollapsed(collapsed) {
    sidebar.classList.toggle('collapsed', collapsed);
    // Panel-toggle glyph stays constant in both states (like VS Code / Linear); the
    // aria-label carries the direction. Icon only — behaviour unchanged.
    toggle.replaceChildren(icon('panel-left'));
    toggle.setAttribute(
      'aria-label',
      collapsed ? 'Expand sidebar' : 'Collapse sidebar'
    );
    toggle.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    if (collapsed) closeMenu();
  }

  const root = el('div', { class: 'app' }, sidebar, content);
  return { root, content, setActive, setCollapsed };
}
