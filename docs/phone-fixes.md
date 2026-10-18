# Phone playback and contact fixes — 18 October 2026

Show Details now derives its playback button from `RadioContext`, including
the selected show ID, playing, buffering and error state. Opening the currently
playing show exposes Pause Live without restarting audio. Paused playback shows
Resume Live, pending connections can be cancelled, and connection errors expose
Retry. Starting a different live show selects it through the same provider.
Playback actions keep Show Details open. An off-air unselected show stays
disabled, while the listener can still control an already selected stream after
that show's scheduled slot ends.

The tab mini-player was underneath the native Show Details modal. Details now
renders `MiniPlayer` inside its own screen with `placement="sheet"`; the bar sits
above the device's bottom safe area without reserving a nonexistent tab bar.
Scroll padding uses the shared mini-player clearance and system font scale.
Both player views read the same provider; no second audio controller is created.
Opening the full player from this bar and returning preserves the detail page.

Both Chat and Settings call `openWhatsAppChat(STATION.whatsapp)`. Native first
opens the installed app using `whatsapp://send?phone=27730676204`; a rejected
handoff falls back to the official `https://wa.me/27730676204` link. Browser
launching uses HTTPS directly during the click. The launcher validates the
configured studio URL and reports failure only after opening attempts fail.
Both entry points guard repeated taps while opening. Generic website/mail
launching also opens directly instead of gating on `canOpenURL`: Android/iOS
availability queries can fail despite a working link handler.

Settings no longer includes Studio email. Shared show-grid cards in Home,
Shows and Saved use `colors.background` (#000000) and the existing one-pixel
`colors.border` (#353535), including the fallback artwork background. Other
card types retain their styling.

## Validation

- TypeScript passed; Android/iOS/web exports succeeded.
- Seventy-six targeted tests passed, including fourteen new production-module
  regressions. Run `npm run test:listening-ui` for link dispatch/fallback and
  Show Details playback-action cases. Existing radio, animation, navigation and
  input tests also passed.
- Seven browser scenarios checked initial playback sync without restart,
  detail/mini/full-player and remote pause, connection cancellation, error retry,
  off-air selection guards, dismissal/restart, both WhatsApp entry points,
  removed email and actual grid colours. No page errors occurred.
- Mini-player positioning, touch targets and horizontal overflow were checked
  at 320×568, 390×844, 430×932 and 768×1024. Captures and results are ignored
  under `.qa/phone-fixes-*`. Browser audio and external opening are mocked;
  physical phones still need verification of WhatsApp handoff and safe areas.

References: [React Native Linking](https://reactnative.dev/docs/linking),
[WhatsApp click to chat](https://faq.whatsapp.com/5913398998672934).
