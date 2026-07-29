// Critical-flow smoke test (CONVENTIONS §13). Covers what exists in this slice:
// sign in, add an athlete, read it back, archive it, confirm it leaves the list.
// Later slices EXTEND this file (load video → drop tag → save clip → export).
//
// It drives the real data layer (src/features/athletes/data.js + the paging
// helper + the org source function), so the test exercises the same code the app
// runs — not a reimplementation.
//
// Getting a session headlessly (the hard part, paid once here):
//   - admin creates a confirmed user, which fires the org-bootstrap trigger;
//   - admin.generateLink('magiclink') yields the same OTP a magic link carries;
//   - verifyOtp on an anon client establishes a real session — the actual
//     magic-link path, not a password shortcut.
// Reload persistence is proven by handing a Map-backed storage (a stand-in for
// localStorage) to the sign-in client, then constructing a BRAND-NEW client over
// the same storage — exactly what a browser reload does — and reading the session
// back.
//
// Env (from `supabase status -o env`): SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

import {
  addAthlete,
  listAthletes,
  archiveAthlete,
} from '../src/features/athletes/data.js';
import { getActiveOrgId } from '../src/lib/org.js';

const URL = requireEnv('SUPABASE_URL');
const ANON = requireEnv('SUPABASE_ANON_KEY');
const SERVICE = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

function requireEnv(name) {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing ${name}. Populate from \`supabase status -o env\` ` +
        `(SUPABASE_URL=API_URL, SUPABASE_ANON_KEY=ANON_KEY, ` +
        `SUPABASE_SERVICE_ROLE_KEY=SERVICE_ROLE_KEY).`
    );
  }
  return v;
}

// Minimal synchronous localStorage stand-in.
function memoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, v),
    removeItem: (k) => map.delete(k),
  };
}

const admin = createClient(URL, SERVICE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const state = {};

before(async () => {
  state.email = `smoke-${crypto.randomUUID()}@example.test`;

  // Create a confirmed user → the auth.users trigger provisions org + membership.
  const { error: createErr } = await admin.auth.admin.createUser({
    email: state.email,
    email_confirm: true,
  });
  assert.equal(createErr, null, `createUser: ${createErr?.message}`);

  // The OTP a magic link would carry.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
    type: 'magiclink',
    email: state.email,
  });
  assert.equal(linkErr, null, `generateLink: ${linkErr?.message}`);
  state.otp = link.properties.email_otp;

  // Sign in on a client backed by a persistent storage.
  state.storage = memoryStorage();
  const signInClient = createClient(URL, ANON, {
    auth: {
      storage: state.storage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const { data: signIn, error: verifyErr } = await signInClient.auth.verifyOtp({
    email: state.email,
    token: state.otp,
    type: 'email',
  });
  state.signInError = verifyErr;
  state.signInSession = signIn?.session ?? null;

  // Simulate a reload: a fresh client over the SAME storage.
  const reloadedClient = createClient(URL, ANON, {
    auth: {
      storage: state.storage,
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const {
    data: { session: reloaded },
  } = await reloadedClient.auth.getSession();
  state.reloadedSession = reloaded;
  state.client = reloadedClient; // authed purely via the persisted session

  const { orgId, error: orgErr } = await getActiveOrgId(reloadedClient);
  state.orgId = orgId;
  state.orgError = orgErr;
});

after(async () => {
  if (state.signInSession?.user?.id) {
    await admin.auth.admin.deleteUser(state.signInSession.user.id);
  }
});

test('magic-link OTP sign-in establishes a session', () => {
  assert.equal(
    state.signInError,
    null,
    `verifyOtp: ${state.signInError?.message}`
  );
  assert.ok(state.signInSession, 'expected a session after verifyOtp');
  assert.equal(state.signInSession.user.email, state.email);
});

test('the session survives a reload (new client, same storage)', () => {
  assert.ok(
    state.reloadedSession,
    'a brand-new client over the same storage should recover the session'
  );
  assert.equal(
    state.reloadedSession.user.id,
    state.signInSession.user.id,
    'reloaded session must be the same user'
  );
});

test('the org came from the bootstrap trigger, not the client', () => {
  assert.equal(
    state.orgError,
    null,
    `getActiveOrgId: ${state.orgError?.message}`
  );
  assert.ok(
    state.orgId,
    'authenticated user should have an org via memberships'
  );
});

test('add an athlete, read it back, archive it, it leaves the list', async () => {
  const { client, orgId } = state;

  const { data: added, error: addErr } = await addAthlete(client, {
    orgId,
    name: 'Smoke Test Athlete',
    kind: 'athlete',
  });
  assert.equal(addErr, null, `addAthlete: ${addErr?.message}`);
  assert.ok(added?.id, 'add should return the new row');

  const { data: afterAdd, error: listErr } = await listAthletes(client, orgId);
  assert.equal(listErr, null, `listAthletes: ${listErr?.message}`);
  assert.ok(
    afterAdd.some((a) => a.id === added.id),
    'the new athlete should read back from active_athletes'
  );

  const { error: archiveErr } = await archiveAthlete(client, {
    id: added.id,
    orgId,
  });
  assert.equal(archiveErr, null, `archiveAthlete: ${archiveErr?.message}`);

  const { data: afterArchive, error: list2Err } = await listAthletes(
    client,
    orgId
  );
  assert.equal(list2Err, null, `listAthletes(2): ${list2Err?.message}`);
  assert.equal(
    afterArchive.some((a) => a.id === added.id),
    false,
    'the archived athlete should no longer appear in active_athletes'
  );
});
