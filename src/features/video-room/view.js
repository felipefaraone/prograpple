// Video Room surface: list, create (with a pairing + a source), and open a video
// (player + custom controls + relink + timeline). All video playback goes through
// the player module (src/lib/player.js) via its §2.4 contract — this file never
// touches the <video> element, so YouTube stays a future adapter, not a rewrite.

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
import { fmtClock, fmtRelative, fmtDate } from '../../ui/format.js';
import { createPlayer, probeDuration } from '../../lib/player.js';
import { mountControls } from '../../lib/player-controls.js';
import { listAthletes } from '../athletes/data.js';
import { mountTagger } from '../tagging/tagger.js';
import {
  listVideos,
  countVideos,
  createVideo,
  archiveVideo,
  restoreVideo,
  hardDeleteVideo,
} from './data.js';
import { validateUrl, fingerprintMatches } from './source.js';

// Local files picked this session, kept in memory so a just-created local video
// plays without a relink. The blob dies on reload (§2.3) — then the relink flow
// takes over. The showOpenFilePicker + IndexedDB enhancement is deferred (§2.3).
const sessionFiles = new Map();

// T21: one video record is one round. Nothing is blocked (there is no upload, so
// a long file costs nothing), but past ~20 minutes the record is almost certainly
// a whole session, not a round — a competition round tops out around 10 minutes
// and even long training rounds rarely reach 20. So 20 minutes is the quiet
// nudge threshold: normal rounds never trip it, an hour-long session always does.
const LONG_VIDEO_SECONDS = 20 * 60;

export function renderVideoRoom(
  container,
  { client, orgId, setSidebar = () => {} }
) {
  let teardownPlayer = null;
  let tagger = null;

  function disposePlayer() {
    if (tagger) {
      tagger.destroy();
      tagger = null;
    }
    if (teardownPlayer) {
      teardownPlayer();
      teardownPlayer = null;
    }
  }

  // --- list (Active | Archived) --------------------------------------------
  // The list page is built once per visit; a refresh() updates only the body and
  // counts, so the segmented control's indicator animates instead of the whole
  // header being rebuilt on every toggle. refreshList/goActiveList are set by
  // buildList so the modals and row actions (outer scope) can drive it.
  let videoView = 'active';
  let videoQuery = '';
  let currentVideos = [];
  let refreshList = () => {};
  let goActiveList = () => {};

  function showList() {
    disposePlayer();
    setSidebar(false); // list screen → sidebar expanded (auto, unless overridden)
    buildList();
  }

  function buildList() {
    videoQuery = '';
    const countPill = el('span', { class: 'page-count' });
    const archCount = el('span', { class: 'seg-n' });

    const viewSeg = createSegmented({
      ariaLabel: 'Active or archived videos',
      value: videoView,
      options: [
        { value: 'active', label: 'Active' },
        {
          value: 'archived',
          node: el('span', { class: 'seg-lbl' }, 'Archived', archCount),
        },
      ],
      onChange: (v) => {
        videoView = v;
        refreshVideos();
      },
    });

    const search = createSearch({
      placeholder: 'Search videos',
      onInput: (q) => {
        videoQuery = q;
        paintVideoRows();
      },
    });

    const newBtn = createAddButton({
      label: 'New video',
      onClick: () => openNewVideoModal(),
    });

    const listBox = el('div', { class: 'listbox' });
    listBox.append(el('div', { class: 'loading muted', text: 'Loading…' }));

    // Archiving hint is persistent chrome, but has no place in an empty view
    // (nothing to archive yet) — hidden by paintVideoRows when the list is empty.
    const archNote = el(
      'div',
      { class: 'arch-note' },
      icon('alert-circle', { size: 14 }),
      el('span', {
        text: 'Archiving hides a video from lists and keeps its tags and clips. Permanent deletion is only available from the Archived view.',
      })
    );

    mount(
      container,
      el(
        'div',
        { class: 'page' },
        listHeader({ title: 'Videos', countPill, primaryBtn: newBtn }),
        el('p', {
          class: 'page-sub',
          text: 'One video is one round. Filming a whole session? Create one record per round against the same file.',
        }),
        controlsRow({ searchRoot: search.root, viewSegRoot: viewSeg.root }),
        listBox,
        archNote
      )
    );

    function paintVideoRows() {
      const archived = videoView === 'archived';
      search.setVisible(currentVideos.length > SEARCH_THRESHOLD);
      archNote.hidden = currentVideos.length === 0;
      if (!currentVideos.length) {
        // Active + zero videos → the "ghost workbench": a static illustration of
        // what the screen becomes. Archived-empty stays a plain empty state.
        listBox.replaceChildren(
          archived
            ? emptyState(
                'Nothing archived',
                'Archived videos appear here. Nothing is lost.'
              )
            : ghostWorkbench(() => openNewVideoModal())
        );
        return;
      }
      const rows = currentVideos.filter(
        (v) =>
          matchesQuery(v.title, videoQuery) ||
          matchesQuery(v.athlete_name, videoQuery) ||
          matchesQuery(v.opponent_name, videoQuery)
      );
      if (!rows.length) {
        listBox.replaceChildren(
          emptyState('No matches', 'No video matches your search.')
        );
        return;
      }
      listBox.replaceChildren(
        el(
          'div',
          { class: 'listcard' },
          ...rows.map((v) => videoRow(v, archived))
        )
      );
    }

    async function refreshVideos() {
      const archived = videoView === 'archived';
      const [{ data: videos, error }, { count: archN }] = await Promise.all([
        listVideos(client, orgId, { archived }),
        countVideos(client, orgId, { archived: true }),
      ]);
      archCount.textContent = ` ${archN}`;
      if (error) {
        currentVideos = [];
        countPill.textContent = '0';
        search.setVisible(false);
        listBox.replaceChildren(
          el('div', { class: 'notice error', text: 'Could not load videos.' })
        );
        return;
      }
      currentVideos = videos;
      countPill.textContent = String(videos.length);
      paintVideoRows();
    }

    refreshList = refreshVideos;
    goActiveList = () => {
      videoView = 'active';
      viewSeg.setValue('active');
      refreshVideos();
    };
    refreshVideos();
  }

  function videoRow(v, archived) {
    const pairing = el('span', { class: 'pairing' });
    if (v.athlete_name || v.opponent_name) {
      pairing.append(
        el('i', { class: 'pair-side us' }),
        v.athlete_name || 'Unknown'
      );
      if (v.opponent_name) {
        pairing.append(
          el('span', { class: 'pair-vs', text: 'vs' }),
          el('i', { class: 'pair-side them' }),
          v.opponent_name
        );
      }
    } else {
      pairing.append('No pairing set');
    }

    const tagsClips =
      (v.tag_count ? `${v.tag_count} tags` : 'No tags yet') +
      (v.clip_count ? ` · ${v.clip_count} clips` : '');

    const title = el('div', { class: 'row-title' }, v.title);
    if (archived) {
      title.append(
        el('span', { class: 'badge badge-archived', text: 'Archived' })
      );
    }

    const actions = el('div', { class: 'row-actions' });
    if (archived) {
      actions.append(
        ractBtn('restore', 'Restore', async () => {
          const { error } = await restoreVideo(client, { id: v.id, orgId });
          if (!error) refreshList();
        }),
        ractBtn('trash', 'Delete forever', () => openDeleteVideoModal(v), true)
      );
    } else {
      actions.append(
        ractBtn('archive', 'Archive', async (event) => {
          event.stopPropagation();
          const { error } = await archiveVideo(client, { id: v.id, orgId });
          if (!error) refreshList();
        })
      );
    }

    const row = el(
      'div',
      { class: 'list-row' + (archived ? ' archived' : ' clickable') },
      el('span', { class: 'vtile' }, icon('play', { size: 14 })),
      el(
        'div',
        { class: 'row-body' },
        title,
        el(
          'div',
          { class: 'row-meta' },
          pairing,
          metaItem(v.source_type === 'url' ? 'URL' : 'Local file'),
          v.duration_seconds != null
            ? metaItem(fmtClock(v.duration_seconds), 'mono')
            : null,
          metaItem(tagsClips),
          metaItem(
            archived
              ? `Archived ${fmtDate(v.archived_at)}`
              : fmtRelative(v.created_at)
          )
        )
      ),
      actions
    );
    if (!archived) row.addEventListener('click', () => showOpen(v));
    return row;
  }

  // --- new video (modal, per mock) -----------------------------------------
  async function openNewVideoModal() {
    const { data: athletes } = await listAthletes(client, orgId);
    const list = athletes || [];

    const title = el('input', {
      type: 'text',
      placeholder: 'Round 1, comp prep',
      'aria-label': 'Title',
    });
    // Quiet hint when the picked source is clearly a whole session, not a round
    // (T21). Never blocks creation; it sits under the title and clears itself.
    const longHint = el('div', {
      class: 'hint hint-soft',
      hidden: 'hidden',
      text: 'This looks like a full session. One video is one round, so consider a record per round.',
    });
    const setLongHint = (duration) => {
      longHint.hidden = !(
        Number.isFinite(duration) && duration > LONG_VIDEO_SECONDS
      );
    };

    const athletePick = athletePicker(list, 'Not set', 'Athlete');
    const opponentPick = athletePicker(list, 'Not set', 'Opponent');

    const localBtn = el(
      'button',
      { class: 'on', type: 'button' },
      'Local file'
    );
    const urlBtn = el('button', { type: 'button' }, 'Video URL');

    // Cache the probe done at pick-time so the hint and the create both use it
    // (one probe per file, not two).
    let picked = { file: null, duration: null };
    const dz = createDropzone({
      accept: 'video/*',
      onPick: async (file) => {
        picked = { file, duration: null };
        try {
          const duration = await probeDuration({ type: 'local', file });
          if (picked.file === file) picked.duration = duration;
          setLongHint(duration);
        } catch {
          setLongHint(null);
        }
      },
    });
    const urlInput = el('input', {
      type: 'text',
      placeholder: 'https://…/round.mp4',
      'aria-label': 'Video URL',
      hidden: 'hidden',
    });
    // Proactive hint (before the coach tries): the URL must be a direct file link,
    // and YouTube/Vimeo page links do not work.
    const urlHint = el('div', {
      class: 'hint',
      hidden: 'hidden',
      text: 'Paste a direct link to a video file (.mp4, .webm, or .mov). YouTube and Vimeo page links do not work.',
    });

    const err = el('div', { class: 'notice error', hidden: 'hidden' });
    const createBtn = el(
      'button',
      { class: 'btn primary', type: 'button' },
      'Create video'
    );
    const fail = (msg) => {
      err.textContent = msg;
      err.hidden = false;
      createBtn.disabled = false;
    };

    // Reject a bad URL as it is typed/pasted and block Create until it is valid.
    // An empty field does not nag — Create will prompt for it.
    const checkUrl = () => {
      if (source !== 'url') return;
      const raw = urlInput.value.trim();
      if (!raw) {
        err.hidden = true;
        createBtn.disabled = false;
        return;
      }
      const check = validateUrl(raw);
      err.hidden = check.ok;
      if (!check.ok) err.textContent = check.message;
      createBtn.disabled = !check.ok;
    };
    urlInput.addEventListener('input', checkUrl);

    // Best-effort long-video hint for a URL source: probe on blur, ignore failures.
    urlInput.addEventListener('blur', async () => {
      const check = validateUrl(urlInput.value);
      if (!check.ok) return setLongHint(null);
      try {
        setLongHint(await probeDuration({ type: 'url', url: check.url }));
      } catch {
        setLongHint(null);
      }
    });

    let source = 'local';
    const setSource = (s) => {
      source = s;
      localBtn.classList.toggle('on', s === 'local');
      urlBtn.classList.toggle('on', s === 'url');
      dz.root.hidden = s !== 'local';
      urlInput.hidden = s !== 'url';
      urlHint.hidden = s !== 'url';
      if (s === 'url') {
        checkUrl();
      } else {
        err.hidden = true;
        createBtn.disabled = false;
      }
    };
    localBtn.onclick = () => setSource('local');
    urlBtn.onclick = () => setSource('url');

    const titleField = modalField('Title', title, 'One video is one round.');
    titleField.append(longHint);
    const body = el(
      'div',
      {},
      titleField,
      el(
        'div',
        { class: 'field field-row' },
        modalField('Athlete', athletePick.root),
        modalField('Opponent', opponentPick.root, null, '(optional)')
      ),
      modalField(
        'Source',
        el(
          'div',
          {},
          el('div', { class: 'srcseg' }, localBtn, urlBtn),
          dz.root,
          urlInput,
          urlHint
        )
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
      createBtn
    );
    const modal = openModal({
      title: 'New video',
      body,
      foot,
      initialFocus: title,
    });

    createBtn.onclick = async () => {
      err.hidden = true;
      createBtn.disabled = true;
      if (!title.value.trim()) return fail('Enter a title.');

      let src;
      let pickedFile = null;
      if (source === 'local') {
        pickedFile = dz.getFile();
        if (!pickedFile) return fail('Choose a video file.');
        let duration = picked.file === pickedFile ? picked.duration : null;
        if (duration == null) {
          try {
            duration = await probeDuration({ type: 'local', file: pickedFile });
          } catch (probeError) {
            return fail(probeError.message);
          }
        }
        src = {
          type: 'local',
          fileName: pickedFile.name,
          fileSize: pickedFile.size,
          duration,
        };
      } else {
        const check = validateUrl(urlInput.value);
        if (!check.ok) return fail(check.message);
        let duration;
        try {
          duration = await probeDuration({ type: 'url', url: check.url });
        } catch {
          duration = null;
        }
        src = { type: 'url', url: check.url, duration };
      }

      const { data, error } = await createVideo(client, {
        orgId,
        title: title.value,
        athleteId: athletePick.value || null,
        opponentId: opponentPick.value || null,
        source: src,
      });
      if (error) return fail(error.message || 'Could not create the video.');
      if (pickedFile) sessionFiles.set(data.id, pickedFile);
      modal.close();
      goActiveList();
    };
  }

  // --- delete video forever (modal, typed-confirmation gate) ----------------
  function openDeleteVideoModal(v) {
    const nameInput = el('input', {
      type: 'text',
      placeholder: v.title,
      'aria-label': 'Type the video title to confirm',
    });
    const delBtn = el(
      'button',
      { class: 'btn primary', type: 'button', disabled: 'disabled' },
      'Delete forever'
    );
    nameInput.addEventListener('input', () => {
      delBtn.disabled = nameInput.value !== v.title;
    });
    const err = el('div', { class: 'notice error', hidden: 'hidden' });

    const dies =
      `${v.tag_count} ${v.tag_count === 1 ? 'tag' : 'tags'}` +
      (v.clip_count
        ? ` and ${v.clip_count} ${v.clip_count === 1 ? 'clip' : 'clips'}`
        : '');
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
          el('b', { text: `“${v.title}”` }),
          ' and everything on it (',
          el('b', { text: dies }),
          ') will be permanently deleted. This cannot be undone.',
          el('br'),
          el('span', {
            class: 'muted',
            text: 'Your video file is not touched. ProGrapple never stored it.',
          })
        )
      ),
      modalField('Type the video title to confirm', nameInput),
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
      title: 'Delete video forever?',
      body,
      foot,
      initialFocus: nameInput,
    });

    delBtn.onclick = async () => {
      if (nameInput.value !== v.title) return;
      delBtn.disabled = true;
      const { ok, error } = await hardDeleteVideo(client, { id: v.id, orgId });
      if (!ok) {
        err.textContent = error?.message || 'Could not delete the video.';
        err.hidden = false;
        delBtn.disabled = false;
        return;
      }
      modal.close();
      refreshList();
    };
  }

  // --- open ----------------------------------------------------------------
  async function showOpen(video) {
    disposePlayer();
    setSidebar(true); // entering the video room → auto-collapse the sidebar
    // Names come embedded on the list row; null when unset so the UI says so
    // honestly rather than inventing a name.
    const athleteName = video.athlete_name ?? null;
    const opponentName = video.opponent_name ?? null;
    const pairing =
      video.athlete_id || video.opponent_id
        ? `${athleteName || 'Unknown'} vs ${opponentName || 'Unknown'}`
        : 'No pairing set';

    // Two-pane workbench matching the prototype: a fixed-height left column where
    // the video, timeline, transport and tag bar sit together in the coach's
    // field of view (no page scroll), and a right pane that scrolls internally.
    const stageWrap = el('div', { class: 'stage-wrap' });
    const timelineBox = el('div', { class: 'timeline-box' });
    const controlsBox = el('div', { class: 'controls-box' });
    const tagBox = el('div', { class: 'tag-box' });

    // Left column order mirrors the prototype's .player-col: stage → timeline →
    // transport → tag bar.
    const playerCol = el(
      'div',
      { class: 'player-col' },
      stageWrap,
      timelineBox,
      controlsBox,
      tagBox
    );

    // The right pane is the prototype's Tags panel: the live tag list for this
    // video. The tagger fills tagListBox from the same in-memory store the timeline
    // uses (detail editor + roll-shape strip are Slice 2).
    const tagListBox = el('div', { class: 'taglist' });
    const sidePane = el(
      'aside',
      { class: 'side-pane' },
      el('div', { class: 'side-head', text: 'Tags' }),
      tagListBox
    );

    // One bar: a breadcrumb "Videos / <title>" ("Videos" links back to the list),
    // pairing as secondary text, quiet shortcut hints on the right. Sign-out now
    // lives in the sidebar.
    const topbar = el(
      'div',
      { class: 'wb-topbar' },
      el(
        'div',
        { class: 'wb-crumb' },
        el(
          'button',
          { class: 'wb-crumb-link', type: 'button', onclick: showList },
          'Videos'
        ),
        el('span', { class: 'wb-crumb-sep', text: '/' }),
        el('h1', { class: 'wb-title', text: video.title })
      ),
      el('span', { class: 'wb-pairing', text: pairing }),
      el('span', { class: 'spacer' }),
      el(
        'span',
        { class: 'wb-hint' },
        'Tag with ',
        el('kbd', { text: 'T' }),
        ' · switch side with ',
        el('kbd', { text: 'Tab' }),
        ' · all shortcuts ',
        el('kbd', { text: '?' })
      )
    );

    mount(
      container,
      el(
        'div',
        { class: 'workbench-wrap' },
        topbar,
        el('div', { class: 'workbench' }, playerCol, sidePane)
      )
    );

    let player = null;

    // The tagger owns the store + timeline and reaches the video only through the
    // player contract via getPlayer().
    tagger = mountTagger({
      client,
      orgId,
      video,
      getPlayer: () => player,
      tagBarContainer: tagBox,
      timelineContainer: timelineBox,
      tagListContainer: tagListBox,
      athleteName,
      opponentName,
    });

    const startPlayer = (source) => {
      clear(stageWrap);
      const stage = el('div', { class: 'stage' });
      stageWrap.append(stage);
      player = createPlayer(stage);
      const controls = mountControls({ player, container: controlsBox });
      const errorBox = el('div', { class: 'notice error', hidden: 'hidden' });
      stageWrap.append(errorBox);
      player.on('error', (e) => {
        errorBox.textContent = e.message; // truth about the format (§2.2)
        errorBox.hidden = false;
      });
      player.on('ready', () => {
        errorBox.hidden = true;
        tagger.refreshDuration(); // real duration → reposition markers
        tagger.setEnabled(true); // a source is loaded → tagging is allowed (item 10)
      });
      player.on('time', (t) => tagger.setPlayhead(t)); // playhead tracks playback
      teardownPlayer = () => {
        controls.destroy();
        clear(controlsBox);
        player.destroy();
        player = null;
      };
      player.load(source);
    };

    if (video.source_type === 'url') {
      startPlayer({ type: 'url', url: video.source_url });
    } else if (sessionFiles.has(video.id)) {
      startPlayer({ type: 'local', file: sessionFiles.get(video.id) });
    } else {
      renderRelink(stageWrap, video, (file) => {
        sessionFiles.set(video.id, file);
        startPlayer({ type: 'local', file });
      });
    }
  }

  // The relink empty state (§2.3). Match on all three fingerprint fields; on
  // mismatch, warn and let the coach override, never block.
  function renderRelink(area, video, onFile) {
    clear(area);
    const { root: fileField, input: fileInput } = styledFileInput({
      accept: 'video/*',
      ariaLabel: 'Locate file',
      label: 'Locate file…',
    });
    const note = el('div', { class: 'notice', hidden: 'hidden' });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      // If the pick can't be read, treat duration as unknown — the fingerprint
      // then reports a length mismatch rather than throwing.
      let duration;
      try {
        duration = await probeDuration({ type: 'local', file });
      } catch {
        duration = null;
      }
      const match = fingerprintMatches(video, file, duration);
      if (match.all) {
        onFile(file);
        return;
      }
      const diffs = [
        match.nameOk ? null : 'name',
        match.sizeOk ? null : 'size',
        match.durationOk ? null : 'length',
      ].filter(Boolean);
      note.hidden = false;
      clear(note);
      note.classList.add('error');
      note.append(
        `This file doesn't match the original (${diffs.join(', ')} differ). `,
        el(
          'button',
          { class: 'btn', type: 'button', onclick: () => onFile(file) },
          'Load anyway'
        )
      );
    });

    area.append(
      el(
        'div',
        { class: 'relink' },
        el('div', { class: 'relink-icon' }, icon('film', { size: 28 })),
        el('div', {
          class: 'relink-title',
          text: 'Locate the video file',
        }),
        el('div', {
          class: 'muted',
          text: `Pick “${video.file_name}” to resume. Everything else is saved.`,
        }),
        fileField,
        note
      )
    );
  }

  showList();
}

// A styled file control: the raw <input type=file> is visually hidden (but still
// focusable and operable) inside a styled, keyboard-reachable label. Returns the
// label root and the live input so callers read .files / attach change handlers.
function styledFileInput({
  accept,
  ariaLabel,
  label = 'Choose a video file…',
}) {
  const input = el('input', {
    class: 'file-native',
    type: 'file',
    accept,
    'aria-label': ariaLabel,
  });
  const text = el('span', { class: 'file-text', text: label });
  const root = el('label', { class: 'file-field' }, icon('film'), text, input);
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    text.textContent = file ? file.name : label;
  });
  return { root, input };
}

// A pairing picker: an accessible listbox (never a native select, §11). The
// first option clears the pairing back to "Not set" since both sides are optional.
function athletePicker(athletes, placeholder, ariaLabel) {
  const options = [
    { value: '', label: placeholder },
    ...athletes.map((a) => ({
      value: a.id,
      label: a.kind === 'opponent' ? `${a.name} (opponent)` : a.name,
    })),
  ];
  return createListbox({ options, value: '', placeholder, ariaLabel });
}

// A modal form field: uppercase label (+ optional "(optional)" tag), control, hint.
function modalField(labelText, control, hint, optTag) {
  const label = el('label', { text: labelText });
  if (optTag) label.append(' ', el('span', { class: 'opt', text: optTag }));
  return el(
    'div',
    { class: 'field' },
    label,
    control,
    hint ? el('div', { class: 'hint', text: hint }) : null
  );
}

// Centered empty/no-match state (DESIGN §6.10).
function emptyState(title, sub) {
  return el(
    'div',
    { class: 'empty' },
    el('div', { class: 'empty-title', text: title }),
    el('div', { text: sub })
  );
}

// The "ghost workbench" empty state: a STATIC, non-interactive illustration of the
// screen a first video will fill (CONVENTIONS §11 "nothing scenographic" — this is
// empty-state art, not data: a dashed stage placeholder + a faded two-lane timeline
// preview foreshadowing the side convention, athlete above / opponent below). The
// marks are fixed markup, not derived from any tag or state. onNewVideo reuses the
// same handler as the corner "+".
function ghostMark(side, left) {
  const m = el('i', { class: `ghost-mark ${side}` });
  m.style.left = `${left}%`;
  return m;
}
function ghostWorkbench(onNewVideo) {
  const ghost = el(
    'div',
    { class: 'ghost', 'aria-hidden': 'true' },
    el('div', { class: 'ghost-stage' }, icon('play', { size: 40 })),
    el(
      'div',
      { class: 'ghost-tl' },
      el(
        'div',
        { class: 'ghost-lane us' },
        ghostMark('us', 14),
        ghostMark('us', 39),
        ghostMark('us', 66)
      ),
      el(
        'div',
        { class: 'ghost-lane them' },
        ghostMark('them', 24),
        ghostMark('them', 52),
        ghostMark('them', 81)
      )
    )
  );
  return el(
    'div',
    { class: 'empty ghost-empty' },
    ghost,
    el('div', { class: 'empty-title', text: 'Your first round goes here' }),
    el('div', {
      class: 'empty-sub',
      text: "Load the footage, hit play, and drop tags as it happens. Your athlete's tags sit above the line, the opponent's below.",
    }),
    el(
      'button',
      { class: 'btn primary', type: 'button', onclick: onNewVideo },
      'New video'
    )
  );
}

// A meta-line item; a leading "·" separator is added by CSS (.sep::before).
function metaItem(text, extraClass) {
  return el(
    'span',
    { class: 'sep' + (extraClass ? ` ${extraClass}` : '') },
    text
  );
}

// A row action button (revealed on hover). danger → red on hover only (§6.1).
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

// A styled dropzone: click-to-pick (label + hidden-but-focusable input) AND
// drag-and-drop, keyboard-reachable. The mock's honest note is shown.
function createDropzone({ accept, onPick }) {
  const input = el('input', {
    class: 'file-native',
    type: 'file',
    accept,
    'aria-label': 'Video file',
  });
  const note =
    'MP4, WebM, or MOV. The file stays on your computer. Only tags are saved.';
  const textWrap = el(
    'span',
    {},
    el('b', { text: 'Choose a video file' }),
    ' or drop it here',
    el('div', { class: 'dz-note', text: note })
  );
  const root = el('label', { class: 'dropzone' }, textWrap, input);
  let file = null;
  const setFile = (f) => {
    if (!f) return;
    file = f;
    textWrap.replaceChildren(
      el('b', { text: f.name }),
      el('div', {
        class: 'dz-note',
        text: 'Stays on your computer. Only tags are saved.',
      })
    );
    onPick?.(f);
  };
  input.addEventListener('change', () => setFile(input.files?.[0]));
  for (const ev of ['dragenter', 'dragover']) {
    root.addEventListener(ev, (event) => {
      event.preventDefault();
      root.classList.add('dragover');
    });
  }
  for (const ev of ['dragleave', 'drop']) {
    root.addEventListener(ev, (event) => {
      event.preventDefault();
      root.classList.remove('dragover');
    });
  }
  root.addEventListener('drop', (event) =>
    setFile(event.dataTransfer?.files?.[0])
  );
  return { root, getFile: () => file };
}
