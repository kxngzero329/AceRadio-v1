-- The station story, founders, history and identity now live in the application.
-- Add a smaller API without changing the v1 contract used by installed builds.
-- Legacy records/objects remain intact; this migration does not delete content.
create function public.get_app_content_v2() returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
 'version', 2,
 'shows', coalesce((select jsonb_agg(to_jsonb(s) - 'source_payload' order by s.display_order, s.id) from public.shows s where status = 'published'), '[]'::jsonb),
 'presenters', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.presenters p where status = 'published'), '[]'::jsonb),
 'show_presenters', coalesce((select jsonb_agg(to_jsonb(sp) order by sp.show_id, sp.position) from public.show_presenters sp join public.shows s on s.id = sp.show_id join public.presenters p on p.id = sp.presenter_id where s.status = 'published' and p.status = 'published'), '[]'::jsonb),
 'show_schedules', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.show_id, sc.day_of_week, sc.starts_at) from public.show_schedules sc join public.shows s on s.id = sc.show_id where s.status = 'published'), '[]'::jsonb),
 'media_assets', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.media_assets m where status = 'published' and (
   exists(select 1 from public.shows s where s.status = 'published' and (s.artwork_id = m.id or s.poster_id = m.id)) or
   exists(select 1 from public.presenters p where p.status = 'published' and p.photo_id = m.id) or
   exists(select 1 from public.banners b where b.status = 'published' and b.image_id = m.id and (b.starts_at is null or b.starts_at <= now()) and (b.ends_at is null or b.ends_at > now()) and (b.show_id is null or exists(select 1 from public.shows s where s.id = b.show_id and s.status = 'published')))
 )), '[]'::jsonb),
 'banners', coalesce((select jsonb_agg(to_jsonb(b) order by b.display_order, b.id) from public.banners b where status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()) and (show_id is null or exists(select 1 from public.shows s where s.id = show_id and s.status = 'published'))), '[]'::jsonb),
 'announcements', coalesce((select jsonb_agg(to_jsonb(a) order by a.priority desc, a.created_at desc) from public.announcements a where status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())), '[]'::jsonb),
 'station_settings', (select jsonb_build_object('website', st.website, 'email', st.email, 'whatsapp', st.whatsapp, 'social_links', st.social_links) from public.station_settings st where id = 'main' and status = 'published')
);
$$;
revoke all on function public.get_app_content_v2() from public;
grant execute on function public.get_app_content_v2() to anon, authenticated, service_role;

comment on function public.get_app_content_v2() is 'Current mobile catalogue: dynamic radio content and contact/social settings only. SECURITY INVOKER preserves RLS.';
comment on function public.get_app_content() is 'Legacy v1 catalogue retained for installed builds. New clients use get_app_content_v2.';
comment on table public.station_settings is 'Current clients use only website, email, whatsapp and social_links. Other columns are legacy v1 compatibility data; station identity and About content are local.';
comment on table public.station_team is 'Deprecated: retained for v1 compatibility. Current About founder profiles are bundled in src/data/about.ts.';
comment on table public.station_milestones is 'Deprecated: retained for v1 compatibility. Current About timeline is bundled in src/data/about.ts.';
