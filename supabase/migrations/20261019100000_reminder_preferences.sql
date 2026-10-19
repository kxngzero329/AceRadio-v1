-- Extend existing revisioned settings without breaking boolean writes from older clients.
alter table public.user_settings
  add column reminder_scope text not null default 'favorites' check (reminder_scope in ('favorites','all')),
  add column reminder_lead_minutes smallint not null default 5 check (reminder_lead_minutes in (0,5,10,15));

create or replace function public.get_account_data() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare uid uuid := app_private.require_account();
begin
  return jsonb_build_object('version', 1, 'user_id', uid,
    'profile', (select jsonb_build_object('display_name', display_name, 'revision', revision) from public.profiles where id = uid),
    'role', (select role from public.user_roles where user_id = uid),
    'settings', (select jsonb_build_object('notifications_enabled', notifications_enabled, 'revision', revision, 'reminder_scope', reminder_scope, 'reminder_lead_minutes', reminder_lead_minutes) from public.user_settings where user_id = uid),
    'favorites', coalesce((select jsonb_agg(jsonb_build_object('show_id', show_id, 'is_favorite', is_favorite, 'revision', revision) order by show_id) from public.user_favorites where user_id = uid), '[]'::jsonb));
end; $$;

create or replace function public.apply_account_changes(changes jsonb) returns jsonb
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
      if (item ? 'scope') and (jsonb_typeof(item->'scope') is distinct from 'string' or item->>'scope' not in ('favorites','all')) then
        raise exception 'Invalid reminder scope.' using errcode = '22023';
      end if;
      if (item ? 'leadMinutes') and (jsonb_typeof(item->'leadMinutes') is distinct from 'number' or item->>'leadMinutes' not in ('0','5','10','15')) then
        raise exception 'Invalid reminder time.' using errcode = '22023';
      end if;
      select revision into actual from public.user_settings where user_id = uid;
      if actual <> base then result := jsonb_build_object('id', op, 'status', 'conflict');
      else
        update public.user_settings set notifications_enabled = (item->>'value')::boolean,
          reminder_scope = coalesce(item->>'scope', reminder_scope),
          reminder_lead_minutes = coalesce((item->>'leadMinutes')::smallint, reminder_lead_minutes),
          revision = revision + 1 where user_id = uid;
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

