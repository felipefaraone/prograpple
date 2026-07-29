# Tests

No tests in this scaffold. The two mandatory tests arrive with the database in
the next task (see `docs/CONVENTIONS.md` §13):

- **`isolation.test.js`** — tenant isolation. Runs as an authenticated user
  holding the **anon key** (the service role would pass unconditionally and
  prove nothing). Enumerates tables from `pg_tables`, asserts org A reads zero
  of org B's rows, and that RLS is enabled with a policy per command on every
  public table.
- **`smoke.test.js`** — critical-flow smoke. Log in → add athlete → load video
  → drop tag → save clip → export.

Both run in CI on every push. Red blocks deploy.
