-- Published content is exported to R2 by one credential-gated, globally paced
-- publisher. Guests never receive this credential or access to its state.
create table app_private.public_content_delivery (
  id boolean primary key default true check(id),
  revision bigint not null default 1,
  publisher_sha256 text,
  lease_until timestamptz not null default '-infinity'
);
insert into app_private.public_content_delivery(id) values(true);
alter table app_private.public_content_delivery enable row level security;
revoke all on app_private.public_content_delivery from public, anon, authenticated;

create function app_private.mark_public_content_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 update app_private.public_content_delivery set revision=revision+1 where id;
 return null;
end $$;
revoke all on function app_private.mark_public_content_changed() from public,anon,authenticated;
do $$ declare tab text; begin
 foreach tab in array array['shows','presenters','show_presenters','show_schedules',
   'media_assets','banners','announcements','events','event_ticket_types'] loop
   execute format('create trigger public_content_revision after insert or update or delete or truncate on public.%I for each statement execute function app_private.mark_public_content_changed()',tab);
 end loop;
end $$;

create function public.claim_public_content_publish(p_token text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare rev bigint; next_boundary timestamptz;
begin
 if length(p_token)<>64 or not exists(select 1 from app_private.public_content_delivery
   where id and publisher_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex')) then
   raise exception 'Publisher credential required' using errcode='42501';
 end if;
 update app_private.public_content_delivery set lease_until=clock_timestamp()+interval '55 seconds'
 where id and lease_until<=clock_timestamp() returning revision into rev;
 if not found then return jsonb_build_object('allowed',false); end if;
 select min(boundary) into next_boundary from (
   select starts_at boundary from public.banners where status='published'
   union all select ends_at from public.banners where status='published'
   union all select starts_at from public.announcements where status='published'
   union all select ends_at from public.announcements where status='published'
   union all select coalesce(ends_at,starts_at) from public.events where status='published'
 ) b where boundary>now();
 return jsonb_build_object('allowed',true,'revision',rev,'next_transition',next_boundary);
end $$;
revoke all on function public.claim_public_content_publish(text) from public,anon,authenticated;
grant execute on function public.claim_public_content_publish(text) to anon;

create function public.export_public_content(p_token text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
begin
 if length(p_token)<>64 or not exists(select 1 from app_private.public_content_delivery
   where id and publisher_sha256=encode(sha256(convert_to(p_token,'UTF8')),'hex')
   and lease_until>clock_timestamp()) then
   raise exception 'Publisher lease required' using errcode='42501';
 end if;
 -- These RPCs explicitly select published content; the publisher additionally
 -- allowlists every output field. No account, booking or staff tables are read.
 return jsonb_build_object('revision',(select revision from app_private.public_content_delivery where id),
   'app',public.get_app_content_v3(),
   'website',public.get_website_content(),
   'events',coalesce((select jsonb_agg(jsonb_build_object(
     'id',id,'title',title,'description',description,'starts_at',starts_at,
     'ends_at',ends_at,'location',location,'image_url',image_url,
     'booking_url',booking_url,'status',status) order by starts_at,id)
     from public.events where status='published'),'[]'::jsonb));
end $$;
revoke all on function public.export_public_content(text) from public,anon,authenticated;
grant execute on function public.export_public_content(text) to anon;

create function public.reserve_media_upload() returns boolean
language plpgsql security definer set search_path='' as $$
declare uid uuid := auth.uid();
begin
 if uid is null or not public.is_content_editor() then
   raise exception 'Verified staff access required' using errcode='42501';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('media-upload:'||uid::text,0));
 perform app_private.account_limit(uid,'media-upload-minute',20,60);
 perform app_private.account_limit(uid,'media-upload-hour',120,3600);
 return true;
exception when sqlstate 'P0429' then return false;
end $$;
revoke all on function public.reserve_media_upload() from public,anon,authenticated;
grant execute on function public.reserve_media_upload() to authenticated;

comment on function public.reserve_media_upload() is
 'Database-enforced, per-staff upload limits shared across all Edge instances. Admin/MFA rules remain authoritative.';
