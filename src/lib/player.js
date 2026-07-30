// The player module (ARCHITECTURE §2.4). THE ONLY place a <video> element, its
// .play()/.currentTime/.playbackRate, and blob URLs are touched. Feature code
// composes this contract and never reaches the element — so adding YouTube later
// is a second adapter behind the same interface, not a rewrite (§2.1).
//
// Contract (§2.4):
//   load(source)   {type:'url', url} | {type:'local', file}
//   play() / pause()
//   seek(seconds)  absolute
//   nudge(delta)   ±1, ±5
//   setRate(r)     0.25 | 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2
//   time           getter, seconds (float)
//   duration       getter, seconds
//   on(evt, fn)    'time' | 'ready' | 'error'
//
// Extensions used by the transport UI (additive, the three above are all present):
//   togglePlay(), get paused, get rate, destroy(), and the extra events
//   'play' | 'pause' | 'ended' | 'ratechange'.

export const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

const EVENTS = [
  'time',
  'ready',
  'error',
  'play',
  'pause',
  'ended',
  'ratechange',
];

function clamp(value, min, max) {
  if (!Number.isFinite(max)) return Math.max(min, value);
  return Math.min(max, Math.max(min, value));
}

// A native MediaError, translated to the truth (§2.2) — never a running timeline
// over nothing.
function describeError(mediaError) {
  const code = mediaError?.code ?? 0;
  // MediaError: 1 ABORTED, 2 NETWORK, 3 DECODE, 4 SRC_NOT_SUPPORTED
  if (code === 3 || code === 4) {
    return {
      code,
      message:
        "This browser can't play this file. The format isn't supported. Try an MP4 (H.264).",
    };
  }
  if (code === 2) {
    return {
      code,
      message:
        'Network error while loading the video. Check the URL or your connection.',
    };
  }
  if (code === 1) {
    return { code, message: 'Video loading was aborted.' };
  }
  return {
    code,
    message: mediaError?.message || 'The video could not be played.',
  };
}

export function createPlayer(container) {
  const video = document.createElement('video');
  video.setAttribute('playsinline', '');
  video.preload = 'metadata';
  video.tabIndex = -1;
  container.append(video);

  let objectUrl = null;
  const listeners = Object.fromEntries(EVENTS.map((e) => [e, new Set()]));
  const emit = (evt, payload) => {
    for (const fn of listeners[evt]) fn(payload);
  };

  const onTime = () => emit('time', video.currentTime);
  video.addEventListener('timeupdate', onTime);
  video.addEventListener('seeked', onTime);
  video.addEventListener('loadedmetadata', () =>
    emit('ready', { duration: video.duration })
  );
  video.addEventListener('durationchange', () =>
    emit('ready', { duration: video.duration })
  );
  video.addEventListener('error', () =>
    emit('error', describeError(video.error))
  );
  video.addEventListener('play', () => emit('play'));
  video.addEventListener('pause', () => emit('pause'));
  video.addEventListener('ended', () => emit('ended'));
  video.addEventListener('ratechange', () =>
    emit('ratechange', video.playbackRate)
  );

  function releaseUrl() {
    if (objectUrl) {
      URL.revokeObjectURL(objectUrl);
      objectUrl = null;
    }
  }

  return {
    load(source) {
      releaseUrl();
      if (source?.type === 'url') {
        video.src = source.url;
      } else if (source?.type === 'local') {
        objectUrl = URL.createObjectURL(source.file);
        video.src = objectUrl;
      } else {
        throw new Error('player.load: source must be {type:"url"|"local"}');
      }
      video.load();
    },
    play() {
      return video.play();
    },
    pause() {
      video.pause();
    },
    togglePlay() {
      if (video.paused) return video.play();
      video.pause();
      return undefined;
    },
    seek(seconds) {
      video.currentTime = clamp(seconds, 0, video.duration);
    },
    nudge(delta) {
      video.currentTime = clamp(video.currentTime + delta, 0, video.duration);
    },
    setRate(r) {
      if (RATES.includes(r)) video.playbackRate = r;
    },
    get time() {
      return video.currentTime;
    },
    get duration() {
      return video.duration;
    },
    get paused() {
      return video.paused;
    },
    get rate() {
      return video.playbackRate;
    },
    on(evt, fn) {
      listeners[evt]?.add(fn);
      return () => listeners[evt]?.delete(fn);
    },
    destroy() {
      video.pause();
      releaseUrl();
      video.removeAttribute('src');
      video.load();
      if (video.parentNode) video.parentNode.removeChild(video);
    },
  };
}

// Read a source's duration by loading only its metadata. Deterministic:
//   - every listener is attached BEFORE src is assigned;
//   - both loadedmetadata AND durationchange are observed, because for some
//     containers duration is still NaN/Infinity at loadedmetadata and is only
//     corrected by durationchange — reading once was the intermittency;
//   - metadata already available when we attach is read immediately;
//   - the blob URL is revoked only after the probe settles, never before;
//   - a timeout applies to network URLs only (a local blob cannot hang), so it is
//     an explicit genuine-failure path, not a competitor to a progressing load.
// Resolves with a finite duration in seconds, or REJECTS with a specific message
// on genuine failure — never a silent null for a valid file. Lives here because
// it is the only other place that needs a <video> element.
export function probeDuration(source, options = {}) {
  const type = source?.type;
  const timeoutMs = options.timeoutMs ?? (type === 'url' ? 30000 : 0);

  return new Promise((resolve, reject) => {
    if (type !== 'local' && type !== 'url') {
      reject(new Error('probeDuration: source must be {type:"url"|"local"}'));
      return;
    }

    const probe = document.createElement('video');
    probe.preload = 'metadata';

    let url = null;
    let timer = null;
    let settled = false;

    // Detach listeners first, then tear down the element, then revoke the URL —
    // so no stray error fires and metadata is fully read before revoke.
    const cleanup = () => {
      probe.removeEventListener('loadedmetadata', onMeta);
      probe.removeEventListener('durationchange', onMeta);
      probe.removeEventListener('error', onError);
      if (timer) clearTimeout(timer);
      probe.removeAttribute('src');
      probe.load();
      if (url) URL.revokeObjectURL(url);
    };

    const succeed = (seconds) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(seconds);
    };
    const failWith = (message) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    // Succeeds once a finite, known duration is available.
    const tryRead = () => {
      const d = probe.duration;
      if (Number.isFinite(d) && d > 0) {
        succeed(d);
        return true;
      }
      return false;
    };

    const onMeta = () => tryRead();
    const onError = () => failWith(describeError(probe.error).message);

    probe.addEventListener('loadedmetadata', onMeta);
    probe.addEventListener('durationchange', onMeta);
    probe.addEventListener('error', onError);

    if (timeoutMs > 0) {
      timer = setTimeout(
        () =>
          failWith(
            'Timed out reading the video metadata. Check the URL or your connection.'
          ),
        timeoutMs
      );
    }

    // Assign the source only AFTER every listener is attached.
    if (type === 'local') {
      url = URL.createObjectURL(source.file);
      probe.src = url;
    } else {
      probe.src = source.url;
    }
    probe.load();

    // Metadata may already be available by now — read it rather than waiting for
    // an event that has already fired.
    if (probe.readyState >= 1 /* HAVE_METADATA */) tryRead();
  });
}
