-- Hot-list indexes, exactly as specified in ARCHITECTURE §6.3. Each covers the
-- filter (org_id + video/archived) and the sort of a list query.

create index tags_org_video_ts_idx     on public.tags     (org_id, video_id, timestamp_seconds);
create index clips_org_video_in_idx    on public.clips    (org_id, video_id, in_seconds);
create index videos_org_archived_created_idx on public.videos (org_id, archived_at, created_at desc);
create index athletes_org_archived_name_idx  on public.athletes (org_id, archived_at, name);
