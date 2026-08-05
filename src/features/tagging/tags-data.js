// Tag data layer (ARCHITECTURE §3, §6). Pure functions over an injected client,
// returning verified results. The outbox (outbox.js) wraps insert/delete with
// batching + retry; the smoke test drives these same functions directly.

import { fetchAllPaged } from '../../lib/paged.js';

// Read shape for a tag (ARCHITECTURE §4). `note` is read so the tag list can show
// it; category/term are NOT stored here — they come from the taxonomy join in
// memory (§4.3, no denormalised copy). Used by the read (fetchTagsForVideo); the
// insert path upserts client-built tag objects and does not select these columns.
export const TAG_COLS =
  'id, org_id, video_id, timestamp_seconds, side, taxonomy_id, result, note';

// The ONE source function for "what are the tags of this video?" (CONVENTIONS §9),
// through the paging helper with explicit ordering (§6.2). Used to hydrate the
// in-memory store on open and on reload.
export function fetchTagsForVideo(client, orgId, videoId) {
  return fetchAllPaged(client, {
    table: 'tags',
    columns: TAG_COLS,
    eq: { org_id: orgId, video_id: videoId },
    orderColumn: 'timestamp_seconds',
    ascending: true,
    tiebreak: 'id',
  });
}

// Insert a batch idempotently and VERIFY it (ARCHITECTURE §3.2, CONVENTIONS §10).
// - Client-generated ids + ON CONFLICT DO NOTHING make a retry after an ambiguous
//   failure safe (T11).
// - A mutation returning an empty array with a null error is NOT trusted as
//   success: any id neither returned by the write nor found by a follow-up select
//   is a silent no-op and is reported as missing so the caller requeues it.
// Returns { persistedIds, missingIds, error }.
export async function insertTags(client, tags) {
  if (!tags.length) return { persistedIds: [], missingIds: [], error: null };
  const ids = tags.map((t) => t.id);

  const { data, error } = await client
    .from('tags')
    .upsert(tags, { onConflict: 'id', ignoreDuplicates: true })
    .select('id');
  if (error) return { persistedIds: [], missingIds: ids, error };

  const returned = new Set((data || []).map((r) => r.id));
  const notReturned = ids.filter((id) => !returned.has(id));
  if (notReturned.length === 0) {
    return { persistedIds: ids, missingIds: [], error: null };
  }

  // Not returned means either already-present (a safe retry) or silently dropped.
  // Distinguish by reading them back, rather than assuming the empty result meant
  // success — the exact myBJJ bug this guards against.
  const { data: check, error: checkErr } = await client
    .from('tags')
    .select('id')
    .in('id', notReturned);
  if (checkErr) {
    return {
      persistedIds: [...returned],
      missingIds: notReturned,
      error: checkErr,
    };
  }

  const present = new Set((check || []).map((r) => r.id));
  const persistedIds = ids.filter((id) => returned.has(id) || present.has(id));
  const missingIds = ids.filter((id) => !returned.has(id) && !present.has(id));
  return { persistedIds, missingIds, error: null };
}

// Edit a tag's post-hoc detail (result, note). This is NOT the hot drop path: it
// is low-frequency, so it is a plain awaited UPDATE with verify-the-write, NOT the
// optimistic outbox (ARCHITECTURE §3.2). Scoped by org_id AND id (two locks;
// tags_update RLS is the backstop). Verify (§10 / CONVENTIONS §10): the update
// SELECTs the row back and a row MUST come back — an empty array with a null error
// is the silent-no-op signature, reported as an error rather than trusted.
// Returns { data: row|null, error }.
export async function updateTagDetail(client, { id, orgId, result, note }) {
  const { data, error } = await client
    .from('tags')
    .update({ result: result ?? null, note: note ?? null })
    .eq('id', id)
    .eq('org_id', orgId)
    .select(TAG_COLS);
  if (error) return { data: null, error };
  if (!data || data.length === 0) {
    return {
      data: null,
      error: new Error('Update matched no row — nothing was saved.'),
    };
  }
  return { data: data[0], error: null };
}

// Delete a batch (§3.1: delete gets the same treatment). Deleting an id that is
// already absent returns no rows and is also success (idempotent).
export async function deleteTags(client, ids) {
  if (!ids.length) return { ok: true, error: null };
  const { error } = await client
    .from('tags')
    .delete()
    .in('id', ids)
    .select('id');
  if (error) return { ok: false, error };
  return { ok: true, error: null };
}
