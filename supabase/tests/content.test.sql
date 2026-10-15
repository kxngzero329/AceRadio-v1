-- Run against the LOCAL Supabase stack after migrations and seed: supabase test db.
-- scripts/content.test.cjs also runs PostgreSQL policy/constraint tests without Docker.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);
select has_table('public','shows','Shows exist');
select has_table('public','presenters','Presenters exist');
select has_table('public','show_schedules','Structured schedules exist');
select has_function('public','get_app_content',array[]::text[],'Mobile catalogue RPC exists');
select has_function('public','get_app_content_v2',array[]::text[],'Current mobile catalogue RPC exists');
select has_function('public','get_app_content_v3',array[]::text[],'Radio-only catalogue RPC exists');
select hasnt_table('public','station_settings','Station settings table removed');
select hasnt_table('public','station_team','Station team table removed');
select hasnt_table('public','station_milestones','Station milestones table removed');
select is((select count(*)::integer from public.shows),11,'Verified shows seeded');
select is((select count(*)::integer from public.show_schedules),27,'Weekly slots seeded');
select is((select count(*)::integer from public.banners),11,'Verified banners seeded');
select ok((select bool_and(rowsecurity) from pg_tables where schemaname = 'public'),'Content tables use RLS');
set local role anon;
select is(jsonb_array_length(public.get_app_content_v3()->'shows'),11,'Anonymous role can read published shows');
select ok(not (public.get_app_content_v3() ?| array['station_team','station_settings','station_milestones']),'Current catalogue omits all removed station content');
select ok(not public.is_content_editor(),'Anonymous listener is not staff');
reset role;
select * from finish();
rollback;
