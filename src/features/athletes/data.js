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

// List reads from the active_athletes VIEW so archived filtering lives in one
// place (ARCHITECTURE §4.4), and routes through the paging helper (§6.2).
export function listAthletes(client, orgId) {
  return fetchAllPaged(client, {
    table: 'active_athletes',
    columns: ATHLETE_COLS,
    eq: { org_id: orgId },
    orderColumn: 'name',
    ascending: true,
    tiebreak: 'id',
  });
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
