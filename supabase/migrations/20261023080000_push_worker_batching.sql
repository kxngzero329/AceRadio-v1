-- Additive, service-only batching. Existing delivery records, sender credentials,
-- eligibility functions, minute cron and legacy RPC signatures are retained.
begin;
create table app_private.push_maintenance (
 id boolean primary key default true check(id),
 next_cleanup_at timestamptz not null default (now()+interval '1 hour')
);
insert into app_private.push_maintenance(id) values(true);
alter table app_private.push_maintenance enable row level security;
revoke all on app_private.push_maintenance from public,anon,authenticated;

-- Bound the work as delivery history grows; avoid scanning sent history each minute.
create index push_jobs_retention on app_private.push_jobs(created_at);
create index push_jobs_expired_leases on app_private.push_jobs(lease_until) where state='leased';
create index push_devices_expiry on app_private.push_devices(expires_at);
create index push_one_time_expiry on app_private.push_one_time(starts_at);
create index push_rate_limits_retention on app_private.push_rate_limits(window_start);

create function public.push_worker_begin(p_environment text,p_lease uuid,p_allowed uuid[] default null)
returns jsonb language plpgsql security definer set search_path='' as $$
declare jobs jsonb; receipts jsonb;
begin
 if p_environment is null or p_environment not in ('preview','production') or p_lease is null then
  raise exception 'Invalid worker identity' using errcode='22023';
 end if;
 if not public.push_worker_lock(p_environment,p_lease) then
  return jsonb_build_object('acquired',false,'idle',false,'jobs','[]'::jsonb,'receipts','[]'::jsonb);
 end if;
 -- The conditional update serializes the hourly gate across both environments.
 -- Cleanup and its timestamp commit together; a failure rolls both back.
 update app_private.push_maintenance set next_cleanup_at=now()+interval '1 hour'
 where id and next_cleanup_at<=now();
 if found then perform public.push_cleanup(); end if;
 receipts:=public.push_pending_receipts();
 jobs:=public.push_claim_jobs(p_environment,p_allowed);
 if jsonb_array_length(jobs)=0 and jsonb_array_length(receipts)=0 then
  perform public.push_worker_unlock(p_environment,p_lease);
  return jsonb_build_object('acquired',false,'idle',true,'jobs',jobs,'receipts',receipts);
 end if;
 return jsonb_build_object('acquired',true,'idle',false,'jobs',jobs,'receipts',receipts);
end $$;

create function public.push_worker_flush(
 p_environment text,p_lease uuid,p_results jsonb default '[]',
 p_receipts jsonb default '[]',p_claim boolean default false,p_allowed uuid[] default null
) returns jsonb language plpgsql security definer set search_path='' as $$
declare item jsonb;
begin
 if jsonb_typeof(p_results) is distinct from 'array' or jsonb_typeof(p_receipts) is distinct from 'array'
  or jsonb_array_length(p_results)>100 or jsonb_array_length(p_receipts)>100
  or octet_length(p_results::text)+octet_length(p_receipts::text)>131072 then
  raise exception 'Invalid worker batch' using errcode='22023';
 end if;
 -- A heartbeat protects a slow in-flight batch from an overlapping minute run.
 -- Only the current unexpired owner may commit acknowledgements or claim more.
 update app_private.push_worker_leases set lease_until=clock_timestamp()+interval '60 seconds'
 where environment=p_environment and lease=p_lease and lease_until>clock_timestamp();
 if not found then raise exception 'Worker lease required' using errcode='42501'; end if;
 for item in select value from jsonb_array_elements(p_results) loop
  if item->>'id' is null or item->>'lease' is null or item->>'state' is null then
   raise exception 'Invalid delivery result' using errcode='22023';
  end if;
  perform public.push_finish_job((item->>'id')::uuid,(item->>'lease')::uuid,
    item->>'state',item->>'ticket',item->>'error');
 end loop;
 for item in select value from jsonb_array_elements(p_receipts) loop
  if item->>'id' is null or item->>'result' is null then
   raise exception 'Invalid receipt result' using errcode='22023';
  end if;
  perform public.push_finish_receipt((item->>'id')::uuid,item->>'result',item->>'error');
 end loop;
 if p_claim then return public.push_claim_jobs(p_environment,p_allowed); end if;
 return '[]'::jsonb;
end $$;

revoke all on function public.push_worker_begin(text,uuid,uuid[]),public.push_worker_flush(text,uuid,jsonb,jsonb,boolean,uuid[]) from public,anon,authenticated;
grant execute on function public.push_worker_begin(text,uuid,uuid[]),public.push_worker_flush(text,uuid,jsonb,jsonb,boolean,uuid[]) to service_role;
commit;
