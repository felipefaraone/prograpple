// Shared scaffolding for the Videos and Athletes list screens, so both read
// identically (mock v2 / DESIGN §6): the header is title + count left and a
// plus-icon primary button far right; the search field and the Active/Archived
// segmented sit on their own controls row below. Same order, same components,
// same positions on both screens.

import { el } from './dom.js';
import { icon } from './icons.js';

// Show the search field whenever there is more than one row to search. With a
// single row (or none) there is nothing to filter, so it stays hidden; its
// disappearance below that reads as intentional, not confusing.
export const SEARCH_THRESHOLD = 1;

// Header: title + count top-left, plus-icon primary action far right.
export function listHeader({ title, countPill, primaryBtn }) {
  return el(
    'div',
    { class: 'list-head' },
    el('h1', { text: title }),
    countPill,
    el('span', { class: 'grow' }),
    primaryBtn || null
  );
}

// Controls row: search left (grows to a cap), Active/Archived segmented right.
export function controlsRow({ searchRoot, viewSegRoot }) {
  return el(
    'div',
    { class: 'controls' },
    searchRoot || null,
    viewSegRoot || null
  );
}

// The plus-icon primary button with a hover tooltip naming the action. Icon-only
// (mock v2), with an aria-label carrying the same name for assistive tech.
export function createAddButton({ label, onClick }) {
  return el(
    'button',
    {
      class: 'addbtn',
      type: 'button',
      'aria-label': label,
      onclick: onClick,
    },
    icon('plus', { size: 18 }),
    el('span', { class: 'tip', text: label })
  );
}

// A search field with a magnifier icon. onInput receives the lowercased, trimmed
// query. Hidden until the caller shows it (past SEARCH_THRESHOLD rows).
export function createSearch({ placeholder, onInput }) {
  const input = el('input', {
    class: 'search-input',
    type: 'search',
    placeholder,
    'aria-label': placeholder,
    oninput: () => onInput(input.value.trim().toLowerCase()),
  });
  const root = el(
    'div',
    { class: 'search-field', hidden: 'hidden' },
    icon('search', { size: 15 }),
    input
  );
  return {
    root,
    input,
    setVisible(visible) {
      root.hidden = !visible;
      if (!visible && input.value) {
        input.value = '';
        onInput('');
      }
    },
  };
}

// Case-insensitive substring match; an empty query matches everything.
export function matchesQuery(text, query) {
  return (
    !query ||
    String(text || '')
      .toLowerCase()
      .includes(query)
  );
}
