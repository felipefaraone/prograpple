# ProGrapple — Architecture

**Version:** 0.2
**Scope:** MVP (Video Room, Step 1 of the roadmap), as defined in `ProGrapple_MVP_Build_Spec`.
**Status of this document:** design decisions for _this_ system. Changes as the product learns.
**Changed in 0.2:** hosting corrected to GitHub Pages (Netlify in 0.1 was an unverified assumption); Supabase organisation rather than account; frontend build step documented; §2 and §4.1 marked provisional pending John.

> **Companion document:** `CONVENTIONS.md` holds the rules that do not change per feature (schema style, migrations, security discipline, query rules, prompt protocol). Feed `CONVENTIONS.md` to Claude Code at the start of **every** task. Feed the relevant section of _this_ document only when the task touches it.

> ✅ **§2 and §4.1 are now settled** (29 July 2026, decisions T20 and T21). John answered: footage lives everywhere — phone, laptop, YouTube, Drive — and one file should be a single round. The MVP supports local file and direct URL on a native player; YouTube and Vimeo stay deferred behind the §2.4 interface. The pairing stays on the video, and a session file is handled by several `videos` rows sharing one file fingerprint. Every section of this document is now safe to build against.

---

## 0. What this document decides

The MVP Build Spec says _what_ gets built. This says _how the system is shaped_, specifically in the seven places where the answer is not obvious and where getting it wrong costs a migration or a rewrite:

1. How video is loaded and played (§2)
2. How a tag gets written (§3)
3. The data model (§4)
4. The taxonomy model (§5)
5. How data is read back without silently losing rows (§6)
6. The security model and how it is proven (§7)
7. What export actually is (§8)

Everything else in the MVP is ordinary CRUD and needs no architecture.

---

## 1. System shape

```
┌──────────────────────┐        ┌───────────────────────────┐
│  Frontend (static)   │◄──────►│  Supabase                 │
│  vanilla JS + Vite   │  anon  │  Postgres + Auth + RLS    │
│  hosted: GitHub Pages│  key   │  Edge Functions (secrets) │
└──────────────────────┘        └───────────────────────────┘
         │
         │  video never leaves the browser in the MVP:
         │  direct URL streams from its origin,
         └─ local file plays from a blob URL
```

- The frontend talks to Supabase directly with the anon key. RLS is what protects data, not the key.
- **No video host in the MVP.** No Supabase Storage for video, ever (egress). Bunny Stream arrives with upload, which is deferred.
- **No secrets in the frontend.** The anon key is the only key that ships. Anything privileged lives in an Edge Function.

**Two Supabase projects, both free tier during the build:** `prograpple-dev` and `prograpple-prod`. The free tier allows exactly 2 active projects per organisation, which is why ProGrapple lives in its **own Supabase organisation**, separate from myBJJ (which already occupies both of its own slots, one being its planned staging). A separate organisation is sufficient; a separate account is not required.

**Frontend deploy.** The static bundle is built by GitHub Actions and published to GitHub Pages from a public repo — the same hosting pattern as myBJJ, with one difference that matters: myBJJ serves `index.html` directly, so deploy is `git push`, whereas Vite produces a `dist/` that must be built first. Publishing raw `/src` will not work. Edge Functions deploy separately via `supabase functions deploy`.

**Upgrade trigger:** `prograpple-prod` moves to Pro ($25/mo) **the day the first external coach receives a login** — not before, not later. Free-tier projects pause after 7 days of inactivity and take ~30s to wake. During the build that is irrelevant. During validation, a coach opening the app unprompted and getting a connection error destroys the exact signal the MVP exists to collect. Do **not** paper over this with a cron ping: it is maintenance that fails silently at the worst moment. `prograpple-dev` stays free permanently.

---

## 2. Video: source model and player

> ✅ **Settled — T20.** John's answer was "all of the above": phone, laptop, YouTube, Drive. No source dominates, so no source-specific investment pays off, and the decision is to take the one with zero infrastructure. He also proposed restricting the product to upload; that is deferred for the reasons in T20 — it is the largest deferred block in the project and it costs the coach minutes before the first tag, in exchange for solving a commodity problem that carries no technical risk.

This is the hardest part of the MVP and the part with the least prototype evidence behind it. Read this section before writing any player code.

### 2.1 Decision: two sources, one player

| Source                                           | In MVP       | Player                          |
| ------------------------------------------------ | ------------ | ------------------------------- |
| Direct video URL (`.mp4`, `.webm`, `.mov/H.264`) | **Yes**      | native `<video>`                |
| Local file from the coach's disk                 | **Yes**      | native `<video>` + blob URL     |
| YouTube link                                     | **Deferred** | would need the IFrame API       |
| Vimeo link                                       | **Deferred** | would need the Vimeo Player SDK |

**Why only two.** The MVP requires a custom player with `±1s` seek and `0.5×–2×` speed. That is only fully achievable on a native `<video>` element. YouTube's IFrame API gives polled time (hundreds of ms granularity), a fixed speed set, re-buffering seeks, and branding constraints on hiding native controls. Vimeo is a second SDK with its own auth model for private video — a separate integration, not a variant of the first. Supporting all four sources means **three player implementations** behind one UI, which the MVP Build Spec budgets as a single line item.

**Why deferring is safe.** The prototype never loaded a video at all — it played one hardcoded sample MP4. YouTube and Vimeo have never been built, demoed, or reacted to by a coach. There is no evidence anyone needs them yet.

**What would reverse this.** A coach whose footage is on YouTube and who will not download a file to test. That is the first thing to watch at Gate 1, and the fix is additive: a second adapter behind §2.4's contract, no schema change (T20a).

### 2.2 Codec reality

A local file only plays if the browser can decode it. Phone footage (H.264 MP4) and most GoPro output work. H.265/HEVC is inconsistent. AVI and MKV do not play in any browser without transcoding — which is exactly why upload/transcoding is deferred.

Do not silently fail. Listen for `video.error` and surface the truth: _"This browser can't play this file (format not supported). Try an MP4."_ A player that shows a running timeline over nothing is scenery, not software.

### 2.3 Local files have no persistent identity — how it is handled

A `File` picked from an `<input>` is a blob in memory. `URL.createObjectURL(file)` produces a URL that dies on reload. So without design, the coach returns tomorrow to 40 tags and nothing to play.

**`videos` therefore stores a fingerprint, not a handle:**

```
source_type        'url' | 'local'
source_url         text        -- populated for 'url', null for 'local'
file_name          text        -- 'local' only
file_size_bytes    bigint      -- 'local' only
duration_seconds   numeric     -- both
```

**Relink flow.** Opening a `local` video with no live blob renders the full record — title, tags, clips, timeline, filters, export — with the player area replaced by an explicit _"Video not loaded — locate file"_ state. The coach picks the file; match on `file_name` **and** `file_size_bytes` **and** `duration_seconds` (±0.5s tolerance). On mismatch, warn and let them override; do not block.

**Progressive enhancement, not the primary path.** On Chromium desktop, `showOpenFilePicker()` returns a `FileSystemFileHandle` that survives in IndexedDB. Store it keyed by video id; on open, `queryPermission()` → if granted, auto-relink with no gesture. Safari and Firefox do not support this, so the manual relink above is always the fallback and always shipped.

**This changes the Definition of Done.** MVP Build Spec §8 currently reads _"…and all of it persists."_ It cannot be literally true for local files. Replace with:

> …and all of it persists. For local files the coach re-selects the file once per session (automatically on Chrome desktop); tags, clips and the timeline are never lost.

### 2.4 Player contract

One module, one object, no direct `<video>` access from feature code:

```
player.load(source)      // {type:'url', url} | {type:'local', file}
player.play() / pause()
player.seek(seconds)     // absolute
player.nudge(delta)      // ±1, ±5
player.setRate(r)        // 0.5 | 0.75 | 1 | 1.25 | 1.5 | 2
player.time              // getter, seconds (float)
player.duration          // getter, seconds
player.on('time'|'ready'|'error', fn)
```

Written this way, adding YouTube later is a second adapter behind the same interface. Written any other way, it is a rewrite.

---

## 3. The tag write path

Dropping a tag is the hot path of the entire product and the only place where latency is a _feature requirement_, not a quality concern. The spec's word is "instantly."

### 3.1 Never `await` the insert before rendering

A naive `await supabase.from('tags').insert(...)` per tag costs 150–800ms round trip. A coach tags 20–60 moments in a six-minute roll, sometimes two within a second. That latency lands exactly where the coach's attention is on the video, and a dropped connection loses tags with no recovery and no error.

### 3.2 Client-generated UUID + optimistic render + outbox

```
1. id = crypto.randomUUID()          // client side, NOT gen_random_uuid()
2. push into in-memory state, render timeline + list  → returns in <16ms
3. enqueue {id, payload} into an IndexedDB outbox
4. background flush: insert with on-conflict-do-nothing, batched
5. on success: dequeue. on failure: retry with backoff, keep queued
6. surface a single unobtrusive "N unsaved" indicator when the queue is non-empty
```

The client-generated UUID is what makes step 4 idempotent — a retry after an ambiguous failure cannot duplicate. This is the half of "UUID primary keys" that matters, and it is the opposite of Supabase's default.

**Verify the write, do not assume it.** A mutation that returns an empty array with a null error is an anomaly, not a success — this exact signature (a silent no-op upsert colliding with a stale constraint) cost a real production bug in myBJJ, where the UI reverted the user's action on the next hydrate. The flush must check that rows came back, and requeue if they did not.

Same treatment for tag delete and clip save. Tag _detail_ edits (result, note) are post-hoc and low-frequency — a plain awaited update with a saving indicator is fine there.

---

## 4. Data model

> ✅ **Settled — T21.** One video record is one round between one pair. John's own rule: a file should be a single round, not an hour of ten. A coach who films continuously is not forced into an editor first — they create several `videos` rows against the same file, which the relink fingerprint matches in one pick, each row carrying its own pairing. If session files become the norm, `start_seconds` / `end_seconds` on `videos` bound each row to a window: two nullable columns, additive, not built now.

```sql
orgs
  id                uuid pk
  name              text not null
  created_at, updated_at

memberships
  user_id           uuid not null references auth.users
  org_id            uuid not null references orgs
  role              text not null default 'head_coach'   -- 'athlete' reserved, no UI
  quick_tag_recents jsonb not null default '[]'          -- MRU taxonomy ids, per coach per org
  created_at, updated_at
  primary key (user_id, org_id)

athletes
  id           uuid pk
  org_id       uuid not null references orgs
  name         text not null
  kind         text not null                              -- 'athlete' | 'opponent'
  archived_at  timestamptz
  created_by_user_id uuid references auth.users
  created_at, updated_at

videos
  id                uuid pk
  org_id            uuid not null references orgs
  title             text not null
  athlete_id        uuid references athletes               -- the subject ("us")
  opponent_id       uuid references athletes               -- the other side ("them")
  source_type       text not null                          -- 'url' | 'local'
  source_url        text
  file_name         text
  file_size_bytes   bigint
  duration_seconds  numeric
  archived_at       timestamptz
  created_by_user_id uuid references auth.users
  created_at, updated_at

tags
  id                 uuid pk                               -- generated client-side
  org_id             uuid not null references orgs
  video_id           uuid not null references videos on delete cascade
  timestamp_seconds  numeric not null
  side               text not null                         -- 'athlete' | 'opponent'
  taxonomy_id        uuid not null references taxonomy
  result             text                                  -- 'scored' | 'attempted' | 'defended' | null
  note               text
  created_by_user_id uuid references auth.users
  created_at, updated_at

clips
  id                 uuid pk                               -- generated client-side
  org_id             uuid not null references orgs
  video_id           uuid not null references videos on delete cascade
  in_seconds         numeric not null
  out_seconds        numeric not null
  name               text not null
  created_by_user_id uuid references auth.users
  created_at, updated_at

taxonomy
  id          uuid pk
  org_id      uuid                                          -- NULL = global seed
  category    text not null      -- position|pass|sweep|takedown|back|legs|submission|event
  term        text not null
  synonyms    text[] not null default '{}'
  is_generic  boolean not null default false                -- "Pass (unspecified)" etc.
  is_default  boolean not null default false
  sort_order  int
```

### 4.1 Why the pairing lives on the video and not on the tag

The MVP Build Spec's `tags(athlete_id, side)` is ambiguous, and the ambiguity produces a bug. Two readings are equally natural:

- `athlete_id` is always the subject of the video, and `side` says who performed the action → the opponent's identity is never captured.
- `athlete_id` is whoever performed the action (possibly an `athletes` row of kind `opponent`) → `side` is then derivable from that row and is redundant.

Both readings satisfy the timeline spec ("athlete tags above the line, opponent below"). They disagree about what "filter by athlete" means. Claude Code will pick one on Friday and the other on Tuesday.

**The prototype already answers this:** it stores `side: 'us' | 'them'` and no athlete reference at all. The model above is that, normalised — the pairing is a property of the _video_ (`athlete_id` + `opponent_id`), and the tag carries only which side acted. There is exactly one representation of the fact, so nothing can drift.

Consequence: "filter by athlete" filters the video library, not tags within a video. That is the honest reading and it is what a coach actually wants.

### 4.2 Clips are their own table

The MVP Build Spec says _"mark in/out around a tag"_ and the original blueprint puts `clip_start` / `clip_end` on the tag row. **The prototype does neither** — `saveClip()` pushes a free-standing `{in, out, name}` that never references a tag. A clip with no tag is the _default_ behaviour of the thing the coach used, and it is unrepresentable in both documents.

Own table. A clip may overlap any number of tags; that relationship is computed from timestamps, not stored.

### 4.3 Denormalised copies are forbidden

The prototype's tag object carries `cat` and `label` alongside `taxId`. In memory that is a harmless cache. In Postgres it is two sources of truth that drift the first time a term is renamed. Store `taxonomy_id`; get the rest by join.

### 4.4 Deletes

`tags` and `clips` are hard-deleted — high volume, low historical value, and the coach deleting a mis-drop expects it gone. `athletes` and `videos` use `archived_at` (soft), because deleting them by accident destroys referential context.

Where `archived_at` exists, filtering it is **not** the frontend's job repeated in every list. Expose `active_athletes` / `active_videos` views, or fold it into the RLS policy. One place, not twelve.

---

## 5. Taxonomy model

### 5.1 The prototype's taxonomy fuses two axes and must be split

The 82-term prototype taxonomy has 8 categories, one of which — `pts` (Points) — is not a category of technique at all. It is a **scoring axis wearing a category's clothes**, and it collides with the other seven:

- Three terms are literally duplicated across categories: `Mount`, `Knee on Belly`, `Back Control` each exist in both `pos` and `pts`.
- Four more shadow whole categories: `pts:Guard Pass (3)` against nine passes, `pts:Sweep (2)` against nine sweeps, `pts:Takedown (2)` against seven takedowns, `pts:Submission (finish)` against sixteen submissions.
- A third representation of the same axis already exists as the tag's `result` field (`scored` / `attempted` / `defended`).

Tagging `pass:Knee Cut` and then `pts:Guard Pass (3)` records one event twice on two axes. This is the same class of defect as fusing uniform, level and audience into a single pre-baked `class type` — a mistake that cost a migration plus a refactor in myBJJ, and which is cheapest to avoid before the seed becomes a table.

### 5.2 The split

**`pts` dissolves into two things.**

_Seven of its eleven terms are derivable_ from `category` + `result` under a ruleset:

| category                 | result = scored | points (IBJJF) |
| ------------------------ | --------------- | -------------- |
| takedown                 | ✓               | 2              |
| sweep                    | ✓               | 2              |
| pass                     | ✓               | 3              |
| position (knee on belly) | ✓               | 2              |
| position (mount)         | ✓               | 4              |
| position (back control)  | ✓               | 4              |
| submission               | ✓               | finish         |

This becomes a pure function `pointsFor(category, term, result, ruleset)`. **It is not built in the MVP** and no points are displayed. The point of stating it here is that the schema must not _prevent_ it — which storing `pts:Guard Pass (3)` as a taxonomy term would.

_Four survive_ as a new category `event`, because nothing derives them: **Advantage, Penalty, Scramble, Reset (ref stand-up)**.

**Final shape: 7 technique categories (71 terms) + `event` (4 terms) = 75.** Correct the MVP Build Spec, which says "~90 terms" — the prototype has 82, of which 18 carry synonyms.

### 5.3 The UX cost, and how it is paid

Today the coach hits one chip labelled "Guard Pass (3)". Under the split that would be two gestures — pick the pass, then set the result — in the fastest path of the product. That is a regression and it is not acceptable.

**Quick-tags become composite presets.** A quick-tag writes `(taxonomy_id, result)` in a single tap:

```
"Pass ✓"        → taxonomy_id = pass:Pass (unspecified),   result = 'scored'
"Sweep ✓"       → taxonomy_id = sweep:Sweep (unspecified), result = 'scored'
"Sub attempt"   → taxonomy_id = submission:Submission (unspecified), result = 'attempted'
```

This requires one **generic term per category** (`is_generic = true`), so the fast path never forces the coach to choose _which_ pass mid-roll. Refining `Pass (unspecified)` → `Knee Cut` happens later from the tag list.

This is the MVP Build Spec's own stated philosophy — _"tag detail: optional, added after the fact… never blocks the fast drop"_ — applied to the taxonomy instead of only to the note field.

### 5.4 Search stays on the client

75 rows. Fetch once on load, keep in memory, match in JS: lowercase, `startsWith` bucket first, `includes` bucket second, over `term` plus `synonyms`. This is exactly the prototype's `searchTax()` and it is correct.

**Explicitly do not build server-side search.** `pg_trgm` + a GIN index over 75 rows would put a network round trip inside the fastest gesture in the product. This is written down because it is the kind of "proper" solution an agent reaches for unprompted.

### 5.5 Global vs org rows

`taxonomy.org_id IS NULL` means global seed. The obvious RLS policy (`org_id = my org`) **excludes every global row**, and the coach opens the picker to an empty list — which reads as a data bug and gets debugged in the wrong place. The policy must be:

```sql
using (org_id is null or org_id in (select org_id from memberships where user_id = auth.uid()))
```

---

## 6. Reading data back

### 6.1 The row ceiling is the highest-probability silent failure in this system

PostgREST truncates every response at `max-rows` (1000 by default) with **no error and no warning**. Without an `ORDER BY` the cut follows physical heap order, which drops the **most recently inserted** rows.

Applied here: one six-minute roll is ~40 tags. A camp is 30 videos × 40 = 1,200 tags in a single org. The tag list exceeds 1000 in month one, and the rows that vanish are the ones the coach just dropped.

This is not hypothetical. The identical failure hit myBJJ in production: an owner entered attendance, could not see it, while an instructor could see everything. Diagnosis took a wrong turn through permissions first. The signature is worth memorising:

> **The data exists in the database, one user sees it and another does not, switching context does not help, and the console is clean.** Compare how many rows each profile receives _before_ investigating permissions — the user with more access receives more rows and overflows first. "Whoever has more access sees less."

### 6.2 Rules

1. **Every list query has an explicit `.order()`.** Two of them: the meaningful field, then `id` as a tiebreaker. Without total ordering, pagination duplicates and skips rows.
2. **Paginate explicitly rather than trusting the implicit ceiling.** Page in blocks of 1000 with `.range()`, with a safety cap on iterations.
3. Return `{data, error}` from the paging helper so it drops into where the single query was.

```js
async function fetchAllTags(client, videoId) {
  const PAGE = 1000;
  let all = [],
    from = 0;
  for (let page = 0; page < 10; page++) {
    const r = await client
      .from('tags')
      .select(TAG_COLS)
      .eq('video_id', videoId)
      .order('timestamp_seconds', { ascending: true })
      .order('id', { ascending: true })
      .range(from, from + PAGE - 1);
    if (r.error) return { data: null, error: r.error };
    all = all.concat(r.data || []);
    if ((r.data || []).length < PAGE) break;
    from += PAGE;
  }
  return { data: all, error: null };
}
```

### 6.3 Indexes

```sql
create index on tags (org_id, video_id, timestamp_seconds);
create index on clips (org_id, video_id, in_seconds);
create index on videos (org_id, archived_at, created_at desc);
create index on athletes (org_id, archived_at, name);
```

---

## 7. Security

### 7.1 Model

The MVP builds **one role (head coach) and one org per coach**. The full five-role matrix from John's PRD is explicitly deferred. So the isolation model is single-axis: _the row's `org_id` must be one the current user belongs to via `memberships`_.

- RLS enabled on every table, a separate policy per command (select / insert / update / delete).
- `taxonomy` is the one exception (§5.5).
- The frontend also scopes every query by the active org. Two locks. RLS is the one that saves you when app code is wrong.

**Extension seam.** When roles arrive, `memberships.role` extends without reshaping anything. What does _not_ come free is per-athlete assignment (needs a `coach_athletes` join table) and per-video visibility (needs a column plus layered policies). Both are additive; neither is built now.

### 7.2 The service-role key

The anon key ships in the bundle and is safe — RLS protects everything behind it. The **service-role key bypasses RLS entirely**. It appears in Edge Function environment variables and nowhere else — never in frontend code, never in git.

When an Edge Function uses the service role, it must scope by `org_id` manually. A service-role query missing its `where org_id = …` is a cross-tenant leak, and it is the single most likely way an AI-written backend leaks data. Ask, every time: _does this use the service role, and if so where is the org filter?_

### 7.3 Org bootstrap must not race

"Create org on first sign-in" written in client code creates two orgs when a coach double-taps their magic link. Use a `SECURITY DEFINER` trigger on `auth.users` AFTER INSERT that creates the org and the membership in one transaction, guarded by the `memberships` primary key. The client never provisions.

### 7.4 The isolation test — specified, because "an isolation test" is not enough

This is the only security control the MVP has, which makes its precision matter more, not less.

1. **It runs as an authenticated user holding the anon key.** Run it with the service role and it passes unconditionally while proving nothing. This is the mistake to guard against.
2. **The table list comes from the catalog, not from a hand-written array.** Query `pg_tables` for schema `public` and iterate. A hand-written list means the next table added silently escapes the test.
3. **It asserts RLS is enabled**, which is a different failure from a wrong policy. Assert `pg_tables.rowsecurity = true` for every table, and that each has at least one policy per command. A forgotten `ALTER TABLE … ENABLE ROW LEVEL SECURITY` is the likeliest leak of all, and a policy-correctness test does not catch it.

Shape: seed two orgs with two users; for every public table, authenticate as user A and assert zero rows belonging to org B; assert RLS enabled and policies present on all of them. Run in CI on every push against a local `supabase start` instance (hermetic, ~2–3 min of Docker pulls) or, if that proves too slow, against two seeded orgs in `prograpple-dev`.

---

## 8. Export

Export is the stated payoff — the "show the athlete" output — and in the prototype it is six columns of formatted strings with no link to anything.

### 8.1 What a row is

```
video_title, video_url, timestamp_seconds, timestamp_display,
side, athlete_name, category, term, result, note, deep_link
```

- `timestamp_seconds` is **numeric**. The prototype exports `"6:23"`, which cannot be read back into the app or sorted correctly in a spreadsheet. Ship both: numeric for machines, `mm:ss` for humans.
- `deep_link` is `https://<app>/?v=<video_id>&t=<seconds>` — a root-level query string, so it needs no routing configuration on any static host. Opening it loads the video and seeks. **This one column is what turns a list of numbers into a usable artifact.**
- **Clips are exported.** The prototype never exports `state.clips` at all, despite the spec listing "clip list" and the Definition of Done saying "mark and export clips." Second section or second file, with `in_seconds`, `out_seconds`, `name`, and a deep link to the in-point.
- Escape properly: quote fields containing commas. The prototype replaces commas with semicolons, which corrupts the coach's notes.

### 8.2 Known limitation — state it, do not paper over it

Athletes have no login (deferred). So `deep_link` only works for someone with a session — the coach. What the athlete actually receives is a spreadsheet.

**The "show the athlete" output is genuinely weak until either athlete login or tokenised share links exist.** The MVP carries this knowingly. It is the first thing to fix after the coach signal if the coach confirms that sharing is the point — and it is cheap once decided (a signed, expiring share URL plus a read-only view).

---

## 9. Keyboard

The prototype and John's PRD collide on the number row: the prototype uses `1`/`2` to switch side, the PRD wants number keys for quick-tags. Resolved in the PRD's favour at no cost, because `Tab` already switches side:

| Key             | Action                           |
| --------------- | -------------------------------- |
| `Space`         | play / pause                     |
| `Tab`           | switch side (athlete ⇄ opponent) |
| `1`–`8`         | drop quick-tag 1–8               |
| `T`             | open taxonomy palette            |
| `←` / `→`       | ∓1s                              |
| `J` / `L`       | ∓5s                              |
| `[` / `]`       | previous / next tag              |
| `I` / `O` / `C` | clip in / out / save             |
| `?`             | shortcuts overlay                |
| `Esc`           | close palette / overlay / detail |

Every shortcut is suppressed while focus is in an input or textarea.

---

## 10. Failure and offline behaviour

The coach tags on a laptop, often on venue or gym wifi. The product is not offline-first, but it must not lose work when the network blinks.

| Failure                      | Behaviour                                                                                                                                  |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Network drops mid-session    | Tags and clips queue in the outbox; a single "N unsaved" indicator appears; flush resumes automatically                                    |
| Video fails to decode        | Explicit error naming the format. Never a running timeline over nothing — the prototype's `sim` mode is demo scaffolding and does not ship |
| Local file not relinked      | Full record renders; player area shows "locate file"                                                                                       |
| Supabase unreachable at load | Explicit retry state, not an empty roster that looks like data loss                                                                        |

---

## 11. Deliberately not built (and what it costs to add)

| Deferred                                    | Cost to add later                                                                                                             |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Upload + transcoding + Bunny                | Additive: new columns on `videos`, new pipeline. No reshaping                                                                 |
| YouTube / Vimeo sources                     | Additive: a second player adapter, if §2.4's interface holds                                                                  |
| Five-role permission matrix                 | `memberships.role` extends free; per-athlete assignment and per-video visibility are new tables/columns plus layered policies |
| Athlete login                               | Role already reserved in `memberships`; needs UI and a visibility model                                                       |
| Points display                              | Pure function over existing columns — zero schema change, which is the entire reason §5.2 splits the axes now                 |
| Collections, comments, review status        | New tables referencing `videos`. No reshaping                                                                                 |
| Any automated video analysis / auto-tagging | Out of scope indefinitely. AI, when it arrives, sits on top of human tags                                                     |
