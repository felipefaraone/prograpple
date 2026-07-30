# ProGrapple — Fidelity Audit (prototype vs `src/`)

**Date:** 2026-07-30
**Author:** Claude Code (analysis only — no code changed in this task).
**Compared:** `Prototype/index.html` (the approved north star) against all of `src/` as of build step 6 (tagging drop path).

## Method & legend

Every prototype feature, interaction and visual treatment is classified:

- **BUILT** — exists in `src/` and matches.
- **PARTIAL** — exists but differs; the difference is stated.
- **PLANNED** — not built, but named in the MVP build order.
- **MISSING** — in the prototype, in **no** plan document at all.

**On the build order.** There is no `ProGrapple_MVP_Build_Spec` text file in the repo. The build order lives in `mvp_epic_build_sequence.png`, which reads:

1. Project scaffold → 2. Database foundation → **Gate 1** → 3. Auth & athlete spine → 4. Video, player, timeline → 5. **Tagging engine** (instant drop, quick tags, side toggle) ← *current* → 6. **Filter, clips, export** (tag detail, in/out, CSV) → 7. Ship & observe.

So most gaps below land in step 6 ("Filter, clips, export"). Where something is not in that sequence but *is* named in `ARCHITECTURE.md`/`CONVENTIONS.md`, I say so and still call it PLANNED (a plan document covers it). MISSING is reserved for prototype behaviour that **no** document covers.

Counts depend on granularity; the item breakdown and totals are at the end.

---

## 1. Keyboard shortcuts

The prototype's shortcut table (lines 535–542) versus `src/lib/player-controls.js` (transport keys) and `src/features/tagging/tagger.js` (tagging keys).

| Prototype shortcut | Status | Notes |
|---|---|---|
| `Space` play/pause | **BUILT** | `player-controls.js`. |
| `T` tag (opens palette) | **BUILT** | `tagger.js` → `palette.open()`. |
| `Tab` switch side | **BUILT** | `tagger.js`, `preventDefault`'d. |
| `1` / `2` = tag as Alex / Duarte (set side) | **PARTIAL** | Deliberately remapped. In `src`, `1`–`8` fire the eight quick-tags and side is switched only by `Tab`. This is not a defect — it follows `ARCHITECTURE.md §9`, which resolved the prototype-vs-PRD collision in the PRD's favour (number keys = quick-tags, `Tab` = side). |
| `←` / `→` step ∓1s | **BUILT** | `player-controls.js`. |
| `[` / `]` previous / next tag | **BUILT** | `tagger.js`, via the in-memory store. |
| `I` / `O` / `C` clip in/out/save | **PLANNED** | Build step 6 ("in and out"). No clip code exists. |
| `?` shortcuts overlay | **PLANNED** | Named in `ARCHITECTURE.md §9`, but not a discrete build-order step and not built. |
| `Esc` closes palette / overlay / detail | **PARTIAL** | `Esc` closes the palette (built). The shortcuts overlay and the tag-detail editor don't exist yet, so those two Esc targets are PLANNED. |
| Speed set `0.5× / 1× / 1.5× / 2×` (4 steps) | **PARTIAL** | `src` ships six steps `0.5 / 0.75 / 1 / 1.25 / 1.5 / 2` per `ARCHITECTURE.md §2.4` — a superset, not a loss. |

**`src` adds keys the prototype never had:** `J` / `L` = ∓5s (and −5s/+5s buttons), per `ARCHITECTURE.md §9`. An addition, not a fidelity gap.

Every shortcut in both is suppressed while focus is in an input/textarea/select (`isTypingTarget`), matching the prototype's `inField` guard.

---

## 2. Quick-tag set and how it is chosen

| Aspect | Prototype | `src` | Status |
|---|---|---|---|
| Count | 8 | 8 | — |
| How chosen | **Dynamic**: most-recently-used (up to 6) prepended to `QUICK_DEFAULTS`, sliced to 8 (`renderQuick()`) | **Fixed** frontend constant of 8 (`quick-tags.js`) | **PARTIAL** |
| What a tap writes | `taxonomy_id` only, `result: null` (`addTag`) | Composite `(taxonomy_id, result)` in one action | **PARTIAL** |
| Resolution | Direct id strings (`"pts:Guard Pass (3)"`) | `(category, term)` resolved to id at load, **fails loudly** if the seed disagrees (T25) | improvement |
| Chip styling | Category-colour dot + name | `kbd` number + label + a result chip; **no category-colour dot** | **PARTIAL** |
| "All tags" affordance | Dashed `+ all tags` chip in the quick row | Separate "All tags" button (opens palette) | **BUILT** (function preserved, restyled/moved) |
| Recents (MRU) behaviour | Drives the quick row; `state.recents` | **Not built.** Replaced by fixed presets per `ARCHITECTURE.md §5.3`. The `memberships.quick_tag_recents` column exists but nothing writes/reads it yet | **PARTIAL** (by design) |

Blunt version: the prototype's quick row *learns* (recents float to the front); `src`'s is a static eight. That is an intentional call (T25 + §5.3), and the composite `(id, result)` is genuinely better than the prototype's result-less drop — but the category-colour dot was dropped, so the quick chips read as plainer text than the prototype's colour-coded ones.

The eight in `src` (derived from the prototype's `QUICK_DEFAULTS`, remapped onto the split taxonomy): Guard pull, Pass (scored), Sweep (scored), Back take (scored), Sub attempt, Mount (scored), Sub finish, Scramble.

---

## 3. Taxonomy palette

`src/features/tagging/palette.js` vs the prototype palette (lines 526–530, 867–919).

| Behaviour | Status | Notes |
|---|---|---|
| Opens on `T` and via "All tags" | **BUILT** | |
| Fuzzy search: lowercase, `startsWith` bucket then `includes`, over term + synonyms | **BUILT** | `taxonomy.js searchTaxonomy()` — identical algorithm to the prototype's `searchTax()`. |
| Keyboard: `↑`/`↓` move, `Enter` pick, `Esc` close | **BUILT** | |
| Drop writes `result = null` | **BUILT** | Refinement deferred, matching the prototype. |
| Backdrop click + explicit close (`✕`) | **BUILT** | `src` adds a visible close button; the prototype relied on scrim/Esc only. |
| Mounts at the app root (overlay) | **BUILT** | `document.body`, per `CONVENTIONS.md §11`. |
| Results **grouped by category** with coloured group labels | **PARTIAL** | `src` renders a **flat** list. No category grouping. |
| Category-colour dot per item | **PARTIAL** | Absent in `src`; items show term + category name (plain text) + synonyms. |
| "Tagging *&lt;side&gt;* at *&lt;time&gt;*" context header | **PARTIAL** | Absent in `src` — the palette does not show which side or timestamp you're about to tag. |
| `Tab` inside the palette switches side | **PARTIAL** | Not handled in `src` (the prototype toggles side and updates the pill live). |

The core palette works and the search is faithful. What's lost is *orientation*: the prototype's palette tells you who and when you're tagging and colour-groups the list; `src`'s is a plain filter box.

---

## 4. Timeline: layout, markers, collisions

`src/features/timeline/timeline.js` + `src/ui/video.css` vs the prototype timeline (lines 87–108, 656–705). The prototype's own comment calls this **"the product's signature."**

| Aspect | Prototype | `src` | Status |
|---|---|---|---|
| A drop appears as a marker, positioned by time | yes | yes | **BUILT** |
| Athlete above the line, opponent below | yes (top/bottom lanes) | yes (`.tl-lane.athlete` / `.opponent`) | **BUILT** |
| Click a marker to seek | yes | yes | **BUILT** |
| Delete a marker | via list `✕` | Alt-click / right-click a marker | see §5 (PARTIAL) |
| Marker colour | **by category** (`catById[cat].color`) | **by side** (blue/red) | **MISSING** (category colour on markers not carried; no plan specifies it — `ARCHITECTURE.md §4.1` only mandates the above/below split) |
| Moving **playhead** on the timeline | yes | **none** | **MISSING** |
| Buffer bar / lane background bands / legend | yes (`--us-soft`/`--them-soft` bands, "Alex top / Duarte bottom" legend) | **none** (thin centre line + bare lanes) | **MISSING** |
| Hover-time tooltip | yes | **none** | **MISSING** |
| Click empty track to seek | yes | **none** (only markers seek) | **MISSING** |
| Placement | directly under the video, always on screen | below the video **and** below the tag bar, in a scrolling column | **PARTIAL / regressed** (see call-out §A) |

So the "signature" is present in mechanism (markers, side split, seek) but stripped of nearly all of its instrumentation: no playhead, no scrub-on-track, no hover time, no category colour, no lane shading, no legend. It is a marker container, not the prototype's rich transport-linked timeline.

---

## 5. Tag list and detail refinement

Entirely **PLANNED** — build step 6 ("Tag detail"). None of it exists in `src` (step 6 explicitly deferred the list, detail editing, and filtering).

| Prototype feature | Status |
|---|---|
| Scrollable tag list (time · side bar · label · category dot · athlete · result badge · note) | **PLANNED** |
| `+ Detail` / `Edit` inline editor | **PLANNED** |
| Result editing (scored / attempted / defended segmented control) | **PLANNED** |
| Note editing (textarea) | **PLANNED** |
| Count pill; current-tag highlight synced to playback | **PLANNED** |
| Delete a tag | **PARTIAL** — the delete **write path** is built (optimistic remove + outbox + verify, per §3.1), but only via Alt-click/right-click on a timeline marker. The prototype's discoverable list `✕` does not exist. |

---

## 6. Filters

**PLANNED** — build step 6 ("Filter"). The prototype has eight category filter chips that dim non-matching markers and filter the list (`renderFilters`, `.f-chip`). `src` has **none**.

## 7. Clips

**PLANNED** — build step 6 ("in and out"). Prototype: mark In (`I`), mark Out (`O`), save (`C`), pending + saved clip overlays on the timeline, a saved-clips list, and in→out clip playback. `src` has **none** — no clip UI, no `I/O/C` keys, no `clips` reads/writes. (The `clips` table exists in the schema; the surface does not.)

## 8. Export

**PLANNED** — build step 6 ("CSV"). Prototype: "Export CSV" button, columns `time,athlete,tag,category,result,note`, commas in notes replaced by semicolons, blob download. `src` has **none**. Note `ARCHITECTURE.md §8` specifies a *richer* export than the prototype (numeric **and** `mm:ss` timestamps, a `deep_link` column, a clips section, proper quoting) — so when built it should exceed the prototype, not copy it.

## 9. Roll-shape summary strip

**MISSING.** The prototype's `.summary-strip` ("Roll shape") renders category-coloured segments sized by count, with a "No tags yet" empty state (lines 159–162, 797–805). It is **not** in the build order and **not** in `ARCHITECTURE.md`/`CONVENTIONS.md`. `src` has nothing equivalent. No plan covers it.

## 10. Shortcuts overlay

**PLANNED** (see §1, `?`). The `?` overlay (lines 531–546) is named in `ARCHITECTURE.md §9` but is unscheduled and unbuilt. Note the intro also advertises it ("press `?` inside for shortcuts"), so shipping without it leaves a dangling promise.

---

## 11. Layout and vertical rhythm — what is visible without scrolling

This is the biggest divergence and the source of both hand-observed problems.

**Prototype.** A fixed-height two-pane workbench: `.workbench { display:grid; grid-template-columns:1fr 400px; height:calc(100vh - 50px) }`. Left column (flex): video (`flex:1`) → **timeline** → legend → transport → tag bar. Right column: the tag list with its own internal scroll (`.tag-list { overflow-y:auto }`), plus filters, summary strip and clips. **The whole tool fits in one viewport with no page scroll**; only the tag list scrolls. The timeline sits immediately under the video.

**`src`.** A single centred column: `.main { max-width:760px; margin:0 auto }` in normal document flow. `showOpen` stacks: section header → pairing line → player (16/9) + custom controls → **tag bar** → **timeline**. There is no second pane and no fixed-height workbench; **the page scrolls**, and the timeline is rendered *after* the tag bar.

Status: **PARTIAL / regressed.** `src` is looser and taller than the prototype: the two-pane, single-viewport workbench became a tall scrolling column, and the tag list panel is simply absent (PLANNED).

## 12. The video media card

| Aspect | Prototype | `src` | Status |
|---|---|---|---|
| Dark media card | `#0c0e12`, inset white hairline ring, margin, `flex:1` (fills column height) | `background: var(--text)` (`#17181c`), `aspect-ratio:16/9`, shadow, no inset ring | **PARTIAL** |
| Video fit | `object-fit: contain` | none set (defaults to `fill`, can distort) | **PARTIAL** (minor) |

`src` does render a dark card — the direction is kept — but it's a fixed-aspect box using the `--text` token rather than the prototype's dedicated near-black with an inset highlight, and it can letterbox/stretch differently because `object-fit` was not set.

## 13. Design tokens — `src/ui/tokens.css` vs the prototype `:root`

| Token group | Status | Notes |
|---|---|---|
| Surfaces (`--bg`, `--panel`, `--panel-2/3`, `--line`, `--line-2`) | **BUILT** | Hex copied verbatim. |
| Text (`--text`, `--text-dim`, `--text-faint`) | **BUILT** | Verbatim. |
| Accent ramp (`--accent`, `-soft`, `-dim`, `-deep`) | **BUILT** | Verbatim. |
| Sides (`--us`, `--us-soft`, `--them`, `--them-soft`) | **BUILT** | Verbatim. |
| Shadows (`--shadow-sm/md/lg`), fonts (`--font-d/b/m`), `--ease` | **BUILT** | Verbatim. |
| Radii | **PARTIAL** | `--r` (9px) and `--r-lg` (14px) verbatim; `src` **adds** `--r-sm` (5px) and `--r-pill` (99px) — additive, fine. |
| **Category colours** `--c-pos … --c-pts` (8) | **MISSING** | **Absent from `tokens.css`** (grep: 0 hits). The prototype's technique palette — used by markers, category dots, filter chips and the summary strip — has no home in `src`. Filters/summary/list (step 6) will need it re-introduced. |
| Type scale | **PARTIAL** | Prototype uses one-off sizes inline (10–58px). `src` formalised a bucketed scale (`--text-xs … --text-2xl`); reasonable, but heading sizes are coarser (e.g. the prototype's 26/21/18/16px headings collapse toward `--text-2xl`/`--text-md`). |
| Spacing scale | **PARTIAL** | Prototype spaces inline; `src` added `--space-1 … --space-10`. Additive systematisation; individual paddings won't match the prototype pixel-for-pixel. |
| Semantic aliases `--danger`/`--danger-soft` | added | Map to `--them`; not in the prototype. Fine. |

Net: the kept tokens are faithful (verbatim hex). The one real loss is the **eight category colours**, which are simply gone.

## 14. Feedback & accessibility details

| Prototype detail | Status | Notes |
|---|---|---|
| Drop confirmation **toast** ("Alex · Armbar · 0:12 · add detail later in the list") | **MISSING** | `src` has no per-drop toast (grep: none). It shows a marker + a single "N unsaved" indicator instead. No plan mentions the toast. |
| `@media (prefers-reduced-motion: reduce)` global guard | **MISSING** | Prototype disables animation/transition for reduced-motion users; `src` CSS has no such block. Accessibility treatment, no plan. *(Unsure if this counts as a "feature" — listing it.)* |
| Custom scrollbar styling (`::-webkit-scrollbar`) | **MISSING** | Cosmetic; prototype styles it, `src` doesn't. No plan. |
| "N unsaved" outbox indicator | `src` **addition** | Not in the prototype; from `ARCHITECTURE.md §3.2`. Not a fidelity gap. |

## 15. Intro & Vision screens

| Prototype screen | Status | Notes |
|---|---|---|
| Intro/landing ("Prototype · nothing is saved", two cards) | **PLANNED / by design** | Prototype framing. `CONVENTIONS.md §11` ("nothing scenographic ships") means this intentionally does not ship as-is; `src` goes straight from sign-in to the app. Not a gap. |
| Vision/mockup ("Not built" — Roster, Vault, Matchup Lab, Weight Cut, AI bar) | **PLANNED / deferred** | Explicitly labelled "Not built" in the prototype; deferred in `ARCHITECTURE.md §11` (collections, analysis, AI are out of MVP scope). Not a gap. |

---

## A. Call-out: is the timeline below the fold?

**Yes, in `src`. No, in the prototype.**

- **Prototype:** the timeline is the second element in the left column, **directly under the video**, inside a `height:calc(100vh - 50px)` workbench that never page-scrolls. A coach watching the video sees markers appear on the same screen, in their peripheral vision, as they tag. That is the whole point of the "signature" timeline.
- **`src`:** `showOpen` renders, top to bottom in a single scrolling `max-width:760px` column: header → pairing → **player + controls** → **tag bar** → **timeline**. The timeline is *after* the tag bar in normal flow. On a typical laptop the video card (16/9) plus the transport controls plus the quick-tag bar already fill the viewport, so the marker timeline sits **off the bottom of the screen** during the exact activity — tagging — it exists to support. The coach cannot see markers land without scrolling.

This is a genuine regression against the approved design, not a variation. The prototype deliberately puts the timeline where the eyes already are; `src` puts it where they aren't.

## B. Call-out: do same-timestamp markers collapse into one?

**Yes in `src` — and the prototype has the same geometric flaw; neither fans them out.**

Both position markers by `left: <time/duration>%` with a fixed ~4px width and `translateX(-2px)`, and **neither** applies any collision detection or horizontal dodge. Two tags at the same timestamp on the same lane land at the same x and fully overlap — reading as one marker — in **both** the prototype and `src`.

Where they differ is legibility of a *near*-collision:

- The **prototype** colours each marker by **category**, and gives it a `box-shadow: 0 0 0 1.5px var(--panel)` ring. Two closely-spaced markers of different techniques still show as two differently-coloured slivers.
- **`src`** colours every marker by **side** (all athlete markers blue, all opponent markers red). Two different techniques a fraction of a second apart on the same side render as one indistinguishable blue (or red) bar.

So the "single pixel" stacking is **inherited** from the prototype, not introduced by `src` — but `src`'s side-only colouring makes a cluster *less* readable than the prototype's category colouring. Fixing it properly (dodge/fan overlapping markers, or widen hit targets) is unspecified in every document and would be **MISSING** work for either codebase.

---

## Counts

Over the 44 classified items above (granularity noted; sub-points merged where sensible):

| Class | Count |
|---|---|
| **BUILT** | 12 |
| **PARTIAL** | 11 |
| **PLANNED** | 11 |
| **MISSING** | 10 |

Read bluntly: the drop path and its plumbing are solid and faithful, but almost everything that made the prototype *feel* like the approved tool — the category colour language, the instrumented timeline sitting under the video, the single-viewport workbench, the roll-shape strip, the drop toast — is either deferred, degraded, or gone. The two hand-observed problems are real; one (below-the-fold timeline) is a `src`-introduced regression, the other (same-timestamp stacking) is inherited and made slightly worse by side-only marker colouring.

## Every MISSING item, in one place

These are in the prototype and covered by **no** plan document (build order, `ARCHITECTURE.md`, or `CONVENTIONS.md`):

1. **Roll-shape summary strip** — category-coloured segments sized by count (§9).
2. **Category-coloured timeline markers** — `src` colours by side instead; no doc specifies category colour on markers (§4).
3. **Timeline playhead** — the moving position indicator on the marker timeline (§4).
4. **Timeline hover-time tooltip** — time readout on mouse-move over the timeline (§4).
5. **Click empty timeline track to seek** — `src` only seeks from markers (§4).
6. **Timeline lane shading + buffer bar + legend** — `--us-soft`/`--them-soft` bands, played-buffer, and the "Alex top / Duarte bottom" legend (§4).
7. **Category colour tokens** `--c-pos … --c-pts` — absent from `src/ui/tokens.css`; the prototype's whole technique palette (§13).
8. **Drop confirmation toast** — the per-tag "who · what · when · add detail later" toast (§14).
9. **`prefers-reduced-motion` handling** — global reduced-motion guard (§14). *(Unsure this counts as a feature.)*
10. **Custom scrollbar styling** — cosmetic (§14).

Plus the collision-handling for same-timestamp markers (call-out §B), which is unspecified everywhere and would be new work for either codebase.
