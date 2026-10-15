-- Additive content schema. No existing application tables or data are replaced.
create schema if not exists app_private;
revoke all on schema app_private from public, anon, authenticated;

create table app_private.content_staff (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('admin', 'editor')),
  created_at timestamptz not null default now()
);
alter table app_private.content_staff enable row level security;
revoke all on app_private.content_staff from public, anon, authenticated;

-- Membership is maintained by a trusted administrator, never by user_metadata.
create function public.is_content_editor() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from app_private.content_staff where user_id = (select auth.uid()));
$$;
revoke all on function public.is_content_editor() from public;
grant execute on function public.is_content_editor() to anon, authenticated, service_role;

create table public.media_assets (
  id text primary key check (length(btrim(id)) > 0),
  bucket_id text not null references storage.buckets(id) on delete restrict,
  object_path text not null check (object_path !~ '(^/|(^|/)\.\.(/|$))' and length(object_path) > 0),
  mime_type text not null check (mime_type in ('image/jpeg', 'image/png', 'image/webp')),
  width integer check (width > 0), height integer check (height > 0),
  sha256 text check (sha256 ~ '^[a-f0-9]{64}$'),
  alt_text text,
  source_url text check (source_url is null or source_url ~ '^https://'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (bucket_id, object_path)
);

create table public.presenters (
  id text primary key check (length(btrim(id)) > 0),
  name text not null check (length(btrim(name)) > 0),
  bio text, photo_id text references public.media_assets(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  source_system text not null default 'editor', external_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source_system, external_id)
);

create table public.shows (
  id text primary key check (id ~ '^[a-z0-9][a-z0-9-]*$'),
  title text not null check (length(btrim(title)) > 0),
  subtitle text, description text,
  artwork_id text references public.media_assets(id) on delete restrict,
  poster_id text references public.media_assets(id) on delete restrict,
  accent text not null default '#0C321C' check (accent ~ '^#[0-9A-Fa-f]{6}$'),
  category text check (category in ('weekdays','weekends','mixed')),
  display_order integer not null default 0 check (display_order >= 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  source_system text not null default 'editor', external_id text,
  source_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(source_payload) = 'object'),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source_system, external_id)
);

create table public.show_presenters (
  show_id text not null references public.shows(id) on delete cascade,
  presenter_id text not null references public.presenters(id) on delete restrict,
  position integer not null default 0 check (position >= 0),
  primary key (show_id, presenter_id), unique (show_id, position)
);

-- Each row is a recurring start day in SAST. end < start represents an overnight show.
create table public.show_schedules (
  id text primary key,
  show_id text not null references public.shows(id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 0 and 6),
  starts_at time not null, ends_at time not null check (ends_at <> starts_at),
  check (extract(second from starts_at) = 0 and extract(second from ends_at) = 0),
  timezone text not null default 'Africa/Johannesburg' check (timezone = 'Africa/Johannesburg'),
  valid_from date, valid_until date check (valid_until is null or valid_from is null or valid_until >= valid_from),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique nulls not distinct (show_id, day_of_week, starts_at, ends_at, valid_from)
);

create table public.banners (
  id text primary key,
  show_id text references public.shows(id) on delete restrict,
  title text not null check (length(btrim(title)) > 0), subtitle text,
  image_id text not null references public.media_assets(id) on delete restrict,
  placement text not null default 'home_spotlight' check (placement in ('home_spotlight','home_banner')),
  link_url text check (link_url is null or link_url ~ '^https://'),
  starts_at timestamptz, ends_at timestamptz check (ends_at is null or starts_at is null or ends_at > starts_at),
  display_order integer not null default 0 check (display_order >= 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  source_system text not null default 'editor', external_id text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique (source_system, external_id)
);

create table public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) > 0), body text not null check (length(btrim(body)) > 0),
  link_url text check (link_url is null or link_url ~ '^https://'),
  starts_at timestamptz, ends_at timestamptz check (ends_at is null or starts_at is null or ends_at > starts_at),
  priority integer not null default 0,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.station_settings (
  id text primary key default 'main' check (id = 'main'),
  name text not null, tagline text, location text,
  stream_url text not null check (stream_url ~ '^https://'),
  website text check (website is null or website ~ '^https://'),
  email text, whatsapp text check (whatsapp is null or whatsapp ~ '^https://'),
  social_links jsonb not null default '{}'::jsonb check (jsonb_typeof(social_links) = 'object'),
  about jsonb not null default '{}'::jsonb check (jsonb_typeof(about) = 'object'),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.station_team (
  id text primary key, name text not null, role text not null,
  presenter_id text references public.presenters(id) on delete restrict,
  photo_id text references public.media_assets(id) on delete restrict,
  display_order integer not null default 0 check (display_order >= 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create table public.station_milestones (
  id text primary key, date_label text not null, description text not null,
  event_date date, display_order integer not null default 0 check (display_order >= 0),
  status text not null default 'draft' check (status in ('draft','published','archived')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

create function app_private.touch_content() returns trigger
language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;

-- Published content is public; only explicitly approved staff can edit or see drafts.
do $$
declare tab text;
begin
  foreach tab in array array['media_assets','presenters','shows','banners','announcements','station_settings','station_team','station_milestones'] loop
    execute format('alter table public.%I enable row level security', tab);
    execute format('revoke all on public.%I from public, anon, authenticated', tab);
    execute format('grant select on public.%I to anon, authenticated', tab);
    execute format('grant insert, update, delete on public.%I to authenticated', tab);
    execute format('grant all on public.%I to service_role', tab);
    execute format('create policy published_read on public.%I for select to anon, authenticated using (status = ''published'')', tab);
    execute format('create policy staff_manage on public.%I for all to authenticated using ((select public.is_content_editor())) with check ((select public.is_content_editor()))', tab);
    execute format('create trigger touch_updated_at before update on public.%I for each row execute function app_private.touch_content()', tab);
  end loop;
end $$;

alter table public.show_presenters enable row level security;
alter table public.show_schedules enable row level security;
revoke all on public.show_presenters, public.show_schedules from public, anon, authenticated;
grant select on public.show_presenters, public.show_schedules to anon, authenticated;
grant insert, update, delete on public.show_presenters, public.show_schedules to authenticated;
grant all on public.show_presenters, public.show_schedules to service_role;
create policy published_read on public.show_presenters for select to anon, authenticated using (
  exists(select 1 from public.shows s where s.id = show_id and s.status = 'published') and
  exists(select 1 from public.presenters p where p.id = presenter_id and p.status = 'published')
);
create policy published_read on public.show_schedules for select to anon, authenticated using (
  exists(select 1 from public.shows s where s.id = show_id and s.status = 'published')
);
create policy staff_manage on public.show_presenters for all to authenticated
  using ((select public.is_content_editor())) with check ((select public.is_content_editor()));
create policy staff_manage on public.show_schedules for all to authenticated
  using ((select public.is_content_editor())) with check ((select public.is_content_editor()));
create trigger touch_updated_at before update on public.show_schedules
  for each row execute function app_private.touch_content();

create index shows_published_order on public.shows(display_order, id) where status = 'published';
create index schedules_show_day on public.show_schedules(show_id, day_of_week);
create index show_presenters_presenter on public.show_presenters(presenter_id);
create index shows_artwork on public.shows(artwork_id);
create index shows_poster on public.shows(poster_id);
create index presenters_photo on public.presenters(photo_id);
create index banners_show on public.banners(show_id);
create index banners_image on public.banners(image_id);
create index banners_published_order on public.banners(placement, display_order) where status = 'published';
create index announcements_published_window on public.announcements(starts_at, ends_at) where status = 'published';
create index station_team_presenter on public.station_team(presenter_id);
create index station_team_photo on public.station_team(photo_id);

-- Public promotional media only. Draft/confidential uploads belong in separate private buckets.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types) values
  ('show-artwork','show-artwork',true,10485760,array['image/jpeg','image/png','image/webp']),
  ('presenter-photos','presenter-photos',true,10485760,array['image/jpeg','image/png','image/webp']),
  ('banners','banners',true,10485760,array['image/jpeg','image/png','image/webp']),
  ('station-media','station-media',true,10485760,array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
create policy aceradio_media_read on storage.objects for select to anon, authenticated
  using (bucket_id in ('show-artwork','presenter-photos','banners','station-media'));
create policy aceradio_staff_upload on storage.objects for insert to authenticated
  with check (bucket_id in ('show-artwork','presenter-photos','banners','station-media') and (select public.is_content_editor()));
create policy aceradio_staff_update on storage.objects for update to authenticated
  using (bucket_id in ('show-artwork','presenter-photos','banners','station-media') and (select public.is_content_editor()))
  with check (bucket_id in ('show-artwork','presenter-photos','banners','station-media') and (select public.is_content_editor()));
create policy aceradio_staff_delete on storage.objects for delete to authenticated
  using (bucket_id in ('show-artwork','presenter-photos','banners','station-media') and (select public.is_content_editor()));
