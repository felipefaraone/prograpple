-- Add two global taxonomy terms a coach hit as missing during a live session:
-- "Front Headlock" and "Collar Tie". Both are clinch/turtle CONTROL positions, so
-- they belong in the `position` category alongside "Standing / Clinch" (18) and
-- "Turtle" (17). The `takedown` category holds takedown ACTIONS (Single Leg, Snap
-- Down, Guard Pull), not control ties, so it is not their home. (Verified the
-- category string 'position' against a real taxonomy row before writing.)
--
-- Global seed rows, same shape as 20260729114950_seed_taxonomy.sql:
--   org_id IS NULL, is_generic = false, is_default = false.
--
-- Assumptions (per Autonomy):
--   - sort_order continues the position sequence after the current max (18):
--     Front Headlock = 19, Collar Tie = 20. Existing rows are not renumbered.
--   - Light synonyms only: "front head lock"; "collar-tie", "tie up".
--
-- Idempotent: ON CONFLICT DO NOTHING against the partial unique index
-- taxonomy_global_term_uidx (category, term) WHERE org_id IS NULL, so re-running
-- inserts nothing the second time. No GRANT/RLS change — T24 grants and the §5.5
-- select policy already admit org_id IS NULL rows to every org.

insert into public.taxonomy (org_id, category, term, synonyms, is_generic, is_default, sort_order) values
  (null, 'position', 'Front Headlock', '{"front head lock"}',      false, false, 19),
  (null, 'position', 'Collar Tie',     '{"collar-tie","tie up"}',  false, false, 20)
on conflict do nothing;
