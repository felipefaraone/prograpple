// Minimal IndexedDB wrapper for File System Access handles (ARCHITECTURE §2.3
// progressive enhancement). A FileSystemFileHandle survives a reload, so storing
// one keyed by video id lets a local video re-open without the coach hunting for
// the file. Handles are structured-cloneable objects — they are stored directly,
// NEVER stringified and NEVER in localStorage (which cannot hold them).
//
// Only open + get + set + delete, keyed by video id. This is the only IndexedDB in
// the app; the tag outbox is in-memory (T22). Referenced only on browsers that
// support the File System Access API, so `indexedDB` is touched lazily inside the
// functions, never at module load.

const DB_NAME = 'prograpple';
const STORE = 'video-handles';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function run(mode, fn) {
  return openDb().then(
    (db) =>
      new Promise((resolve, reject) => {
        const store = db.transaction(STORE, mode).objectStore(STORE);
        const req = fn(store);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      })
  );
}

// The stored FileSystemFileHandle for this video id, or null if none.
export function getHandle(videoId) {
  return run('readonly', (s) => s.get(videoId)).then((v) => v ?? null);
}

// Persist the handle for this video id (structured clone; not stringified).
export function setHandle(videoId, handle) {
  return run('readwrite', (s) => s.put(handle, videoId)).then(() => undefined);
}

// Drop a dead/stale handle (e.g. the file was moved or the video was deleted).
export function deleteHandle(videoId) {
  return run('readwrite', (s) => s.delete(videoId)).then(() => undefined);
}
