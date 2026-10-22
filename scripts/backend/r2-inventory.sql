-- Metadata only: no image downloads, credentials or listener/account records.
select jsonb_build_object(
 'assets',coalesce((select jsonb_agg(to_jsonb(m)) from public.media_assets m),'[]'),
 'objects',coalesce((select jsonb_agg(jsonb_build_object('bucket_id',o.bucket_id,'object_path',o.name,'bytes',(o.metadata->>'size')::bigint,'mime_type',o.metadata->>'mimetype')) from storage.objects o join storage.buckets b on b.id=o.bucket_id where b.public and b.id in ('show-artwork','presenter-photos','banners','station-media')),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'image_url',e.image_url,'updated_at',e.updated_at)) from public.events e where e.image_url is not null),'[]'),
 'announcements',coalesce((select jsonb_agg(jsonb_build_object('id',a.id,'image_url',to_jsonb(a)->>'image_url','updated_at',a.updated_at)) from public.announcements a where to_jsonb(a)->>'image_url' is not null),'[]')
) as inventory;
