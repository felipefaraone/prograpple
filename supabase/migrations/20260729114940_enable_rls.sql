-- Row level security (ARCHITECTURE §7, CONVENTIONS §7).
--
-- Model: single-axis tenant isolation. A row is visible/writable only when its
-- org_id is one the current user belongs to via memberships. RLS is the backstop
-- for when app code forgets to scope by org.
--
-- Every table: RLS enabled + one policy PER command (select/insert/update/delete).
--   - Policies target `to authenticated` (not the deprecated auth.role()); the
--     anon role matches no policy and therefore reads/writes nothing.
--   - auth.uid() is wrapped in (select ...) so the planner evaluates it once.
--   - UPDATE policies carry both USING and WITH CHECK so a row cannot be moved
--     to another org.
-- taxonomy is the documented exception (§5.5): global rows (org_id is null) are
--   readable by everyone authenticated, but only org-scoped rows are writable.

alter table public.orgs        enable row level security;
alter table public.memberships enable row level security;
alter table public.athletes    enable row level security;
alter table public.videos      enable row level security;
alter table public.taxonomy    enable row level security;
alter table public.tags        enable row level security;
alter table public.clips       enable row level security;

-- orgs -----------------------------------------------------------------------
create policy orgs_select on public.orgs for select to authenticated
  using (id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy orgs_insert on public.orgs for insert to authenticated
  with check (id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy orgs_update on public.orgs for update to authenticated
  using (id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy orgs_delete on public.orgs for delete to authenticated
  using (id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));

-- memberships ----------------------------------------------------------------
-- Scoped to the current user's own rows. In the single-user-per-org MVP this is
-- exactly "your org's membership"; it also makes the org subquery above safe from
-- recursion, because this policy only ever returns rows where user_id = auth.uid().
create policy memberships_select on public.memberships for select to authenticated
  using (user_id = (select auth.uid()));
create policy memberships_insert on public.memberships for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy memberships_update on public.memberships for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
create policy memberships_delete on public.memberships for delete to authenticated
  using (user_id = (select auth.uid()));

-- athletes -------------------------------------------------------------------
create policy athletes_select on public.athletes for select to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy athletes_insert on public.athletes for insert to authenticated
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy athletes_update on public.athletes for update to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy athletes_delete on public.athletes for delete to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));

-- videos ---------------------------------------------------------------------
create policy videos_select on public.videos for select to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy videos_insert on public.videos for insert to authenticated
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy videos_update on public.videos for update to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy videos_delete on public.videos for delete to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));

-- taxonomy -------------------------------------------------------------------
-- Read: global seed (org_id is null) OR my org's rows (§5.5). An org-only policy
-- would open the picker empty and get debugged in the wrong place.
create policy taxonomy_select on public.taxonomy for select to authenticated
  using (org_id is null or org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
-- Write: org-scoped rows only. A user can never create/modify/delete a global row.
create policy taxonomy_insert on public.taxonomy for insert to authenticated
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy taxonomy_update on public.taxonomy for update to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy taxonomy_delete on public.taxonomy for delete to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));

-- tags -----------------------------------------------------------------------
create policy tags_select on public.tags for select to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy tags_insert on public.tags for insert to authenticated
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy tags_update on public.tags for update to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy tags_delete on public.tags for delete to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));

-- clips ----------------------------------------------------------------------
create policy clips_select on public.clips for select to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy clips_insert on public.clips for insert to authenticated
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy clips_update on public.clips for update to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())))
  with check (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
create policy clips_delete on public.clips for delete to authenticated
  using (org_id in (select m.org_id from public.memberships m where m.user_id = (select auth.uid())));
