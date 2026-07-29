// Athletes surface: list (from active_athletes), add, rename (inline), archive.
// Re-fetches through the data layer after each mutation so the view reflects the
// database, never optimistic guesses on this low-frequency screen.

import { el, mount, clear } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import {
  listAthletes,
  addAthlete,
  renameAthlete,
  archiveAthlete,
} from './data.js';

export function renderAthletes(container, { client, orgId }) {
  const listBox = el('div');
  const formError = el('div', { class: 'notice error', hidden: 'hidden' });

  const nameInput = el('input', {
    class: 'input',
    type: 'text',
    placeholder: 'Athlete name',
    'aria-label': 'Athlete name',
  });
  const kindSelect = el(
    'select',
    { class: 'select', 'aria-label': 'Kind' },
    el('option', { value: 'athlete' }, 'Athlete'),
    el('option', { value: 'opponent' }, 'Opponent')
  );
  const addBtn = el(
    'button',
    { class: 'btn primary', type: 'submit' },
    icon('plus'),
    'Add'
  );

  const addForm = el(
    'form',
    {
      class: 'add-form',
      onsubmit: async (event) => {
        event.preventDefault();
        formError.hidden = true;
        addBtn.disabled = true;
        const { error } = await addAthlete(client, {
          orgId,
          name: nameInput.value,
          kind: kindSelect.value,
        });
        addBtn.disabled = false;
        if (error) {
          formError.textContent = error.message || 'Could not add athlete.';
          formError.hidden = false;
          return;
        }
        nameInput.value = '';
        kindSelect.value = 'athlete';
        nameInput.focus();
        await refresh();
      },
    },
    el('div', { class: 'field' }, el('label', { text: 'Name' }), nameInput),
    el(
      'div',
      { class: 'field kind' },
      el('label', { text: 'Kind' }),
      kindSelect
    ),
    addBtn
  );

  mount(
    container,
    el(
      'div',
      {},
      el('div', { class: 'section-head' }, el('h1', { text: 'Athletes' })),
      addForm,
      formError,
      listBox
    )
  );

  function renderRow(athlete) {
    const nameCell = el('span', { class: 'name', text: athlete.name });

    const renameBtn = el(
      'button',
      {
        class: 'icon-btn',
        type: 'button',
        title: 'Rename',
        'aria-label': 'Rename',
      },
      icon('pencil')
    );
    const archiveBtn = el(
      'button',
      {
        class: 'icon-btn danger',
        type: 'button',
        title: 'Archive',
        'aria-label': 'Archive',
      },
      icon('archive')
    );

    const row = el(
      'div',
      { class: 'row' },
      nameCell,
      // Mark the exception, not the OK state (§11): badge opponents only.
      athlete.kind === 'opponent'
        ? el('span', { class: 'badge', text: 'Opponent' })
        : null,
      el('div', { class: 'actions' }, renameBtn, archiveBtn)
    );

    renameBtn.addEventListener('click', () => {
      const input = el('input', {
        class: 'input name-input',
        type: 'text',
        value: athlete.name,
        'aria-label': 'New name',
      });
      const save = el(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          title: 'Save',
          'aria-label': 'Save',
        },
        icon('check')
      );
      const cancel = el(
        'button',
        {
          class: 'icon-btn',
          type: 'button',
          title: 'Cancel',
          'aria-label': 'Cancel',
        },
        icon('x')
      );
      clear(row);
      row.append(input, el('div', { class: 'actions' }, save, cancel));
      input.focus();
      input.select();

      const commit = async () => {
        const { error } = await renameAthlete(client, {
          id: athlete.id,
          orgId,
          name: input.value,
        });
        if (error) {
          formError.textContent = error.message || 'Could not rename.';
          formError.hidden = false;
        }
        await refresh();
      };
      save.addEventListener('click', commit);
      cancel.addEventListener('click', refresh);
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') commit();
        if (event.key === 'Escape') refresh();
      });
    });

    archiveBtn.addEventListener('click', async () => {
      archiveBtn.disabled = true;
      const { error } = await archiveAthlete(client, { id: athlete.id, orgId });
      if (error) {
        archiveBtn.disabled = false;
        formError.textContent = error.message || 'Could not archive.';
        formError.hidden = false;
        return;
      }
      await refresh();
    });

    return row;
  }

  async function refresh() {
    formError.hidden = true;
    mount(listBox, el('div', { class: 'muted', text: 'Loading…' }));

    const { data, error } = await listAthletes(client, orgId);
    if (error) {
      mount(
        listBox,
        el('div', { class: 'notice error', text: 'Could not load athletes.' })
      );
      return;
    }
    if (!data.length) {
      mount(
        listBox,
        el(
          'div',
          { class: 'empty' },
          el('div', { class: 'empty-title', text: 'No athletes yet' }),
          el('div', { text: 'Add your first athlete or opponent above.' })
        )
      );
      return;
    }
    mount(listBox, el('div', { class: 'list' }, ...data.map(renderRow)));
  }

  refresh();
}
