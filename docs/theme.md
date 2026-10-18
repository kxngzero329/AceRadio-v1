# AceRadio monochrome theme

Updated on 17 October 2026 to match the station's confirmed black, white and grey brand colours.

## Palette

`src/theme/colors.ts` owns the semantic colours. All tokens use equal red, green and blue channels, including translucent scrims; there are no green/red aliases.

| Token | Value | Use |
| --- | --- | --- |
| `background` | `#000000` | Page and navigation background, matching the approved splash |
| `surface` | `#121212` | Cards, panels and tab bar |
| `surface2` | `#1E1E1E` | Raised surfaces and placeholders |
| `accentSoft` | `#262626` | Selected icon backgrounds and quiet badges |
| `accent` | `#F0F0F0` | Primary actions, active icons and links |
| `onAccent` | `#0A0A0A` | Text/icons on light actions |
| `white` | `#F5F5F5` | Headings and primary text |
| `muted` | `#BDBDBD` | Secondary text |
| `subtle` | `#969696` | Tertiary labels |
| `border` / `borderStrong` | `#353535` / `#707070` | Panel edges / form outlines |

Hero gradients, playback/loading states, favourites, filters, sleep-timer pills, notification switches, chat options, account/sync/MFA views and error callouts use this palette. Selected filters and timer options have light fills with dark labels. Favourite hearts use filled versus outlined shapes. Notification switches use a light track and dark thumb when enabled. Live, paused, connecting and interrupted playback retain explicit text labels. Error callouts use readable text and borders, with the player's alert icon; they do not depend on a red tint.

Show-card placeholders use a neutral surface even when a fetched show's catalogue accent is coloured. Catalogue accent metadata and original show posters/presenter photographs remain content, rather than controlling the app's interface palette. The station-only live hero/player now use the approved black-and-white icon instead of the old green decorative artwork. No raster artwork was edited.

Browser text selection, native input cursors, browser form controls and visible keyboard-focus outlines are neutral too. `applyWebTheme.web.ts` sets the browser rules, including inherited link colours; the native module is a no-op. React Native Web's switch receives its separate `activeThumbColor` so its default teal does not reappear when enabled. Windows/browser forced-colour mode can retain its user-selected focus colour.

The Android notification accent is soft white in `app.json`. Existing native installations need a new binary to acquire that setting. The two local Auth email templates also match the palette; they will be applied when production SMTP setup is finished, using the existing Auth configuration script. This change does not enable email flows or change the hosted database.

## Contrast

Measured from the actual palette values:

| Pair | Contrast |
| --- | --- |
| Primary text on `surface` | 17.18:1 |
| Secondary text on `surface2` | 8.87:1 |
| Tertiary text on `surface2` | 5.64:1 |
| Dark text on the primary action | 17.37:1 |
| Dark text on the loading action | 13.62:1 |
| Error text on its callout surface | 13.53:1 |

These measured text pairs exceed 4.5:1. Photos/posters have their own colours; image overlays and badge backgrounds separate interface text from that content.

## Validation

TypeScript and all 108 existing account, content, listener, playback, navigation and browser-input tests pass. Android, iOS and web bundle exports succeed. Local browser captures and interaction results are stored under ignored `.qa/monochrome-*` paths.

The browser suite passes 34 screen/state checks: Home, the playing station hero and mini-player, full player and error, Shows and selected filters, show details and favourites, Settings with the notification preference enabled and a selected timer, Account and its validation error, About, and the chat chooser/development notice. Pages were checked at 320, 390, 430 and 768 pixels. The suite checks computed interface paints for non-neutral RGB values, keyboard focus and horizontal overflow; no browser page errors occurred. Playback events were simulated, and test Auth requests were intercepted, so these checks do not establish live audio output or email delivery. Android configuration introspection also confirms the soft-white notification accent.

Physical Android/iPhone checks remain necessary for native switches, system font scaling, touch feedback and the installed notification tint. The existing stream, account permissions, caching, favourites/settings sync and rate limits keep their existing behaviour.
