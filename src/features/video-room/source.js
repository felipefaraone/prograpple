// Source model + validation (ARCHITECTURE §2.1, §2.3). Pure logic, no <video>.
//
// Two sources only: a direct URL or a local file. YouTube/Vimeo are out of scope
// and intentionally absent.

// .mov is H.264 in practice; .m4v is the same container family.
const VIDEO_EXTENSION = /\.(mp4|webm|mov|m4v)$/i;

// Validate a URL on the way in (§2.1): https only + a recognisable video
// extension. Reject clearly rather than loading something that will never play.
export function validateUrl(raw) {
  const value = (raw || '').trim();
  if (!value) return { ok: false, message: 'Enter a video URL.' };

  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, message: 'That is not a valid URL.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, message: 'The URL must start with https://.' };
  }
  if (!VIDEO_EXTENSION.test(parsed.pathname)) {
    return {
      ok: false,
      message: 'The URL must point to a video file (.mp4, .webm or .mov).',
    };
  }
  return { ok: true, url: value };
}

// Relink match (§2.3): a picked file matches a stored local video only when
// file_name AND file_size_bytes AND duration_seconds (±0.5s) all agree. On a
// mismatch the caller warns and lets the coach override — it never blocks.
export function fingerprintMatches(video, file, probedDuration) {
  const nameOk = video.file_name === file.name;
  const sizeOk = Number(video.file_size_bytes) === Number(file.size);
  const durationOk =
    video.duration_seconds != null &&
    probedDuration != null &&
    Math.abs(Number(video.duration_seconds) - Number(probedDuration)) <= 0.5;

  return {
    nameOk,
    sizeOk,
    durationOk,
    all: nameOk && sizeOk && durationOk,
  };
}
