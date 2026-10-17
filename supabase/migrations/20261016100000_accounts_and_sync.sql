-- Accounts are independent of the public catalogue and station audio.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Listener' check (char_length(btrim(display_name)) between 2 and 40 and display_name !~ '[[:cntrl:]]'),
  revision bigint not null default 0 check (revision >= 0),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.user_roles (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  role text not null default 'user' check (role in ('user', 'admin')),
  updated_at timestamptz not null default now()
);
create table public.user_settings (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  notifications_enabled boolean not null default false,
  revision bigint not null default 0 check (revision >= 0),
  updated_at timestamptz not null default now()
);
-- False rows are tombstones: an offline client must not resurrect a removed favourite.
create table public.user_favorites (
  user_id uuid not null references public.profiles(id) on delete cascade,
  show_id text not null references public.shows(id) on delete restrict,
  is_favorite boolean not null default true,
  revision bigint not null default 1 check (revision >= 1),
  updated_at timestamptz not null default now(), primary key (user_id, show_id)
);
create table app_private.account_operations (
  user_id uuid not null references public.profiles(id) on delete cascade,
  operation_id uuid not null, result jsonb not null,
  created_at timestamptz not null default now(), primary key(user_id, operation_id)
);
create table app_private.account_rate_limits (
  user_id uuid not null references public.profiles(id) on delete cascade,
  action text not null, window_start timestamptz not null default now(),
  hits integer not null default 0, primary key(user_id, action)
);
revoke all on app_private.account_operations, app_private.account_rate_limits from public, anon, authenticated;
alter table app_private.account_operations enable row level security;
alter table app_private.account_rate_limits enable row level security;

create function app_private.create_account() returns trigger
language plpgsql security definer set search_path = '' as $$
declare label text;
begin
  label := left(btrim(regexp_replace(coalesce(new.raw_user_meta_data->>'display_name', 'Listener'), '[[:cntrl:]]', '', 'g')), 40);
  if char_length(label) < 2 then label := 'Listener'; end if;
  insert into public.profiles(id, display_name) values (new.id, label);
  insert into public.user_roles(user_id, role) values (new.id, 'user');
  insert into public.user_settings(user_id) values (new.id);
  return new;
end; $$;
revoke all on function app_private.create_account() from public, anon, authenticated;
create trigger aceradio_create_account after insert on auth.users for each row execute function app_private.create_account();
insert into public.profiles(id) select id from auth.users on conflict do nothing;
insert into public.user_roles(user_id) select id from public.profiles on conflict do nothing;
insert into public.user_settings(user_id) select id from public.profiles on conflict do nothing;

-- Never silently turn a legacy editor into an administrator.
do $$ begin
  if exists(select 1 from app_private.content_staff where role = 'editor') then
    raise exception 'Review existing editor memberships before migrating to the two-role account system';
  end if;
end $$;
update public.user_roles r set role = 'admin', updated_at = now()
from app_private.content_staff s where s.user_id = r.user_id and s.role = 'admin';

create function public.is_verified_account() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from auth.users u join public.profiles p on p.id = u.id
    where u.id = (select auth.uid()) and u.email_confirmed_at is not null);
$$;
create function public.is_account_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_verified_account() and exists(select 1 from public.user_roles where user_id = (select auth.uid()) and role = 'admin')
    and coalesce((select auth.jwt())->>'aal', '') = 'aal2';
$$;
-- Preserve the existing catalogue/Storage policy dependencies while changing their authority.
create or replace function public.is_content_editor() returns boolean
language sql stable security definer set search_path = '' as $$ select public.is_account_admin(); $$;
drop table app_private.content_staff;
revoke all on function public.is_verified_account(), public.is_account_admin() from public;
grant execute on function public.is_verified_account(), public.is_account_admin() to anon, authenticated, service_role;

do $$ declare tab text; owner_col text; begin
  foreach tab in array array['profiles','user_roles','user_settings','user_favorites'] loop
    owner_col := case when tab = 'profiles' then 'id' else 'user_id' end;
    execute format('alter table public.%I enable row level security', tab);
    execute format('revoke all on public.%I from public, anon, authenticated', tab);
    execute format('grant select on public.%I to authenticated', tab);
    execute format('grant all on public.%I to service_role', tab);
    execute format('create policy own_account_read on public.%I for select to authenticated using (%I = (select auth.uid()) and (select public.is_verified_account()))', tab, owner_col);
  end loop;
end $$;
create trigger account_profile_updated before update on public.profiles for each row execute function app_private.touch_content();
create trigger account_role_updated before update on public.user_roles for each row execute function app_private.touch_content();
create trigger account_settings_updated before update on public.user_settings for each row execute function app_private.touch_content();
create trigger account_favorite_updated before update on public.user_favorites for each row execute function app_private.touch_content();

create function app_private.protect_studio_account() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.user_roles where user_id = old.id and role = 'admin') then
    raise exception 'Transfer the studio admin role before deleting this account.' using errcode = '42501';
  end if;
  return old;
end; $$;
revoke all on function app_private.protect_studio_account() from public, anon, authenticated;
create trigger aceradio_protect_studio_account before delete on auth.users for each row execute function app_private.protect_studio_account();

create function app_private.require_account() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.is_verified_account() then raise exception 'Please sign in with a verified email.' using errcode = '42501'; end if;
  return (select auth.uid());
end; $$;
revoke all on function app_private.require_account() from public, anon, authenticated;

-- Called while holding the account advisory lock; separate short/long windows.
create function app_private.account_limit(uid uuid, action_name text, max_hits integer, window_seconds integer) returns void
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into app_private.account_rate_limits(user_id, action) values(uid, action_name) on conflict do nothing;
  update app_private.account_rate_limits set
    hits = case when window_start <= now() - make_interval(secs => window_seconds) then 1 else hits + 1 end,
    window_start = case when window_start <= now() - make_interval(secs => window_seconds) then now() else window_start end
    where user_id = uid and action = action_name returning hits into n;
  if n > max_hits then raise exception 'Too many changes. Please wait a minute and retry.' using errcode = 'P0429'; end if;
end; $$;
revoke all on function app_private.account_limit(uuid, text, integer, integer) from public, anon, authenticated;

create function public.get_account_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := app_private.require_account();
begin
  return jsonb_build_object('version', 1, 'user_id', uid,
    'profile', (select jsonb_build_object('display_name', display_name, 'revision', revision) from public.profiles where id = uid),
    'role', (select role from public.user_roles where user_id = uid),
    'settings', (select jsonb_build_object('notifications_enabled', notifications_enabled, 'revision', revision) from public.user_settings where user_id = uid),
    'favorites', coalesce((select jsonb_agg(jsonb_build_object('show_id', show_id, 'is_favorite', is_favorite, 'revision', revision) order by show_id) from public.user_favorites where user_id = uid), '[]'::jsonb));
end; $$;

create function public.apply_account_changes(changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare uid uuid := app_private.require_account(); item jsonb; op uuid; kind text; base bigint; actual bigint;
  result jsonb; results jsonb := '[]'::jsonb; label text; desired boolean; show_ref text;
begin
  if changes is null or jsonb_typeof(changes) <> 'array' or jsonb_array_length(changes) not between 1 and 50 or octet_length(changes::text) > 32768 then
    raise exception 'Invalid changes.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 417));
  delete from app_private.account_operations where user_id = uid and created_at < now() - interval '14 days';
  for item in select value from jsonb_array_elements(changes) loop
    op := (item->>'id')::uuid; kind := item->>'kind'; base := (item->>'base_revision')::bigint;
    if op is null or kind is null or base is null or base < 0 then raise exception 'Invalid change.' using errcode = '22023'; end if;
    select o.result into result from app_private.account_operations o where o.user_id = uid and operation_id = op;
    if result is not null then results := results || jsonb_build_array(result); continue; end if;
    perform app_private.account_limit(uid, 'writes_minute', 90, 60);
    perform app_private.account_limit(uid, 'writes_day', 2000, 86400);
    if kind = 'favorite' then
      show_ref := item->>'show_id';
      if jsonb_typeof(item->'value') is distinct from 'boolean' or not exists(select 1 from public.shows where id = show_ref and status = 'published') then
        result := jsonb_build_object('id', op, 'status', 'unavailable');
      else
        desired := (item->>'value')::boolean;
        select revision into actual from public.user_favorites where user_id = uid and show_id = show_ref;
        actual := coalesce(actual, 0);
        if actual <> base then result := jsonb_build_object('id', op, 'status', 'conflict');
        else
          insert into public.user_favorites(user_id, show_id, is_favorite, revision) values(uid, show_ref, desired, actual + 1)
          on conflict(user_id, show_id) do update set is_favorite = excluded.is_favorite, revision = excluded.revision;
          result := jsonb_build_object('id', op, 'status', 'saved');
        end if;
      end if;
    elsif kind = 'settings' then
      if jsonb_typeof(item->'value') is distinct from 'boolean' then raise exception 'Invalid preference.' using errcode = '22023'; end if;
      select revision into actual from public.user_settings where user_id = uid;
      if actual <> base then result := jsonb_build_object('id', op, 'status', 'conflict');
      else
        update public.user_settings set notifications_enabled = (item->>'value')::boolean, revision = revision + 1 where user_id = uid;
        result := jsonb_build_object('id', op, 'status', 'saved');
      end if;
    elsif kind = 'profile' then
      perform app_private.account_limit(uid, 'profile_hour', 10, 3600);
      label := btrim(item->>'value');
      if jsonb_typeof(item->'value') is distinct from 'string' or label is null or char_length(label) not between 2 and 40 or label ~ '[[:cntrl:]]' then
        raise exception 'Use a display name of 2 to 40 characters.' using errcode = '22023';
      end if;
      select revision into actual from public.profiles where id = uid;
      if actual <> base then result := jsonb_build_object('id', op, 'status', 'conflict');
      else
        update public.profiles set display_name = label, revision = revision + 1 where id = uid;
        result := jsonb_build_object('id', op, 'status', 'saved');
      end if;
    else raise exception 'Invalid change type.' using errcode = '22023'; end if;
    insert into app_private.account_operations(user_id, operation_id, result) values(uid, op, result);
    results := results || jsonb_build_array(result);
  end loop;
  return jsonb_build_object('account', public.get_account_data(), 'results', results);
end; $$;

-- The Edge Function validates the JWT with Auth before calling this check.
create function public.assert_account_deletion_allowed() returns boolean
language plpgsql security definer set search_path = '' as $$
declare uid uuid := app_private.require_account();
begin
  if exists(select 1 from public.user_roles where user_id = uid and role = 'admin') then
    raise exception 'Transfer the studio admin role before deleting this account.' using errcode = '42501';
  end if;
  if not exists(select 1 from jsonb_array_elements(coalesce((select auth.jwt())->'amr', '[]'::jsonb)) a
    where a->>'method' = 'password' and (a->>'timestamp')::bigint >= extract(epoch from now()) - 300) then
    raise exception 'Confirm your password again before deleting your account.' using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(uid::text, 417));
  perform app_private.account_limit(uid, 'delete_hour', 5, 3600);
  return true;
end; $$;
revoke all on function public.get_account_data(), public.apply_account_changes(jsonb), public.assert_account_deletion_allowed() from public, anon;
grant execute on function public.get_account_data(), public.apply_account_changes(jsonb), public.assert_account_deletion_allowed() to authenticated;

comment on table public.user_roles is 'Only user/admin. Promote or demote via trusted Supabase dashboard/SQL; clients cannot change roles. Admin content/Storage writes require MFA aal2.';
comment on table public.user_favorites is 'Private account favourites with revisioned removal tombstones. All client writes use apply_account_changes.';
comment on function public.apply_account_changes(jsonb) is 'Verified owner only, atomic, bounded, rate-limited, retry-safe writes with optimistic concurrency. Never accepts another account ID.';
