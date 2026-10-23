-- R2 folders are independent of legacy bucket_id/object_path provenance.
-- Keep old URLs readable during the separately verified data migration.
alter table public.media_assets drop constraint media_r2_delivery;
alter table public.media_assets add constraint media_r2_delivery check (
 (public_url is null and r2_key is null and r2_sha256 is null and r2_bytes is null)
 or (
  public_url is not null and public_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/[^[:space:]]+$'
  and position('@' in split_part(public_url, '/', 3)) = 0
  and r2_key is not null
  and (r2_key ~ '^(headshots|show-banners|events|announcements)/[a-f0-9]{64}\.(jpg|png|webp)$'
       or r2_key like bucket_id || '/r2/%')
  and r2_key !~ '(^/|(^|/)\.\.(/|$)|[[:space:]\\])'
  and r2_sha256 is not null and r2_sha256 ~ '^[a-f0-9]{64}$'
  and r2_bytes is not null and r2_bytes between 1 and 10485760
 )
);
alter table public.media_assets add column media_category text generated always as (
 case split_part(r2_key,'/',1)
  when 'headshots' then 'headshots'
  when 'show-artwork' then 'headshots'
  when 'presenter-photos' then 'headshots'
  when 'show-banners' then 'show-banners'
  when 'banners' then 'show-banners'
  when 'events' then 'events'
  when 'announcements' then 'announcements'
  else null
 end
) stored;
-- One shared catalogue record per physical R2 file, including concurrent retries.
alter table public.media_assets add constraint media_assets_r2_key_key unique (r2_key);
comment on column public.media_assets.media_category is
 'R2 library folder. Shared headshots and show banners are selected by reference; no image bytes are stored in Postgres.';
comment on column public.media_assets.public_url is
 'Verified R2 HTTPS image URL. bucket_id/object_path preserve legacy provenance only; Supabase Storage files are no longer required.';

-- Existing read/delete access remains for the reviewed cleanup. Restrictive
-- policies also block new Storage uploads if another permissive policy exists.
create policy aceradio_images_r2_only_insert on storage.objects as restrictive
 for insert to authenticated with check
 (bucket_id not in ('show-artwork','presenter-photos','banners','station-media'));
create policy aceradio_images_r2_only_update on storage.objects as restrictive
 for update to authenticated using
 (bucket_id not in ('show-artwork','presenter-photos','banners','station-media'))
 with check (bucket_id not in ('show-artwork','presenter-photos','banners','station-media'));
