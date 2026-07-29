-- Centralise archived_at filtering in one place, not repeated in every list
-- query (ARCHITECTURE §4.4).
--
-- security_invoker = true is mandatory (prompt #7, and Supabase security
-- checklist): without it the view executes as its owner and silently bypasses
-- the querying user's RLS, leaking across tenants. With it, the underlying
-- athletes/videos RLS policies still apply to whoever selects from the view.

create view public.active_athletes
  with (security_invoker = true)
as
  select *
  from public.athletes
  where archived_at is null;

create view public.active_videos
  with (security_invoker = true)
as
  select *
  from public.videos
  where archived_at is null;
