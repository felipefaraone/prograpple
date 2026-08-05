// Remembers which video the coach had open so a reload returns to it instead of
// the list (client-side only — sessionStorage, no URL routing). Set on open,
// cleared on an explicit back-to-list, read on app load to pick the initial
// surface. sessionStorage access is wrapped so a storage-disabled context is a
// silent no-op, never an error.

const KEY = 'pg:lastVideoId';

export function rememberVideo(id) {
  try {
    sessionStorage.setItem(KEY, id);
  } catch {
    /* storage unavailable — restore is a best-effort enhancement */
  }
}

export function forgetVideo() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export function lastVideo() {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}
