# Shared R2 image library

Updated and deployed on **23 October 2026**. Supabase stores content, image URLs
and reference metadata. **No image files remain in Supabase Storage**. The app's
stream, accounts, favourites, notifications and bookings retain their existing
independent behaviour.

## Live state

- R2 bucket: `aceradio-media`.
- Public base: `https://pub-ceb0894cfd2d497bb797c252ba0503fc.r2.dev`.
- Shared database: `dbgpfqyighcaquxwzkfe` (`aceradio_db`).
- 41 media records were reviewed; eight pairs had identical image bytes.
- The active library now has **33 unique file references**: 22 headshots and
  11 show banners. Distinct crops/versions and group portraits were preserved.
- Every canonical image was copied, downloaded and SHA-256/size verified.
- All **33 original Supabase files** were backed up locally and removed through
  the Storage API. A final audit found **zero objects in every Storage bucket**.
- The current public snapshot contains 20 referenced media records, 11 shows
  and 10 published presenters. Unreferenced/draft/archived content stays excluded.
- The updated upload backend and schema are live. Website/admin changes are in
  the adjacent website checkout and **have not been published**.

The owner confirmed that only the current R2-aware app and rebuilt website need
support. Older clients that construct Supabase image URLs are no longer supported.

`r2.dev` is a rate-limited development address. Use a production custom domain
before a public launch. This migration does not reset already-consumed Supabase
quotas. See [Cloudflare public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/).

## Folders and references

```text
aceradio-media/
  headshots/<sha256>.<extension>
  show-banners/<sha256>.<extension>
  events/<sha256>.<extension>
  announcements/<sha256>.<extension>
  public-content/v1/...  # shared app/website catalogue, not images
```

R2 prefixes appear when the first image is uploaded; there are currently no
uploaded event or announcement images. No missing artwork was invented.

| Admin image          | R2 folder       | Parent value stored in Supabase                            |
| -------------------- | --------------- | ---------------------------------------------------------- |
| Show artwork         | `headshots`     | `shows.artwork_id` → `media_assets.id`                     |
| Presenter photo      | `headshots`     | `presenters.photo_id` → `media_assets.id`                  |
| Show poster / banner | `show-banners`  | `shows.poster_id` / `banners.image_id` → `media_assets.id` |
| Event image          | `events`        | `events.image_url` stores the public R2 URL                |
| Announcement image   | `announcements` | `announcements.image_url` stores the public R2 URL         |

One `media_assets` row stores each canonical file's public URL, key, SHA-256,
byte size, dimensions and provenance. The unique `r2_key` constraint prevents
concurrent duplicate registrations. `media_category` is generated from its key.
Legacy `bucket_id`/`object_path` values and empty Storage bucket definitions remain
for schema/client compatibility; they are metadata, not stored image files.

The admin offers **Choose existing image** within each category. Selecting an
existing image clears a pending file selection and saves its reference without
uploading or encoding again. A presenter owns one canonical headshot. Their solo shows and Show hosts entries
use that same media ID; a show poster and banner can share the same banner record. The current website
has no standalone banner editor; existing banner records use the same library.

Exact-byte duplicates were merged and all their foreign keys reassigned to the
canonical record. Different crops/versions were retained. For solo shows, changing the image from either the Presenters editor or the Show
artwork editor updates the same visible headshot across all consumers. Removing
the shared photo shows the existing placeholder everywhere. A database trigger
saves solo-show artwork edits to the presenter; the public API projects the
presenter's photo into the show's existing `artwork_id` field. Installed R2-aware
apps retain their response contract. The admin resolves the same canonical ID.

Co-hosted shows keep their group artwork; each host entry uses that individual
presenter's headshot. Linking/unlinking hosts automatically changes the public
projection without replacing the stored group artwork. Missing person photos
remain missing. During migration, eight presenters were aligned to their current
unambiguous solo-show headshots; older distinct crops remain in the library.

**The four old R2 image prefixes have been retired:** `banners/`,
`presenter-photos/`, `show-artwork/` and `station-media/`. The owner explicitly
confirmed only test devices use the app and will refresh their cached data. All
41 old objects were removed only after verifying their canonical replacements
by SHA-256, through signed R2 reads and public delivery. No canonical image was
removed. Old paths no longer work. Reopen test devices online and allow the next
foreground catalogue refresh (about a minute); favourites and sessions stay intact. The current snapshot contains no retired URLs.

`public-content/` must stay: it serves the shared cached catalogue and prevents
per-client database content reads. It is infrastructure rather than an image
category. `events/` and `announcements/` appear automatically on first upload.

## Upload safety

The browser optimises JPG/PNG/WebP images to at most 2048 pixels on the longest
side, with WebP quality 0.88 where supported. Upload happens on Save. Events and
announcements pass their owning section explicitly so their folders stay separate.

`media-upload` checks the user's token, database-owned staff/MFA access and the
persistent per-staff quota: **20 uploads/minute and 120/hour**. It bounds the body
to 10 MiB and checks image signatures, dimensions and hash before writing R2.
Immutable hash-addressed objects use `public, max-age=31536000, immutable`.

Only metadata reaches the database registration operation. Its conflict target
is `r2_key`, so uploading an already registered file returns its existing media ID,
including an imported presenter/show ID. Conflicts and provider failures stop the
save. Existing parent references stay intact; uncertain uploads are retained for
safe retry instead of deleting a file that may already be referenced.

Restrictive database policies block authenticated users from inserting/updating
image objects in the four old Supabase buckets, even if another permissive policy
would otherwise allow it. Public users still cannot upload. Staff permissions,
MFA and RLS on content remain authoritative. All promotional images are public,
including those selected for draft content.

## App, website and caching

Both clients resolve `media_assets.public_url`. Missing/invalid delivery URLs use
existing UI placeholders; updated clients do not construct Supabase image URLs.
The app uses Expo Image memory/disk caching across shows, posters, banners,
presenter photos, events, player artwork and Station updates. Announcement images
appear on Station updates; compact homepage notices remain unchanged.

Content changes increment a private revision. The existing publisher checks it
once per minute and writes allowlisted public JSON to immutable R2 snapshots;
unchanged revisions do not export the full catalogue again. Account data, push
tokens, bookings and staff records are excluded.

Native clients and the website server read R2 directly. Expo web uses the public
Edge proxy, which reads R2 without querying Postgres. App refreshes are shared,
persisted, rate-spaced by at least 60 seconds and back off on errors. The website
retains its five-minute station cache. Allow the next publishing/cache refresh
for edits to appear; caches are not invalidated instantly. Cached data survives
transient failures, and the image component uses a bundled placeholder on errors.

The website only needs its existing public Supabase settings and server-only
`PUBLIC_CONTENT_BASE_URL`. The removed `VITE_MEDIA_UPLOAD_PROVIDER` selector has
no effect. No private R2 key or Supabase service-role key belongs in either client.
The old `.env.r2.local` is not required by the running app/site; R2 credentials
remain in deployed Edge secrets.

## Reproduction and maintenance

Canonical backend code is in this mobile checkout; upload modules and migrations
are also mirrored into the website repository.

- `20261022100000_r2_media_delivery.sql`: original additive R2 URL metadata.
- `20261022160000_public_content_delivery.sql`: publisher revision/lease, public
  export and shared staff-upload quota.
- `20261023140000_shared_r2_library.sql`: generated library category, unique R2
  key, canonical-folder validation and restrictive Storage-write policies.
- `20261023160000_shared_presenter_headshots.sql`: canonical solo-show photo
  projection, one-way shared-photo edit trigger and guarded initial alignment.
- `media-upload`: staff-authorised R2 upload and metadata-only registration.
- `content-publish` / `public-content`: existing public snapshot delivery.

The reviewed migration tools are Node-only:

```sh
node scripts/backend/deploy-r2-library.cjs                # schema dry run
node scripts/backend/r2-library.cjs plan                 # local inventory → guarded plan
node scripts/backend/r2-library.cjs verify               # public canonical R2 hashes
node scripts/backend/r2-library.cjs backup               # verified local originals
npm run backend:verify                                  # public APIs and R2 artwork
```

Apply operations require `--apply --confirm-project dbgpfqyighcaquxwzkfe`:
`copy` uses a temporary private Edge worker with an ephemeral secret, leaving R2
credentials on the server; it deletes the worker and unsets the secret afterwards.
`cutover` re-verifies all public files and atomically guards metadata timestamps,
rewires foreign keys, merges duplicates and updates URLs. Concurrent edits abort
the transaction. `cleanup` additionally requires `--confirm-current-r2-clients`,
verifies local backups and all current references, and removes only reviewed
Storage objects through the Storage API. It refuses unknown objects/changes.

`node scripts/backend/deploy-headshots.cjs` validates the shared-headshot migration
against isolated linked migration history; adding the project confirmation and
`--apply` deploys it. `node scripts/backend/retire-r2-legacy.cjs` inventories R2
using a temporary private worker. Its apply mode also requires
`--confirm-refreshed-test-clients`, refuses unknown objects/live legacy references,
and removes only reviewed legacy keys with verified canonical replacements. The
worker and temporary secret are removed afterwards. This does not need local R2
credentials. See ignored `.qa/shared-headshots` for the inventory, retirement
proof, before/after public data, snapshot hash and browser checks.

The completed plan, original row metadata, local original-file backups, guarded
SQL and evidence live in ignored `.qa/r2-library`. Keep these backups safe. The
old `media:rollback` workflow targets the retired Supabase delivery and must not
be used after cleanup. Recovery now restores reviewed R2 references/metadata
from that plan; do not clear `public_url` or point clients at deleted Storage files.
The old `backend:import -- --apply` Supabase-file importer is disabled so it cannot repopulate Storage. Its source audit remains available.
Do not run `backend:setup-push` for image work; push configuration is unrelated.

## Verification and release

- **298 app tests and 112 website/admin tests passed.** Coverage includes every
  upload/reuse field, separate event/announcement folders, immutable retry and
  existing-ID reuse, RLS/MFA, Storage-write denial and guarded data migration.
- App/website TypeScript, function Deno checks, changed website-file lint,
  website production build and Android/iOS/web Expo exports passed.
- Chrome verified real website R2 artwork/cache reuse at 390/768/1440 pixels,
  and app artwork at 390/412/768 pixels, with zero Supabase image requests.
- Isolated browser fixtures verified announcement artwork and admin image reuse
  at phone/desktop sizes, including clearing a pending file without uploading.
  No test announcement/image or staff account was published to production.
- Live checks confirmed identical referenced artwork hashes, preserved schedules,
  banners and announcements, unchanged scheduled jobs, unique canonical references, no missing R2 URLs, zero
  Storage objects, shared solo-show headshots, retired legacy R2 prefixes, and
  removal of the temporary worker/credential. Other custom
  Edge setting names/update timestamps were preserved; values were not exposed.

Publish the updated website/admin through its chosen hosting workflow. Install
the current app build for the latest image rendering changes; R2-aware installed
builds already understand the migrated URLs. Refresh test-device catalogue
caches after retiring the legacy image paths. Perform one real MFA-staff upload
and reuse it for a show/presenter, then verify both clients after cache refresh.
Physical-device behaviour and a real staff session remain manual acceptance checks.
