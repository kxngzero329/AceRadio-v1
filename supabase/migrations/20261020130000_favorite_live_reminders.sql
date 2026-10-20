-- Preserve every existing job as its original reminder. A distinct phase allows
-- one additional favourite-show alert, five minutes into the published slot.
alter table app_private.push_jobs add column phase text not null default 'reminder'
  check (phase in ('reminder','live'));
alter table app_private.push_jobs drop constraint push_jobs_device_id_show_id_starts_at_key;
alter table app_private.push_jobs add unique(device_id,show_id,starts_at,phase);

create function public.push_delivery_candidates(p_at timestamptz default now())
returns table(device_id uuid,show_id text,title text,starts_at timestamptz,ends_at timestamptz,expires_at timestamptz,token text,environment text,phase text)
language sql stable security definer set search_path = '' as $$
  select c.*, 'reminder'::text from public.push_due_candidates(p_at) c
  union all
  select distinct d.id,s.show_id,sh.title,slot.starts_at,slot.ends_at,
    least(slot.ends_at,slot.starts_at+interval '7 minutes'),d.token,d.environment,'live'::text
  from public.show_schedules s join public.shows sh on sh.id=s.show_id and sh.status='published'
  cross join lateral (select ((p_at at time zone 'Africa/Johannesburg')::date+g.n) as day from generate_series(-1,0) g(n)) days
  cross join lateral (select (days.day+s.starts_at) at time zone s.timezone as starts_at,
    (days.day+case when s.ends_at<=s.starts_at then 1 else 0 end+s.ends_at) at time zone s.timezone as ends_at) slot
  cross join app_private.push_devices d
  left join public.user_settings us on us.user_id=d.user_id
  where extract(dow from days.day)=s.day_of_week and (s.valid_from is null or days.day>=s.valid_from)
    and (s.valid_until is null or days.day<=s.valid_until)
    and p_at>=slot.starts_at+interval '5 minutes' and p_at<least(slot.ends_at,slot.starts_at+interval '7 minutes')
    and d.enabled and d.expires_at>p_at and d.token is not null
    and case when d.user_id is null then d.reminders_enabled else coalesce(us.notifications_enabled,false) end
    and ((d.user_id is null and s.show_id=any(d.favorites)) or
      (d.user_id is not null and exists(select 1 from public.user_favorites f where f.user_id=d.user_id and f.show_id=s.show_id and f.is_favorite)));
$$;

create or replace function public.push_claim_jobs(p_environment text,p_allowed uuid[] default null,p_at timestamptz default now())
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update app_private.push_jobs set state='uncertain',error_code='lease_expired' where state='leased' and lease_until<p_at;
  update app_private.push_jobs j set state='cancelled' where j.state in ('queued','retry') and
    (j.expires_at<=p_at or not exists(select 1 from public.push_delivery_candidates(p_at) c
      where c.device_id=j.device_id and c.show_id=j.show_id and c.starts_at=j.starts_at and c.phase=j.phase));
  insert into app_private.push_jobs(device_id,show_id,starts_at,ends_at,expires_at,next_attempt_at,phase)
    select device_id,show_id,starts_at,ends_at,expires_at,p_at,phase from public.push_delivery_candidates(p_at)
    where environment=p_environment and (p_allowed is null or device_id=any(p_allowed))
    on conflict(device_id,show_id,starts_at,phase) do nothing;
  with picked as (
    select j.id,c.token from app_private.push_jobs j
    join public.push_delivery_candidates(p_at) c on c.device_id=j.device_id and c.show_id=j.show_id and c.starts_at=j.starts_at and c.phase=j.phase
    where j.state in ('queued','retry') and j.next_attempt_at<=p_at and j.expires_at>p_at and c.environment=p_environment
      and (p_allowed is null or j.device_id=any(p_allowed))
    order by j.next_attempt_at,j.id for update of j skip locked limit 100
  ), claimed as (
    update app_private.push_jobs j set state='leased',lease=gen_random_uuid(),lease_until=p_at+interval '90 seconds',attempts=attempts+1,sent_token=p.token
    from picked p where j.id=p.id returning j.*
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',j.id,'lease',j.lease,'token',j.sent_token,'showId',j.show_id,
    'title',sh.title,'startsAt',j.starts_at,'endsAt',j.ends_at,'expiresAt',j.expires_at,'phase',j.phase,
    'time',to_char(j.starts_at at time zone 'Africa/Johannesburg','HH24:MI'))),'[]'::jsonb)
  into result from claimed j join public.shows sh on sh.id=j.show_id;
  return result;
end; $$;

revoke all on function public.push_delivery_candidates(timestamptz) from public,anon,authenticated;
grant execute on function public.push_delivery_candidates(timestamptz) to service_role;
revoke all on function public.push_claim_jobs(text,uuid[],timestamptz) from public,anon,authenticated;
grant execute on function public.push_claim_jobs(text,uuid[],timestamptz) to service_role;
