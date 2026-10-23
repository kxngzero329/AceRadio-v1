# Show reminders: setup and operation

The 23 October backend optimisation batches delivery acknowledgements, reduces
idle polling from five database API calls to one, and gates cleanup hourly.
Minute reminders and existing client payloads are preserved. See
[request reduction, 1,000-device checks and capacity limits](backend-capacity.md).

For the iPhone setup after Android is working, follow the
[complete iOS guide](ios-push-notifications.md). It covers the paid Apple team,
bundle identifier, APNs key, device registration, preview build and adding the
iPhone to the existing allowlist while preserving Android delivery.

Implemented on 19 October 2026. **The base migrations, both Edge Functions and
minute cron are installed. On 20 October, preview delivery was enabled with
explicit approval for one registered Android phone. Public delivery remains
disabled.** The favourite-live migration and worker update were also deployed
with explicit approval on 20 October.

## What listeners get

- Guests can save favourites and notification choices on their phone. No account
  or anonymous Auth signup is required. Enabling reminders registers a device
  subscription containing the selected public show IDs.
- Signed-in listeners use their account favourites and reminder choices. The
  server reads their latest synced account data, so changes made on another
  device affect future sends. Each phone still needs its own explicit permission
  and device consent. A saved old “coming soon” preference never opts in a phone.
- Choices: **My favourites / Every show**, with **At start / 5 / 10 / 15 minutes
  before**. The suggested timing is five minutes before. No favourites means no
  favourite reminders, rather than silently switching to all shows.
- Favourite-live reminders add one extra reminder **five minutes into
  a favourite show's published slot**. It requires recurring reminders and current
  favourite membership, including in Every show mode. A one-time request alone
  does not subscribe to this extra alert. It stops if the show has ended or the
  listener opts out/removes the favourite. Timing remains schedule-based.
- Home's **Remind me** saves only the next occurrence. If the preferred advance
  time has already passed, that one-time reminder falls back to the show's start.
  A show already covered by global preferences is labelled accordingly, avoiding
  an off switch which misleadingly suggests the global reminder was cancelled.
- Turning off the device's show-reminder switch clears its one-time reminders
  too. For signed-in listeners, recurring on/off also syncs with the account;
  permission, explicit device consent and one-time requests remain per phone.
  One-time reminders can otherwise be used without enabling recurring ones.
- Tapping waits for fonts, the app's initial layout, navigation and usable content.
  It refreshes the schedule, opens the show and starts audio only after that route
  commits. Duplicate/previously handled responses cannot replay audio on launch.
- During the show, its live stream starts. Before the show, the actual current
  station broadcast starts with an explanatory message. AceRadio has one stream;
  a future show cannot be played early. An ended, changed or unavailable show
  opens with a message and does not start unrelated audio automatically.
- Blocked permission, offline sync, delivery still being set up, and unsupported
  Expo Go/web are described honestly. Remote subscription changes apply when the
  server acknowledges them. Already handed-off notifications cannot be recalled.

## What is already installed

Project: `dbgpfqyighcaquxwzkfe`; EAS project:
`33e70d72-aa53-45a9-a75b-eb6c99bafbcf`.

| Component                                                                | State                                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Revisioned reminder scope/timing in `user_settings`                      | Migrated; older boolean writes preserve new choices                                     |
| Private registrations, one-time requests, jobs, limits and worker leases | Migrated; no public token/table access                                                  |
| `push-device`                                                            | Deployed; guest installation authentication and optional verified account bearer        |
| `push-dispatch`                                                          | Deployed; server worker authentication only                                             |
| `aceradio-show-reminders` cron                                           | Active, every minute                                                                    |
| Worker credential                                                        | Installed in Supabase Secrets and encrypted Vault                                       |
| `PUSH_ENABLED`                                                           | `true`, approved phone-only preview test                                                |
| `PUSH_ALLOW_ALL`                                                         | `false`                                                                                 |
| `PUSH_ENVIRONMENT`                                                       | `preview`                                                                               |
| Test devices                                                             | One Android preview installation, explicitly approved on 20 October                     |
| Firebase / Expo token                                                    | Android client configured, FCM V1 upload confirmed by user, Expo server token installed |
| Apple credentials                                                        | Pending user setup below                                                                |

**20 October Android review:** the phone is registered as a guest with
`rush-hour` saved, five-minute advance reminders and a one-time request for the
15:00 SAST broadcast. The Expo access token is configured. The review found that
`PUSH_ENABLED` was still false and the audience unset; after explicit approval,
phone-only preview delivery was enabled with `PUSH_ALLOW_ALL=false` and exactly
that installation allowlisted. The 14:55 eligibility check was read-only and
created no delivery jobs. Credential values were neither printed nor persisted.

The favourite-live migration `20261020130000_favorite_live_reminders.sql` and
worker change were deployed after a separate explicit approval. The migration preserves
existing jobs as `phase=reminder` and adds a separate `live` phase. Both use the
existing version-1 notification payload, so the installed Android preview can
open the extra alert with the installed build. Automatic signup transfer
requires a new app build. Its details are in [accounts](accounts.md).

Post-deployment verification at 14:29 SAST confirmed the migration, private job
RLS, service-only candidate RPC, active minute cron and HTTP-200 enabled-worker
responses. Read-only eligibility checks returned Rush Hour's `reminder` at 14:55
and `live` at 15:05. The sender retained exactly the approved Android installation,
`PUSH_ALLOW_ALL=false` and `PUSH_ENVIRONMENT=preview`. No due jobs existed yet;
provider handoff/phone arrival still required the scheduled device test at that
point. On 21 October, the user confirmed Android delivery. A fresh read-only
audit found two initial reminders and one favourite-live alert sent to Android,
all with successful provider receipts, and the minute cron still active. No iOS
device was registered; the preview audience remained restricted to the approved
Android installation. The iOS client review added fresh APNs registration per
launch, device-bound Keychain storage and shared in-flight token registration,
without changing live backend configuration.

The shared project also contains website/booking migrations absent from this
app's original checkout. **Do not repair/revert those migrations.**
`backend:deploy-push` fetches the actual remote history into a fresh ignored
workspace, adds only the reviewed reminder migrations, previews the change,
and applies those plus the two named functions. It preserves website history.

## Your setup, step by step

### 1. Register the Android app in Firebase

1. Open the [Firebase Console](https://console.firebase.google.com/) and select
   AceRadio's Firebase project, or create one if needed.
2. Add an **Android app** with package name **`com.aceradio.app`**.
3. Download its **`google-services.json`** client configuration.
4. Place it in this repository's root, beside `app.json`. It is ignored by Git.

`app.config.js` detects that file for local native builds. It checks the Android
package and rejects an unrelated file or a service-account private key.

### 2. Make the Android client file available to EAS builds

On the AceRadio project at [expo.dev](https://expo.dev/), open **Environment
variables**, select **preview**, and add:

| Field      | Value                                                 |
| ---------- | ----------------------------------------------------- |
| Name       | `GOOGLE_SERVICES_JSON`                                |
| Type       | File                                                  |
| Visibility | Secret                                                |
| File       | The Android client `google-services.json` from step 1 |

Repeat for **development** if using development clients, and **production**
before production builds. The dynamic app config uses the file path supplied by
EAS. Git-ignored files are not automatically uploaded with the source archive.
See [EAS environment variables](https://docs.expo.dev/eas/environment-variables/).

### 3. Set up Android FCM V1 sending credentials

In Firebase, open **Project settings → Service accounts**, generate a private
key, and keep that JSON file somewhere secure outside this repository. Then run:

```powershell
npx --yes eas-cli@latest credentials --platform android
```

Select the application and its **Google Service Account → Push Notifications
(FCM V1)** credentials. Upload the private service-account JSON there.

The client file from step 1 and private key must belong to the same Firebase
project. The private key belongs in EAS credentials, never in the app or any
`EXPO_PUBLIC_*` variable. [Expo FCM V1 instructions](https://docs.expo.dev/push-notifications/fcm-credentials/).

### 4. Set up Apple push credentials

You need access to a **paid** Apple Developer team used to sign AceRadio. A free
Personal Team cannot provision Push Notifications. Follow the
[full iOS instructions](ios-push-notifications.md), starting with device and
bundle-identifier checks. The credential command is:

```powershell
npx --yes eas-cli@latest credentials --platform ios
```

Select the app with bundle identifier **`com.aceradio.app`** and let EAS create
or select its **Apple Push Notifications service key**. Enable push notifications
when the build prompts. Register your test iPhone when prompted for internal
distribution. The existing `expo-notifications` plugin supplies native
configuration; install a new build after completing credentials.
[Expo platform setup](https://docs.expo.dev/push-notifications/push-notifications-setup/).

### 5. Enable authenticated Expo push sending

1. In the Expo account settings, create a server access token named for AceRadio
   push delivery. Keep it private; do not paste it into this chat.
2. Enable **enhanced push security / requiring an access token** for AceRadio in
   the EAS project dashboard.
3. In the Supabase project's **Edge Functions → Secrets**, add
   **`EXPO_ACCESS_TOKEN`** with that token's value.

The worker already sends Expo requests with that server token. It does not use
the phone's Supabase key to authorise sending. For a new setup, leave
`PUSH_ENABLED=false` and `PUSH_ALLOW_ALL=false` until test phones have registered.
For this existing project, Android delivery is already enabled for the approved
phone; preserve its credentials and settings while adding iOS.
[Expo push security](https://docs.expo.dev/push-notifications/sending-notifications/#additional-security).

### 6. Build and install new previews

From the project directory:

```powershell
npm run build:android -- --clear-cache
npm run build:ios -- --clear-cache
```

The profiles already label these registrations **preview**. Install them on your
Android and iPhone; use the release-like preview builds to check the real splash,
notification opening and audio. **Expo Go cannot validate remote push delivery.**

Open Settings in the installed app, select **My favourites**, choose **At start**
for your first test, enable show reminders and allow the phone permission. Save
a show as a favourite. Guest testing requires no login. Until the next step the
app correctly says delivery is still being set up.

### 7. Allow only your test phones

In Supabase SQL Editor, inspect installation IDs without selecting secrets:

```sql
select id, platform, environment, enabled, updated_at
from app_private.push_devices
order by updated_at desc;
```

Identify your Android/iPhone by platform and registration time. In **Edge
Functions → Secrets**, preserve existing approved installation IDs and append
the new phone's ID to `PUSH_TEST_DEVICE_IDS`:

```text
PUSH_TEST_DEVICE_IDS=<android-installation-uuid>,<iphone-installation-uuid>
PUSH_ENVIRONMENT=preview
PUSH_ALLOW_ALL=false
PUSH_ENABLED=true
```

These are installation UUIDs from the query, not Expo tokens or account IDs.
Keep `PUSH_ALLOW_ALL=false`. Only those devices in the preview audience are
eligible. In the app tap **Refresh notification status** after changing secrets.
The UI also checks the audience before claiming delivery is enabled.

### 8. Check an actual scheduled reminder on each phone

Wait for the next published favourite show, with **At start** selected. Check:

1. A reminder arrives while the phone is locked and AceRadio is backgrounded.
2. Tapping it after closing the app cold-loads the interface, opens the correct
   show and starts live audio once. No duplicate playback or navigation occurs.
3. Five-minute reminders explain that early taps play the current station stream.
4. Favourite-only mode excludes other shows; Every show includes them.
5. Turning reminders off stops future server sends after sync is confirmed.
6. Permission denial/re-enabling, Wi-Fi/mobile-data changes, retry after offline
   edits, logout/login/account switching, and the same account on both phones work.
7. Playback controls, background listening and the native media session still work.

Do not change public station schedules merely to trigger a test. Automated
tests exercise arbitrary dates/schedules in an isolated database. The cron reads
the real published schedule in production.

### 9. Enable production only after device checks pass

Upload the Firebase client file to the EAS **production** environment and install
a production/TestFlight/internal test build labelled `production` before release.
First allowlist those production installations with `PUSH_ENVIRONMENT=production`.
After successful tests, the launch settings are:

```text
PUSH_ENVIRONMENT=production
PUSH_ALLOW_ALL=true
PUSH_ENABLED=true
```

Only explicitly opted-in, permitted, registered production phones are targeted.
An emergency stop is **`PUSH_ENABLED=false`**. This stops further worker sends;
Apple/Google may still deliver messages already handed off.

## Maintenance and verification

```powershell
npm run typecheck
npm run test:push
npm run backend:deploy-push
# Re-deploy only these reviewed migrations/functions, if needed:
npm run backend:deploy-push -- --apply --confirm-project dbgpfqyighcaquxwzkfe
```

`backend:setup-push` is already applied. Running it again rotates the worker key,
reinstalls the named cron and **turns sending OFF** for a safe setup session:

```powershell
npm run backend:setup-push -- --apply --confirm-project dbgpfqyighcaquxwzkfe
```

Operational queries (never expose raw tokens or secret hashes):

```sql
select state, receipt_state, error_code, count(*)
from app_private.push_jobs
group by state, receipt_state, error_code;

select jobname, schedule, active from cron.job
where jobname = 'aceradio-show-reminders';
```

## Reliability and limits

The database derives occurrences from published structured schedules in SAST,
including overnight slots and effective dates. Only due occurrences in a
two-minute dispatch window are eligible. It rechecks favourites, device consent,
account settings and publication before claiming work. One job per device/show/
start and phase prevents overlapping one-time/global subscriptions from duplicating
sends, while allowing one independent five-minute favourite-live alert. The
initial reminder and live alert have separate job IDs, provider collapse IDs,
retry state and receipts. Live eligibility is checked against current account
favourites for signed-in listeners and device favourites for guests.

Workers claim jobs atomically, use a separate worker lease, send batches of at
most 100, limit send pace, retry clear temporary rejections, and check receipts
after 15 minutes. Receipt failures never block current reminders. Invalid tokens
are disabled only if the installation has not since rotated its token.

Timeouts/lost acknowledgements become **uncertain**, not automatic duplicate
resends. This deliberately favours avoiding a repeated alert over retrying a send
that Expo may already have accepted. Push providers can still duplicate, delay
or miss delivery; exactly-once arrival and exact-second timing are not promised.
Short message expiry avoids stale “starting soon” reminders after long outages.

Device secrets are random 256-bit values in native SecureStore, hashed at the
server. Persisted increasing sequence numbers reject late old-owner snapshots.
Phone registration is rate-limited, debounced, bounded by deadlines and retried
on reconnect/foreground; only failed syncs poll every minute. Expo token refreshes
are cached for 15 minutes and invalidated on native token-change events. Opted-in
iPhones also re-register on every launch, rather than trusting a token persisted
before an installation or signing change. Concurrent registration requests share
one in-flight operation. Their installation credentials use device-only Keychain
accessibility to avoid migration to a different phone through backup restoration.

One-time requests are limited to 50 over the next 14 days. Registration snapshots
accept up to 2,000 public show IDs and 64 KiB. Rate limits are 300 requests/minute
and 10,000/day per hashed IP, and 30/minute per installation. No raw IP, push token,
bearer token or installation secret is logged. Jobs are retained for 30 days;
devices expire after 90 days without registration refresh and re-register when
the app is opened. Account deletion cascades its linked private registrations.
Offline logout/edits cannot revoke a notification already handed to a provider;
the next successful device snapshot releases the old account association.

The existing two-role model, station schedule, bookings, announcements, account
deletion and media service are retained. Push reminders do not subscribe users
to event/announcement campaigns or chat alerts.

## Review on 20 October 2026

The working tree was clean at the start of the review; the notification work was
in commit `164e179`. The live linked project was inspected using read-only CLI
queries. Both reminder migrations and Edge Functions are present. All five push
tables have RLS, no client table grants exist, and all ten push RPCs are executable
only by the service role. The minute cron uses the Vault credential and its latest
five invocations returned HTTP 200 with delivery disabled. There were zero device
registrations, one-time requests or delivery jobs. Secret digests confirm
`PUSH_ENABLED=false`, `PUSH_ALLOW_ALL=false`, `PUSH_ENVIRONMENT=preview`; no
`EXPO_ACCESS_TOKEN` is configured, and no local `google-services.json` exists.
EAS-hosted FCM/APNs credentials were not inspected. No live settings, records,
secrets, schedules or deployments were changed during this review.

Local corrections:

- Cancel obsolete sync work after asynchronous permission/token acquisition and
  while it waits in the serialized device-write queue. Signing out, switching
  accounts or disabling reminders cannot enqueue an old enabled snapshot later.
- Passive refresh explicitly disallows permission prompts. iOS provisional
  permission is accepted without requesting permission again.
- Failed SecureStore token writes do not populate the successful token cache.
  Restored counters catch up to the server before retrying, rather than reporting
  an ignored registration as successfully saved.
- Delivery status also checks current device consent and OS permission.
- Spotlight preserves each banner's image source while scrolling. It recenters
  only at the looping end copies, waits for native offset acknowledgement, and
  loads only nearby artwork. Arrow/swipe, loop, resize, catalogue refresh and
  reduced-motion cases are covered for Android, iOS and web event sequences.

The platform credential and installed-device steps above are still required
before enabling test delivery. The physical-device checklist has not been
completed by this review.

## Validation performed

The 20 October Android follow-up also checks guest favourites across app launches,
automatic signup transfer, durable offline/restart recovery, account isolation,
bulk-import capacity, overnight/effective-date live reminders, existing delivery
preservation during migration, phase deduplication, opt-out and payload compatibility.
The browser signup test intercepts every authentication/account-write endpoint:
it creates no real account and changes no production favourites. It verifies the
Saved page before signup, after automatic sync, after reload and after sign-out.
The deployment dry run preserves shared website migration history. Device receipt
confirmation remains distinct from a successful code/export test.

- TypeScript and all **230 automated tests** pass, including **52** push database,
  endpoint, client-lifecycle and native-service cases, **8** spotlight cases and
  **8** guest-account transfer cases.
  Run `node --test scripts/*.test.cjs`, `npm run typecheck`, `npm run test:push`
  and `npm run test:animations` to repeat the relevant checks.
- Android, iOS and web exports succeed.
- Deno type-checking passes for both deployed Edge Function entrypoints.
- The review's browser check navigates all 11 banners through both loop boundaries,
  samples animation frames for stable image sources, swipes using touch input,
  resizes at 320/390/430/768 px without overflow and opens the visible show.
  No page errors occurred. These are browser checks, not physical iOS/Android runs.
- Five browser scenarios cover live events/announcements, guest favourites,
  settings persistence, unsupported web behaviour, four responsive widths and
  playback. No browser page errors or attempted web push registrations occurred.
  Seven existing phone-UI browser scenarios also pass against the final export,
  covering player/detail synchronisation, cancellation/retry, mini-player layout,
  card styling and WhatsApp links.
- Live verification confirms both migrations, service-only dispatch permissions,
  the active minute cron, and successful disabled-worker invocations. No device
  registrations or delivery jobs existed at the end of setup.
- No native cloud build or listener notification was sent. Actual FCM/APNs
  delivery, native permission dialogs and audio on a physical notification tap
  remain dependent on the credentials/build/device checks above.

Ignored evidence is under `.qa/push-*`. Production credentials never belong in
tracked files, screenshots, client environment variables or chat messages.
