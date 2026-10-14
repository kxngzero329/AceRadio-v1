# AceRadio mobile preview

Expo SDK 57 / React Native / TypeScript app using the supplied AceRadio artwork and branding.

Listening uses AceRadio's public live stream, `https://studio.ace.radio/stream`. Every show plays that same station stream for now. Show metadata and listener estimates are bundled local data while the station's show API is pending. No API keys or environment variables are required.

## Run

```sh
npm install
npm run start:go -- --clear
```

For a native development client, run `npm start`. Use `npm run web` for the browser preview.

Expo Go plays the station stream in the foreground. It skips this app's background playback service and lock-screen controls because `app.json` cannot add native services to the installed Expo Go app. For background listening and system player controls, use a fresh AceRadio development or release build with the existing `expo-audio` plugin (`enableBackgroundPlayback: true`). Changing app config or clearing Metro's cache does not update a previously installed native binary. [Expo Audio configuration](https://docs.expo.dev/versions/latest/sdk/audio/#configuration-in-app-config).

## Listening and show previews

- Home's “Listen Live” selects the show scheduled at the current time in South African Standard Time (SAST), then starts the real station audio. Outside a listed show slot, it still starts the station stream. The public source is configured in `src/config/station.ts`.
- The hero crossfades into the selected presenter artwork with a gentle zoom and text entrance. It shows the title, presenter, subtitle, schedule and listener count.
- Live badges, the Home notice board, the Shows “Live now” filter, and playback's live lineup follow each show's printed SAST day and time slot. Schedule checks use the Africa/Johannesburg time zone and refresh automatically.
- Show listener counts are local estimates. The app always displays a non-zero listener count; when no show is scheduled, it identifies the stream as “AceRadio Live On Air” and uses the same app-session estimate from 50 to 2,000.
- Show details indicate whether the selected show is On Air or Off Air. Listening from show details is enabled only during that show's SAST schedule.
- The hero, mini player and full player share one audio player and show selection across navigation. Pause releases the live connection; resume keeps the selected show and rejoins the station's current live audio.
- The mini player appears after station audio has actually started and remains available while paused. Previous / Play-Pause / Next use the currently scheduled live lineup; its close button stops playback and fades the mini player away.
- Show changes fade the previous artwork and metadata out before showing the next selection across the hero and players.
- The full player and show details use one slide up/down transition. Android/iOS run transforms on the native UI thread and retain the dark underlying page until the reverse slide completes. The down arrow, Android Back and browser Back share guarded dismissal. Direct player links can close to Home.
- “Listen Live” in show details selects any show, including shows outside their schedule, and plays the same station stream. Selecting a show never pauses already-playing audio.
- Loading, pause and playback states follow actual audio events. Connection failures show a message with a retry action. Cancelled or replaced connections cannot restart playback.
- The sleep timer pauses the shared audio session. Notification preferences remain saved locally without permissions, tokens or remote registration.
- The spotlight loops through all 11 posters while mounting only the previous, current and next slides. Autoplay pauses during interaction, away from Home, in the background and for reduced motion. The only controls are previous/next arrows; the slideshow play/pause button is removed.
- Reduced motion disables the hero/show/modal transitions, tab fade and automatic spotlight movement.

## Other functionality

Searchable show grid, show details and posters, locally saved favourites, founder profiles and station story, contact links, and official social links. Existing show IDs and favourite storage are preserved.

Home, Shows and Favourites use the same show card: square artwork, independent heart at the top-right, content-width live badge at the top-left, and matching text slots. Narrow cards show just LIVE in the badge to keep the heart clear; its accessibility label still includes listeners.

Shows has All shows, Live now, Weekdays and Weekend filters below search. Search and filters combine; an empty result offers a reset. Weekdays includes Monday-Friday shows, including evening shows. Pages start at the top when switching tabs, and tapping the current tab smoothly returns to the top. Closing the player or show details preserves the underlying page's scroll position. Tab changes use an eased fade, with native pages kept mounted and the player prefetched to avoid first-navigation mounting work. The navigation theme and its backing views use AceRadio's dark background.

Audio connects to the public station stream only when listening starts. No show API or credentials are connected. Contact/social actions open their public links only when tapped. Show artwork, metadata and favourite storage remain local.

## Verify

```sh
npm run typecheck
npm run test:radio
npm run test:navigation
npm run test:web-input
npm run build:web
npx expo export --platform android --output-dir .qa/android
```

Radio tests cover show selection, previous/next wrapping, rapid skips, listener fixtures, cancelled loading, stale completions, pause/resume and errors. Native device testing is still needed for speaker output, headset/call interruptions, background playback and animation performance.

React Native Web `0.21.4` uses the existing `patch-package` responder fix. Keep `patches/react-native-web+0.21.4.patch` with the lockfile; `npm install` reapplies it.

## Source layout

- `app/`: five tabs, full player modal and show details.
- `src/components/LiveRadioHero.tsx`: artwork and show transition.
- `src/components/ShowSpotlight.tsx`: bounded three-slide carousel.
- `src/components/ShowCard.tsx`: shared card for Home, Shows and Favourites.
- `src/components/PageScrollView.tsx`: focus reset and current-tab scroll-to-top.
- `src/hooks/useModalTransition.ts`: native UI-thread slide, browser slide and guarded close.
- `src/hooks/useShowTransition.ts`: cancel-safe show crossfades.
- `src/context/RadioContext.tsx`: shared live-stream playback, preview show selection and sleep timer.
- `src/utils/radio.ts`: scheduled live show selection, with all shows playable through the station stream.
- `src/utils/showSchedule.ts`: SAST schedule evaluation and next-show lookup.
- `src/utils/RadioPlayback.ts`: connection lifetime, playback status and error handling.
- `src/services/radioTransport.ts` / `radioTransport.web.ts`: native Expo Audio and browser audio transports.
- `src/hooks/useRadioPlayback.ts`: transport lifecycle and status subscription.
- `src/data/shows.ts`: 11 shows, local artwork, schedules and demo live fixtures.
- `src/context/FavoritesContext.tsx`: persisted device favourites.
- `src/config/station.ts`: public live-stream URL and contact/social links.
- `src/services/notifications.ts`: local notification preference.
- `assets/`: supplied branding, presenter portraits, posters, icons and splash.

Native playback uses the installed Expo Audio package. Expo's native Expo Go detection keeps foreground playback working there without requesting unsupported service controls; AceRadio development and release builds retain background listening and live lock-screen controls. `ExecutionEnvironment.StoreClient` alone is not used to detect Expo Go because it also includes development clients. Browsers use their audio element and media-session controls. No microphone access or recording permissions are requested. Station notifications remain a local preference preview.
