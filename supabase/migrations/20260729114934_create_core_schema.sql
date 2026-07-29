-- Core schema for ProGrapple (ARCHITECTURE §4).
-- Tables only. RLS is a separate migration; indexes are a separate migration.
--
-- Conventions applied (CONVENTIONS §4):
--   - UUID primary keys, server default gen_random_uuid() EXCEPT tags/clips whose
--     ids are generated client-side (crypto.randomUUID) for idempotent retries.
--   - org_id uuid not null on every domain table.
--   - created_at + updated_at on every table; updated_at maintained by trigger.
--   - created_by_user_id on every table holding user-entered data.
--   - archived_at on athletes and videos only.
--   - snake_case, plural tables, explicit units (timestamp_seconds, file_size_bytes...).
--
-- Assumptions (not dictated by ARCHITECTURE, noted per Autonomy):
--   - CHECK constraints pin the closed enums exactly to the values documented in §4.
--   - FK delete behaviour: membership/org bootstrap cascades on user/org deletion;
--     created_by_user_id set null on user deletion (preserve the row, drop the author);
--     tags/clips cascade on video deletion (per §4); taxonomy cascades with its org.
--   - taxonomy carries created_at/updated_at per CONVENTIONS §4 "every table",
--     though the §4 column listing abbreviated them away.

-- updated_at maintenance. Trigger, not application code (CONVENTIONS §4).
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- orgs -----------------------------------------------------------------------
create table public.orgs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- memberships ----------------------------------------------------------------
-- Composite PK (user_id, org_id) is the intentional non-UUID exception: it is
-- what guards the org-bootstrap trigger against the double-tap race (§7.3).
create table public.memberships (
  user_id            uuid not null references auth.users (id) on delete cascade,
  org_id             uuid not null references public.orgs (id) on delete cascade,
  role               text not null default 'head_coach' check (role in ('head_coach', 'athlete')),
  quick_tag_recents  jsonb not null default '[]',
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, org_id)
);

-- athletes -------------------------------------------------------------------
create table public.athletes (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id),
  name                text not null,
  kind                text not null check (kind in ('athlete', 'opponent')),
  archived_at         timestamptz,
  created_by_user_id  uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- videos ---------------------------------------------------------------------
create table public.videos (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.orgs (id),
  title               text not null,
  athlete_id          uuid references public.athletes (id),
  opponent_id         uuid references public.athletes (id),
  source_type         text not null check (source_type in ('url', 'local')),
  source_url          text,
  file_name           text,
  file_size_bytes     bigint,
  duration_seconds    numeric,
  archived_at         timestamptz,
  created_by_user_id  uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- taxonomy -------------------------------------------------------------------
-- org_id NULL = global seed (§5.5). Created before tags because tags.taxonomy_id
-- references it.
create table public.taxonomy (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid references public.orgs (id) on delete cascade,
  category    text not null check (category in ('position', 'pass', 'sweep', 'takedown', 'back', 'legs', 'submission', 'event')),
  term        text not null,
  synonyms    text[] not null default '{}',
  is_generic  boolean not null default false,
  is_default  boolean not null default false,
  sort_order  int,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- tags -----------------------------------------------------------------------
-- id has NO server default: generated client-side (§3.2, T11).
create table public.tags (
  id                  uuid primary key,
  org_id              uuid not null references public.orgs (id),
  video_id            uuid not null references public.videos (id) on delete cascade,
  timestamp_seconds   numeric not null,
  side                text not null check (side in ('athlete', 'opponent')),
  taxonomy_id         uuid not null references public.taxonomy (id),
  result              text check (result in ('scored', 'attempted', 'defended')),
  note                text,
  created_by_user_id  uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- clips ----------------------------------------------------------------------
-- id has NO server default: generated client-side (§3.2, T11).
create table public.clips (
  id                  uuid primary key,
  org_id              uuid not null references public.orgs (id),
  video_id            uuid not null references public.videos (id) on delete cascade,
  in_seconds          numeric not null,
  out_seconds         numeric not null,
  name                text not null,
  created_by_user_id  uuid references auth.users (id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- Attach updated_at triggers to every table.
create trigger set_updated_at before update on public.orgs
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.memberships
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.athletes
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.videos
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.taxonomy
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.tags
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.clips
  for each row execute function public.set_updated_at();
