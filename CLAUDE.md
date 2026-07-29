# ProGrapple

BJJ video tagging tool for competitive grappling coaches. Solo builder directing an AI agent.

## Read before any task
- `docs/CONVENTIONS.md` — authoritative. Where a prompt and this disagree, CONVENTIONS wins.
- `docs/ARCHITECTURE.md` — read the section relevant to the task.

## Stack (fixed, do not introduce alternatives)
Supabase (Postgres, Auth, RLS, Edge Functions), vanilla JS, Vite + modules, GitHub Pages via Actions.

## Non-negotiables
- RLS on every table, a policy per command. `org_id` on every domain table.
- No secret in client code. Only the anon key ships.
- Every schema change is a numbered migration file. Never the dashboard.
- Verify writes: an empty array with a null error is an anomaly, not a success.
- Never commit, push or tag unless explicitly told to.

## Never
- Do not run repo-wide formatters or codemods (`prettier --write .`, `eslint --fix .`).
  Format only files this task created or edited.
