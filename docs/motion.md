# Motion and playback artwork

Home and the full player share `PlaybackArtwork`. It retains the decoded current
image below its replacement until the new image loads, then crossfades over
360 ms with a subtle settling scale. The default station icon follows the same
path as show artwork. Failed or missing artwork uses the station logo; audio and
controls never wait for image loading. The full player's square frame stays fixed.
Home reserves metadata/footer space before playback so Play does not move the
card's action or the following schedule while artwork appears.

Only two artwork layers can be mounted. When a request changes while loading,
the pending image can be replaced; while revealing, the short reveal completes
and the latest request follows. Promoting the incoming layer preserves its React
key and decoded image rather than remounting it. Old animations stop on cleanup,
and stale completion callbacks cannot replace the current request. Android's
built-in image fade is disabled to avoid overlapping fade timings.

`useShowTransition` handles title/presenter fades separately: 90 ms out and
220 ms in. The first playback selection fades in, while opening a player for an
already selected show relies on the sheet transition. Same-show catalogue
refreshes update copy without resetting opacity or cancelling an active fade.
Interrupted transitions recover correctly when returning to the previous show;
clearing playback and reduced motion select immediately.

`src/theme/motion.ts` centralises the durations: sheets open in 320 ms and close
in 240 ms; tabs fade in 180 ms; the mini-player enters in 220 ms and leaves in
180 ms with an 8 px vertical offset. Mini-player animations stop on unmount.
Starting playback during dismissal cancels that exit, preventing its callback
from clearing the new stream. `PlaybackButton` gives play controls short opacity
feedback while preserving button layout, accessibility and touch targets.

All custom animations use opacity/transforms and the native driver on iOS and
Android, with `isInteraction: false`. No layout properties or React state are
updated on animation frames. Native sheet rasterisation remains limited to its
transition. Reduced-motion preferences disable decorative motion and update at
runtime. Web reads its initial media preference synchronously; Spotlight uses
the same preference and disables autoplay when reduced motion is requested.

## Verification

`npm run test:animations` exercises the production metadata hook with controlled
animation completions, cancellation, first play, same-show refreshes, rapid
changes, a return to the outgoing selection, cleanup, native/web drivers and
reduced motion. Existing navigation tests continue to cover Android Back,
browser Back/Forward, repeated dismissal, direct links and closing during entry.

Ignored `.qa/motion-browser.cjs` checks actual intermediate opacity, preservation
of the decoded DOM node, delayed/failed artwork, playback during mini dismissal,
press/release feedback, runtime reduced motion and responsive layouts. The
existing sharing/schedule/player browser flows are rerun against the same export
by `.qa/motion-regression-browser.cjs`. Audio is mocked for these browser checks.
Physical iOS/Android testing is still needed for device frame pacing, memory,
safe areas, system accessibility settings and background audio interruptions.

Verified on 18 October 2026: TypeScript and 62 tests passed (including eight new
transition regression cases). Six browser motion scenarios and twelve existing
sharing/schedule/player scenarios passed with no page errors. Checks include
unchanged Home card height across Play and four viewport sizes from 320 to 768 px.

References: [React Native Animated](https://reactnative.dev/docs/animated),
[React Native performance](https://reactnative.dev/docs/performance).
