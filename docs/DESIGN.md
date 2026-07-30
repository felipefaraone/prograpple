# ProGrapple — Design System

**Version:** 2.0 (supersedes 1.0 — see changelog, §10)
**Audience:** Felipe, Claude Code, and any future contributor touching UI.
**Status:** WORKING. Single source of truth for visual decisions. When a prompt and this document disagree, this document wins — say so in the prompt.
**Canonical location:** `/docs/DESIGN.md` in the repo. The Claude-project copy is a mirror.

> **What changed and why (the one-paragraph version).** v1.0 allowed three competing color systems on screen at once: an orange action accent, a blue/red side pair, and eight category hues. In the real build that read as noise — the timeline became a rainbow and the orange dominated surfaces it had no business dominating. v2.0 removes the hue accent entirely (actions are **graphite**, like the rest of modern Apple UI), demotes category color to exactly one surface, and leaves **blue vs red side identity as the only strong color statement in the product**. One color story, not three.

> **Relation to `CONVENTIONS §11`:** unchanged. That section holds the structural rules (CSS custom properties only, no emoji, nothing scenographic, mark the exception not the OK state). This document is the system those rules operate on.

> **Out of scope:** logo, wordmark, brand identity — deferred until the name is settled (D11).

---

## 0. The design thesis

Three facts decide everything:

1. **The user is a competition head coach on a laptop for hours.** Low-fatigue is a requirement: quiet neutral chrome, restrained contrast, nothing blinking for attention.
2. **The screen is shared with a video.** The footage is the loudest thing on screen, always. The UI's job is to be furniture around it.
3. **Every tag belongs to one of two sides.** Athlete vs opponent is the one distinction the coach must read instantly and peripherally. It gets the only saturated colors in the product.

**The rule that summarizes v2.0: the interface is monochrome; the *data* wears the color — and the only data that earns strong color is the side.** If a screen looks colorful, something is wrong.

Personality: calm, precise, quietly athletic. Apple-like light system. No MMA clichés, no dashboards-with-fireworks.

---

## 1. Color system

### 1.1 Neutral foundation (the chrome)

| Token | Value | Use |
|---|---|---|
| `--bg` | `#f5f5f7` | App background (Apple's canonical light gray) |
| `--panel` | `#ffffff` | Cards, bars, list rows, modals |
| `--panel-2` | `#f0f0f2` | Recessed: hover states, editors, segmented tracks, selected nav |
| `--panel-3` | `#e8e8ea` | Deeper recess: pressed states |
| `--line` | `#e6e6e9` | Hairline borders and dividers |
| `--line-2` | `#d4d4d9` | Emphasised borders on interactive controls |
| `--text` | `#1d1d1f` | Primary text |
| `--text-dim` | `#56565e` | Secondary text |
| `--text-faint` | `#8b8b92` | Tertiary: hints, labels, metadata |

Three text levels, never more. The stage stays the one dark surface: `#0c0e12`, with `#d4d9e1` / `#7d8595` text used only inside it.

### 1.2 Ink — the action color (replaces the v1 orange accent)

There is **no hue accent** in ProGrapple. Every "this is interactive / this is current / this is yours" signal is **graphite** — the same near-black as primary text, used as fill, bar, or ring.

| Token | Value | Use |
|---|---|---|
| `--ink` | `#1d1d1f` | Filled primary buttons, active nav state, playhead, progress fill, active speed step, focus ring |
| `--ink-soft` | `rgba(29,29,31,.07)` | Tinted fills: current tag row, clip ranges on the timeline, selected palette row |
| `--ink-dim` | `rgba(29,29,31,.22)` | Tinted borders: clip range outline, pressed outlines |

**Why no hue.** An accent hue has to fight the video, the side pair, and the data for attention, and in practice it won — the orange was the loudest thing on every screen while carrying the least information. Graphite gives the same affordance ("this is active / this is mine") with zero added noise, and it is the current Apple grammar: black filled buttons, black sliders, black selection states on white.

**What this changes concretely:** active sidebar item = `--panel-2` fill + `--text` (no colored fill, no colored icon). Slider/progress = graphite on gray track. Playhead = graphite. Current tag row = `--ink-soft` fill + 3px graphite inset bar. Clips = `--ink-soft` fill + `--ink-dim` border. Focus ring = 2px graphite, offset 2px. "Export CSV" and other primary-of-cluster buttons = white with border (unchanged) or graphite filled when truly primary.

**The one exception:** inside the *dark* stage, graphite is invisible — playhead and toasts on the stage use white/light values from §1.1's stage set.

### 1.3 Side identity — the only strong color in the product

| Token | Value | Soft | Meaning |
|---|---|---|---|
| `--us` | `#1470e0` | `--us-soft` `#f2f7fd` | The coach's athlete (top lane) |
| `--them` | `#d63652` | `--them-soft` `#fdf3f5` | The opponent (bottom lane) |

Blue vs red is the corner convention of combat sports; every coach reads it untaught. **us = blue, them = red, fixed forever, identical on every surface.**

Where side color appears — and this is the *complete* list:

1. Timeline markers (all markers are side-colored — see §1.4)
2. Timeline lane tints (the soft values, now at near-subliminal strength)
3. The side toggle's active segment
4. The 4px edge bar on tag-list rows
5. The side pill in the palette header and toasts

Rules: side colors never mean anything but side (no blue info buttons, no red delete buttons); side is never carried by color alone (always paired with lane position and/or a name); the soft tints are ambient — if you can "see" them when looking straight at them, they are too strong.

### 1.4 Category — demoted to one surface

**v2.0 removes category hue from timeline markers, quick-tag chips, list dots, and filter chips.** In the build, eight hues repeated across four surfaces was the single biggest source of visual noise, and it buried the distinction that actually matters (side) under one that doesn't need to be pre-attentive (category).

- **Timeline markers are side-colored.** Blue marks up top, red marks below. The lane already says side; the marker color agrees instead of shouting something else. What a marker *is* lives in its tooltip and in the list.
- **Quick-tag chips are text-only pills.** No dots. The label is the information.
- **Tag-list rows carry category as text** in the meta line. No dot.
- **Filter chips are neutral; active = graphite fill, white text.**
- **The roll-shape summary strip is the one place category hue survives**, because an aggregate strip genuinely cannot work with labels alone. It uses the muted set below — one family, low chroma, matched lightness, so even eight-at-once reads as one calm object:

| Token | Value | Category |
|---|---|---|
| `--c-pos` | `#5b7aa6` | Positions |
| `--c-pass` | `#5f9e82` | Passes |
| `--c-sweep` | `#8f7ab0` | Sweeps |
| `--c-td` | `#a87e63` | Takedowns |
| `--c-back` | `#a89a5f` | Back |
| `--c-legs` | `#5f9e9a` | Legs |
| `--c-sub` | `#b06a78` | Submissions |
| `--c-pts` | `#8a8f98` | Events |

These eight tokens may be used **only** in the roll-shape strip (and any future aggregate strip of the same kind, e.g. an athlete-profile summary). Anywhere else, category is text. If a future feature seems to need category color elsewhere, that is a design-system amendment, not a local choice.

### 1.5 Result colors — one quiet green, the rest neutral

v1's green/amber/blue badge triplet added a third hue system. v2 keeps color only for the outcome worth spotting at a glance:

| Result | Treatment |
|---|---|
| scored | Green badge: text `#1e7a4a`, border `#b9dcc8`, fill `#eff8f2` |
| attempted | Neutral badge: `--text-dim` text, `--line-2` border, `--panel-2` fill |
| defended | Neutral badge, same as attempted |

"Scored" is the exception worth marking (CONVENTIONS §11); the others are facts, and the badge's word carries them. The amber is gone. When athlete status ships in Phase 2, the same logic applies: neutral by default, one color only for the state that demands attention (Sidelined), and that decision gets logged when it happens.

### 1.6 The color budget (the whole system in five lines)

On any screen, at rest:

1. **Neutrals do everything structural.** Chrome, buttons, borders, selection.
2. **Graphite marks action and currency.** What is active, what is yours, where you are.
3. **Blue/red marks side.** The only saturated pair, in exactly five places (§1.3).
4. **One green** exists, on scored badges only.
5. **Muted category hues live in the roll-shape strip and nowhere else.**

Test for any new surface: grayscale-screenshot it. If it still works, and the only things you miss are "whose moment is this" — the design is correct.

---

## 2. Typography

Unchanged from v1 except values restated for completeness. System stack only, no webfonts, ever.

| Token | Stack | Role |
|---|---|---|
| `--font-d` | `-apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", Roboto, Helvetica, Arial, sans-serif` | Display: headings, card titles, big numbers |
| `--font-b` | same with "SF Pro Text" | Body |
| `--font-m` | `ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace` | Timestamps, counts, keys, speeds |

Scale: Display `clamp(40px,5.4vw,58px)/700/-.032em` · H2 `34/700/-.028em` · H3 `21–26/650/-.022em` · Panel title `16/650` · Body `14` · Small `13` · Meta `11–12` · Label `10–11/700/+.07em/uppercase`.

Rules: timestamps always `--font-m` + `tabular-nums`; never uppercase above 12px; line-height 1.5 body / 1.05–1.15 display / 1.6–1.75 empty-state paragraphs.

---

## 3. Space, shape, elevation

- **Spacing:** 4px grid. Steps 4/8/12/16/18/24/32. Panels 16–18px, cards 22–28px, dense rows 10px vertical.
- **Radius:** `--r` 9px (controls) · `--r-lg` 14px (surfaces) · 16–18px (modals, large cards) · 99px (pills). Nested < container.
- **Elevation:** `--shadow-sm 0 1px 1px rgba(20,22,28,.04), 0 1px 3px rgba(20,22,28,.06)` (resting controls) · `--shadow-md 0 1px 2px rgba(20,22,28,.05), 0 6px 18px rgba(20,22,28,.08)` (stage, raised cards) · `--shadow-lg 0 4px 10px rgba(20,22,28,.06), 0 20px 50px rgba(20,22,28,.16)` (modals only). Elevated controls get border **and** small shadow; never shadow-only or heavy-border-only.

---

## 4. Motion

`--ease: cubic-bezier(.2,.7,.3,1)`. Micro 100–160ms, standard 180–220ms, modal entrance 160–180ms (fade + 8px rise + .98 scale).

- **The hot path is never animated** — a tag drop renders same-frame (<16ms, ARCHITECTURE §3). Motion confirms around the action, never between keystroke and mark.
- Press: `scale(.93)` chips, `translateY(.5px)` buttons. No hover-lift on in-flow controls.
- `prefers-reduced-motion` kills everything, globally, non-optional.
- No ambient/decorative animation. At rest, only the video moves.

---

## 5. Iconography & glyphs

- No emoji (CONVENTIONS §11). Line icons inheriting `currentColor`, or typographic glyphs (`→ ⟨ ⟩ ✕ ▶`). Icons are always monochrome — an icon never carries a hue.
- `<kbd>`: `--font-m` 11px, `--line-2` border with 2px bottom edge, 5px radius. Keyboard hints are first-class UI.
- Side legend glyph: 8px rounded square. (Category dots no longer exist outside the strip.)

---

## 6. Component specifications

### 6.1 Buttons
| Variant | Anatomy | Use |
|---|---|---|
| Ghost | Transparent, `--text-dim`, hover `--panel-3` | Transport, secondary. The default button |
| Outline | `--panel` fill, `--line-2` border, `--shadow-sm` | Primary-of-cluster (Play, Export CSV) |
| Filled | `--ink` fill, white text | Commit actions (Done), true primaries |
| Destructive | Never standing red; red appears only on hover of a local `✕` | Delete tag |

Heights 30–34px. Ghost transport is a locked decision.

### 6.2 Sidebar / navigation
Active item: `--panel-2` fill, `--text` label, monochrome icon. No colored fills, no colored icons, no left accent bar. The sidebar is furniture.

### 6.3 Quick-tag chips
Text-only pills: `--panel` fill, `--line` border, `--shadow-sm`, 8/15px padding, ≥32px tall, press-scale. Overflow chip ("+ all tags") dashed, transparent, shadowless.

### 6.4 Side toggle
Segmented control on `--panel-2` track, 2px inner padding. Active segment: side color fill + white text + `--shadow-sm`. Shows both names and both key hints. Active side also paints a 2.5px line across the top of the tagbar — peripheral legibility while watching footage.

### 6.5 Timeline (signature component)
- 60px, two lane tints (`--us-soft` / `--them-soft`) at near-subliminal strength, hairline track between.
- Markers: 4×16px, **side-colored**, 1.5px white halo, hover 6×20px. Filtered-out markers dim to 14%, never disappear.
- Playhead: 2px `--ink` + 10px knob with white ring. Progress: `--ink` on gray track.
- Clips: `--ink-soft` fill + `--ink-dim` border; pending = dashed.
- Hover: monospace time pill.

Future tag-over-time surfaces reuse this grammar exactly: lanes + side color for marks, graphite for the coach's artifacts.

### 6.6 Tag-list rows
Mono time (42px) → 4px side bar → label 14/550 → meta line as *text* (category name · athlete · badge · italic note). Current row: `--ink-soft` fill + 3px graphite inset. "+ Detail" is an outline chip like its neighbours — the row's hover state is the invitation, not a colored button.

### 6.7 Command palette
13vh, 560px, `--shadow-lg`, pop entrance. Header (time + side pill) on `--panel-2`; 17px borderless input; grouped results with uppercase labels in `--text-faint`; selected row `--ink-soft` + graphite inset bar. Empty state teaches synonyms.

### 6.8 Toasts
Stage-anchored, `rgba(17,20,26,.92)` + blur, white text, side pill. Confirmation only; never carries an action.

### 6.9 Badges & pills
10px/700 uppercase or 600 text, tinted 1px border + tinted fill, 99px/5px radius. States a fact; never clickable. Neutral by default (§1.5) — a colored badge is an exception that earned it.

### 6.10 Empty states
Centered, 46px pad: 18/650 `--text-dim` headline + 13px `--text-faint` next-action guidance including its key. Never blank, never apologetic.

### 6.11 Forms
Uppercase 10px labels; inputs `--panel` + `--line-2` + `--r`. Focus: graphite ring (2px, offset 2) — same ring everywhere in the app. Segmented controls for ≤5 closed options.

---

## 7. Accessibility & keyboard

- `:focus-visible` = 2px `--ink` ring, 2px offset, everywhere. Never removed without replacement.
- Contrast: body ≥ 7:1; secondary ≥ 4.5:1. Graphite-on-white clears everything by construction — one of the quiet wins of dropping the orange, which failed contrast as text and needed a special dark variant.
- Color never carries meaning alone: side = lane + name; category = text; result = the badge's word.
- Keyboard-first: every hot action has a key, every key is discoverable (`?`, inline `<kbd>`), all shortcuts suppressed in text fields.
- Hit targets ≥ 32px on live-tagging controls. `prefers-reduced-motion` global.

---

## 8. Voice & microcopy

Sentence case except the uppercase label tier. Verbs named by outcome ("Save clip", never "Submit"). BJJ vocabulary is the interface vocabulary. Honest labels: unknown says unknown, mockups say Mockup. Every hint that names an action names its key.

---

## 9. Governance

1. Tokens live in `/src/ui/tokens.css` only. No hex anywhere else — this is the enforceable form of the document.
2. Canonical in repo (`/docs/DESIGN.md`); Claude-project copy is a mirror; repo wins.
3. Changing a token's *role* is a decision-log entry; tweaking a value within its role is not.
4. Dark mode deferred; the token architecture makes it a second `:root` block if coaches ask by behaviour.
5. Logo/brand blocked on the name (D11).

---

## 10. Changelog & migration from v1.0

**v2.0 — July 2026.** Prompted by the first build screens reading as visually noisy ("carnival"): three hue systems competing on one screen.

| Change | v1.0 | v2.0 |
|---|---|---|
| Action accent | Orange (`--accent` #e07c00 + 3 variants) | **Removed.** Graphite `--ink` + `--ink-soft` + `--ink-dim` |
| Active nav | Orange tint | `--panel-2` fill, monochrome |
| Playhead / progress / slider | Orange | Graphite |
| Clips on timeline | Orange tint + orange border | `--ink-soft` + `--ink-dim` |
| Current row / selected palette row | Orange soft fill | `--ink-soft` + graphite inset bar |
| Focus ring | Orange | Graphite |
| Timeline markers | Category-colored | **Side-colored** |
| Quick-tag chips | Category dot + text | Text only |
| Tag-list category | Colored dot | Text in meta line |
| Filter chips (active) | Category-color fill | Graphite fill |
| Category hues | 8 saturated, 4 surfaces | 8 muted, **roll-shape strip only** |
| Result badges | Green / amber / blue | Green (scored) / neutral / neutral |
| Lane tints | Visible tint | Near-subliminal tint |
| Side pair, typography, spacing, radius, shadows, motion, voice | — | Unchanged |

**Token migration for Claude Code** (delete → add):

```css
/* DELETE */
--accent --accent-deep --accent-soft --accent-dim

/* ADD */
--ink:#1d1d1f;
--ink-soft:rgba(29,29,31,.07);
--ink-dim:rgba(29,29,31,.22);

/* REPLACE VALUES */
--bg:#f5f5f7; --panel-2:#f0f0f2; --panel-3:#e8e8ea;
--line:#e6e6e9; --line-2:#d4d4d9;
--text:#1d1d1f; --text-dim:#56565e; --text-faint:#8b8b92;
--us-soft:#f2f7fd; --them-soft:#fdf3f5;
--c-pos:#5b7aa6; --c-pass:#5f9e82; --c-sweep:#8f7ab0; --c-td:#a87e63;
--c-back:#a89a5f; --c-legs:#5f9e9a; --c-sub:#b06a78; --c-pts:#8a8f98;
```

Grep guard after migration: `--accent` must return zero matches in `/src`.
