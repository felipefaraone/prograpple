-- Org bootstrap (ARCHITECTURE §7.3).
--
-- "Create org on first sign-in" in client code creates two orgs when a coach
-- double-taps their magic link. Instead, a SECURITY DEFINER trigger on
-- auth.users AFTER INSERT creates the org and the membership in one transaction.
-- The client never provisions an org.
--
-- Guards:
--   - AFTER INSERT ... FOR EACH ROW fires exactly once per user row.
--   - Idempotent existence check + the memberships primary key make a repeat
--     provisioning attempt a no-op rather than a second org.
-- Security:
--   - SECURITY DEFINER is required to write public.orgs/memberships and to read
--     during signup, before any membership exists. search_path is pinned empty so
--     every reference is schema-qualified and cannot be hijacked.
--   - EXECUTE is revoked from the client roles: the function runs from the trigger
--     regardless, and must not be a callable public endpoint (it only makes sense
--     with a trigger NEW record anyway).

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_org_id uuid;
begin
  -- Idempotent: if this user already belongs to an org, do nothing.
  if exists (select 1 from public.memberships where user_id = new.id) then
    return new;
  end if;

  insert into public.orgs (name)
    values (coalesce(nullif(new.email, ''), 'ProGrapple org'))
    returning id into v_org_id;

  insert into public.memberships (user_id, org_id, role)
    values (new.id, v_org_id, 'head_coach')
    on conflict (user_id, org_id) do nothing;

  return new;
end;
$$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
