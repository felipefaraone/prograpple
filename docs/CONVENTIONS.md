# ProGrapple — Conventions

**Version:** 0.2
**Audience:** Claude Code, and future-Felipe.
**Rule:** feed this document to Claude Code at the **start of every task**. It is short on purpose so that doing so is cheap.
**Changed in 0.2:** hosting corrected to GitHub Pages with a build step (Netlify in 0.1 was an unverified assumption); repository reversed from private to public with a corrected rationale; Supabase organisation rather than account.

> **Companion document:** `ARCHITECTURE.md` holds the design of *this* system (player, write path, data model, taxonomy, export). This document holds the rules that do not change per feature. When a prompt and this document disagree, **this document wins** — say so in the prompt.

---

## 1. Operating principle

This project is built by one non-engineer directing an AI agent. That is the constraint everything below is derived from:

> **Safety comes from legibility and automated guardrails, not from code review.** Claude Code is fast and confident, including when it is confidently wrong. Nobody is going to catch a subtle bug by reading a diff. So the system must be boring, consistent, and self-checking.

Clean and simple is the professional choice here, not a compromise. Sophisticated means the failure modes are handled; it does not mean clever.

---

## 2. Stack (fixed — do not introduce alternatives)

| Layer | Choice |
| --- | --- |
| Database / Auth / API | Supabase (Postgres, GoTrue, RLS, Edge Functions) |
| Frontend language | Vanilla JS. No React, no Vue, no framework |
| Frontend structure | Vite + modules |
| Hosting (frontend) | GitHub Pages (static), built and published by GitHub Actions |
| Error tracking | Sentry, free tier, from day one |
| Video host | None in the MVP. Bunny Stream if and when upload ships. **Never Supabase Storage for video** |

**Not doing, ever, in this project:** microservices, a separate backend server, Docker in production, Kubernetes, custom auth, custom billing, server-side rendering.

**On Vite (supersedes the frontend-structure half of Decision Log D5).** The MVP Build Spec inherited myBJJ's single-file frontend. That is being overridden for one specific reason, and it is worth writing down because the usual reason given is weaker: **it is not that single files "rot."** It is that a ~14k-line single file is the point where an AI agent starts making stale-context errors — editing against a version of the file it no longer holds correctly. That is a measured, lived failure from myBJJ, and it is the thing that would cost the most here. Modules keep every unit inside a window the agent can actually hold.

**Deploy differs from myBJJ, and this is the part that trips an agent up.** myBJJ serves `index.html` directly from GitHub Pages, so deploying is `git push`. Vite produces a `dist/`, so ProGrapple is built and published by a GitHub Actions workflow. **Publishing raw `/src` will not work.** Edge Functions are separate from both: they deploy with `supabase functions deploy <name>`, never with the frontend.

---

## 3. Repo structure

```
/src
  /lib        supabase client, auth, outbox, player, shared helpers
  /features   video-room/, athletes/, tagging/, export/   (one folder per feature)
  /ui         reusable components and styles
/supabase
  /migrations numbered, sequential, committed
  /functions  edge functions
/docs
  ARCHITECTURE.md
  CONVENTIONS.md   ← this file
  DECISIONS.md     ← decision log
/tests
  isolation.test.js
  smoke.test.js
```

**Repository is public, under Felipe's personal GitHub account, until partnership terms are signed (Gate 2).**

*Personal account, not a shared org:* creating it under a group org before terms exist is asset accumulation ahead of agreement — which the MVP Build Spec itself flags as the precondition most worth not skipping. Transferring a repo to an org later preserves history and takes two minutes.

*Public, not private:* an earlier draft of this document said private, on the grounds that the moat is workflow and taxonomy. That rationale does not hold. The research verdict is explicit that the moat is workflow lock-in, product quality and BJJ-specificity — **execution, not secrecy**. The taxonomy is common knowledge to any black belt, and Athlete Analyzer has shipped a near-identical feature set for a decade while remaining niche, which is evidence that knowing *what* to build was never the hard part. Public also keeps GitHub Pages free, where a private repo needs a paid plan or a different host — paying to hide something that does not protect us. myBJJ already operates this way.

*This changes nothing about secrets.* Public code is not a leaked credential. No key ever enters the repo; see §7.

---

## 4. Schema conventions

- **Primary keys are UUID.** For `tags` and `clips` the UUID is **generated on the client** (`crypto.randomUUID()`), not by `gen_random_uuid()` — that is what makes retries idempotent. Everything else may use the server default.
- **`org_id uuid not null`** on every domain table, FK to `orgs`. No exceptions. This is the spine of tenant isolation.
- **`created_at` and `updated_at` on every table.** `updated_at` maintained by trigger, not by application code.
- **`created_by_user_id` on every table that holds user-entered data.** Add it on day one even while there is a single user. Adding it later means backfilling with a guess — myBJJ carries 22 promotion records signed by a shared admin account, and that audit trail cannot be recovered.
- **Soft delete via `archived_at timestamptz`** for `athletes` and `videos`. Hard delete for `tags` and `clips` (high volume, and the user expects a mis-drop to be gone).
- **Naming:** `snake_case`; plural table names; singular column names; positive boolean prefixes (`is_`, `has_`); explicit units in the name (`timestamp_seconds`, `file_size_bytes`, `duration_seconds`). Pick it once, never deviate.
- **Separate table when the data has its own identity or needs its own RLS.** JSONB only when it is always read together with its parent and the volume is bounded.
- **No denormalised copies of joinable data.** If a column duplicates something reachable by join, it will drift. Store the id, join for the rest.

---

## 5. Migrations

- **Every schema change is a numbered migration file, committed to git.** No exceptions.
- **Never change the schema by clicking in the dashboard.** No history, no rollback, silent dev/prod drift.
- **A change applied in the SQL editor still becomes a numbered file, the same day.** myBJJ accumulated roughly a dozen live database objects that existed nowhere in version control, discovered only by auditing the database against the files — and that debt is now what blocks setting up a staging environment. Knowing the rule is not the control; writing the file is.
- **The control that makes the rule real:** CI runs `supabase db diff` against the deployed schema and **fails if the output is non-empty**. A rule without a detector is a rule that gets broken and not noticed.
- Migrations are idempotent (`if not exists`, `on conflict`) and additive wherever possible.
- **`create or replace view` cannot reorder or insert columns in the middle** (error 42P16). New columns go at the end. This has bitten twice in myBJJ.
- **`current_role` is a reserved word in Postgres.** Schema-qualify any helper of that shape.

---

## 6. Migration sequencing

- **Database before frontend, always.** The dangerous state is new frontend against old database.
- **A large change ships in phases, each independently verifiable.**
  - *Phase A:* columns and backfill, frontend untouched. Fully backward-compatible; verifiable on its own.
  - *Phase B:* frontend starts using the new columns.
- **A legacy column is not dropped while any consumer exists.** It becomes documented "live legacy," synchronised from the new source of truth.
- **One architectural migration at a time.** No parallel agent tasks against the schema.

---

## 7. Security rules

- **RLS enabled on every table**, with a separate policy per command (select / insert / update / delete).
- **The frontend also scopes every query by org.** Two locks. RLS is the backstop for when app code is wrong.
- **The service-role key never appears in frontend code, in git, or anywhere client-reachable.** It lives only in Edge Function environment variables. The anon key is public by design and safe.
- **Any Edge Function using the service role must scope by `org_id` manually.** A service-role query missing its org filter is a cross-tenant leak, and it is the most likely way an AI-written backend leaks data.
- **No API keys in the frontend.** Ever. The bundle is public. `.env` is in `.gitignore` from commit one.
- **Privacy is structural, not cosmetic.** If something must be hidden from a class of user, it is hidden by a policy or by living in its own table — not by the frontend choosing not to render it.
- **Never build SQL by string concatenation.** Parameterised queries or the Supabase client only.
- **Validate on the way in.** A video `source_url` must match an allowlist of expected hosts; this also prevents SSRF if anything server-side ever fetches it.
- Supabase Auth, magic link. Email confirmation on. Do not roll your own sessions or rate limiting.

---

## 8. Query rules

- **Every list query has an explicit `.order()`, and two of them:** the meaningful field, then `id` as a tiebreaker for total ordering.
- **Paginate explicitly. Never trust the implicit ceiling.** PostgREST truncates at 1000 rows with no error; without ordering, the rows it drops are the most recently inserted ones.
- **Diagnostic signature to memorise:** *the data exists in the database, one user sees it and another does not, switching context does not help, and the console is clean.* Before investigating permissions, compare how many rows each profile receives. The user with more access receives more rows and overflows first — **"whoever has more access sees less."**
- Every hot list gets an index covering its filter and sort.

---

## 9. Derived state: one source function per question

**Every derived value has exactly one function that produces it. Every surface calls that function. No surface re-derives it from raw fields.**

This is the single most valuable structural rule carried over from myBJJ. It eliminates the entire class of "the same question answered differently in three places" by construction, rather than by remembering to keep them in sync.

Corollary: **one function per question, not one function for everything.** Two questions that look similar but are not — "can this video be played?" and "has this video been reviewed?" — get two functions. Fusing them creates a different bug.

When touching or creating derived state, check whether a source function already exists. If it does, call it. If it does not and the value is being computed in more than one place, propose creating one.

---

## 10. Data safety

- **Never run a blind mass `update` or `delete`.** Run the `select` that shows the exact rows first.
- **Back up to a table before correcting data** (`_bak_<target>_<date>`), with RLS enabled on the backup.
- **The rollback statement never ships in the same paste as the fix.** Separate messages.
- **Fix at the source, not at the surface.** Wrong data is corrected in the base table — not in a view, and not in the frontend.
- **A mutation that returns an empty array with a null error is an anomaly, not a success.** Verify row counts after a write. This exact signature — a silent no-op upsert against a stale constraint, with the UI reverting on the next hydrate — was a real production bug in myBJJ.

---

## 11. Frontend conventions

- **CSS custom properties only. No hardcoded hex values anywhere.**
- **No emoji in the UI.** Where a glyph is needed, use a line icon that inherits `currentColor`.
- **Mark the exception, not the OK state.** Nothing renders unless it reflects real, non-default data. No badge for "normal," no chip for "nothing to report."
- **Nothing scenographic.** A hardcoded array posing as a feature is an architectural error, not a cosmetic one. Anything visible comes from the database or is an explicit empty state. This includes simulated behaviour: the prototype's fake playback clock does not ship.
- **Labels must tell the truth about the data.** A number fabricated from null is a product bug. If a value is unknown, the UI says unknown.
- **Overlays and modals mount at the app root, never inside a scrollable sub-view.** `position: absolute` anchors to the nearest positioned ancestor; inside a long list, the overlay covers the list and pushes the sheet outside the viewport, blocking clicks with a clean console. Same family: `position: fixed` anchors to the nearest *transformed* ancestor.
- **To change one surface without risking another, add a branch gated by a flag** rather than editing the shared path. The old path stays intact by construction, not by care.
- **Reuse an existing state rather than inventing a new value.** A new enum value forces code changes in every surface that reads it; an existing state that already means the right thing does not.

---

## 12. Definition of done (per feature)

A feature is not done until all of these are true. Claude Code must confirm each explicitly:

1. RLS policy written for every new table, every command.
2. Migration committed as a numbered file.
3. No secret in client code; state which secrets were used and where they live.
4. Every new list query has explicit ordering and pagination.
5. New derived state calls a source function, or a new one was proposed.
6. The isolation test passes.
7. The smoke path still works.

---

## 13. Tests

Two, and only two are mandatory. Do not write exhaustive unit tests.

- **Tenant isolation test.** Runs as an authenticated user holding the **anon key** (running it with the service role passes unconditionally and proves nothing). The table list is enumerated from `pg_tables`, not hand-written, so a new table cannot escape it. It asserts both that org A reads zero of org B's rows **and** that `rowsecurity` is true on every public table with at least one policy per command — a forgotten `enable row level security` is a different failure from a wrong policy and is the likeliest leak of all.
- **Critical-flow smoke test.** Log in → add athlete → load video → drop tag → save clip → export. That is the floor.

Both run in CI on every push. Red blocks deploy.

---

## 14. Working with Claude Code

**Every prompt is structured:**

```
## Context
## Bug evidence  (or: Requirement)
## Required fix
## Do not touch
## Verify before reporting
## Autonomy
## Tests
## At end
```

**`## Autonomy` always says:** decide without asking; note assumptions taken; hard-stop only for a new fetch, a new RPC, a schema change, or anything destructive.

**Every prompt ends with:** do NOT commit, do NOT push, do NOT tag. (Plus "do NOT deploy" when an Edge Function is involved.)

**Always require it to verify property and column names against the actual schema before using them.** It has invented columns that do not exist.

**Ask it to prove the security-sensitive parts explicitly**, after every feature:
- "List every secret this touched and where it lives."
- "List every table this touched and confirm RLS is enforced on each."

**Prompt in vertical slices** — one feature end to end — not horizontal layers. Each change should be independently testable and shippable.

**Its report is not verification.** Confirm with `grep` before pushing. A delivery report is a claim, not evidence.

---

## 15. Environments and deploy

- **`prograpple-dev` and `prograpple-prod` are separate Supabase projects.** Claude Code points at dev. Promotion to prod is deliberate and manual. Never test against real coach data.
- **Both start on the Supabase free tier.** `prograpple-prod` moves to Pro **the day the first external coach receives a login** — free projects pause after 7 days of inactivity and take ~30s to wake, which is unacceptable once a real user might open the app unannounced. Do not use a keep-alive ping instead: it is ongoing maintenance that fails silently at the worst possible moment. `prograpple-dev` stays free.
- **ProGrapple lives in its own Supabase organisation**, separate from myBJJ. The free tier allows two active projects per organisation, and myBJJ already needs both of its own. A separate organisation is sufficient — a whole separate account is not required — and it keeps billing separate while partnership terms are open.
- **Edge Functions do not deploy with the frontend.** Separate pipeline (`supabase functions deploy <name>`).
- **The `verify_jwt` trap:** CLI deploys enable `verify_jwt` by default. On a public-facing function that returns 401 before any code runs, and the logs show only boot and shutdown with no application error. Pin `verify_jwt = false` in `supabase/config.toml` for any public function. Confirm with `curl -i`: **401 means the gate blocked it; 403 means the request reached your code.**
- **Backups:** the free tier has none. Before any real coach data exists in prod, either be on Pro (daily backups, 7-day retention) or have a scheduled export running. Decide before the data exists, not after.
- **Cost alerts** set on Supabase and any AI API. GitHub Pages has no metered cost at this scale. The known risk is video egress once upload ships; the unknown risk is a runaway function.

---

## 16. Compliance posture

Not a legal programme — a design input, so the answers are "handled" rather than "never thought about it."

- **Minors.** Competition squads include under-18 athletes. Footage of identifiable minors is personal data. Keep it access-controlled and org-scoped; never public by default. Before any module stores weight or body data on a minor, decide the consent flow and the minimisation rule first. myBJJ hit this as a retrofit: a public storage bucket meant every uploaded photo — including children's, including ones pending approval — was publicly fetchable, with approval enforced only at the app layer. Private bucket plus signed URLs is the answer, and it is far cheaper before there is data than after.
- **Data ownership and export.** Coaches own their data. One-click export builds trust, is a selling point, and covers "right to access." Cheap early, painful to retrofit.
- **Jurisdiction.** Australia (Privacy Act); coaches may be elsewhere. A privacy policy, terms of service, and a defensible answer to "where is my data and can I delete it." Templates are fine to start.
