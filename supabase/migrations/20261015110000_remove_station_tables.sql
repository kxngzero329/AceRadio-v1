-- User-approved removal of the three station tables. Audio/content tables and
-- Storage objects are untouched. Current station/About data lives in local files.
-- v1/v2 wrappers below retain their public response shapes for installed builds.
create function public.get_app_content_v3() returns jsonb
language sql stable security invoker set search_path = '' as $$
select jsonb_build_object(
 'version', 3,
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
 'announcements', coalesce((select jsonb_agg(to_jsonb(a) order by a.priority desc, a.created_at desc) from public.announcements a where status = 'published' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())), '[]'::jsonb)
);
$$;
revoke all on function public.get_app_content_v3() from public;
grant execute on function public.get_app_content_v3() to anon, authenticated, service_role;

-- Frozen PUBLIC payloads captured from the existing v1/v2 APIs before removal.
create or replace function public.get_app_content_v2() returns jsonb
language sql stable security invoker set search_path = '' as 'select public.get_app_content_v3() || jsonb_build_object(''version'',2,''station_settings'',''{"email":"studio@ace.radio","social_links":{"facebook":"https://www.facebook.com/ace.radio.za","instagram":"https://www.instagram.com/ace.radio","tiktok":"https://www.tiktok.com/@ace.radio.za","x":"https://x.com/aceradioza"},"website":"https://ace.radio","whatsapp":"https://wa.me/27730676204"}''::jsonb);';
revoke all on function public.get_app_content_v2() from public;
grant execute on function public.get_app_content_v2() to anon, authenticated, service_role;

create or replace function public.get_app_content() returns jsonb
language sql stable security invoker set search_path = '' as 'select public.get_app_content_v3() || jsonb_build_object(''version'',1,''station_settings'',''{"about":{"footer":"AceRadio • Built for those who listen differently.","intro":"It''''s a vision brought to life.","location_detail":"Broadcasting from Century City, South Africa","vision_body":"Built from the ground up by a driven team, AceRadio aims to reimagine what radio can be in the digital age.","vision_title":"Radio. Reimagined."},"created_at":"2026-10-15T12:26:36.844976+00:00","email":"studio@ace.radio","id":"main","location":"Cape Town, South Africa","name":"AceRadio","social_links":{"facebook":"https://www.facebook.com/ace.radio.za","instagram":"https://www.instagram.com/ace.radio","tiktok":"https://www.tiktok.com/@ace.radio.za","x":"https://x.com/aceradioza"},"status":"published","stream_url":"https://studio.ace.radio/stream","tagline":"Built for those who listen differently.","updated_at":"2026-10-15T12:26:36.844976+00:00","website":"https://ace.radio","whatsapp":"https://wa.me/27730676204"}''::jsonb,''station_team'',''[{"created_at":"2026-10-15T12:26:36.844976+00:00","display_order":0,"id":"luke-henwood","name":"Luke Henwood","photo_id":"team:luke-henwood","presenter_id":null,"role":"CO-FOUNDER","status":"published","updated_at":"2026-10-15T12:26:36.844976+00:00"},{"created_at":"2026-10-15T12:26:36.844976+00:00","display_order":1,"id":"christopher-marshall","name":"Christopher Marshall","photo_id":"presenter:christopher-marshall","presenter_id":"christopher-marshall","role":"CO-FOUNDER","status":"published","updated_at":"2026-10-15T12:26:36.844976+00:00"}]''::jsonb,''station_milestones'',''[{"created_at":"2026-10-15T12:26:36.844976+00:00","date_label":"July 2025","description":"The idea was born.","display_order":0,"event_date":null,"id":"idea","status":"published","updated_at":"2026-10-15T12:26:36.844976+00:00"},{"created_at":"2026-10-15T12:26:36.844976+00:00","date_label":"60 days later","description":"From concept to build.","display_order":1,"event_date":null,"id":"concept","status":"published","updated_at":"2026-10-15T12:26:36.844976+00:00"},{"created_at":"2026-10-15T12:26:36.844976+00:00","date_label":"3 October 2025","description":"AceRadio officially launched.","display_order":2,"event_date":"2025-10-03","id":"launch","status":"published","updated_at":"2026-10-15T12:26:36.844976+00:00"}]''::jsonb,''media_assets'',coalesce((select jsonb_agg(to_jsonb(m) order by m.id) from public.media_assets m where status=''published''),''[]''::jsonb));';
revoke all on function public.get_app_content() from public;
grant execute on function public.get_app_content() to anon, authenticated, service_role;

-- No CASCADE: an unexpected external dependency must abort the migration.
drop table public.station_team;
drop table public.station_milestones;
drop table public.station_settings;

comment on function public.get_app_content_v3() is 'Current public radio catalogue. Station identity, About and contact/social links are frontend content. SECURITY INVOKER preserves RLS.';
comment on function public.get_app_content_v2() is 'Legacy v2 response wrapper. Contact fields are a frozen public compatibility snapshot; no station tables exist.';
comment on function public.get_app_content() is 'Legacy v1 response wrapper. Station/About fields are a frozen public compatibility snapshot; no station tables exist.';
