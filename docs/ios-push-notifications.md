# iPhone push notifications

Continue from the working Android setup. iOS uses the same EAS project,
Supabase backend, scheduler and Expo server access token. Delivery goes from
Supabase to Expo Push Service to Apple's APNs, then to the installed iPhone app.
Firebase's Android credentials are not used for iOS.

## What is implemented

- Explicit opt-in requests alerts and sound without badges. Signing in, opening
  the app and passive refreshes do not request permission.
- iOS authorisation states are checked consistently, including provisional quiet
  permission. Revoking permission disables the device on its next successful sync.
- Opted-in iPhones register with APNs/Expo on each launch; subsequent refreshes
  cache the token for 15 minutes. Native token changes invalidate it. Concurrent
  opt-in and passive refresh requests share one registration.
- Installation credentials stay in SecureStore. iOS writes use
  `WHEN_UNLOCKED_THIS_DEVICE_ONLY` to prevent migration of an installation secret
  to a different iPhone through backup restoration. Account favourites sync
  separately, with the existing guest-to-new-account transfer preserved.
- Guests and signed-in listeners use the existing private registration endpoint.
  Both get their chosen initial reminder and a separate alert five minutes into
  favourite shows. No account is required for device reminders.
- Foreground alerts can show banners and enter Notification Centre without a
  badge. An alert for the show already playing is suppressed while in the app.
- Notification taps wait for startup/content, open the show and start live audio
  once. Expired or changed schedules do not autoplay.
- Expo's native configuration generates `aps-environment` and preserves
  background audio. Expo infers the APNs environment from the signed app. The
  application's `preview`/`production` audience is a separate setting.

Visible alerts are displayed by iOS while the app is backgrounded or terminated.
They do not need a JavaScript background task or a constantly running player.
These reminders do not require silent pushes, critical alerts or additional
background modes. Radio playback retains its existing background audio mode.

## Verified backend state on 21 October 2026

A read-only audit found one enabled Android preview device, two sent initial
reminders and one sent favourite-live alert, all with successful provider receipts.
The minute cron was active. No iPhone was registered. The existing secret
configuration still matched `PUSH_ENABLED=true`, `PUSH_ALLOW_ALL=false`,
`PUSH_ENVIRONMENT=preview` and the approved Android-only allowlist. Expo server
and worker credentials were present; their values were not printed or saved.

This review changed no live backend settings, schedules, credentials or delivery
audiences. Physical iPhone delivery remains to be tested after the steps below.

## 1. Use a paid Apple Developer team

Use an active [Apple Developer Program](https://developer.apple.com/programs/)
membership or AceRadio's existing paid team. The free Xcode **Personal Team**
previously used for local testing cannot provision Push Notifications. Expo Go
cannot test this app's own push registration or credentials.
[Expo's iOS credential requirements](https://docs.expo.dev/push-notifications/push-notifications-setup/#get-credentials-for-development-builds).

Use an Account Holder/Admin for the initial capability/key setup, or have that
person perform it. Signing into Expo and signing into Apple are separate logins.

## 2. Check the Expo project and iOS identifier

From the project directory:

```sh
npx --yes eas-cli@latest login
npx --yes eas-cli@latest project:info
```

Expect `@zuzu786/aceradio`, ID `33e70d72-aa53-45a9-a75b-eb6c99bafbcf`. Keep
this existing project; Android uses it too.

`app.json` sets **`expo.ios.bundleIdentifier` to `com.aceradio.app`**. In Apple's
[Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list),
select the paid team that will own AceRadio and check that identifier:

- If the team owns it, use that team.
- If available, let EAS register it during credential/build setup.
- If Apple says another team owns it, use the owning team or choose an available
  permanent iOS identifier. Update **only** `expo.ios.bundleIdentifier` in
  `app.json` before configuring credentials/building. Preserve Android's
  `com.aceradio.app`, the EAS project ID and the app scheme.

For an existing identifier, check **Push Notifications** is enabled and save.
Let EAS regenerate the provisioning profile after a capability change.
[Apple capability instructions](https://developer.apple.com/help/account/identifiers/enable-app-capabilities/).

The ignored local `ios/` project was customised for free signing: it still uses
`com.zuhayrsmith.aceradio.dev` and has an empty entitlements file. That old build
is not push-ready. EAS excludes `ios/` through `.gitignore` and generates native
files from app config, including the notifications plugin. The EAS steps below
do not require editing the old Xcode project or running local prebuild.

## 3. Register the iPhone before building

```sh
npx --yes eas-cli@latest device:create
```

Select the correct paid Apple team and choose the website/device-registration
option. Open the provided link on the **iPhone in Safari** and follow the UDID
registration instructions. If a temporary registration profile is downloaded,
complete its installation under **Settings → General → VPN & Device Management**
as directed by the registration page.

Verify the phone appears:

```sh
npx --yes eas-cli@latest device:list
```

Ad hoc previews install only on devices included in the provisioning profile.
Registering another phone afterwards requires an updated profile and a new or
re-signed build. [Expo internal distribution](https://docs.expo.dev/build/internal-distribution/).

## 4. Configure Apple's push sending key in EAS

```sh
npx --yes eas-cli@latest credentials --platform ios
```

Choose **preview**, log into Apple when asked and select the same paid team.
Find **Push Notifications / Apple Push Notifications service key** (the wording
can vary between CLI versions):

1. Choose to set up push notifications for this application.
2. Reuse a suitable existing APNs key for that team, or let EAS generate one.
3. Confirm its assignment to the correct application and team.
4. Let EAS create/reuse the distribution certificate and generate an ad hoc
   provisioning profile that includes Push Notifications and your iPhone.

If the build asks **Set up Push Notifications for your project?**, answer **Yes**.
If no suitable key exists, answer **Yes** to generating a new Apple Push
Notifications service key. EAS may complete provisioning during the build.

Private `.p8` keys belong in EAS credentials. They do not belong in app config,
environment variables shipped with the app, Supabase client settings or Git.
This integration does not need `GoogleService-Info.plist`. Preserve the working
Android FCM credential and Expo server access token.
[Expo managed credentials](https://docs.expo.dev/app-signing/managed-credentials/).

## 5. Build and install the iOS preview

```sh
npm run build:ios -- --clear-cache
```

Select the paid team and your registered iPhone when asked. Let EAS manage signing
and update the provisioning profile if requested. The existing preview profile
uses internal distribution, the shared EAS preview environment and
`EXPO_PUBLIC_PUSH_ENVIRONMENT=preview`. It is a standalone installed app and
does not need Metro or Expo Go.

When the build finishes, open its installation link on the registered iPhone in
Safari, tap **Install**, and launch that **AceRadio** app. Do not use Expo Go or
the old personal-team build. A JavaScript reload cannot add push capability to
an old binary.

## 6. Enable reminders on the iPhone

1. Open AceRadio and save an upcoming show as a favourite. No account is required.
2. In AceRadio Settings choose **My favourites**, select **At start** for the
   first test, and enable show reminders.
3. Tap **Allow** on Apple's permission prompt.
4. Keep the app open with internet access while it syncs. Use **Refresh
   notification status** if needed.

Before the phone is allowlisted, **Choices saved. Reminder delivery is being set
up.** is expected: registration can succeed while preview sending is restricted.
Resolve any connection/configuration error before continuing.

If permission was denied previously, open iPhone **Settings → Notifications →
AceRadio** and enable **Allow Notifications**, Lock Screen, Notification Centre,
Banners and Sounds as desired. Return to AceRadio and refresh status. iOS will
not keep repeating a denied permission prompt. Provisional permission delivers
quietly; enable alerts in Settings for prominent banners and sounds.

## 7. Add the iPhone to the existing preview audience

In Supabase project **`dbgpfqyighcaquxwzkfe`**, run this read-only SQL:

```sql
select id, platform, environment, enabled, updated_at
from app_private.push_devices
order by updated_at desc;
```

Find the new `ios` / `preview` row with `enabled=true`, using its registration
time to identify your phone. Copy **id**. This is an installation UUID, not the
Apple UDID, account ID, EAS project ID or Expo push token.

In Supabase **Edge Functions → Secrets**, edit **`PUSH_TEST_DEVICE_IDS`** by
appending the new iPhone ID to the current list, separated by a comma:

```text
<existing Android installation UUID>,<new iPhone installation UUID>
```

Preserve all existing approved IDs. Keep:

```text
PUSH_ENABLED=true
PUSH_ALLOW_ALL=false
PUSH_ENVIRONMENT=preview
```

Leave `EXPO_ACCESS_TOKEN` and `PUSH_WORKER_SECRET` unchanged. Save, return to
AceRadio and tap **Refresh notification status**. The setup-pending message
should clear. Secret changes do not require redeploying Edge Functions.

**Do not run `backend:setup-push` again:** it rotates the worker credential and
turns sending off. No new database migration, function deployment or cron is
needed for iOS. Keep `PUSH_ALLOW_ALL=false` during testing.

## 8. Test real delivery and opening

Use an actual published favourite show; do not edit public schedules for testing.
Enable and sync reminders before the due window. The scheduler uses SAST and
checks every minute. **At start** sends the initial reminder around the start;
a favourite gets one more alert five minutes into the show if still live and
reminders remain enabled.

- Background AceRadio and lock the phone. Verify arrival without the player or
  app running in the foreground.
- Tap after closing the app. It should load, open the right show and start live
  station audio once. It cannot play a past programme recording.
- With the app open and no matching show playing, check banners and sound.
  The same show's alert is intentionally suppressed while already listening
  in the foreground; alerts for other shows can still appear.
- Turn reminders off and wait for successful sync. Check denial/re-enabling,
  reconnect after offline changes, guest use and account use.
- Verify Android keeps receiving its notifications; its installation remains
  allowlisted with its existing FCM credentials.

For the first visible-alert test, disable Focus/Do Not Disturb and Scheduled
Summary for AceRadio and check sound settings. Ordinary reminders follow iOS
settings. Delivery is best effort; short expiry avoids stale alerts after outages.

Inspect provider handoff/receipts without selecting private token values:

```sql
select d.platform, j.phase, j.state, j.receipt_state, j.error_code,
       count(*) as deliveries
from app_private.push_jobs j
join app_private.push_devices d on d.id = j.device_id
group by d.platform, j.phase, j.state, j.receipt_state, j.error_code;
```

`state=sent` means Expo accepted the push. `receipt_state=ok`, checked after about
15 minutes, means the downstream provider accepted it; also verify arrival on
the actual iPhone. `InvalidCredentials` requires checking the APNs key, team and
application assignment in EAS. A missing `aps-environment` error requires a new
binary/profile with Push Notifications. No iOS row means registration has not
completed; a saved row without eligible jobs points to audience, consent,
favourites or timing rather than Apple delivery.

## 9. Move to production after preview checks

Keep `preview` while testing both phones. For TestFlight/App Store, build with
the same permanent iOS identifier and paid team:

```sh
npx --yes eas-cli@latest build --platform ios --profile production
```

Production builds use the separate `production` application audience and require
explicit opt-in for that audience. The sender selects one audience at a time:
changing `PUSH_ENVIRONMENT` to `production` stops targeting preview builds.
Coordinate production builds and the audience switch for both platforms, test
with an allowlist, and approve broad delivery separately. Do not manually change
APNs sandbox/signing flags to choose the application audience.

## Code verification

```sh
npm run typecheck
npm run test:push
node --test scripts/*.test.cjs
npx expo export --platform all --output-dir .qa/ios-push-export
```

The native configuration test uses Expo introspection without rewriting the
local Xcode project. Tests cover iOS permissions, token persistence/concurrency,
guest/account behaviour, foreground display, cold-start taps, both platforms'
scheduler jobs, opt-out and the existing Android paths. Apple credentials and
physical iPhone delivery still require on-device verification.

On 21 October 2026, TypeScript passed, all 239 automated tests passed (including
61 push checks), and iOS, Android and web exports completed successfully. No
Apple-signed native build or physical iPhone delivery was tested in this review.
