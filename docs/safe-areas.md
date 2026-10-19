# Detail-page safe areas

On 19 October 2026, an iPhone 16e running Expo Go was reported to place the
detail-page back controls too close to the status/notch area. Android was working
correctly. The affected routes use custom headers inside animated full-screen
native-stack modals.

## Implementation

`ScreenSafeArea` uses `useSafeAreaInsets()` and explicit padding on an ordinary
View on iOS. The React context remains available when native modal presentation
changes the view hierarchy; the padding no longer depends on the animated
view's local native safe-area measurement. This follows
[React Navigation's guidance for animated screens and custom headers](https://reactnavigation.org/docs/handling-safe-area/).

The installed iOS Fabric SafeAreaView implementation searches for its provider
in the native ancestor chain and falls back to its own insets when one is not
found. That is consistent with the reported symptom on native modal screens;
the physical-device cause has not been independently reproduced here.

The wrapper is used by Show Details, the full player, Account and ContentSheet
(Events, Event Details and Station Updates). It applies actual top, bottom,
left and right iOS insets once, allowing different cutouts and window sizes.
There are no hardcoded status-bar heights or iPhone-specific offsets.

Android and web keep their original native SafeAreaView with top/bottom edges
and the same page styles. The existing tab-page safe areas, Chat modal insets,
slide animations, dismissal guards and audio session are untouched. Show/player
header labels can shrink/wrap between the existing 44-point controls.

## Verification

- `npm run test:safe-area`: nonzero and zero iOS insets, side insets, changing
  measurements, unchanged Android/web handling and a full shared-header back
  button below the unsafe area, with the existing close callback preserved.
- TypeScript and all 162 automated tests pass, including navigation, audio,
  account, content and listening UI tests.
- Browser navigation/layout checks cover Show Details, Station Updates, Events,
  nested Event Details, the player and Account at 320, 390, 430 and 768 px widths.
  These are web regressions, not a substitute for native safe-area validation.
- Android, iOS and web exports are checked separately. No cloud build or backend
  change is required for this JavaScript/layout change.

Ignored logs and browser evidence are under `.qa/ios-safe-area-*`.

No iOS simulator or physical-device control is available in this workspace.
Reload Expo Go on the reported iPhone and check first opening, reopening, nested
event navigation, back controls, larger system text and the player while audio
continues. Also verify Android with gesture and button navigation. The browser
checks cannot establish UIKit hit-testing or actual notch placement.
