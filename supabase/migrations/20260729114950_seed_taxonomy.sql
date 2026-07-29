-- Taxonomy seed as GLOBAL rows (org_id is null), per ARCHITECTURE §5.
--
-- Source of truth is Prototype/index.html TAXONOMY (82 terms, 8 categories).
-- Applied transforms (§5.2):
--   - Drop the `pts` category entirely (a scoring axis, not a technique category).
--   - Add category `event` = Advantage, Penalty, Scramble, Reset (ref stand-up)
--     (the 4 `pts` terms nothing derives). The other 7 `pts` terms are derivable
--     from category+result and are NOT stored (see pointsFor(), §5.2).
--   - Every synonym from the prototype is preserved verbatim.
--   - One generic "(unspecified)" term per TECHNIQUE category (is_generic = true,
--     §5.3) so a quick-tag never forces a mid-roll choice. `event` gets none — its
--     terms are already atomic.
--
-- Count: 71 technique + 4 event = 75 base terms (matches §5.2), + 7 generics = 82.
--
-- Assumptions (noted per Autonomy):
--   - Generic term names follow the §5.3 pattern "<Category> (unspecified)"; the
--     four §5.3 does not name explicitly are: Position, Takedown, Back Attack,
--     Leg Entanglement (unspecified).
--   - sort_order: generic = 0 (surfaces first for the fast path), then prototype
--     order 1..n within each category.
--   - is_default left false for all; the column exists for later per-org defaults.

-- Idempotency + integrity: at most one global term per (category, term).
create unique index taxonomy_global_term_uidx
  on public.taxonomy (category, term)
  where org_id is null;

insert into public.taxonomy (org_id, category, term, synonyms, is_generic, sort_order) values
  -- position -----------------------------------------------------------------
  (null, 'position', 'Position (unspecified)', '{}',            true,  0),
  (null, 'position', 'Closed Guard',           '{}',            false, 1),
  (null, 'position', 'Open Guard',             '{}',            false, 2),
  (null, 'position', 'Half Guard',             '{}',            false, 3),
  (null, 'position', 'Butterfly Guard',        '{}',            false, 4),
  (null, 'position', 'De la Riva',             '{"DLR"}',       false, 5),
  (null, 'position', 'Reverse DLR',            '{"RDLR"}',      false, 6),
  (null, 'position', 'Spider Guard',           '{}',            false, 7),
  (null, 'position', 'Lasso Guard',            '{}',            false, 8),
  (null, 'position', 'X-Guard',                '{}',            false, 9),
  (null, 'position', 'Deep Half',              '{}',            false, 10),
  (null, 'position', 'Knee Shield',            '{"Z-Guard"}',   false, 11),
  (null, 'position', 'Mount',                  '{}',            false, 12),
  (null, 'position', 'Side Control',           '{}',            false, 13),
  (null, 'position', 'North-South',            '{}',            false, 14),
  (null, 'position', 'Knee on Belly',          '{"KOB"}',       false, 15),
  (null, 'position', 'Back Control',           '{}',            false, 16),
  (null, 'position', 'Turtle',                 '{}',            false, 17),
  (null, 'position', 'Standing / Clinch',      '{}',            false, 18),
  -- pass ---------------------------------------------------------------------
  (null, 'pass', 'Pass (unspecified)', '{}',              true,  0),
  (null, 'pass', 'Toreando',           '{"Bullfighter"}', false, 1),
  (null, 'pass', 'Knee Cut',           '{"Knee Slice"}',  false, 2),
  (null, 'pass', 'Leg Drag',           '{}',              false, 3),
  (null, 'pass', 'Over-Under',         '{}',              false, 4),
  (null, 'pass', 'Double Under',       '{}',              false, 5),
  (null, 'pass', 'Body Lock Pass',     '{}',              false, 6),
  (null, 'pass', 'Long Step',          '{}',              false, 7),
  (null, 'pass', 'Stack Pass',         '{}',              false, 8),
  (null, 'pass', 'Folding Pass',       '{}',              false, 9),
  -- sweep --------------------------------------------------------------------
  (null, 'sweep', 'Sweep (unspecified)',   '{}',             true,  0),
  (null, 'sweep', 'Scissor Sweep',         '{}',             false, 1),
  (null, 'sweep', 'Hip Bump',              '{}',             false, 2),
  (null, 'sweep', 'Flower Sweep',          '{"Pendulum"}',   false, 3),
  (null, 'sweep', 'Butterfly Sweep',       '{"Hook Sweep"}', false, 4),
  (null, 'sweep', 'Waiter Sweep',          '{}',             false, 5),
  (null, 'sweep', 'Berimbolo',             '{}',             false, 6),
  (null, 'sweep', 'Kiss of the Dragon',    '{"KOTD"}',       false, 7),
  (null, 'sweep', 'Tripod / Sickle',       '{}',             false, 8),
  (null, 'sweep', 'Technical Stand-up',    '{}',             false, 9),
  -- takedown -----------------------------------------------------------------
  (null, 'takedown', 'Takedown (unspecified)', '{}', true,  0),
  (null, 'takedown', 'Single Leg',            '{}', false, 1),
  (null, 'takedown', 'Double Leg',            '{}', false, 2),
  (null, 'takedown', 'Body Lock Takedown',    '{}', false, 3),
  (null, 'takedown', 'Snap Down',             '{}', false, 4),
  (null, 'takedown', 'Ankle Pick',            '{}', false, 5),
  (null, 'takedown', 'Foot Sweep',            '{}', false, 6),
  (null, 'takedown', 'Guard Pull',            '{}', false, 7),
  -- back ---------------------------------------------------------------------
  (null, 'back', 'Back Attack (unspecified)', '{}',          true,  0),
  (null, 'back', 'Back Take',                 '{}',          false, 1),
  (null, 'back', 'Turtle to Back',            '{}',          false, 2),
  (null, 'back', 'Crab Ride',                 '{}',          false, 3),
  (null, 'back', 'Body Triangle',             '{}',          false, 4),
  (null, 'back', 'Seatbelt',                  '{"Harness"}', false, 5),
  -- legs ---------------------------------------------------------------------
  (null, 'legs', 'Leg Entanglement (unspecified)', '{}',                                   true,  0),
  (null, 'legs', 'Straight Ashi Garami',           '{"Ashi"}',                             false, 1),
  (null, 'legs', 'Single-Leg X',                   '{"SLX"}',                              false, 2),
  (null, 'legs', '50/50',                          '{"Fifty fifty"}',                      false, 3),
  (null, 'legs', 'Saddle',                         '{"411","Inside Sankaku","Honey Hole"}', false, 4),
  (null, 'legs', 'Outside Ashi',                   '{}',                                   false, 5),
  (null, 'legs', 'Cross Ashi',                     '{}',                                   false, 6),
  (null, 'legs', 'Backside 50/50',                 '{}',                                   false, 7),
  -- submission ---------------------------------------------------------------
  (null, 'submission', 'Submission (unspecified)', '{}',                            true,  0),
  (null, 'submission', 'Rear Naked Choke',         '{"RNC","Mata Leão","Mata Leao"}', false, 1),
  (null, 'submission', 'Guillotine',               '{}',                            false, 2),
  (null, 'submission', 'Triangle',                 '{}',                            false, 3),
  (null, 'submission', 'Armbar',                   '{"Juji Gatame","Juji"}',        false, 4),
  (null, 'submission', 'Kimura',                   '{}',                            false, 5),
  (null, 'submission', 'Americana',                '{}',                            false, 6),
  (null, 'submission', 'Omoplata',                 '{}',                            false, 7),
  (null, 'submission', 'Ezekiel',                  '{}',                            false, 8),
  (null, 'submission', 'Bow and Arrow',            '{}',                            false, 9),
  (null, 'submission', 'Cross Collar Choke',       '{}',                            false, 10),
  (null, 'submission', 'D''Arce',                  '{"Darce"}',                     false, 11),
  (null, 'submission', 'Anaconda',                 '{}',                            false, 12),
  (null, 'submission', 'Straight Ankle Lock',      '{"Footlock"}',                  false, 13),
  (null, 'submission', 'Heel Hook',               '{}',                            false, 14),
  (null, 'submission', 'Kneebar',                  '{}',                            false, 15),
  (null, 'submission', 'Toe Hold',                '{}',                            false, 16),
  -- event (new; the 4 non-derivable ex-`pts` terms) --------------------------
  (null, 'event', 'Advantage',           '{}', false, 1),
  (null, 'event', 'Penalty',             '{}', false, 2),
  (null, 'event', 'Scramble',            '{}', false, 3),
  (null, 'event', 'Reset (ref stand-up)', '{}', false, 4)
on conflict do nothing;
