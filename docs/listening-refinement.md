# Listening refinements — 18 October 2026

Between scheduled shows, connecting to the default AceRadio stream changes the
Home hero to station artwork, badges and the main action. Introductory copy,
show metadata and the status footer are hidden for this state. Actual connection
errors remain visible. Named live shows keep their existing presentation. The
station artwork no longer waits for the load event used only by show artwork.

The mini-player is one horizontal row, 62 px tall at normal text size. Its copy
opens the full player; play/pause and stop/dismiss remain beside it with 44 px
targets. The full player also uses only a centred play/pause control. Artwork hides below
360 px or above a 1.3 system font scale. Large text can grow the row and use two
title lines; page clearance uses the same height calculation.

Home's Live schedule has Live right now and Coming up next sections, including
when a scheduled show is currently live. Between shows it displays the station
stream, with an arrow opening the live player without starting playback.
Named live entries open their show details. Loading and unavailable-schedule states remain explicit. Next-show
timestamps retain their SAST label.

Remind me sits inside Coming up next without a separating divider and replaces
the timezone footer. This is a frontend preview:
its caption says Notifications coming soon, and enabling it adds Preview on.
It holds only component state for the next scheduled occurrence. It resets on
remount or when that occurrence changes; it does not request permissions, store
an account preference, register a device, subscribe or send a notification.
Real reminders will require a separate implementation with device permissions,
push tokens, delivery scheduling, cancellation and preference persistence.

## Frontend show sharing

Show details offers Share show below Listen Live. It opens the OS share sheet
with the title, presenter, published schedule and `aceradio://show/<encoded id>`.
The existing Expo scheme and Router show route handle this in an installed
development/production build. Expo Go uses its own development URLs and is not
the recipient for these app links. Share dismissal is silent; failed opening
offers retry feedback. On iPad, the button anchors the popover.

Web uses the browser share sheet when supported, or copies the share message;
if clipboard access is unavailable, selectable text remains available. Sharing
does not publish content or write to Supabase. Recipients need AceRadio installed.
Verified HTTPS links with a website/app-store fallback require separate domain
hosting and association files, and are outside this frontend change.

References: [React Native Share](https://reactnative.dev/docs/share),
[Expo incoming links](https://docs.expo.dev/linking/into-your-app/).

## Validation

- TypeScript passed, plus 69 existing radio, schedule, listener, navigation and
  web responder tests.
- Expo exported Android, iOS and web successfully.
- Edge browser checks verified station connecting/playing presentation, retained
  named-show details, current and next schedule entries, reminder toggling and
  occurrence reset, no reminder writes or permission requests, and mini-player
  pause/resume/open/stop.
- At 320×568, 390×844, 430×932 and 768×1024, the mini-player measured 62 px tall,
  its controls stayed beside the copy with 44 px targets, and pages had no
  horizontal overflow. No browser page errors occurred.

Ignored `.qa/listening-refinement-browser.cjs` and its results/captures reproduce
the browser checks using mocked audio; no real notification is sent. Physical
iOS/Android checks remain for native safe areas and large system text.

The subsequent sharing/control update passed TypeScript, 54 existing radio,
navigation and responder tests, and Android/iOS/web exports. Twelve browser
scenarios in ignored `.qa/show-sharing-browser.cjs` verify both schedule entry
actions, the grouped reminder, a centred full-player toggle without skip
buttons, sharing payload/cancellation/error states, clipboard/manual-copy
fallbacks, direct show routes, unavailable shows and responsive layouts.
No page errors occurred. Native share sheets, the iPad popover anchor and incoming
custom-scheme links still need testing on installed iOS/Android builds.
