# AceRadio mobile preview

For an end-to-end map of the screens, playback, content flow, deployed database and CLI setup, see the [codebase overview](docs/codebase-overview.md), reviewed on 16 October 2026.

Accounts, the two-role permission system, MFA for admin writes, and cached favourites/settings sync are implemented. See [account setup and release checks](docs/accounts.md). Public email-code registration/recovery stays gated until a production SMTP sender and templates are configured; listening and guest favourites remain available.

Expo SDK 57 / React Native / TypeScript app using the supplied AceRadio artwork and branding.

Listening uses AceRadio's public live stream, `https://studio.ace.radio/stream`. Every show plays that same station stream. Supabase is deployed and enabled for local use and the EAS development, preview and production environments, with reproducible migrations, verified API imports, Storage, RLS and a persisted catalogue cache. A fresh build includes this integration; later published content updates arrive without another release. Supabase mode uses only a public URL/key. Unconfigured checkouts default to bundled content. See [backend setup and deployment status](docs/supabase.md).

## Run

```sh
npm install
npm run start:go -- --clear
```

For a native development client, run `npm start`. Use `npm run web` for the browser preview.

Expo Go plays the station stream in the foreground. It skips this app's background playback service and lock-screen controls because `app.json` cannot add native services to the installed Expo Go app. For background listening and system player controls, use a fresh AceRadio development or release build with the existing `expo-audio` plugin (`enableBackgroundPlayback: true`). Changing app config or clearing Metro's cache does not update a previously installed native binary. [Expo Audio configuration](https://docs.expo.dev/versions/latest/sdk/audio/#configuration-in-app-config).

## Listening and show previews

Playback artwork and app transitions respect reduced motion, preserve decoded
images during changes and share consistent timings. See [motion and verification](docs/motion.md).

The app uses bundled Outfit headings and Manrope interface text across native
and web. See [typography, font sources and checks](docs/typography.md).

- Home's “Listen Live” selects the show scheduled at the current time in South African Standard Time (SAST), then starts the real station audio. Outside a listed show slot, it still starts the station stream. The public source is configured in `src/config/station.ts`.
- The hero crossfades into the selected presenter artwork with a gentle zoom and text entrance. It shows the title, presenter, subtitle, schedule and listener count.
- Live badges, the Home notice board, the Shows “Live now” filter, and playback's live lineup follow each show's printed SAST day and time slot. Schedule checks use the Africa/Johannesburg time zone and refresh automatically.
- Listener counts come from the verified Icecast `/stream` statistics through a public Supabase Edge Function. They refresh about every 15 seconds and count active stream connections across players. Failed/expired statistics show “Live radio”; sample counts are never displayed in either content mode. Outside scheduled slots, playback still uses the station identity. See [listener count implementation and checks](docs/listeners.md).
- Show details indicate whether the selected show is On air or Scheduled. Listening from show details is enabled only during that show's SAST schedule.
- The hero, mini player and full player share one audio player and show selection across navigation. Native pause keeps the system media session available; resume keeps the selected show and reconnects to the station's current live audio. Closing the mini player or finishing the sleep timer releases the player and removes its system controls.
- The mini player appears after station audio has actually started and remains available while paused. Previous / Play-Pause / Next use the currently scheduled live lineup; its close button stops playback and fades the mini player away.
- Show changes fade the previous artwork and metadata out before showing the next selection across the hero and players.
- The full player and show details use one slide up/down transition. Android/iOS run transforms on the native UI thread and retain the dark underlying page until the reverse slide completes. The down arrow, Android Back and browser Back share guarded dismissal. Direct player links can close to Home.
- “Listen Live” in show details selects the scheduled show and plays the same station stream. Selecting a show never pauses already-playing audio.
- Loading, pause and playback states follow actual audio events. Connection failures show a message with a retry action. Cancelled or replaced connections cannot restart playback.
- The sleep timer pauses the shared audio session. Notification preferences remain saved locally without permissions, tokens or remote registration.
- The spotlight loops through all 11 posters while mounting only the previous, current and next slides. Autoplay pauses during interaction, away from Home, in the background and for reduced motion. The only controls are previous/next arrows; the slideshow play/pause button is removed.
- Reduced motion disables the hero/show/modal transitions, tab fade and automatic spotlight movement.

## Other functionality

Searchable show grid, show details and posters, locally saved favourites, founder profiles and station story, contact links, and official social links. Existing show IDs and favourite storage are preserved.

The bottom bar's Chat action opens a compact chooser. In-app chat is marked Coming soon and shows a development notice when tapped; WhatsApp opens the studio's official chat. About remains available through Home's Our story link. See [chat chooser and future scope](docs/chat.md).

Home, Shows and Favourites use the same show card: square artwork, independent heart at the top-right, content-width live badge at the top-left, and matching text slots. Narrow cards show just LIVE in the badge to keep the heart clear; its accessibility label still includes listeners.

Home uses a compact hero and schedule, restrained dark surfaces, clearer schedule text and a single spotlight counter. The tab bar and mini-player share safe-area spacing, and large system fonts use a single-column show layout. See [homepage refinement and visual checks](docs/homepage.md).

The full player, Show Details and remaining tabs share the same typography and page spacing. The compact mini-player keeps play/pause and stop beside the show title and status in one row. The full player uses a centred play/pause control. Show details offers client-only sharing through the existing app scheme, with browser copy fallbacks. Shows and Saved share static loading placeholders. See [app design and interaction checks](docs/app-design.md) and [listening refinements](docs/listening-refinement.md).

Shows has All shows, Live now, Weekdays and Weekend filters below search. Search and filters combine; an empty result offers a reset. Weekdays includes Monday-Friday shows, including evening shows. Pages start at the top when switching tabs, and tapping the current tab smoothly returns to the top. Closing the player or show details preserves the underlying page's scroll position. Tab changes use an eased fade, with native pages kept mounted and the player prefetched to avoid first-navigation mounting work. The navigation theme and its backing views use AceRadio's dark background.

Audio connects to the public station stream only when listening starts and works independently of Supabase availability. Contact/social actions open links only when tapped. Supabase mode reads published shows, presenters, structured schedules, banners and announcements, with cached content available offline. About copy, founder profiles/photos, history, vision, station identity and contact/social links are local frontend content. The three station tables have been removed by migration; compatible API responses remain available for older installed builds. Favourites and notification preferences remain on the device.

## Verify

The interface uses black backgrounds, charcoal panels, soft-white controls and grey secondary text throughout. See [the monochrome theme](docs/theme.md) for the palette and visual checks. The approved black-and-white app icon and splash artwork, Android adaptive/themed icons, notification symbol and Play Store icon are installed. See [branding assets and native preview checks](docs/branding.md) for the sources, exports and device checklist. Native branding changes require new installed builds.

```sh
npm run typecheck
npm run test:content
npm run test:listeners
npm run test:radio
npm run test:navigation
npm run test:web-input
npm run build:web
npx expo export --platform android --output-dir .qa/android
```

Radio tests cover show selection, previous/next wrapping, rapid skips, listener fixtures, cancelled loading, stale completions, pause/resume and errors. Native device testing is still needed for speaker output, headset/call interruptions, background playback and animation performance.

React Native Web `0.21.4` uses the existing `patch-package` responder fix. Keep `patches/react-native-web+0.21.4.patch` with the lockfile; `npm install` reapplies it.

## Background audio and phone controls

AceRadio uses Expo Audio's native Android Media3 foreground service and iOS AVAudioSession / Now Playing integration. Android shows a media notification; iOS shows the player on the Lock Screen and in Control Center. This media session is independent of the Settings toggle for future show notifications. Android media-session notifications do not require the ordinary notification permission. [Android media notification exemption](https://developer.android.com/develop/ui/views/notifications/notification-permission#media-sessions).

The controls show the selected show title, presenter and artwork. Packaged Android drawable artwork is copied through Expo Asset to a readable file. Unsupported artwork URIs are omitted until resolved, so artwork cannot prevent the entire media notification from appearing. Metadata updates use the existing media session and do not reconnect or interrupt audible playback.

Play/pause works through the notification, Lock Screen, Control Center and supported headset controls. System previous/next commands cycle through the currently live lineup and are available only when at least two shows are live; the in-app players expose play/pause without skip buttons. The current schedule usually has one live show. Every show uses the same live station URL, so system skip commands change show selection/metadata, not songs or archived episodes. Live playback has no seek bar or ten-second seek buttons.

`expo-audio` is pinned to **57.0.5**, with native additions in `patches/expo-audio+57.0.5.patch`. The patch adds show-navigation commands and their shared-player event, keeps Android's internal service binding separate from the system Media3 binder, forwards command availability correctly, reacquires audio focus for remote play, reconnects live audio on remote resume, and removes iOS block-based remote command targets correctly. It also supports local iOS artwork and fixes Android metadata/listener cleanup. Keep this patch with the lockfile; the existing `postinstall` applies it during EAS builds. Upgrading Expo Audio requires reviewing and regenerating the patch.

Locking the phone, pressing Home, switching apps or dismissing the full-player screen must leave an active broadcast playing. Android's media service retains ongoing playback when the task is removed from Recents. An explicit Android force-stop or iOS swipe-to-force-quit terminates playback; background audio does not bypass those operating-system actions. [Android service lifecycle](https://developer.android.com/media/media3/session/background-playback#implement-service-lifecycle), [Expo's termination distinction](https://docs.expo.dev/versions/latest/sdk/background-task/#when-will-they-be-stopped).

Build and install **new native binaries** to include the patch and background capabilities:

```sh
npm run build:android -- --clear-cache
npm run build:ios -- --clear-cache
```

Use the EAS preview profile, with the usual Apple signing/device provisioning for an iPhone build. Expo Go and previously installed preview builds cannot acquire these native changes from a JavaScript reload.

Before shipping, test a fresh Android build and a physical iPhone build:

1. Start listening; check title, presenter, artwork and play/pause in the Android notification / iOS Lock Screen and Control Center.
2. Lock the phone and switch apps for at least ten minutes; verify uninterrupted playback and remote pause/resume, then reopen the app and check that its buttons agree.
3. Pause in the app and resume remotely; confirm it rejoins the current broadcast. Rapidly play/pause while connecting and confirm no late audio starts.
4. On Android, dismiss the task from Recents while playing and check continued playback and notification controls. On iOS, test Home/background separately from force-quitting.
5. Check headphone disconnect, Bluetooth/headset controls, incoming calls, network loss/retry, the sleep timer, and the mini-player close button. Stopping explicitly must remove the media session.
6. Check previous/next when using a test lineup with overlapping live shows; commands must agree with the in-app lineup without restarting the audio.

Automated tests exercise the actual TypeScript transport/controller with native API doubles; bundle exports and config introspection do not compile Swift/Kotlin or replace these device checks.

## Source layout

- `app/`: five tabs, full player modal and show details.
- `src/components/LiveRadioHero.tsx`: artwork and show transition.
- `src/components/ShowSpotlight.tsx`: bounded three-slide carousel.
- `src/components/ShowCard.tsx`: shared card for Home, Shows and Favourites.
- `src/components/PageScrollView.tsx`: focus reset and current-tab scroll-to-top.
- `src/hooks/useModalTransition.ts`: native UI-thread slide, browser slide and guarded close.
- `src/hooks/useShowTransition.ts`: cancel-safe show crossfades.
- `src/context/RadioContext.tsx`: shared live-stream playback, preview show selection and sleep timer.
- `src/context/ContentContext.tsx`: shared content queries, offline cache and foreground refresh.
- `src/services/contentRepository.ts`: validated Supabase catalogue mapping.
- `src/services/listenerStats.ts` / `src/hooks/useListenerCount.ts`: live stream count, foreground refresh and sample expiry.
- `supabase/functions/listener-stats/`: public aggregate statistics proxy with a short warm-worker cache.
- `src/data/about.ts`: local story, founder profiles/photos, timeline and vision.
- `supabase/`: reproducible schema, RLS, seed and verified import manifest.
- `scripts/backend/`: Node-only configuration, safe import and read-only verification commands.
- `src/utils/radio.ts`: scheduled live show selection, with all shows playable through the station stream.
- `src/utils/showSchedule.ts`: SAST schedule evaluation and next-show lookup.
- `src/utils/RadioPlayback.ts`: connection lifetime, playback status and error handling.
- `src/services/radioTransport.ts` / `radioTransport.web.ts`: native Expo Audio and browser audio transports.
- `src/services/radioMetadata.ts`: media metadata and packaged artwork resolution.
- `src/hooks/useRadioPlayback.ts`: transport lifecycle and status subscription.
- `src/data/shows.ts`: 11 shows, local artwork, schedules and demo live fixtures.
- `src/context/FavoritesContext.tsx`: persisted device favourites.
- `src/config/station.ts`: public live-stream URL and contact/social links.
- `src/services/notifications.ts`: local notification preference.
- `assets/`: supplied branding, presenter portraits, posters, icons and splash.

Native playback uses the installed Expo Audio package. Expo's native Expo Go detection keeps foreground playback working there without requesting unsupported service controls; AceRadio development and release builds retain background listening and live lock-screen controls. `ExecutionEnvironment.StoreClient` alone is not used to detect Expo Go because it also includes development clients. Browsers use their audio element and media-session controls. No microphone access or recording permissions are requested. Station notifications remain a local preference preview.
