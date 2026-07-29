// Tenant isolation test (ARCHITECTURE §7.4, CONVENTIONS §13).
//
// This is the only security control the MVP has, so it is specified precisely:
//
//   1. The cross-tenant reads run as an AUTHENTICATED USER HOLDING THE ANON KEY.
//      Running them with the service role would pass unconditionally and prove
//      nothing. Seeding and catalog introspection use the service role / a direct
//      DB connection, which is fine — only the isolation assertion must be anon.
//   2. The table list comes from pg_tables (the catalog), never a hand-written
//      array, so a table added later cannot silently escape the test.
//   3. It asserts RLS is ENABLED (pg_tables.rowsecurity = true) and that every
//      table has at least one policy PER COMMAND. A forgotten ENABLE ROW LEVEL
//      SECURITY is a different failure from a wrong policy and a policy-correctness
//      test does not catch it.
//
// Shape: seed two orgs (each auto-provisioned by the auth.users trigger) with a
// row in every domain table, authenticate as user A, and assert A reads zero of
// org B's rows on every public table.
//
// Env (map from `supabase status -o env`):
//   SUPABASE_URL=API_URL  SUPABASE_ANON_KEY=ANON_KEY
//   SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY  SUPABASE_DB_URL=DB_URL

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';

const URL = requireEnv('SUPABASE_URL');
const ANON = requireEnv('SUPABASE_ANON_KEY');
const SERVICE = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
const DB_URL = requireEnv('SUPABASE_DB_URL');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Populate from \`supabase status -o env\` ` +
        `(SUPABASE_URL=API_URL, SUPABASE_ANON_KEY=ANON_KEY, ` +
        `SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY, SUPABASE_DB_URL=DB_URL).`
    );
  }
  return v;
}

// --- direct-DB helper (catalog introspection + the RLS-toggle negative test) ---
const UNIT = '\x1f';
function sql(query) {
  const out = execFileSync('psql', [DB_URL, '-Aqt', '-F', UNIT, '-c', query], {
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split(UNIT));
}

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// A unique suffix per run so repeated local runs never collide on user email.
const RUN = execFileSync('psql', [DB_URL, '-Atc', 'select gen_random_uuid()'], {
  encoding: 'utf8',
}).trim();

const state = { tables: [], orgA: null, orgB: null, userA: null, userB: null };

async function makeCoach(letter) {
  const email = `iso-${letter}-${RUN}@example.test`;
  const password = `pw-${RUN}-${letter}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  assert.equal(error, null, `createUser ${letter}: ${error?.message}`);
  const userId = data.user.id;

  // The auth.users AFTER INSERT trigger provisioned the org + membership.
  const { data: mems, error: mErr } = await admin
    .from('memberships')
    .select('org_id')
    .eq('user_id', userId);
  assert.equal(mErr, null, `read membership ${letter}: ${mErr?.message}`);
  assert.equal(
    mems.length,
    1,
    `expected exactly one org for user ${letter}, got ${mems.length} (bootstrap trigger)`
  );
  return { email, password, userId, orgId: mems[0].org_id };
}

// Seed one row per domain table for an org, via the service role (bypasses RLS).
async function seedOrg(orgId, userId) {
  const { data: ath, error: aErr } = await admin
    .from('athletes')
    .insert({
      org_id: orgId,
      name: 'Subject',
      kind: 'athlete',
      created_by_user_id: userId,
    })
    .select('id')
    .single();
  assert.equal(aErr, null, `seed athlete: ${aErr?.message}`);

  const { data: vid, error: vErr } = await admin
    .from('videos')
    .insert({
      org_id: orgId,
      title: 'Round 1',
      athlete_id: ath.id,
      source_type: 'url',
      source_url: 'https://example.test/r1.mp4',
      created_by_user_id: userId,
    })
    .select('id')
    .single();
  assert.equal(vErr, null, `seed video: ${vErr?.message}`);

  // A global taxonomy id for the tag's FK.
  const { data: tax } = await admin
    .from('taxonomy')
    .select('id')
    .is('org_id', null)
    .limit(1)
    .single();

  const { error: tErr } = await admin.from('tags').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    video_id: vid.id,
    timestamp_seconds: 12.5,
    side: 'athlete',
    taxonomy_id: tax.id,
    result: 'scored',
    created_by_user_id: userId,
  });
  assert.equal(tErr, null, `seed tag: ${tErr?.message}`);

  const { error: cErr } = await admin.from('clips').insert({
    id: crypto.randomUUID(),
    org_id: orgId,
    video_id: vid.id,
    in_seconds: 10,
    out_seconds: 20,
    name: 'Clip 1',
    created_by_user_id: userId,
  });
  assert.equal(cErr, null, `seed clip: ${cErr?.message}`);

  // An org-specific taxonomy row, so taxonomy isolation is actually exercised
  // (global rows are shared by design and are not "org B's rows").
  const { error: xErr } = await admin.from('taxonomy').insert({
    org_id: orgId,
    category: 'position',
    term: `Custom ${orgId.slice(0, 8)}`,
  });
  assert.equal(xErr, null, `seed org taxonomy: ${xErr?.message}`);
}

before(async () => {
  state.tables = sql(
    `select tablename from pg_tables where schemaname = 'public' order by tablename`
  ).map((r) => r[0]);
  assert.ok(
    state.tables.length >= 7,
    'expected the 7 domain tables from pg_tables'
  );

  state.userA = await makeCoach('a');
  state.userB = await makeCoach('b');
  state.orgA = state.userA.orgId;
  state.orgB = state.userB.orgId;
  assert.notEqual(
    state.orgA,
    state.orgB,
    'two users must land in two distinct orgs'
  );

  await seedOrg(state.orgA, state.userA.userId);
  await seedOrg(state.orgB, state.userB.userId);
});

after(async () => {
  // Cascades remove memberships; orgs/domain rows are harmless in a throwaway DB.
  if (state.userA) await admin.auth.admin.deleteUser(state.userA.userId);
  if (state.userB) await admin.auth.admin.deleteUser(state.userB.userId);
});

// The tenant key for a table: org_id where present, else id (only `orgs` lacks
// org_id, and its own id IS the org identity). Derived from the catalog, not hand-listed.
function tenantColumn(tableName) {
  const cols = sql(
    `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = '${tableName}'`
  ).map((r) => r[0]);
  return cols.includes('org_id') ? 'org_id' : 'id';
}

test('org A, authenticated with the anon key, reads zero of org B rows on every table', async () => {
  const a = createClient(URL, ANON, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error: signInErr } = await a.auth.signInWithPassword({
    email: state.userA.email,
    password: state.userA.password,
  });
  assert.equal(signInErr, null, `sign in A: ${signInErr?.message}`);

  for (const tableName of state.tables) {
    const col = tenantColumn(tableName);
    const { data, error } = await a
      .from(tableName)
      .select('*')
      .eq(col, state.orgB);
    // An error here (e.g. permission denied) is also a failure: we could not
    // prove isolation. Only an empty result set with no error passes.
    assert.equal(error, null, `select ${tableName} as A: ${error?.message}`);
    assert.equal(
      data.length,
      0,
      `LEAK: user A read ${data.length} of org B's rows from "${tableName}"`
    );
  }
});

test('RLS is enabled on every public table', () => {
  const rows = sql(
    `select tablename, rowsecurity from pg_tables where schemaname = 'public'`
  );
  for (const [tableName, rowsecurity] of rows) {
    assert.equal(
      rowsecurity,
      't',
      `table "${tableName}" does not have ROW LEVEL SECURITY enabled`
    );
  }
});

test('every public table has at least one policy per command', () => {
  const rows = sql(
    `select tablename, cmd from pg_policies where schemaname = 'public'`
  );
  const byTable = new Map();
  for (const [tableName, cmd] of rows) {
    if (!byTable.has(tableName)) byTable.set(tableName, new Set());
    byTable.get(tableName).add(cmd);
  }
  for (const tableName of state.tables) {
    const cmds = byTable.get(tableName) || new Set();
    for (const cmd of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
      const covered = cmds.has(cmd) || cmds.has('ALL');
      assert.ok(
        covered,
        `table "${tableName}" is missing a ${cmd} policy (has: ${[...cmds].join(', ') || 'none'})`
      );
    }
  }
});
