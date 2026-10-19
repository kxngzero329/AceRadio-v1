# Shared events and station announcements

Implemented on 19 October 2026 against the connected project
`dbgpfqyighcaquxwzkfe`. The website/admin already owns the deployed `events`
table; this change only reads it. No tables, policies, migrations, records or
Storage objects were changed. Generated public database types were refreshed
from that shared schema.

## Home and navigation

- Announcements stay immediately below the live hero. One compact card previews
  the highest-priority active announcement. Tapping it opens `/announcements`,
  with all active updates, complete text and any supplied information links.
- Upcoming events sit below the live schedule/station note, before Show Spotlight.
  Home mounts up to six swipeable cards. When multiple events are available,
  **See all** opens `/events`, which includes the complete fetched calendar.
- A card opens `/event/[id]` with its actual title, dates, venue, description and
  optional artwork. No image, end time or venue is invented when absent.
  **Book on the Website** opens `https://bookings.ace.radio/`, configured in
  `STATION.bookings`, even when the event has no individual booking URL. The
  button appears for events whose known dates have not passed; the app does not
  create bookings or collect ticket payments.
- New pages reuse the existing guarded modal transition/back behaviour.
  Underlying page position and the shared audio session are preserved.

The screens use the existing monochrome palette, Outfit/Manrope typography,
safe areas and spacing. Artwork is contained rather than cropped; failed artwork
has a neutral calendar fallback. Large text reduces carousel columns. Loading,
empty, error/retry and unavailable-event states are included.

## Event data contract

`eventsRepository.ts` uses the existing anonymous public Supabase client, with
explicit display columns and `status = 'published'` on list and detail queries:

| Column | App use |
| --- | --- |
| `id` | UUID, stable navigation/cache key |
| `title`, `description` | Published plain text, paragraphs preserved |
| `starts_at` | Required timestamp with timezone |
| `ends_at` | Optional timestamp, later than the start when supplied |
| `location` | Optional venue/address |
| `image_url` | Optional HTTPS artwork URL |
| `booking_url` | Optional HTTPS event link retained in the data model; the button uses the configured official booking site |
| `status` | Must be `published` |

Unsafe or invalid optional URLs are ignored, while invalid required fields or
date ranges produce a recoverable event error. The app never queries guest,
booking, payment or rate-limit tables. Event reads require no listener account.

The list selects future events and ongoing events with a known future end,
ordered by start and ID. It reads pages of 100 without silently truncating the
calendar and deduplicates IDs between pages. A single 15-second deadline covers
the complete request and response bodies; caller cancellation is propagated.

Dates are displayed in `Africa/Johannesburg`, explicitly labelled SAST,
independently of the device timezone. The existing shared 30-second content
clock removes expired cached events even without a successful network refresh.
An event with no end time stops being upcoming at its advertised start; no
duration is assumed. A direct link to a still-published past event shows its
dates and a Past event label. Missing/unpublished detail reads show unavailable.

## Refresh, offline cache and isolation

Events have independent TanStack Query keys under `station-events`; the original
`get_app_content_v3()` catalogue contract is unchanged. An event outage does not
fail shows, schedules, announcements or audio. The reverse is also true: events
can render while the catalogue request fails.

Queries share the existing 60-second stale time, refresh at 60-second intervals
while foregrounded, and refresh on stale foreground/reconnect. Event queries
allow one automatic retry. Opening details seeds its public data from the list
for an immediate view, with an independent published-only detail lookup when
needed and on refresh.

Validated public event rows/details join the existing seven-day persisted
content cache. Failed refreshes keep the last valid content and show a saved-data
notice. The persistence allowlist still excludes listener samples and private
account data. Restored event payloads are validated before display.

Announcements continue using the existing catalogue RPC and publication-window
filtering. Their priority is now retained and sorted descending. Older cached
payloads without priority remain compatible, defaulting to zero; ties retain the
RPC's original order. Existing account/favourite storage is unchanged.

## Admin workflow and setup

Use the existing website/admin to publish events or announcements. App changes
appear through the existing Supabase configuration and refresh behaviour; no
mobile-specific duplicate content or backend deployment is needed. Bundled
content mode intentionally has no remote events. Supabase mode was already
selected in the inspected local configuration and was not switched.

Read-only live verification found **Red Star Festival**, at ArenaX, Milnerton,
on **29 November 2026, 09:00–22:00 SAST**. Its artwork and booking URL were null.
There were no published announcements at that snapshot, so their Home preview
correctly remains hidden until an active update is published.

## Validation

- TypeScript and all **150 automated tests** pass, including eight new event
  tests, announcement-priority/legacy-cache coverage and public-cache isolation.
- Production anonymous event list/detail queries were checked against the
  actual deployed table. No records were inserted or updated.
- Android, iOS and web exports succeed.
- Browser checks cover live content, SAST dates, full descriptions, announcement
  priority/windows, full lists/details/back, booking/information links and link
  failure, artwork load/failure, loading/empty/error/retry, offline cache restore,
  independent catalogue/event failures and local event expiry without refetch.
- Home and event details were checked at 320, 390, 430 and 768 px without
  horizontal overflow. Real live playback continued through event navigation
  without a new stream connection; search, favourites and Chat still worked.
- Test content was supplied through browser interceptions only, not the database.

Ignored local evidence is under `.qa/events-*`, including the browser script,
results, production public snapshot and screenshots. Physical Android/iPhone
checks remain necessary for device safe areas, large system fonts, native link
handoff and background/system media controls.

Run `npm run test:events`, the existing `test:*` scripts and `npm run typecheck`.
Export all platforms with
`npx expo export --platform all --output-dir .qa/events-export`.
