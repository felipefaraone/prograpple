// The single source function for "what is the active org?" (CONVENTIONS §9).
// Every surface asks here rather than re-deriving it. The org is provisioned by
// the auth.users trigger (ARCHITECTURE §7.3) — the client NEVER creates one.

let cachedOrgId = null;

export async function getActiveOrgId(client) {
  if (cachedOrgId) return { orgId: cachedOrgId, error: null };

  const {
    data: { session },
  } = await client.auth.getSession();
  const userId = session?.user?.id;
  if (!userId) return { orgId: null, error: new Error('not authenticated') };

  // One membership per user in the MVP; order for total determinism anyway.
  const { data, error } = await client
    .from('memberships')
    .select('org_id')
    .eq('user_id', userId)
    .order('created_at', { ascending: true })
    .order('org_id', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) return { orgId: null, error };
  if (!data) return { orgId: null, error: new Error('no membership for user') };

  cachedOrgId = data.org_id;
  return { orgId: cachedOrgId, error: null };
}

export function clearOrgCache() {
  cachedOrgId = null;
}
