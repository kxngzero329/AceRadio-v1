# R2 media and public content delivery

Reviewed and activated on **22 October 2026**. Supabase remains the shared
source of truth for content, accounts, favourites, bookings and staff permissions.
Updated clients read public image bytes and published catalogue snapshots from
R2. Audio continues to use `https://studio.ace.radio/stream` independently.

## Current status

- Bucket: `aceradio-media`, in the developer's Cloudflare account.
- Public base: `https://pub-ceb0894cfd2d497bb797c252ba0503fc.r2.dev`.
- Linked Supabase project: `dbgpfqyighcaquxwzkfe` (`aceradio_db`).
- All **32 existing images** were uploaded, downloaded and SHA-256 verified.
  Their R2 delivery fields are now active in the database under the user's
  subsequent full permission to complete this work. The earlier hold on switching
  images has been superseded by that permission.
- Delivery files total **2,502,804 bytes**, versus **16,621,665 source bytes**
  (approximately 85% smaller). Dimensions and transparency are retained.
- All 32 original Supabase objects remain. Original media IDs, foreign keys,
  source paths, source hashes and dimensions are preserved.
- The public catalogue publisher and browser reader are deployed. The current
  published catalogue contains 11 shows and 10 presenters. Publication rules
  expose 28 of the 32 media records; unpublished content remains excluded.
- The mobile integration is implemented. **Install a fresh mobile build** to get
  the new code and the `expo-image` native dependency.
- The rebuilt website/admin integration is implemented and validated locally.
  **It has not been published**; the owner confirmed it has no deployment yet.
  No existing production website or DNS records were changed.

`r2.dev` works now, but Cloudflare documents it as a **rate-limited development
endpoint**. It can throttle public traffic. Connect an owned custom domain before
public launch for production delivery and Cloudflare cache controls. This work
does not reset Supabase's already-used allowance or guarantee either provider
will never reach a quota. See [Cloudflare public buckets](https://developers.cloudflare.com/r2/buckets/public-buckets/)
and [Supabase egress usage](https://supabase.com/docs/guides/platform/manage-your-usage/egress).

## How delivery works

1. Staff continue editing the shared Supabase tables through authenticated,
   authorised admin operations. Existing roles, MFA and RLS remain authoritative.
2. Statement triggers on shows, presenters, show hosts, schedules, media, banners,
   announcements, events and ticket types increment a private content revision.
3. The new `aceradio-public-content` cron job calls `content-publish` every minute.
   Its private credential is kept in Supabase Vault and Edge Function secrets.
   A database lease permits at most one accepted publisher per 55 seconds,
   across all function instances.
4. The publisher checks the revision and the next publication-window boundary.
   It exports the complete public payload only when required. The JSON contains
   explicitly allowlisted public fields, never profiles, sessions, push tokens,
   booking submissions or other private account data.
5. The complete JSON is stored at `public-content/v1/<sha256>.json`. A small
   `public-content/v1/current.json` pointer contains its hash, revision and a
   publisher heartbeat. Conditional writes prevent an older publisher replacing
   a newer pointer. Signed pointer reads request identity encoding and normalise
   weak gzip ETags before conditional writes.
6. Native mobile clients read the public R2 pointer directly. The website server
   reads R2 directly. Expo web uses the CORS-enabled `public-content` Edge reader,
   which reads R2 and **never queries Postgres**.
7. Unchanged hashes reuse the downloaded JSON. Full snapshots and images use
   content-addressed immutable URLs and `public, max-age=31536000, immutable`.
   The pointer uses a short 30-second cache lifetime.

Updates are asynchronous: allow the publisher's next minute plus the client's
refresh/cache interval. The website retains its existing five-minute station
cache. Active-window filtering and SAST show calculations remain in their
existing consumers. A publisher outage does not automatically redirect clients
back to database polling.

## Mobile caching and failure behaviour

`src/components/CachedImage.tsx` wraps Expo Image with memory-and-disk caching,
stable recycling keys and no new image transitions. Show artwork, banners,
presenter photos, event artwork and player artwork reuse this component.
Existing fitted image dimensions and player animations are preserved.

An image failure uses the bundled station image. It does not retry against
Supabase or repeatedly download the same failed resource. Changing the image URL
resets that state. Device operating systems can evict disk caches; caching reduces
requests but cannot mean zero future requests.

`src/services/publicSnapshotClient.ts` coalesces concurrent catalogue/event
requests, validates SHA-256 and payload size, and persists verified public JSON
for up to seven days. Refresh attempts have a **60-second minimum interval**, even
with repeated manual refreshes. HTTP 429 honours a bounded Retry-After cooldown;
other failures also cool down. One screen cancelling does not cancel another
screen's shared request. Both streamed fetch responses and React Native's
non-streaming response implementation are supported.

The existing persisted TanStack catalogue remains available offline. Invalid,
oversized or hash-mismatched snapshots do not replace valid cached content.
Publisher heartbeat checks prevent a stale remote snapshot from masquerading as
fresh indefinitely. Loading, error and empty states remain in existing screens.

Public content caches never contain account data. Guest favourites, account
favourite merging, session persistence, private preference sync and notification
registration keep their existing storage and authenticated paths. Listener
statistics retain their existing independent refresh interval.

Public environment configuration:

```dotenv
EXPO_PUBLIC_CONTENT_SOURCE=supabase
EXPO_PUBLIC_SUPABASE_URL=https://dbgpfqyighcaquxwzkfe.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<public key>
# Optional explicit emergency transport rollback:
# EXPO_PUBLIC_CONTENT_TRANSPORT=legacy
# Optional future native pointer override:
# EXPO_PUBLIC_CONTENT_SNAPSHOT_URL=https://media.ace.radio/public-content/v1/current.json
```

Unconfigured checkouts still default to bundled content. Other Supabase projects
retain their original API transport unless a matching deployment is implemented.
The settings above are public; never put R2 credentials or privileged Supabase
keys in `EXPO_PUBLIC_*` values.

## Website and admin

The adjacent `ace.radio_website_admin` checkout now reads station content,
events, ticket types and announcements through its server-only R2 snapshot
loader. Concurrent station/announcement loads share the same fetch and 60-second
reader cache. The existing five-minute station cache and stale-on-error behaviour
remain. Public HTML images reuse immutable URLs and the browser's HTTP cache.
Private bookings, authenticated admin reads/writes and account access remain on
their existing Supabase/RLS paths.

Set these **public** values for the website's first deployment:

```dotenv
VITE_MEDIA_UPLOAD_PROVIDER=r2
PUBLIC_CONTENT_BASE_URL=https://pub-ceb0894cfd2d497bb797c252ba0503fc.r2.dev
```

Keep its existing Supabase public URL/key variables. R2 is the upload default;
`VITE_MEDIA_UPLOAD_PROVIDER=supabase` is an explicit emergency alternative and
requires rebuilding website assets. A failed R2 upload never silently switches
to Supabase. Existing images remain intact when an upload or parent save fails.
The website needs **no private R2 key and no Supabase service-role key**.

### Staff upload flow

`media-upload` verifies the user's bearer token and database-owned staff/MFA
permissions, validates category and MIME type, then reserves a database quota
before reading the request body. The body is capped at 10 MiB; magic bytes,
dimensions and content hash are validated. Browser uploads are optimised to
WebP at quality 0.88 with a maximum dimension of 2048 pixels.

The server writes and verifies an immutable R2 object, creates and verifies a
compatible Supabase object at the original media path, then registers the shared
media row with its R2 delivery metadata. This preserves newly uploaded artwork
for older installed mobile builds. Duplicate/conflicting objects are verified,
never blindly overwritten. New clients still download the R2 copy. Compatibility
copies consume a small amount of Supabase storage/upload verification traffic;
they do not move modern listener image downloads back to Supabase.

The live authenticated staff upload path must also be exercised by an actual
staff member with MFA. Automated tests cover its success/error contracts and
permissions; this work did not create accounts, bypass MFA or publish test content.

## Rate limits and their scope

| Operation                                 | Protection                                                                                                              |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Native public content refresh             | One shared request; minimum 60 seconds per client; persisted public cache and failure backoff                           |
| Public snapshot publishing                | Private credential; persistent global 55-second lease; full export only on changes/window boundaries                    |
| Website/server R2 reader                  | 60-second cache; concurrent request coalescing; 30-second failure cooldown                                              |
| Browser public Edge reader                | R2-only, 60-second cache and ETags; bounded per-warm-instance safeguard of 240 requests/minute per reported IP          |
| Staff media uploads                       | Database-enforced 20 uploads/minute and 120/hour **per authorised staff account**, shared across all function instances |
| Existing account, push and booking writes | Existing database validation, RLS and operation-specific limits retained                                                |

The browser reader's IP safeguard is **not a distributed/global firewall**.
It does not replace Cloudflare production-domain rules. Requests to that reader
still count as Supabase Edge usage/egress, although they do not read the database;
native clients and the rebuilt website's server read R2 directly.

**Older anonymous Supabase Data API endpoints remain available for installed
legacy clients. They do not have a new universal read quota.** Removing them would
break those clients, so this change does not claim to prevent every possible
malicious direct database request. SQL GET/stable-RPC transactions cannot safely
record write-based counters; no global counter hook was installed. See
[Supabase API security](https://supabase.com/docs/guides/api/securing-your-api).
Review retiring legacy APIs after supported builds are adopted, with a separate
compatibility plan. Real quotas must be enforced server-side; client cooldowns
alone are performance controls, not security boundaries.

Supabase remains metered for auth, private account/admin operations, listener
statistics, notifications, bookings and legacy usage. Monitor both Supabase and
Cloudflare usage. A Cloudflare billing alert is not a hard spending cap.

## Reproducible backend setup

Canonical migrations and functions are in this mobile checkout; matching files
are also in the website checkout:

- `20261022100000_r2_media_delivery.sql`: additive coherent delivery metadata on
  `media_assets`; original IDs, fields, relationships and policies preserved.
- `20261022160000_public_content_delivery.sql`: private revision/lease state,
  revision triggers, credential-gated public export and staff upload quota RPC.
- `media-upload`, `content-publish`, `public-content`, and their shared helpers.

The following tooling requires the linked AceRadio project. **It is already
configured live; do not rerun setup just to test the app.** Dry runs are the
safe default. Apply flags require explicit project/bucket confirmation:

```sh
# Check local R2 configuration without printing values:
npm run backend:configure-r2
# Deploy the reviewed additive media migration and upload function:
npm run backend:deploy-media -- --apply --confirm-project dbgpfqyighcaquxwzkfe
# Set only the six R2 Edge server settings from ignored .env.r2.local:
npm run backend:configure-r2 -- --apply --confirm-project dbgpfqyighcaquxwzkfe
# Deploy the snapshot migration and its two named functions:
npm run backend:deploy-public-content -- --apply --confirm-project dbgpfqyighcaquxwzkfe
# Creates/rotates only this publisher's private key and named cron job:
npm run backend:setup-public-content -- --apply --confirm-project dbgpfqyighcaquxwzkfe
```

**Never run `backend:setup-push` for media work.** That is unrelated setup and can
change sending configuration. Existing `aceradio-show-reminders` and
`aceradio-station-listeners` jobs were preserved alongside the new publisher job.
Secrets were checked by names/update timestamps only; private values are not
logged. Supabase-managed environment timestamps can change during deployments.

Bucket-scoped replacement credentials belong in ignored, mode-0600
`.env.r2.local` for backend tooling only. Previously exposed credentials were
revoked/replaced by the user; they were not used. Temporary secret files are
removed after configuration. Never commit `.env.local`, `.env.r2.local`, service
keys, private tokens or exported Vault contents.

The local `.env.r2.local` was removed after deployment at the owner's request.
Neither the running app nor deployed functions need that file: Edge Functions
read their deployed secrets. Recreate it from `.env.r2.example` only when local
maintenance needs R2 credentials, or supply those values through the maintenance
process environment. Metro explicitly excludes `.env.r2` files from application
modules; regular `.env.local` remains available to Expo for public app settings.

### Import/review tools

```sh
npm run media:prepare
# Permit downloading only original sources missing locally, if required:
npm run media:prepare -- --download-missing
npm run media:upload -- --confirm-bucket aceradio-media
npm run media:cutover
# Reviewed live switch, already completed:
# npm run media:cutover -- --apply --confirm-project dbgpfqyighcaquxwzkfe
```

Preparation uses existing import files and verifies source hashes/metadata.
Opaque PNGs become JPEG quality 88 only when at least 5% smaller; transparent
PNGs stay PNG; existing JPEG/WebP bytes are preserved. Sources are never invented.
The three largest banners were visually compared before activation.

Ignored `.qa/r2-media` artifacts contain the manifest, optimised files, signed and
public download proof, conditional cutover SQL and conditional rollback SQL.
Repeat uploads reuse identical hash-addressed objects. Cutover locks/guards
reviewed records and aborts on conflicting edits; it never deletes originals.

## Rollback

```sh
# Generate/review conditional SQL, with no remote change:
npm run media:rollback
# Apply only after reviewing the current records and rollback SQL:
# npm run media:rollback -- --apply --confirm-project dbgpfqyighcaquxwzkfe
```

Rollback clears only matching R2 delivery fields and restores matching direct
image URLs. It preserves later unrelated editorial edits, aborts on conflicting
delivery changes, and is idempotent. Tests exercise this against the database
schema. Keep both R2 files and Supabase originals during rollback. The publisher
picks up the changed revision; already cached/offline clients update on their
normal refresh. Client caches cannot be remotely invalidated instantly.

An explicit mobile `EXPO_PUBLIC_CONTENT_TRANSPORT=legacy` build restores the
existing database transport if the snapshot service needs a longer repair.
It does not remove `public_url` support or delete any content.

## Moving to a production image domain later

1. In the Cloudflare account containing this bucket and the active `ace.radio`
   zone, open R2 → `aceradio-media` → Settings → Custom Domains → Add.
2. Connect `media.ace.radio` and wait for Active/TLS readiness. Do not change
   nameservers or unrelated website, streaming, bookings or mail records.
3. Verify complete existing image and snapshot paths under the new hostname.
   For direct browser JSON reads, configure CORS GET/HEAD as appropriate;
   browser image tags and native reads do not require R2 browser PUT access.
4. Update the local backend public-base setting and review the corresponding
   Edge secret, database delivery URLs and publisher/reader configuration.
   The cutover tool intentionally rejects unexpected existing delivery values:
   a domain move requires a newly reviewed conditional migration, not blind
   reuse of the original cutover approval/proof.
5. Update the mobile public pointer override and website server public base,
   rebuild/redeploy those clients, and verify real network traffic/cache headers.
6. Keep the old address enabled while supported installed builds still use it.

Bucket-scoped object credentials cannot administer bucket CORS or custom domains.
Those changes require the Cloudflare dashboard or separately authorised account
access. No such account-wide credential is embedded in this application.

## Validation and release checks

Automated coverage includes immutable uploads, duplicate/conflict handling,
conditional rollback, strict public field allowlists, publisher authentication,
lease/window behaviour, compressed weak ETags, snapshots shared across screens,
SHA/size checks, cancellation isolation, offline restoration, backoff, upload
quotas/MFA permissions and image cache/dimension/error behaviour. Existing audio,
listener, accounts, favourites, navigation, events and notification tests are
included in the complete regression run.

Chrome checks exercise app and website show artwork/navigation at phone/tablet/
desktop widths, observe reusable R2 image cache hits, and reject direct public
Supabase database/image requests from the updated public screens. TypeScript,
Deno checks, Expo Android/iOS/web exports and the website production build are
also verified. Evidence is stored in ignored `.qa` artifacts and temporary build
logs, never with credentials.

Before release, install the fresh native preview on Android and iPhone; check
cold/warm artwork, airplane-mode cached content, account/favourite flows,
background audio and existing notification delivery. Perform one real MFA-staff
image upload/save and verify it on both clients. Publish the rebuilt website
through its chosen hosting workflow. Physical-device performance and a real staff
upload cannot be certified by desktop automation alone.
