# Tests

Two mandatory tests, per `docs/CONVENTIONS.md` §13. Both run in CI on every push;
red blocks the workflow.

- **`isolation.test.js`** — tenant isolation (ARCHITECTURE §7.4). **Present.** The
  cross-tenant reads run as an authenticated user holding the **anon key** (the
  service role would pass unconditionally and prove nothing). It enumerates tables
  from `pg_tables` (never a hand-written array), seeds two orgs with two users, and
  asserts org A reads zero of org B's rows on every table — plus that RLS is
  enabled and every table has a policy per command.
- **`smoke.test.js`** — critical-flow smoke. Log in → add athlete → load video →
  drop tag → save clip → export. **Not yet present** — arrives with the app surface.

## Running the isolation test locally

Requires a container runtime (Docker/Colima) for the local Supabase stack.

```sh
supabase start
eval "$(supabase status -o env | sed 's/^/export /')"
export SUPABASE_URL="$API_URL" \
       SUPABASE_ANON_KEY="$ANON_KEY" \
       SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
       SUPABASE_DB_URL="$DB_URL"
npm run test:isolation
```

`psql` must be on `PATH` (used for catalog introspection and the RLS assertions).
No secrets are needed: the stack is local and its keys are throwaway defaults.
