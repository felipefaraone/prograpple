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

// List from the active_videos VIEW (archived filtering in one place, §4.4) via
// the paging helper. Meaningful order is newest-first, id as tiebreaker (§6.3).
export function listVideos(client, orgId) {
  return fetchAllPaged(client, {
    table: 'active_videos',
    columns: VIDEO_COLS,
    eq: { org_id: orgId },
    orderColumn: 'created_at',
    ascending: false,
    tiebreak: 'id',
  });
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
