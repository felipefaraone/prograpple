-- Make table privileges for the API roles explicit and deterministic.
--
-- RLS and GRANT are separate layers: RLS decides WHICH ROWS a role sees, GRANT
-- decides whether the role may touch the table AT ALL. Enabling RLS (migration 3)
-- does nothing about GRANT.
--
-- The bug this removes is version-dependent implicit grants:
--   - Older Supabase CLIs (and this local stack) ship default ACLs that grant
--     ALL on every new public table to anon, authenticated AND service_role.
--   - Newer CLIs grant nothing, so service_role hit `42501 permission denied for
--     table memberships` in CI.
-- Both are implicit and differ by version. So we normalise: REVOKE ALL from the
-- three API roles, then GRANT precisely the intended privileges, and set matching
-- default privileges for future objects. The end state is identical on any CLI
-- version or dashboard setting.
--
--   authenticated : SELECT/INSERT/UPDATE/DELETE on app tables, SELECT on views.
--                   RLS still constrains the rows; the grant only opens the table.
--   service_role  : ALL (bypasses RLS, but still needs the grant).
--   anon          : nothing. Every policy is `TO authenticated`, and pre-login
--                   auth goes through GoTrue (role supabase_auth_admin), not
--                   PostgREST. No table is read before login, so anon needs no
--                   table privilege — and we revoke the platform default so it
--                   deterministically holds none.
--
-- Assumption (noted per Autonomy): migrations run as `postgres`, which owns these
-- tables, so ALTER DEFAULT PRIVILEGES on the current role covers every future
-- table our migrations create. Objects created by other roles are out of scope.

-- Schema usage — PostgREST resolves objects through the schema. anon omitted.
grant usage on schema public to authenticated, service_role;

-- 1. Clear whatever the platform granted by default, so the end state is exact.
revoke all privileges on
  public.orgs,
  public.memberships,
  public.athletes,
  public.videos,
  public.taxonomy,
  public.tags,
  public.clips,
  public.active_athletes,
  public.active_videos
from anon, authenticated, service_role;

-- 2. authenticated: app tables (RLS gates the rows) + read-only on the views.
grant select, insert, update, delete on
  public.orgs,
  public.memberships,
  public.athletes,
  public.videos,
  public.taxonomy,
  public.tags,
  public.clips
to authenticated;

grant select on public.active_athletes, public.active_videos to authenticated;

-- 3. service_role: full privileges on tables and views.
grant all privileges on
  public.orgs,
  public.memberships,
  public.athletes,
  public.videos,
  public.taxonomy,
  public.tags,
  public.clips,
  public.active_athletes,
  public.active_videos
to service_role;

-- 4. Sequences — none exist today (UUID keys), but grant to the non-anon roles so
--    a future serial/identity column works without a repeat of this fix.
grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- 5. Default privileges for FUTURE objects created by this role, so the next
--    migration cannot reintroduce a version-dependent grant. Revoke the platform
--    blanket first, then set ours. Default privileges ON TABLES also cover views.
--    anon is left with nothing.
alter default privileges in schema public
  revoke all on tables from anon, authenticated, service_role;
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all privileges on tables to service_role;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated, service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
