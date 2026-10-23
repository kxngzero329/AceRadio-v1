-- A person's published headshot is shared by their solo shows. Group artwork
-- remains on co-hosted shows. No image bytes or extra media rows are created.
create or replace function public.show_headshot_id(target_show text, fallback text)
returns text language sql stable security invoker set search_path = '' as $$
 select case when count(*) = 1 then min(p.photo_id) else fallback end
 from public.show_presenters sp
 join public.presenters p on p.id = sp.presenter_id
 where sp.show_id = target_show;
$$;
revoke all on function public.show_headshot_id(text,text) from public;
grant execute on function public.show_headshot_id(text,text) to anon, authenticated, service_role;

-- Preserve the current show headshots already selected by staff. Only an
-- unambiguous solo-show image can seed a person's photo; never choose a group
-- image or invent a missing photo. Alternate library images remain available.
with solo as (
 select s.artwork_id, min(sp.presenter_id) as presenter_id
 from public.shows s
 join public.show_presenters sp on sp.show_id = s.id
 join public.media_assets m on m.id = s.artwork_id
 where s.status = 'published' and m.media_category = 'headshots'
 group by s.id, s.artwork_id having count(*) = 1
), agreed as (
 select presenter_id, min(artwork_id) as photo_id from solo
 group by presenter_id having count(distinct artwork_id) = 1
)
update public.presenters p set photo_id = a.photo_id
from agreed a where p.id = a.presenter_id and p.photo_id is distinct from a.photo_id;

-- One direction only: saving a solo show's headshot edits the person's shared
-- photo. Presenter edits are reflected by the public projection and admin
-- resolver, without recursive triggers or overwriting group artwork.
create or replace function app_private.share_solo_show_headshot()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare host_id text;
begin
 select min(sp.presenter_id) into host_id from public.show_presenters sp
 where sp.show_id = new.id having count(*) = 1;
 if host_id is not null then
  update public.presenters set photo_id = new.artwork_id
  where id = host_id and photo_id is distinct from new.artwork_id;
 end if;
 return new;
end;
$$;
revoke all on function app_private.share_solo_show_headshot() from public;
create trigger share_solo_show_headshot after update of artwork_id on public.shows
for each row execute function app_private.share_solo_show_headshot();

CREATE OR REPLACE FUNCTION public.get_app_content_v3()
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
select jsonb_build_object(
 'version', 3,
 'shows', coalesce((select jsonb_agg((to_jsonb(s) - 'source_payload') || jsonb_build_object('artwork_id', public.show_headshot_id(s.id, s.artwork_id)) order by s.display_order, s.id) from public.shows s where status = 'published'), '[]'::jsonb),
 'presenters', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.presenters p where status = 'published'), '[]'::jsonb),
 'show_presenters', coalesce((select jsonb_agg(to_jsonb(sp) order by sp.show_id, sp.position) from public.show_presenters sp join public.shows s on s.id = sp.show_id join public.presenters p on p.id = sp.presenter_id where s.status = 'published' and p.status = 'published'), '[]'::jsonb),
 'show_schedules', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.show_id, sc.day_of_week, sc.starts_at) from public.show_schedules sc join public.shows s on s.id = sc.show_id where s.status = 'published'), '[]'::jsonb),
 'media_assets', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.media_assets m where status = 'published' and (
   exists(select 1 from public.shows s where s.status = 'published' and (public.show_headshot_id(s.id, s.artwork_id) = m.id or s.poster_id = m.id)) or
   exists(select 1 from public.presenters p where p.status = 'published' and p.photo_id = m.id) or
   exists(select 1 from public.banners b where b.status = 'published' and b.image_id = m.id and (b.starts_at is null or b.starts_at <= now()) and (b.ends_at is null or b.ends_at > now()) and (b.show_id is null or exists(select 1 from public.shows s where s.id = b.show_id and s.status = 'published')))
 )), '[]'::jsonb),
 'banners', coalesce((select jsonb_agg(to_jsonb(b) order by b.display_order, b.id) from public.banners b where status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()) and (show_id is null or exists(select 1 from public.shows s where s.id = show_id and s.status = 'published'))), '[]'::jsonb),
 'announcements', coalesce((select jsonb_agg(to_jsonb(a) order by a.priority desc, a.created_at desc) from public.announcements a where status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())), '[]'::jsonb)
);
$function$
;

comment on function public.show_headshot_id(text,text) is 'Canonical person photo for a solo show; original artwork for unhosted or group shows. RLS remains in force.';
