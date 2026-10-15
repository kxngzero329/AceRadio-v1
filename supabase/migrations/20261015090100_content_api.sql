-- One consistent read of the small catalogue, rather than an N+1 query per show.
-- SECURITY INVOKER preserves the caller's RLS policies. Staff still get published-only app content.
create function public.get_app_content() returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
 'version', 1,
 'shows', coalesce((select jsonb_agg(to_jsonb(s) - 'source_payload' order by s.display_order, s.id) from public.shows s where status = 'published'), '[]'::jsonb),
 'presenters', coalesce((select jsonb_agg(to_jsonb(p) order by p.id) from public.presenters p where status = 'published'), '[]'::jsonb),
 'show_presenters', coalesce((select jsonb_agg(to_jsonb(sp) order by sp.show_id, sp.position) from public.show_presenters sp join public.shows s on s.id = sp.show_id join public.presenters p on p.id = sp.presenter_id where s.status = 'published' and p.status = 'published'), '[]'::jsonb),
 'show_schedules', coalesce((select jsonb_agg(to_jsonb(sc) order by sc.show_id, sc.day_of_week, sc.starts_at) from public.show_schedules sc join public.shows s on s.id = sc.show_id where s.status = 'published'), '[]'::jsonb),
 'media_assets', coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.media_assets m where status = 'published'), '[]'::jsonb),
 'banners', coalesce((select jsonb_agg(to_jsonb(b) order by b.display_order, b.id) from public.banners b where status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()) and (show_id is null or exists(select 1 from public.shows s where s.id = show_id and s.status = 'published'))), '[]'::jsonb),
 'announcements', coalesce((select jsonb_agg(to_jsonb(a) order by a.priority desc, a.created_at desc) from public.announcements a where status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())), '[]'::jsonb),
 'station_settings', (select to_jsonb(st) from public.station_settings st where id = 'main' and status = 'published'),
 'station_team', coalesce((select jsonb_agg(to_jsonb(t) order by t.display_order, t.id) from public.station_team t where status = 'published'), '[]'::jsonb),
 'station_milestones', coalesce((select jsonb_agg(to_jsonb(m) order by m.display_order, m.id) from public.station_milestones m where status = 'published'), '[]'::jsonb)
);
$$;
revoke all on function public.get_app_content() from public;
grant execute on function public.get_app_content() to anon, authenticated, service_role;
