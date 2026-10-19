-- Guest installations authenticate to the Edge Function with an unguessable
-- SecureStore secret. Only its SHA-256 hash is kept here. No client table grants.
create table app_private.push_devices (
  id uuid primary key, secret_hash text not null check (secret_hash ~ '^[a-f0-9]{64}$'),
  sequence bigint not null check (sequence >= 1), token text unique,
  platform text not null check (platform in ('android','ios')),
  environment text not null check (environment in ('preview','production')),
  user_id uuid references public.profiles(id) on delete cascade,
  enabled boolean not null default false,
  reminders_enabled boolean not null default false,
  scope text not null default 'favorites' check (scope in ('favorites','all')),
  lead_minutes smallint not null default 5 check (lead_minutes in (0,5,10,15)),
  favorites text[] not null default '{}',
  updated_at timestamptz not null default now(), expires_at timestamptz not null default (now() + interval '90 days'),
  check (not enabled or token ~ '^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]{10,200}\]$')
);
create index push_devices_user on app_private.push_devices(user_id) where user_id is not null;
create table app_private.push_one_time (
  device_id uuid not null references app_private.push_devices on delete cascade,
  show_id text not null references public.shows on delete cascade,
  starts_at timestamptz not null,
  lead_minutes smallint not null check (lead_minutes in (0,5,10,15)),
  primary key(device_id,show_id,starts_at)
);
create table app_private.push_jobs (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references app_private.push_devices on delete cascade,
  show_id text not null references public.shows on delete cascade,
  starts_at timestamptz not null, ends_at timestamptz not null, expires_at timestamptz not null,
  state text not null default 'queued' check (state in ('queued','leased','retry','sent','failed','uncertain','cancelled')),
  attempts integer not null default 0, next_attempt_at timestamptz not null default now(),
  lease uuid, lease_until timestamptz, sent_token text,
  ticket text, receipt_due_at timestamptz, receipt_state text,
  error_code text, created_at timestamptz not null default now(),
  unique(device_id,show_id,starts_at)
);
create index push_jobs_due on app_private.push_jobs(next_attempt_at) where state in ('queued','retry');
create index push_jobs_receipts on app_private.push_jobs(receipt_due_at) where state = 'sent' and receipt_state is null;
create table app_private.push_rate_limits (
  bucket text primary key, hits integer not null default 1, window_start timestamptz not null default now()
);
create table app_private.push_worker_leases (
  environment text primary key, lease uuid not null, lease_until timestamptz not null
);
do $$ declare tab text; begin
  foreach tab in array array['push_devices','push_one_time','push_jobs','push_rate_limits','push_worker_leases'] loop
    execute format('alter table app_private.%I enable row level security',tab);
    execute format('revoke all on app_private.%I from public,anon,authenticated',tab);
  end loop;
end $$;

-- Called separately so failed authentication cannot roll back the request limiter.
create function public.push_hit_limit(p_bucket text, p_max integer, p_seconds integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare n integer;
begin
  insert into app_private.push_rate_limits as limits(bucket) values(p_bucket)
  on conflict(bucket) do update set
    hits = case when limits.window_start <= now()-make_interval(secs=>p_seconds) then 1 else limits.hits+1 end,
    window_start = case when limits.window_start <= now()-make_interval(secs=>p_seconds) then now() else limits.window_start end
  returning hits into n;
  return n <= p_max;
end; $$;

create function public.push_worker_lock(p_environment text,p_lease uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare acquired uuid;
begin
  insert into app_private.push_worker_leases as current(environment,lease,lease_until)
    values(p_environment,p_lease,now()+interval '60 seconds')
  on conflict(environment) do update set lease=excluded.lease,lease_until=excluded.lease_until
    where current.lease_until<now() returning lease into acquired;
  return acquired is not null;
end; $$;
create function public.push_worker_unlock(p_environment text,p_lease uuid) returns void
language sql security definer set search_path = '' as $$
  delete from app_private.push_worker_leases where environment=p_environment and lease=p_lease;
$$;

create function public.push_register_device(
  p_id uuid,p_hash text,p_sequence bigint,p_token text,p_platform text,p_environment text,
  p_user uuid,p_enabled boolean,p_preferences jsonb,p_favorites text[],p_one_time jsonb
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare existing app_private.push_devices%rowtype; item jsonb;
begin
  perform pg_advisory_xact_lock(hashtextextended(p_id::text,921));
  select * into existing from app_private.push_devices where id=p_id for update;
  if existing.id is not null and existing.secret_hash <> p_hash then
    raise exception 'Installation authentication failed' using errcode='42501';
  end if;
  if existing.id is not null and existing.sequence >= p_sequence then
    return jsonb_build_object('saved',false,'sequence',existing.sequence);
  end if;
  if p_hash !~ '^[a-f0-9]{64}$' or p_sequence < 1 or
    coalesce(p_preferences->>'scope','') not in ('favorites','all') or
    coalesce(p_preferences->>'leadMinutes','') not in ('0','5','10','15') or
    jsonb_typeof(p_preferences->'enabled') is distinct from 'boolean' or
    jsonb_typeof(p_one_time) is distinct from 'array' or jsonb_array_length(p_one_time)>50 or
    coalesce(cardinality(p_favorites),0)>2000 then
    raise exception 'Invalid device preferences' using errcode='22023';
  end if;
  -- A token cannot be claimed by a different installation, even by a logged-in user.
  if p_token is not null and exists(select 1 from app_private.push_devices where token=p_token and id<>p_id) then
    raise exception 'Token belongs to another installation' using errcode='23505';
  end if;
  insert into app_private.push_devices(id,secret_hash,sequence,token,platform,environment,user_id,enabled,reminders_enabled,scope,lead_minutes,favorites)
  values(p_id,p_hash,p_sequence,p_token,p_platform,p_environment,p_user,p_enabled,
    (p_preferences->>'enabled')::boolean,p_preferences->>'scope',(p_preferences->>'leadMinutes')::smallint,p_favorites)
  on conflict(id) do update set sequence=excluded.sequence, token=excluded.token,platform=excluded.platform,
    environment=excluded.environment,user_id=excluded.user_id,enabled=excluded.enabled,
    reminders_enabled=excluded.reminders_enabled,scope=excluded.scope,lead_minutes=excluded.lead_minutes,
    favorites=excluded.favorites,updated_at=now(),expires_at=now()+interval '90 days';
  delete from app_private.push_one_time where device_id=p_id;
  if p_enabled then
    for item in select value from jsonb_array_elements(p_one_time) loop
      if (item->>'startsAt')::timestamptz>now() and (item->>'startsAt')::timestamptz<now()+interval '14 days'
        and exists(select 1 from public.shows where id=item->>'showId' and status='published') then
        insert into app_private.push_one_time values(p_id,item->>'showId',(item->>'startsAt')::timestamptz,(item->>'leadMinutes')::smallint)
        on conflict do nothing;
      end if;
    end loop;
  end if;
  -- Cancel unsent work immediately on opt-out or account switch. Other preference
  -- changes are rechecked against the authoritative schedule before claiming.
  if not p_enabled or existing.user_id is distinct from p_user then
    update app_private.push_jobs set state='cancelled' where device_id=p_id and state in ('queued','retry');
  end if;
  return jsonb_build_object('saved',true,'sequence',p_sequence);
end; $$;

-- This function is the single eligibility rule used both to create AND recheck
-- jobs. No catalogue cache or client-provided schedule authorises a push.
create function public.push_due_candidates(p_at timestamptz default now())
returns table(device_id uuid,show_id text,title text,starts_at timestamptz,ends_at timestamptz,expires_at timestamptz,token text,environment text)
language sql stable security definer set search_path = '' as $$
  with slots as (
    select s.show_id,sh.title,
      (days.day+s.starts_at) at time zone s.timezone as starts_at,
      (days.day+case when s.ends_at<=s.starts_at then 1 else 0 end+s.ends_at) at time zone s.timezone as ends_at
    from public.show_schedules s join public.shows sh on sh.id=s.show_id and sh.status='published'
    cross join lateral (select ((p_at at time zone 'Africa/Johannesburg')::date+g.n) as day from generate_series(-1,1) g(n)) days
    where extract(dow from days.day)=s.day_of_week and (s.valid_from is null or days.day>=s.valid_from)
      and (s.valid_until is null or days.day<=s.valid_until)
      and (days.day+s.starts_at) at time zone s.timezone > p_at-interval '2 minutes'
      and (days.day+s.starts_at) at time zone s.timezone <= p_at+interval '15 minutes'
  ), choices as (
    select d.id,d.token,d.environment,s.*,
      coalesce(o.lead_minutes,case when d.user_id is null then d.lead_minutes else us.reminder_lead_minutes end) as lead
    from slots s cross join app_private.push_devices d
    left join public.user_settings us on us.user_id=d.user_id
    left join app_private.push_one_time o on o.device_id=d.id and o.show_id=s.show_id and o.starts_at=s.starts_at
    where d.enabled and d.expires_at>p_at and d.token is not null and (
      o.device_id is not null or
      (case when d.user_id is null then d.reminders_enabled else coalesce(us.notifications_enabled,false) end and
        (case when d.user_id is null then d.scope else us.reminder_scope end='all' or
          (d.user_id is null and s.show_id=any(d.favorites)) or
          (d.user_id is not null and exists(select 1 from public.user_favorites f where f.user_id=d.user_id and f.show_id=s.show_id and f.is_favorite))))
    )
  )
  select distinct id,show_id,title,starts_at,ends_at,
    least(ends_at,starts_at-make_interval(mins=>lead)+interval '2 minutes'),token,environment
  from choices where p_at>=starts_at-make_interval(mins=>lead)
    and p_at<least(ends_at,starts_at-make_interval(mins=>lead)+interval '2 minutes');
$$;

create function public.push_claim_jobs(p_environment text,p_allowed uuid[] default null,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  -- Ambiguous sends are never blindly resent after a crash/timeout.
  update app_private.push_jobs set state='uncertain',error_code='lease_expired' where state='leased' and lease_until<p_at;
  update app_private.push_jobs j set state='cancelled' where j.state in ('queued','retry') and
    (j.expires_at<=p_at or not exists(select 1 from public.push_due_candidates(p_at) c where c.device_id=j.device_id and c.show_id=j.show_id and c.starts_at=j.starts_at));
  insert into app_private.push_jobs(device_id,show_id,starts_at,ends_at,expires_at,next_attempt_at)
    select device_id,show_id,starts_at,ends_at,expires_at,p_at from public.push_due_candidates(p_at)
    where environment=p_environment and (p_allowed is null or device_id=any(p_allowed))
    on conflict(device_id,show_id,starts_at) do nothing;
  with picked as (
    select j.id,c.token from app_private.push_jobs j
    join public.push_due_candidates(p_at) c on c.device_id=j.device_id and c.show_id=j.show_id and c.starts_at=j.starts_at
    where j.state in ('queued','retry') and j.next_attempt_at<=p_at and j.expires_at>p_at and c.environment=p_environment
      and (p_allowed is null or j.device_id=any(p_allowed))
    order by j.next_attempt_at,j.id for update of j skip locked limit 100
  ), claimed as (
    update app_private.push_jobs j set state='leased',lease=gen_random_uuid(),lease_until=p_at+interval '90 seconds',attempts=attempts+1,sent_token=p.token
    from picked p where j.id=p.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'token',j.sent_token,'showId',j.show_id,
    'title',sh.title,'startsAt',j.starts_at,'endsAt',j.ends_at,'expiresAt',j.expires_at,
    'time',to_char(j.starts_at at time zone 'Africa/Johannesburg','HH24:MI'))),'[]'::jsonb)
  into result from claimed j join public.shows sh on sh.id=j.show_id;
  return result;
end; $$;

create function public.push_finish_job(p_id uuid,p_lease uuid,p_state text,p_ticket text default null,p_error text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare job app_private.push_jobs%rowtype;
begin
  if p_state not in ('sent','retry','failed','uncertain') then raise exception 'Invalid delivery result'; end if;
  update app_private.push_jobs set state=case when p_state='retry' and attempts>=5 then 'failed' else p_state end,
    ticket=p_ticket,error_code=left(p_error,80),
    next_attempt_at=now()+make_interval(secs=>least(60,5*power(2,attempts)::integer)),
    receipt_due_at=case when p_state='sent' then now()+interval '15 minutes' else null end
    where id=p_id and lease=p_lease and state='leased' returning * into job;
  if job.id is not null and p_error='DeviceNotRegistered' then
    update app_private.push_devices set enabled=false where id=job.device_id and token=job.sent_token;
  end if;
end; $$;

create function public.push_pending_receipts() returns jsonb
language sql stable security definer set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'ticket',ticket)),'[]'::jsonb) from
    (select id,ticket from app_private.push_jobs where state='sent' and receipt_state is null and ticket is not null and receipt_due_at<=now()
      order by receipt_due_at limit 100) j;
$$;
create function public.push_finish_receipt(p_id uuid,p_result text,p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare job app_private.push_jobs%rowtype;
begin
  if p_result not in ('ok','error','pending') then raise exception 'Invalid receipt'; end if;
  update app_private.push_jobs set receipt_state=case when p_result='pending' and created_at>now()-interval '24 hours' then null
      when p_result='pending' then 'unknown' else p_result end,
    error_code=left(p_error,80),receipt_due_at=now()+interval '5 minutes'
    where id=p_id and state='sent' and receipt_state is null returning * into job;
  if job.id is not null and p_error='DeviceNotRegistered' then
    update app_private.push_devices set enabled=false where id=job.device_id and token=job.sent_token;
  end if;
end; $$;
create function public.push_cleanup() returns void
language sql security definer set search_path = '' as $$
  delete from app_private.push_jobs where created_at<now()-interval '30 days';
  delete from app_private.push_one_time where starts_at<now()-interval '1 day';
  delete from app_private.push_rate_limits where window_start<now()-interval '2 days';
  delete from app_private.push_devices where expires_at<now();
$$;

-- Exact signatures, no callable SECURITY DEFINER entrypoint left open by default.
do $$ declare f record; begin
  for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname like 'push\_%' escape '\' loop
    execute format('revoke all on function %s from public,anon,authenticated',f.signature);
    execute format('grant execute on function %s to service_role',f.signature);
  end loop;
end $$;
