# Animated startup

AceRadio keeps its approved white launch logo on black, adds a subtle five-bar
equalizer while the app starts, and fades into the requested screen. No new
library, generated artwork, configuration plugin or database change is needed.

## Lifecycle

1. `app/_layout.tsx` calls Expo's `preventAutoHideAsync` at module scope. The
   operating system shows the existing native launch screen before JavaScript
   can render anything.
2. `StartupSplash` renders the same `splash-icon.png` on black. Its canvas matches
   the configured native image width: 320 points on iOS and 224 dp on Android.
   The web canvas follows iOS and fits narrow viewports.
3. `useStartupTransition` waits for the overlay's layout and the image's load or
   error event before hiding the native splash. The overlay remains opaque;
   equalizer bars animate while local fonts are loading.
4. Once fonts load, or report an error, the existing providers and navigator
   mount underneath. The first navigation-view layout starts the 380 ms overlay
   fade. There is no minimum display time or dependency on remote content,
   Supabase session restoration, audio or connectivity. Cached starts can go
   straight into the fade without a visible loading phase.
5. After the fade, the overlay unmounts and controls become available. The route
   is preserved, including incoming Show Details links. Returning from another
   app or changing tabs does not replay startup.

The native fade is disabled because the overlay supplies the same transition
on both platforms. `setOptions` is skipped in Expo Go, where it is unsupported;
the app overlay and the settings in standalone/development builds are preserved. Only opacity and scale transforms animate; native frames use
the native Animated driver with `isInteraction: false`. No React state updates
run per frame. Loop orchestration is cleaned up when loading ends, the app moves
to the background, reduced motion changes, or the component unmounts. Stale fade
callbacks cannot update disposed state.

Startup assumes reduced motion until the native accessibility preference is
available. Reduced motion leaves the bars static and reveals the ready screen
immediately. The app also releases a ready overlay immediately in the background,
so a suspended fade cannot block the next foreground visit. Covered navigation
is hidden from accessibility and touch; on web it is also `inert` to keyboard
focus. The loading overlay has one accessible loading label, with decorative
children excluded.

## Verification

Run `npm run typecheck` and `npm run test:startup`. The startup suite exercises
the real hook's image/layout event ordering, fast launch, loading completion,
native/web animation drivers, motion changes, background/resume, cleanup and
late callbacks. Existing audio, navigation, animation, listening UI and browser
responder suites remain green: 87 tests across those six suites.

Android, iOS and web asset/JavaScript exports succeed. Browser checks in ignored
`.qa/animated-splash-browser.cjs` verify actual intermediate fade opacity, moving
bars during delayed font loading, static bars with reduced motion, runtime motion
changes, keyboard blocking, playback and navigation after startup, direct Show
Details links, and recovery with failed fonts/logo and unavailable remote
services. All six startup scenarios passed. Seven existing phone-UI browser
scenarios also passed against the new export, including playback syncing,
mini-player controls, show cards and WhatsApp launchers. Layout checks cover
widths 320, 390, 430 and 768 px. No page errors occurred. Captures and results
are under `.qa/animated-splash-*`.

Install a new Android and iOS preview/release build for final validation. Check
cold and warm launch, native-to-overlay logo alignment, no white/blank flash,
offline launch, incoming show links, reduced motion, and background/foreground
during startup. Check Android with gesture and button navigation and iPhone/iPad
safe areas. Expo Go and development-client launch screens do not faithfully
represent the final native splash. Export and browser checks do not replace
these device checks. No cloud build or store upload was started.

Reference: [Expo splash-screen animation](https://docs.expo.dev/versions/latest/sdk/splash-screen/#animating-the-splash-screen).
