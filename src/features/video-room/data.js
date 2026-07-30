// Video record data layer (ARCHITECTURE §4). Pure functions over an injected
// client, returning {data, error}. No <video> — the source arrives pre-probed
// from the view, so this file stays node-safe and the smoke test drives it.
//
// Two locks (CONVENTIONS §7): every query scoped by org_id in app code, RLS as
// the backstop. Writes are verified, not assumed (§10).

import { fetchAllPaged } from '../../lib/paged.js';

const VIDEO_COLS =
  'id, org_id, title, athlete_id, opponent_id, source_type, source_url, ' +
  'file_name, file_size_bytes, duration_seconds, archived_at, created_at';

// One query for the whole list, aggregates included: PostgREST count-embeds
// tags(count)/clips(count) per row, so a 20-row list costs ONE request — never
// N+1 (§6.2 of the mock). Active vs Archived is a filter, not a different store.
export async function listVideos(client, orgId, { archived = false } = {}) {
  const { data, error } = await fetchAllPaged(client, {
    table: 'videos',
    // Embeds resolve pairing names AND aggregate counts in the same request.
    columns:
      `${VIDEO_COLS}, ` +
      'athlete:athletes!athlete_id(id, name), ' +
      'opponent:athletes!opponent_id(id, name), ' +
      'tags(count), clips(count)',
    eq: { org_id: orgId },
    ...(archived
      ? { notNull: ['archived_at'] }
      : { is: { archived_at: null } }),
    orderColumn: archived ? 'archived_at' : 'created_at',
    ascending: false,
    tiebreak: 'id',
  });
  if (error) return { data: null, error };
  const rows = data.map((v) => ({
    ...v,
    athlete_name: v.athlete?.name ?? null,
    opponent_name: v.opponent?.name ?? null,
    tag_count: v.tags?.[0]?.count ?? 0,
    clip_count: v.clips?.[0]?.count ?? 0,
  }));
  return { data: rows, error: null };
}

// Lightweight exact count for a view's badge (no rows fetched).
export async function countVideos(client, orgId, { archived = false } = {}) {
  let query = client
    .from('videos')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  query = archived
    ? query.not('archived_at', 'is', null)
    : query.is('archived_at', null);
  const { count, error } = await query;
  return { count: count ?? 0, error };
}

// Restore: clear archived_at (move back to the Active view).
export async function restoreVideo(client, { id, orgId }) {
  const { data, error } = await client
    .from('videos')
    .update({ archived_at: null })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id, archived_at')
    .single();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('restore matched no row') };
  return { data, error: null };
}

// Hard delete — a real DELETE (T12 reversed: videos were soft-delete-only). tags
// and clips cascade (ARCHITECTURE §4). Verified: a row must come back.
export async function hardDeleteVideo(client, { id, orgId }) {
  const { data, error } = await client
    .from('videos')
    .delete()
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id');
  if (error) return { ok: false, error };
  if (!data || !data.length) {
    return { ok: false, error: new Error('delete matched no row') };
  }
  return { ok: true, error: null };
}

// source: {type:'url', url, duration} | {type:'local', fileName, fileSize, duration}
// The pairing lives on the video (§4.1): athleteId is the subject, opponentId the
// other side. Both reference the athletes table; both are optional at the DB level.
export async function createVideo(
  client,
  { orgId, title, athleteId, opponentId, source }
) {
  const cleanTitle = (title || '').trim();
  if (!cleanTitle) return { data: null, error: new Error('title is required') };
  if (source?.type !== 'url' && source?.type !== 'local') {
    return { data: null, error: new Error('a source is required') };
  }

  const {
    data: { session },
  } = await client.auth.getSession();

  const row = {
    org_id: orgId,
    title: cleanTitle,
    athlete_id: athleteId || null,
    opponent_id: opponentId || null,
    source_type: source.type,
    source_url: source.type === 'url' ? source.url : null,
    file_name: source.type === 'local' ? source.fileName : null,
    file_size_bytes: source.type === 'local' ? source.fileSize : null,
    duration_seconds: source.duration ?? null,
    created_by_user_id: session?.user?.id ?? null,
  };

  const { data, error } = await client
    .from('videos')
    .insert(row)
    .select(VIDEO_COLS)
    .single();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('insert returned no row') };
  return { data, error: null };
}

// Archive is soft — set archived_at, never a hard DELETE (§4.4).
export async function archiveVideo(client, { id, orgId }) {
  const { data, error } = await client
    .from('videos')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id, archived_at')
    .single();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('archive matched no row') };
  return { data, error: null };
}
