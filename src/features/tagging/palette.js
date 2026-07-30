// Taxonomy palette (ARCHITECTURE §5.4, §9). Opens on T, fuzzy search over term +
// synonyms (searchTaxonomy), keyboard navigable, Enter drops, Esc closes. Dropping
// from the palette writes result = null — refinement is a later slice.
//
// Mounts at the app root (document.body), never inside a scrollable sub-view
// (CONVENTIONS §11). Reachable and escapable without knowing the shortcut: there
// is a visible close control and the backdrop closes it.

import { el, mount } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { searchTaxonomy } from './taxonomy.js';

export function createPalette({ onPick }) {
  let open = false;
  let results = [];
  let selected = 0;

  const input = el('input', {
    class: 'input palette-input',
    type: 'text',
    placeholder: 'Search a technique or synonym…',
    'aria-label': 'Search taxonomy',
    autocomplete: 'off',
  });
  const list = el('div', { class: 'palette-list', role: 'listbox' });

  const panel = el(
    'div',
    { class: 'palette-panel', role: 'dialog', 'aria-label': 'Tag palette' },
    el(
      'div',
      { class: 'palette-head' },
      input,
      el(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          title: 'Close (Esc)',
          'aria-label': 'Close',
          onclick: () => close(),
        },
        icon('x')
      )
    ),
    list
  );
  const backdrop = el('div', {
    class: 'palette-backdrop',
    onclick: (e) => {
      if (e.target === backdrop) close();
    },
  });
  backdrop.append(panel);

  function renderList() {
    mount(list, document.createDocumentFragment());
    results.forEach((row, i) => {
      const item = el(
        'button',
        {
          class: 'palette-item' + (i === selected ? ' on' : ''),
          type: 'button',
          role: 'option',
          onclick: () => choose(i),
        },
        el('span', { class: 'pi-term', text: row.term }),
        el('span', { class: 'pi-cat', text: row.category }),
        row.synonyms && row.synonyms.length
          ? el('span', { class: 'pi-syn', text: row.synonyms.join(', ') })
          : null
      );
      list.append(item);
    });
    if (!results.length) {
      list.append(
        el('div', {
          class: 'palette-none muted',
          text: 'No match. Try a synonym like RNC, DLR, or 411.',
        })
      );
    }
  }

  function refresh() {
    results = searchTaxonomy(input.value);
    selected = 0;
    renderList();
  }

  function move(delta) {
    if (!results.length) return;
    selected = (selected + delta + results.length) % results.length;
    renderList();
    const active = list.children[selected];
    if (active && active.scrollIntoView) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }

  function choose(i) {
    const row = results[i];
    if (!row) return;
    close();
    onPick(row); // result = null decided by the caller
  }

  input.addEventListener('input', refresh);
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      move(1);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      move(-1);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(selected);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  });

  function openPalette() {
    if (open) return;
    open = true;
    document.body.append(backdrop);
    input.value = '';
    refresh();
    input.focus();
  }

  function close() {
    if (!open) return;
    open = false;
    backdrop.remove();
  }

  return {
    open: openPalette,
    close,
    isOpen: () => open,
    destroy: close,
  };
}
