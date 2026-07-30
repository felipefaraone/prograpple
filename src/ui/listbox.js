// Accessible listbox — the replacement for every native <select>. The native
// control renders OS chrome that ignores the design system and, on macOS, opens
// over itself rather than below. This one is a button that shows the current
// value and a panel that opens BELOW it, mounted at the app root (CONVENTIONS
// §11) so it is never clipped by a scrollable sub-view.
//
// createListbox({ options, value, placeholder, ariaLabel, onChange, extraClass })
//   options: [{ value, label }]
// Returns { root, get value, setValue(v) }.

import { el, clear } from './dom.js';
import { icon } from './icons.js';

export function createListbox({
  options = [],
  value = '',
  placeholder = 'Select',
  ariaLabel,
  onChange,
  extraClass,
} = {}) {
  let current = value;
  let open = false;
  let activeIndex = -1;

  const valueLabel = el('span', { class: 'lb-value' });
  const button = el(
    'button',
    {
      class: 'lb-button' + (extraClass ? ` ${extraClass}` : ''),
      type: 'button',
      'aria-haspopup': 'listbox',
      'aria-expanded': 'false',
      'aria-label': ariaLabel || null,
      onclick: () => (open ? closePanel() : openPanel()),
      onkeydown: (event) => {
        // From the closed button, Down / Enter / Space open the panel.
        if (open) return;
        if (['ArrowDown', 'Enter', ' '].includes(event.key)) {
          event.preventDefault();
          openPanel();
        }
      },
    },
    valueLabel,
    icon('chevron-down', { size: 16 })
  );

  const panel = el('div', {
    class: 'lb-panel',
    role: 'listbox',
    'aria-label': ariaLabel || null,
  });
  const backdrop = el('div', {
    class: 'lb-backdrop',
    onmousedown: () => closePanel(),
  });
  const optionEls = [];

  function buildOptions() {
    clear(panel);
    optionEls.length = 0;
    options.forEach((opt, i) => {
      const o = el(
        'div',
        {
          class: 'lb-option' + (opt.value === current ? ' selected' : ''),
          role: 'option',
          'aria-selected': String(opt.value === current),
          onclick: () => choose(i),
          onmousemove: () => setActive(i),
        },
        opt.label
      );
      optionEls.push(o);
      panel.append(o);
    });
  }

  function paintButton() {
    const opt = options.find((o) => o.value === current);
    valueLabel.textContent = opt ? opt.label : placeholder;
    valueLabel.classList.toggle('placeholder', !opt);
  }

  function openPanel() {
    if (open) return;
    open = true;
    buildOptions();
    document.body.append(backdrop, panel);
    const r = button.getBoundingClientRect();
    panel.style.left = `${r.left}px`;
    panel.style.top = `${r.bottom + 4}px`; // opens BELOW the button
    panel.style.minWidth = `${r.width}px`;
    button.setAttribute('aria-expanded', 'true');
    const sel = options.findIndex((o) => o.value === current);
    setActive(sel >= 0 ? sel : 0);
    document.addEventListener('keydown', onPanelKey, true);
  }

  function closePanel(focusButton = false) {
    if (!open) return;
    open = false;
    panel.remove();
    backdrop.remove();
    button.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onPanelKey, true);
    if (focusButton) button.focus();
  }

  function setActive(i) {
    activeIndex = i;
    optionEls.forEach((o, idx) => o.classList.toggle('active', idx === i));
    optionEls[i]?.scrollIntoView({ block: 'nearest' });
  }

  function choose(i) {
    const opt = options[i];
    if (!opt) return;
    current = opt.value;
    paintButton();
    closePanel(true);
    onChange?.(current);
  }

  // Handled in the capture phase and stopped, so the button's own keydown does
  // not re-fire and no global shortcut sees these keys while the panel is open.
  function onPanelKey(event) {
    if (!open) return;
    const last = optionEls.length - 1;
    switch (event.key) {
      case 'ArrowDown':
        setActive(Math.min(last, activeIndex + 1));
        break;
      case 'ArrowUp':
        setActive(Math.max(0, activeIndex - 1));
        break;
      case 'Home':
        setActive(0);
        break;
      case 'End':
        setActive(last);
        break;
      case 'Enter':
        choose(activeIndex);
        break;
      case 'Escape':
        closePanel(true);
        break;
      case 'Tab':
        closePanel();
        return; // let Tab move focus normally
      default:
        return; // unhandled keys pass through
    }
    event.preventDefault();
    event.stopPropagation();
  }

  paintButton();

  return {
    root: button,
    get value() {
      return current;
    },
    setValue(v) {
      current = v;
      paintButton();
    },
  };
}
