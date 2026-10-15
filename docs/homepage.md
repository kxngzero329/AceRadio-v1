# Homepage refinement

The existing Home → live schedule → spotlight → shows → About flow is preserved.
The large promotional panels are compact station notes and an About footer; their
information and the About route remain available. Announcements and independently
managed home banners still render from the existing Supabase catalogue.

## Shared design

- `src/theme/colors.ts` provides the dark surfaces, emerald accent and readable
  secondary text. Measured text contrast against the card surface is 9.05:1 for
  muted text and 5.91:1 for subtle text; the CTA label measures 10.28:1.
- `src/theme/layout.ts` centralises the content width, gutter, section spacing,
  card/control radii and safe-area tab-bar height. Home is centred and constrained
  to 640 px, with 16 px gutters on small phones and 20 px otherwise.
- The hero retains “This is AceRadio” and Listen Live, with a restrained background
  outline, shorter spacing and stronger artwork overlays for the playing state.
  Existing image/text transitions remain native-driven on iOS/Android and respect
  reduced motion. Their duration and movement have been reduced.
- The schedule uses clearer current-show/presenter typography, readable times,
  one timezone note and a distinct next-show state. Between shows is not labelled
  as a station outage. Existing SAST scheduling logic is unchanged.
- Show artwork keeps a square frame. Shared cards separate the day from the time
  range, preserve complete schedule text in accessibility labels, and retain
  independent favourite buttons. Large system fonts switch the grid/carousel to
  one column; wide Home layouts can show three cards.
- Spotlight keeps its bounded three-slide swipe/autoplay implementation and
  reduced-motion/screen-reader behaviour. One counter replaces the duplicate
  dots/counter display, alongside 44 px previous/next controls and accessible
  increment/decrement actions.
- Navigation uses clearer inactive labels and a quiet emerald active icon
  background. The tab bar and mini-player share the bottom safe-area calculation.
- First content load has static show-card placeholders and the schedule loading
  state. Existing errors/retry/empty states remain. No animated shimmer or new
  animation dependency was added.

## Validation

All 90 existing tests and TypeScript passed. Android/iOS/web exports were checked
with the production content configuration. Browser interaction checks covered:

- Widths of 320, 390, 430 and 768 px, including a 320×568 viewport: no horizontal
  page overflow, and Listen Live remains visible on the first screen.
- Spotlight previous/next buttons and a touch swipe, with reduced motion enabled.
- Saving a show, visiting Saved and reloading to verify persistence.
- Show details and Back, Shows search and the selected navigation state.
- Real live play/pause/resume/stop and mini-player clearance above the tab bar.
- Controlled content loading, empty and error responses, including retry and the
  independent live audio CTA when content is unavailable.

The tested browser flow produced no page errors. The live stream, listener polling,
favourite storage, routes, content queries, schema and native audio patch were not
changed. Physical iPhone/Android checks remain necessary for system font scaling,
device safe areas, background playback and system media controls.

Run `npm run typecheck`, the existing `test:*` scripts, and
`npx expo export --platform all --output-dir .qa/homepage-export` for repeatable
code/bundle verification. Local visual captures and browser results are in ignored
`.qa/home-polished-*.png` and `.qa/home-smoke-results.json`.
