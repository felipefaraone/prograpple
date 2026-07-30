// Athlete data layer. Pure functions over an injected Supabase client (so the
// smoke test drives the same code the app does). Every function returns
// {data, error}.
//
// Two locks (CONVENTIONS §7): every query is scoped by org_id in app code, AND
// RLS enforces it in the database. The app scoping is not a substitute for RLS —
// it is the first lock, RLS is the backstop.
//
// Writes are verified, not assumed (CONVENTIONS §10, ARCHITECTURE §3): a mutation
// that returns no row is treated as a failure, not a success.

import { fetchAllPaged } from '../../lib/paged.js';

const ATHLETE_COLS = 'id, org_id, name, kind, archived_at, created_at';

// Active vs Archived is a filter. Routed through the paging helper (§6.2).
export function listAthletes(client, orgId, { archived = false } = {}) {
  return fetchAllPaged(client, {
    table: 'athletes',
    columns: ATHLETE_COLS,
    eq: { org_id: orgId },
    ...(archived
      ? { notNull: ['archived_at'] }
      : { is: { archived_at: null } }),
    orderColumn: archived ? 'archived_at' : 'name',
    ascending: !archived,
    tiebreak: 'id',
  });
}

// Lightweight exact count for a view's badge (no rows fetched).
export async function countAthletes(client, orgId, { archived = false } = {}) {
  let query = client
    .from('athletes')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);
  query = archived
    ? query.not('archived_at', 'is', null)
    : query.is('archived_at', null);
  const { count, error } = await query;
  return { count: count ?? 0, error };
}

// Aggregates + reference-check for athletes in ONE query for the whole list (not
// per-row): fetch every org video with its (athlete_id, opponent_id, tag count)
// via a count-embed, then fold in JS. An athlete's "videos" = rows referencing it
// as subject OR opponent; "tags" = the sum of those videos' tag counts; and being
// referenced by ≥1 video is exactly what blocks a hard delete.
export async function fetchAthleteStats(client, orgId) {
  const { data, error } = await fetchAllPaged(client, {
    table: 'videos',
    columns: 'id, athlete_id, opponent_id, tags(count)',
    eq: { org_id: orgId },
    orderColumn: 'created_at',
    ascending: false,
    tiebreak: 'id',
  });
  if (error) return { stats: new Map(), error };

  const stats = new Map(); // athleteId -> { videos, tags }
  const bump = (aid, tagCount) => {
    if (!aid) return;
    const s = stats.get(aid) || { videos: 0, tags: 0 };
    s.videos += 1;
    s.tags += tagCount;
    stats.set(aid, s);
  };
  for (const v of data) {
    const tagCount = v.tags?.[0]?.count ?? 0;
    bump(v.athlete_id, tagCount);
    if (v.opponent_id && v.opponent_id !== v.athlete_id)
      bump(v.opponent_id, tagCount);
  }
  return { stats, error: null };
}

// Restore: clear archived_at.
export async function restoreAthlete(client, { id, orgId }) {
  const { data, error } = await client
    .from('athletes')
    .update({ archived_at: null })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id, archived_at')
    .single();
  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('restore matched no row') };
  return { data, error: null };
}

// Hard delete — only valid for an unreferenced athlete. The videos.athlete_id /
// opponent_id foreign keys (no cascade) make the database refuse to delete a
// referenced athlete, so this is safe even if the caller's check is stale.
export async function hardDeleteAthlete(client, { id, orgId }) {
  const { data, error } = await client
    .from('athletes')
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

export async function addAthlete(client, { orgId, name, kind }) {
  const cleanName = (name || '').trim();
  if (!cleanName) return { data: null, error: new Error('name is required') };
  if (kind !== 'athlete' && kind !== 'opponent') {
    return {
      data: null,
      error: new Error("kind must be 'athlete' or 'opponent'"),
    };
  }

  const {
    data: { session },
  } = await client.auth.getSession();

  const { data, error } = await client
    .from('athletes')
    .insert({
      org_id: orgId,
      name: cleanName,
      kind,
      created_by_user_id: session?.user?.id ?? null,
    })
    .select(ATHLETE_COLS)
    .single();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('insert returned no row') };
  return { data, error: null };
}

export async function renameAthlete(client, { id, orgId, name }) {
  const cleanName = (name || '').trim();
  if (!cleanName) return { data: null, error: new Error('name is required') };

  const { data, error } = await client
    .from('athletes')
    .update({ name: cleanName })
    .eq('id', id)
    .eq('org_id', orgId) // first lock; RLS is the backstop
    .select(ATHLETE_COLS)
    .single();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('rename matched no row') };
  return { data, error: null };
}

// Archive is a soft delete: set archived_at, never a hard DELETE (§4.4).
export async function archiveAthlete(client, { id, orgId }) {
  const { data, error } = await client
    .from('athletes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .eq('org_id', orgId)
    .select('id, archived_at')
    .single();

  if (error) return { data: null, error };
  if (!data) return { data: null, error: new Error('archive matched no row') };
  return { data, error: null };
}
