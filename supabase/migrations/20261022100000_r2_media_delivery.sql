-- Additive delivery metadata. Preserve original Supabase paths and bytes for
-- installed clients, offline catalogues and rollback. No content is switched here.
alter table public.media_assets
  add column public_url text,
  add column r2_key text,
  add column r2_sha256 text,
  add column r2_bytes bigint;

alter table public.media_assets add constraint media_r2_delivery check (
  (public_url is null and r2_key is null and r2_sha256 is null and r2_bytes is null)
  or (
    public_url is not null and public_url ~ '^https://[A-Za-z0-9.-]+(:[0-9]+)?/[^[:space:]]+$'
    and position('@' in split_part(public_url, '/', 3)) = 0
    and r2_key is not null and r2_key like bucket_id || '/%'
    and r2_key !~ '(^/|(^|/)\.\.(/|$)|[[:space:]\\])'
    and r2_sha256 is not null and r2_sha256 ~ '^[a-f0-9]{64}$'
    and r2_bytes is not null and r2_bytes between 1 and 10485760
  )
);

comment on column public.media_assets.public_url is
 'Optional verified public R2 delivery URL. Original bucket_id/object_path remain the Supabase compatibility source. Existing grants/RLS apply; no credentials are stored here.';

-- get_app_content_v3 and get_website_content already serialize media rows with
-- to_jsonb. New consumers read public_url; old consumers ignore the extra fields.
-- Their existing publication/window filtering and SECURITY INVOKER remain intact.

