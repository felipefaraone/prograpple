// Video Room surface: list, create (with a pairing + a source), and open a video
// (player + custom controls + relink + timeline). All video playback goes through
// the player module (src/lib/player.js) via its §2.4 contract — this file never
// touches the <video> element, so YouTube stays a future adapter, not a rewrite.

import { el, mount, clear } from '../../ui/dom.js';
import { icon } from '../../ui/icons.js';
import { createPlayer, probeDuration } from '../../lib/player.js';
import { mountControls } from '../../lib/player-controls.js';
import { listAthletes } from '../athletes/data.js';
import { renderTimeline } from '../timeline/timeline.js';
import { listVideos, createVideo, archiveVideo } from './data.js';
import { validateUrl, fingerprintMatches } from './source.js';

// Local files picked this session, kept in memory so a just-created local video
// plays without a relink. The blob dies on reload (§2.3) — then the relink flow
// takes over. The showOpenFilePicker + IndexedDB enhancement is deferred (§2.3).
const sessionFiles = new Map();

export function renderVideoRoom(container, { client, orgId }) {
  let teardownPlayer = null;

  function disposePlayer() {
    if (teardownPlayer) {
      teardownPlayer();
      teardownPlayer = null;
    }
  }

  async function athleteMap() {
    const { data } = await listAthletes(client, orgId);
    const map = new Map();
    for (const a of data || []) map.set(a.id, a);
    return map;
  }

  // --- list ----------------------------------------------------------------
  async function showList() {
    disposePlayer();
    mount(
      container,
      el(
        'div',
        {},
        el(
          'div',
          { class: 'section-head' },
          el('h1', { text: 'Videos' }),
          el(
            'button',
            { class: 'btn primary', type: 'button', onclick: showCreate },
            icon('plus'),
            'New video'
          )
        ),
        el('div', { class: 'muted', text: 'Loading…' })
      )
    );

    const [{ data: videos, error }, byId] = await Promise.all([
      listVideos(client, orgId),
      athleteMap(),
    ]);

    const body = container.querySelector('.muted');
    if (error) {
      mount(
        body.parentNode,
        el('div', { class: 'notice error', text: 'Could not load videos.' })
      );
      return;
    }
    if (!videos.length) {
      body.replaceWith(
        el(
          'div',
          { class: 'empty' },
          el('div', { class: 'empty-title', text: 'No videos yet' }),
          el('div', { text: 'Add your first round with “New video”.' })
        )
      );
      return;
    }

    const nameOf = (id) => (id && byId.get(id) ? byId.get(id).name : null);
    const rows = videos.map((v) => {
      const subject = nameOf(v.athlete_id);
      const opponent = nameOf(v.opponent_id);
      const pairing =
        subject || opponent
          ? `${subject || 'Unknown'} vs ${opponent || 'Unknown'}`
          : 'No pairing set';
      const archiveBtn = el(
        'button',
        {
          class: 'icon-btn danger',
          type: 'button',
          title: 'Archive',
          'aria-label': 'Archive',
          onclick: async (event) => {
            event.stopPropagation();
            const { error: archErr } = await archiveVideo(client, {
              id: v.id,
              orgId,
            });
            if (!archErr) showList();
          },
        },
        icon('archive')
      );
      return el(
        'div',
        { class: 'row video-row', onclick: () => showOpen(v, byId) },
        el(
          'div',
          { class: 'video-meta' },
          el('div', { class: 'name', text: v.title }),
          el('div', { class: 'muted', text: `${pairing} · ${v.source_type}` })
        ),
        el('div', { class: 'actions' }, archiveBtn)
      );
    });

    body.replaceWith(el('div', { class: 'list' }, ...rows));
  }

  // --- create --------------------------------------------------------------
  async function showCreate() {
    disposePlayer();
    const byId = await athleteMap();
    const athletes = [...byId.values()];

    const title = el('input', {
      class: 'input',
      type: 'text',
      placeholder: 'e.g. Final — R1',
      'aria-label': 'Title',
    });

    const athleteSelect = athletePicker(athletes, 'Subject (—)');
    const opponentSelect = athletePicker(athletes, 'Opponent (—)');

    const sourceType = el(
      'select',
      { class: 'select', 'aria-label': 'Source type' },
      el('option', { value: 'local' }, 'Local file'),
      el('option', { value: 'url' }, 'Direct URL')
    );
    const fileInput = el('input', {
      class: 'input',
      type: 'file',
      accept: 'video/*',
      'aria-label': 'Video file',
    });
    const urlInput = el('input', {
      class: 'input',
      type: 'url',
      placeholder: 'https://…/round.mp4',
      'aria-label': 'Video URL',
      hidden: 'hidden',
    });
    sourceType.addEventListener('change', () => {
      const local = sourceType.value === 'local';
      fileInput.hidden = !local;
      urlInput.hidden = local;
    });

    const formError = el('div', { class: 'notice error', hidden: 'hidden' });
    const submit = el(
      'button',
      { class: 'btn primary', type: 'submit' },
      icon('plus'),
      'Create video'
    );

    const fail = (msg) => {
      formError.textContent = msg;
      formError.hidden = false;
      submit.disabled = false;
    };

    const form = el(
      'form',
      {
        class: 'create-form',
        onsubmit: async (event) => {
          event.preventDefault();
          formError.hidden = true;
          submit.disabled = true;

          if (!title.value.trim()) return fail('Enter a title.');

          let source;
          let pickedFile = null;
          if (sourceType.value === 'local') {
            pickedFile = fileInput.files?.[0];
            if (!pickedFile) return fail('Choose a video file.');
            const duration = await probeDuration({
              type: 'local',
              file: pickedFile,
            });
            if (duration == null)
              return fail("Couldn't read that file — is it a playable video?");
            source = {
              type: 'local',
              fileName: pickedFile.name,
              fileSize: pickedFile.size,
              duration,
            };
          } else {
            const check = validateUrl(urlInput.value);
            if (!check.ok) return fail(check.message);
            const duration = await probeDuration({
              type: 'url',
              url: check.url,
            }); // best-effort
            source = { type: 'url', url: check.url, duration };
          }

          const { data, error } = await createVideo(client, {
            orgId,
            title: title.value,
            athleteId: athleteSelect.value || null,
            opponentId: opponentSelect.value || null,
            source,
          });
          if (error)
            return fail(error.message || 'Could not create the video.');
          if (pickedFile) sessionFiles.set(data.id, pickedFile);
          showList();
        },
      },
      field('Title', title),
      el(
        'div',
        { class: 'pair-row' },
        field('Subject', athleteSelect),
        field('Opponent', opponentSelect)
      ),
      field('Source', sourceType),
      fileInput,
      urlInput,
      formError,
      el(
        'div',
        { class: 'form-actions' },
        el(
          'button',
          { class: 'btn ghost', type: 'button', onclick: showList },
          'Cancel'
        ),
        submit
      )
    );

    mount(
      container,
      el(
        'div',
        {},
        el('div', { class: 'section-head' }, el('h1', { text: 'New video' })),
        form
      )
    );
    title.focus();
  }

  // --- open ----------------------------------------------------------------
  async function showOpen(video, byId) {
    disposePlayer();
    const map = byId || (await athleteMap());
    const nameOf = (id) => (id && map.get(id) ? map.get(id).name : 'Unknown');
    const pairing =
      video.athlete_id || video.opponent_id
        ? `${nameOf(video.athlete_id)} vs ${nameOf(video.opponent_id)}`
        : 'No pairing set';

    const playerArea = el('div', { class: 'player-area' });
    const timelineBox = el('div', { class: 'timeline-box' });

    mount(
      container,
      el(
        'div',
        {},
        el(
          'div',
          { class: 'section-head' },
          el(
            'button',
            { class: 'btn ghost', type: 'button', onclick: showList },
            'Back'
          ),
          el('h1', { text: video.title })
        ),
        el('div', {
          class: 'muted pairing',
          text: `${pairing} · ${video.source_type}`,
        }),
        playerArea,
        timelineBox
      )
    );

    let player = null;
    const drawTimeline = () =>
      renderTimeline(timelineBox, {
        client,
        orgId,
        videoId: video.id,
        duration: player?.duration ?? video.duration_seconds,
        onSeek: (s) => player?.seek(s),
      });

    const startPlayer = (source) => {
      clear(playerArea);
      const stage = el('div', { class: 'stage' });
      playerArea.append(stage);
      player = createPlayer(stage);
      const controls = mountControls({ player, container: playerArea });
      const errorBox = el('div', { class: 'notice error', hidden: 'hidden' });
      playerArea.append(errorBox);
      player.on('error', (e) => {
        errorBox.textContent = e.message; // truth about the format (§2.2)
        errorBox.hidden = false;
      });
      player.on('ready', () => {
        errorBox.hidden = true;
        drawTimeline(); // now we have a real duration to position against
      });
      teardownPlayer = () => {
        controls.destroy();
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
      renderRelink(playerArea, video, (file) => {
        sessionFiles.set(video.id, file);
        startPlayer({ type: 'local', file });
      });
    }

    drawTimeline();
  }

  // "Video not loaded — locate file" (§2.3). Match on all three fingerprint
  // fields; on mismatch, warn and let the coach override — never block.
  function renderRelink(area, video, onFile) {
    clear(area);
    const fileInput = el('input', {
      class: 'input',
      type: 'file',
      accept: 'video/*',
      'aria-label': 'Locate file',
    });
    const note = el('div', { class: 'notice', hidden: 'hidden' });

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const duration = await probeDuration({ type: 'local', file });
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
          { class: 'btn danger', type: 'button', onclick: () => onFile(file) },
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
          text: 'Video not loaded — locate file',
        }),
        el('div', {
          class: 'muted',
          text: `Local file "${video.file_name}". Pick it to resume; everything else is saved.`,
        }),
        fileInput,
        note
      )
    );
  }

  showList();
}

function athletePicker(athletes, placeholder) {
  const select = el(
    'select',
    { class: 'select' },
    el('option', { value: '' }, placeholder)
  );
  for (const a of athletes) {
    select.append(
      el(
        'option',
        { value: a.id },
        a.kind === 'opponent' ? `${a.name} (opponent)` : a.name
      )
    );
  }
  return select;
}

function field(labelText, control) {
  return el(
    'div',
    { class: 'field' },
    el('label', { text: labelText }),
    control
  );
}
