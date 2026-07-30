// Athletes surface (mock v2): Active | Archived views, add-to-roster via a modal
// opened from the header plus button, a kind type-filter (All / Athletes /
// Opponents), a search field past 8 rows, aggregate counts (videos, tags),
// rename, archive/restore, and — from the archived view — a guarded hard delete:
// a referenced athlete is blocked (archive-only), an unreferenced one is deletable
// behind a typed-confirmation gate.
//
// The page is mounted ONCE; a refresh() updates only the list body and counts.
// That keeps the segmented control, the search field and its focus alive across
// updates (so the segmented indicator animates and a rename cancel cannot flash
// the whole list to "Loading…").

import { el, mount, clear } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { openModal } from '../../ui/modal.js';
import { createListbox } from '../../ui/listbox.js';
import { createSegmented } from '../../ui/segmented.js';
import {
  listHeader,
  controlsRow,
  createAddButton,
  createSearch,
  matchesQuery,
  SEARCH_THRESHOLD,
} from '../../ui/list-screen.js';
import { fmtRelative, fmtDate } from '../../ui/format.js';
import {
  listAthletes,
  countAthletes,
  fetchAthleteStats,
  addAthlete,
  renameAthlete,
  archiveAthlete,
  restoreAthlete,
  hardDeleteAthlete,
} from './data.js';

export function renderAthletes(container, { client, orgId }) {
  let athleteView = 'active';
  let kindFilter = 'all';
  let query = '';
  let stats = new Map(); // athleteId -> { videos, tags }
  let currentData = []; // the loaded list for the current view

  // --- persistent chrome (built once, reused so the controls animate) -------
  const countPill = el('span', { class: 'page-count' });
  const archCount = el('span', { class: 'seg-n' });

  const viewSeg = createSegmented({
    ariaLabel: 'Active or archived athletes',
    value: 'active',
    options: [
      { value: 'active', label: 'Active' },
      {
        value: 'archived',
        node: el('span', { class: 'seg-lbl' }, 'Archived', archCount),
      },
    ],
    onChange: (v) => {
      athleteView = v;
      syncChrome();
      refresh();
    },
  });

  const search = createSearch({
    placeholder: 'Search names…',
    onInput: (q) => {
      query = q;
      paintRows();
    },
  });

  const addBtn = createAddButton({
    label: 'Add athlete',
    onClick: () => openAddAthleteModal(),
  });

  // Kind type-filter: quiet inline text tabs (All / Athletes / Opponents) with
  // per-kind counts, defaulting to All (never hides a side unless asked). Side
  // square glyphs (DESIGN §5), not the word "opponent".
  const tfCount = {
    all: el('span', { class: 'n' }),
    athlete: el('span', { class: 'n' }),
    opponent: el('span', { class: 'n' }),
  };
  const tfButton = (value, glyph, label) =>
    el(
      'button',
      {
        class: 'tf' + (kindFilter === value ? ' on' : ''),
        type: 'button',
        onclick: () => setKind(value),
      },
      glyph ? el('i', { class: glyph }) : null,
      label,
      tfCount[value]
    );
  const tfButtons = {
    all: tfButton('all', null, 'All'),
    athlete: tfButton('athlete', 'us', 'Athletes'),
    opponent: tfButton('opponent', 'them', 'Opponents'),
  };
  const typefilter = el(
    'div',
    { class: 'typefilter' },
    tfButtons.all,
    tfButtons.athlete,
    tfButtons.opponent
  );
  function setKind(v) {
    kindFilter = v;
    for (const [key, b] of Object.entries(tfButtons)) {
      b.classList.toggle('on', key === v);
    }
    paintRows();
  }

  const listBox = el('div', { class: 'listbox' });
  listBox.append(el('div', { class: 'muted', text: 'Loading…' }));

  const page = el(
    'div',
    { class: 'page' },
    listHeader({ title: 'Athletes', countPill, primaryBtn: addBtn }),
    el('p', {
      class: 'page-sub',
      text: 'Athletes and opponents share one list.',
    }),
    controlsRow({ searchRoot: search.root, viewSegRoot: viewSeg.root }),
    typefilter,
    listBox,
    el(
      'div',
      { class: 'arch-note' },
      icon('alert-circle', { size: 14 }),
      el('span', {
        text: 'Archived athletes keep their videos and tags. A referenced athlete can be archived but not deleted.',
      })
    )
  );
  mount(container, page);

  // The kind filter applies to the active roster only.
  function syncChrome() {
    typefilter.hidden = athleteView !== 'active';
  }

  // Add-to-roster modal: a single Name field (no adjacent search to collide
  // with), the Kind via the custom listbox. Add and Enter both create + persist.
  function openAddAthleteModal() {
    const name = el('input', {
      type: 'text',
      placeholder: 'Full name',
      'aria-label': 'Name',
    });
    const kindPick = createListbox({
      ariaLabel: 'Kind',
      value: 'athlete',
      options: [
        { value: 'athlete', label: 'Athlete' },
        { value: 'opponent', label: 'Opponent' },
      ],
    });
    const err = el('div', { class: 'notice error', hidden: 'hidden' });
    const confirmBtn = el(
      'button',
      { class: 'btn primary', type: 'button' },
      'Add'
    );
    const form = el(
      'form',
      {
        onsubmit: (event) => {
          event.preventDefault();
          doAdd();
        },
      },
      modalField('Name', name),
      modalField(
        'Kind',
        kindPick.root,
        'Opponents live in the same list. You tag against them, but they are not your team.'
      ),
      err
    );
    const foot = el(
      'div',
      {},
      el(
        'button',
        { class: 'btn ghost', type: 'button', onclick: () => modal.close() },
        'Cancel'
      ),
      confirmBtn
    );
    const modal = openModal({
      title: 'Add to roster',
      body: form,
      foot,
      initialFocus: name,
    });
    async function doAdd() {
      err.hidden = true;
      const clean = name.value.trim();
      if (!clean) {
        name.focus();
        return;
      }
      confirmBtn.disabled = true;
      const { error } = await addAthlete(client, {
        orgId,
        name: clean,
        kind: kindPick.value,
      });
      if (error) {
        err.textContent = error.message || 'Could not add the athlete.';
        err.hidden = false;
        confirmBtn.disabled = false;
        return;
      }
      modal.close();
      if (athleteView !== 'active') {
        athleteView = 'active';
        viewSeg.setValue('active');
        syncChrome();
      }
      refresh();
    }
    confirmBtn.onclick = doAdd;
  }

  function statOf(id) {
    return stats.get(id) || { videos: 0, tags: 0 };
  }

  function visibleRows() {
    return currentData.filter(
      (a) =>
        (kindFilter === 'all' || a.kind === kindFilter) &&
        matchesQuery(a.name, query)
    );
  }

  // Paint the list body from the in-memory data (search + kind filter). No fetch.
  function paintRows() {
    const archived = athleteView === 'archived';
    tfCount.all.textContent = String(currentData.length);
    tfCount.athlete.textContent = String(
      currentData.filter((a) => a.kind === 'athlete').length
    );
    tfCount.opponent.textContent = String(
      currentData.filter((a) => a.kind === 'opponent').length
    );
    search.setVisible(currentData.length > SEARCH_THRESHOLD);

    if (!currentData.length) {
      listBox.replaceChildren(
        emptyState(
          archived ? 'Nothing archived' : 'No athletes yet',
          archived
            ? 'Archived athletes appear here. Nothing is lost.'
            : 'Add your first athlete or opponent with the plus button.'
        )
      );
      return;
    }
    const rows = visibleRows();
    if (!rows.length) {
      listBox.replaceChildren(
        emptyState(
          'No matches',
          'No athlete matches the current filter or search.'
        )
      );
      return;
    }
    listBox.replaceChildren(
      el(
        'div',
        { class: 'listcard' },
        ...rows.map((a) => athleteRow(a, archived))
      )
    );
  }

  async function refresh() {
    const archived = athleteView === 'archived';
    const [{ data, error }, { stats: s }, { count: archN }] = await Promise.all(
      [
        listAthletes(client, orgId, { archived }),
        fetchAthleteStats(client, orgId),
        countAthletes(client, orgId, { archived: true }),
      ]
    );
    archCount.textContent = ` ${archN}`;
    if (error) {
      currentData = [];
      countPill.textContent = '0';
      search.setVisible(false);
      listBox.replaceChildren(
        el('div', { class: 'notice error', text: 'Could not load athletes.' })
      );
      return;
    }
    stats = s;
    currentData = data;
    countPill.textContent = String(data.length);
    paintRows();
  }

  function athleteRow(a, archived) {
    const s = statOf(a.id);
    const vLabel = `${s.videos} ${s.videos === 1 ? 'video' : 'videos'}`;
    const tLabel = `${s.tags} ${s.tags === 1 ? 'tag' : 'tags'}`;

    const title = el(
      'div',
      { class: 'row-title' },
      el('span', { text: a.name })
    );
    if (a.kind === 'opponent') {
      title.append(el('span', { class: 'badge badge-them', text: 'Opponent' }));
    }
    if (archived) {
      title.append(
        el('span', { class: 'badge badge-archived', text: 'Archived' })
      );
    }

    const meta = el(
      'div',
      { class: 'row-meta' },
      el('span', { text: `${vLabel} · ${tLabel}` }),
      metaItem(
        archived
          ? `Archived ${fmtDate(a.archived_at)}`
          : `Added ${fmtRelative(a.created_at)}`
      )
    );

    const actions = el('div', { class: 'row-actions' });
    const body = el('div', { class: 'row-body' }, title, meta);
    const row = el('div', { class: 'list-row' }, body, actions);

    if (archived) {
      actions.append(
        ractBtn('restore', 'Restore', async () => {
          const { error } = await restoreAthlete(client, { id: a.id, orgId });
          if (!error) refresh();
        }),
        ractBtn(
          'trash',
          'Delete forever',
          () => {
            if (statOf(a.id).videos > 0) openBlockedModal(a);
            else openDeleteAthleteModal(a);
          },
          true
        )
      );
    } else {
      actions.append(
        ractBtn('pencil', 'Rename', () => startRename(a, row, archived)),
        ractBtn('archive', 'Archive', async () => {
          const { error } = await archiveAthlete(client, { id: a.id, orgId });
          if (!error) refresh();
        })
      );
    }
    return row;
  }

  // Rename in place: swap just this row, never re-render the list. Cancel restores
  // the original row synchronously, so there is no flash.
  function startRename(a, row, archived) {
    const body = row.querySelector('.row-body');
    const actions = row.querySelector('.row-actions');
    const input = el('input', {
      class: 'input',
      type: 'text',
      value: a.name,
      'aria-label': 'New name',
    });
    clear(body);
    body.append(input);
    const restore = () => row.replaceWith(athleteRow(a, archived));
    const commit = async () => {
      const { data, error } = await renameAthlete(client, {
        id: a.id,
        orgId,
        name: input.value,
      });
      row.replaceWith(
        athleteRow(
          error ? a : { ...a, name: data?.name ?? input.value },
          archived
        )
      );
    };
    actions.replaceChildren(
      ractBtn('check', 'Save', commit),
      ractBtn('x', 'Cancel', restore)
    );
    input.focus();
    input.select();
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') commit();
      if (event.key === 'Escape') restore();
    });
  }

  // --- referenced-athlete delete blocked (archive-only) ---------------------
  function openBlockedModal(a) {
    const n = statOf(a.id).videos;
    const body = el(
      'div',
      {},
      el(
        'div',
        { class: 'blocked-box' },
        el('span', { class: 'warn-ic' }, icon('alert-circle', { size: 18 })),
        el(
          'div',
          {},
          el('b', { text: a.name }),
          ` is referenced by `,
          el('b', { text: `${n} ${n === 1 ? 'video' : 'videos'}` }),
          '. Deleting them would break those records, so a referenced athlete can only be archived. They leave the pickers and lists but keep the history intact.',
          el('br'),
          el('span', {
            class: 'muted',
            text: 'To delete forever, first delete or re-pair the videos that reference them.',
          })
        )
      )
    );
    const modal = openModal({
      title: 'Can’t delete this athlete',
      body,
      foot: el(
        'button',
        { class: 'btn primary', type: 'button', onclick: () => modal.close() },
        'Keep archived'
      ),
    });
  }

  // --- unreferenced-athlete hard delete (typed-confirmation gate) -----------
  function openDeleteAthleteModal(a) {
    const nameInput2 = el('input', {
      type: 'text',
      placeholder: a.name,
      'aria-label': 'Type the name to confirm',
    });
    const delBtn = el(
      'button',
      { class: 'btn primary', type: 'button', disabled: 'disabled' },
      'Delete forever'
    );
    nameInput2.addEventListener('input', () => {
      delBtn.disabled = nameInput2.value !== a.name;
    });
    const err = el('div', { class: 'notice error', hidden: 'hidden' });
    const body = el(
      'div',
      {},
      el(
        'div',
        { class: 'warn-box' },
        el('span', { class: 'warn-ic' }, icon('alert-triangle', { size: 18 })),
        el(
          'div',
          {},
          el('b', { text: a.name }),
          ' is not referenced by any video and will be permanently deleted. This cannot be undone.'
        )
      ),
      modalField('Type the name to confirm', nameInput2),
      err
    );
    const foot = el(
      'div',
      {},
      el(
        'button',
        { class: 'btn ghost', type: 'button', onclick: () => modal.close() },
        'Cancel'
      ),
      delBtn
    );
    const modal = openModal({
      title: 'Delete athlete forever?',
      body,
      foot,
      initialFocus: nameInput2,
    });
    delBtn.onclick = async () => {
      if (nameInput2.value !== a.name) return;
      delBtn.disabled = true;
      const { ok, error } = await hardDeleteAthlete(client, {
        id: a.id,
        orgId,
      });
      if (!ok) {
        err.textContent = error?.message || 'Could not delete the athlete.';
        err.hidden = false;
        delBtn.disabled = false;
        return;
      }
      modal.close();
      refresh();
    };
  }

  syncChrome();
  refresh();
}

function emptyState(title, sub) {
  return el(
    'div',
    { class: 'empty' },
    el('div', { class: 'empty-title', text: title }),
    el('div', { text: sub })
  );
}

function metaItem(text, extraClass) {
  return el(
    'span',
    { class: 'sep' + (extraClass ? ` ${extraClass}` : '') },
    text
  );
}

function ractBtn(iconName, label, onClick, danger) {
  return el(
    'button',
    {
      class: 'ract' + (danger ? ' danger' : ''),
      type: 'button',
      onclick: onClick,
    },
    icon(iconName, { size: 13 }),
    label
  );
}

function modalField(labelText, control, hint) {
  return el(
    'div',
    { class: 'field' },
    el('label', { text: labelText }),
    control,
    hint ? el('div', { class: 'hint', text: hint }) : null
  );
}
