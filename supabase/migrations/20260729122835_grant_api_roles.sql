-- Grant table privileges to the API roles.
--
-- RLS and GRANT are separate layers: RLS decides WHICH ROWS a role sees, GRANT
-- decides whether the role may touch the table AT ALL. Enabling RLS (migration 3)
-- does nothing about GRANT. Older Supabase CLI versions granted the API roles
-- implicitly for new tables; newer ones do not — so without this migration the
-- schema behaves differently across CLI versions and dashboard settings, and CI
-- fails with `42501 permission denied for table memberships`.
--
-- This migration makes privileges explicit and deterministic. It is additive and
-- changes no policy or table definition.
--
--   authenticated : SELECT/INSERT/UPDATE/DELETE on the app tables (RLS still
--                   constrains the rows; the grant only opens the table).
--   service_role  : ALL (it bypasses RLS, but still needs the grant to touch the
--                   table — this is exactly what the CI error reported).
--   anon          : nothing. Every policy is `TO authenticated`, and pre-login
--                   auth goes through GoTrue, not PostgREST. No table is read
--                   before login, so anon needs no table privilege at all.

-- Schema usage — PostgREST resolves objects through the schema, so the API roles
-- need USAGE on public. anon is deliberately omitted.
grant usage on schema public to authenticated, service_role;

-- Application tables.
grant select, insert, update, delete on
  public.orgs,
  public.memberships,
  public.athletes,
  public.videos,
  public.taxonomy,
  public.tags,
  public.clips
to authenticated;

grant all privileges on
  public.orgs,
  public.memberships,
  public.athletes,
  public.videos,
  public.taxonomy,
  public.tags,
  public.clips
to service_role;

-- Views. security_invoker = true means the underlying tables' RLS still applies
-- to whoever selects, so only SELECT is needed here.
grant select on public.active_athletes, public.active_videos
  to authenticated, service_role;

-- Sequences — none exist today (UUID keys), but grant + default-privilege them so
-- a future serial/identity column does not silently reintroduce a missing grant.
grant usage, select on all sequences in schema public
  to authenticated, service_role;

-- Future objects created by the migration role inherit these grants, so the next
-- migration cannot reintroduce the missing-GRANT bug. Default privileges ON TABLES
-- also cover views. anon is omitted here too.
alter default privileges in schema public
  grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public
  grant all privileges on tables to service_role;
alter default privileges in schema public
  grant usage, select on sequences to authenticated, service_role;
