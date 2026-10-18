# App visual refinement

The full player, Show Details, Shows, Saved, About, Settings and Account use
black backgrounds, charcoal surfaces, soft-white accents and neutral grey text.
See [the monochrome theme](theme.md) for the current palette and validation.

## Shared presentation

- `src/theme/typography.ts` defines page headings, section headings, body text and
  captions. `PageHeading` gives each content tab the same title rhythm.
  Outfit Bold/ExtraBold supplies headings and show titles; Manrope Regular,
  Medium and SemiBold supplies body text, metadata, forms and controls. Five
  static font faces are bundled locally. See [typography](typography.md).
- `usePageContentStyle` centres content within 640 px, uses 16 px gutters on small
  phones and 20 px otherwise, and reserves room for the floating mini-player.
- The mini-player uses one horizontal row, 62 px tall at the default font size.
  Play/pause and stop sit beside the title and playback status. Artwork hides
  on narrow phones or with large system text; larger text can grow the row and
  use two title lines. Tapping the copy opens the full player, whose playback
  controls are now a single centred play/pause button. See
  [listening refinements](listening-refinement.md).
- Page clearance and mini-player positioning share the layout helpers. Player
  controls have at least 44 px targets; unavailable navigation remains disabled.
- The full player uses a bounded square artwork frame, a quieter header and
  fallback, clearer title/presenter hierarchy and explicit playback status.
  Existing show crossfades and modal transitions still respect reduced motion.
  Home and full-player artwork now share a load-aware crossfade, with consistent
  sheet/tab/mini-player timings and playback-button feedback. See [motion](motion.md).
- Show Details groups the actual published schedule with its SAST timezone,
  places Listen Live before the description, and keeps favourite access in the
  header. The button remains disabled outside that show's schedule. “Scheduled”
  is the visual label for a show that is not currently on air.
  Share show sits below Listen Live and opens the native share sheet with show
  details and an `aceradio://show/<id>` link. Web uses sharing where supported,
  then clipboard or selectable text if browser sharing is unavailable. No
  hosted redirect, universal-link domain or app-store fallback is configured.
- Settings includes Share AceRadio under Connect with us. This is a frontend
  placeholder marked Coming soon; tapping it displays an inline store-launch
  notice. It opens no share sheet or external link and writes no preference.
- Shows and Saved reuse static card placeholders. Existing error/retry and empty
  states remain, and Saved's discover action sits inside a compact empty card.
- Filters, favourites and sleep-timer options expose their selected state on
  native and web. Busy playback controls also expose their loading state.
- About's story, founder images, timeline and links remain local. Settings keeps
  the same sleep timer, locally saved notification preference and contact links.
  Notification copy describes the future feature accurately.

## Validation

- TypeScript and all 90 existing content, listener, audio, navigation and web
  responder tests pass. The About rendering test loads the new presentation
  components while retaining its check that no content provider is required.
- Android, iOS and web exports succeed without new project dependencies or
  changes to native configuration.
- Chrome interaction checks cover all five tabs at 320, 390, 430 and 768 px:
  no horizontal overflow, readable mini-player metadata, reachable page footers
  and the primary full-player control visible on the short 320×568 viewport.
- Verified search/filter/reset, saved favourites after reload, Show Details/back,
  unavailable shows, sleep timer selection/off, loading placeholders, empty
  catalogue and content failure with locally available About and Settings.
- Verified the real station stream: play, pause, resume, reload, close full
  player without interrupting playback, mini-player pause/resume/stop, and the
  actual on-air Show Details action. Controlled stream failures verified error
  display/retry recovery and cancelling a pending connection. No browser page
  errors occurred.

Local captures and interaction scripts/results are ignored under
`.qa/app-polish-*`. Bundle output is `.qa/app-polish-export`.

Physical iPhone and Android checks are still needed for large system fonts,
device safe areas, touch feel, background playback and system media controls.
The audio transport, native audio patch, listener polling, content queries,
database schema and stored favourites were not changed by this refinement.
