// The outbox (ARCHITECTURE §3.2). An IN-MEMORY queue — deliberately NOT persisted
// to IndexedDB (T22, deferred). It lets the drop path render before any network
// call, then flushes inserts/deletes in the background, batched, with
// on-conflict-do-nothing idempotency (in insertTags) and retry with backoff.
// Persistence is VERIFIED, not assumed: insertTags reports which ids actually
// landed, and anything missing stays queued.

import { insertTags, deleteTags } from './tags-data.js';

export function createOutbox(client, { onCount } = {}) {
  const inserts = new Map(); // id -> tag payload (pending insert)
  const deletes = new Set(); // ids pending delete
  let flushing = false;
  let timer = null;
  let attempt = 0;
  let listener = onCount || null;

  const pending = () => inserts.size + deletes.size;
  const notify = () => listener && listener(pending());

  function schedule(delay) {
    if (timer != null) return;
    timer = setTimeout(runFlush, delay);
  }

  async function runFlush() {
    timer = null;
    if (flushing) return;
    flushing = true;
    try {
      if (inserts.size) {
        const batch = [...inserts.values()];
        const { persistedIds } = await insertTags(client, batch);
        for (const id of persistedIds) inserts.delete(id);
        // Anything not persisted stays queued and is retried below.
      }
      if (deletes.size) {
        const ids = [...deletes];
        const { ok } = await deleteTags(client, ids);
        if (ok) for (const id of ids) deletes.delete(id);
      }
    } catch {
      // Network/other failure — keep the queue, retry with backoff.
    } finally {
      flushing = false;
      notify();
      if (pending() > 0) {
        attempt += 1;
        schedule(Math.min(500 * 2 ** attempt, 15000));
      } else {
        attempt = 0;
      }
    }
  }

  return {
    enqueueInsert(tag) {
      inserts.set(tag.id, tag);
      notify();
      schedule(0); // next tick — never blocks the drop
    },
    enqueueDelete(id) {
      if (inserts.has(id))
        inserts.delete(id); // never sent yet → just cancel it
      else deletes.add(id);
      notify();
      schedule(0);
    },
    pending,
    setListener(fn) {
      listener = fn;
    },
    // Best-effort drain (used on teardown so pending work still flushes).
    drain() {
      schedule(0);
    },
  };
}
