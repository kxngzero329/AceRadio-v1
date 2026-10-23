# Live listener count

Updated on 23 October 2026. The app reads the **existing public Icecast API**
directly: `https://studio.ace.radio/status-json.xsl`. No new endpoint or streaming
server configuration is required. The live audio URL remains
`https://studio.ace.radio/stream`.

The displayed count measures active connections to that stream across the app,
website and other players, including background audio. It is not a unique-person
count or a count of open apps. Statistics requests do not open an audio connection
or increase the audience. `listener_peak` is not used as the current count.

## Current app data flow

**App → existing Icecast status URL**

- `src/services/listenerStats.ts` performs a public HTTPS GET directly, without
  account credentials or Supabase API keys; browser cookies are explicitly
  omitted. Native cookie handling follows the platform fetch implementation.
  No authentication is required. It works independently of
  Supabase catalogue configuration, including bundled content mode.
- The source is fixed in the pure shared decoder at
  `supabase/functions/_shared/icecast.ts`. Only one exact `/stream` entry under
  `studio.ace.radio` or its advertised `studio.arc.radio` alias is accepted.
  Source objects and arrays are both supported. Missing, ambiguous or unrelated
  mounts, invalid/negative/fractional counts and malformed responses fail safely.
- The response must be JSON and is limited to 64 KiB. Reading works with both
  browser streaming responses and React Native fetch responses without a readable
  body stream. Known Content-Length and decoded byte sizes are checked.
- The shared TanStack query refreshes every **10 seconds while foregrounded**,
  including foreground/reconnect refresh, and is reused across Home, player and
  live show widgets. It does not poll in the background and does not retry in a
  tight loop. Each phone still makes its own requests; this is not a shared cache
  across users.
- Fetch uses `cache: no-store`. The live source currently also returns
  `Cache-Control: no-cache, no-store` and `Access-Control-Allow-Origin: *`.
  Browser CORS and native HTTPS support are checked without exposing credentials.
- Only the validated count and local freshness metadata enter the client cache;
  raw Icecast administrator/server details are not retained as app query data.
- A sample expires after at most **30 seconds**, conservatively accounting for
  HTTP Age and the full request duration. Raw Icecast JSON provides no per-response
  sampling timestamp; the client estimates freshness from request timing rather
  than misusing `server_start` or `stream_start`. A phone's calendar need not
  match the streaming server's clock.
- Errors or expired data show the existing “Live radio”/plain LIVE state, never a
  fabricated zero. A valid actual zero is displayed. There is **no automatic
  Supabase fallback** that could recreate per-phone Edge usage during an outage.
- Counts are excluded from persisted catalogue data. Refreshing statistics never
  starts, stops, reconnects or changes the metadata of audio playback.

This is polling, not an instantaneous push subscription. Count changes generally
appear on a subsequent refresh, subject to network and server disconnection
recognition. Closing the app does not necessarily disconnect background audio.

## Supabase and admin history

The existing deployed `listener-stats` Edge Function remains available for older
installed builds and the separate once-per-minute admin listener-history
collector. It still provides its original aggregate version-1 response and
per-warm-worker cache. The shared decoder was extracted in source without
changing its public contract. This app change requires **no production backend
migration, function deployment, credential change or cron change**.

Updated apps make **zero Supabase database or Edge requests for the displayed
listener count**. Other account/content/notification operations and the admin
collector continue independently. Older installed versions keep their original
transport until updated.

## Capacity and configuration

No listener-specific environment variable or private key is needed. Expo Go
needs a reload with this code; installed previews/releases need an updated build.
The verified public endpoint already exists, and no nginx service or invented
URL was added.

Traffic has moved to the streaming host, not disappeared. At 1,000 continuously
foregrounded clients with one poll per ten seconds, the steady-state estimate is
**360,000 statistics requests/hour** (about 100/second), excluding startup,
foreground and navigation refreshes. Its ability to serve that traffic must be
confirmed by the hosting provider or an authorised load test. Client polling is
not a server-enforced abuse limit. No 1,000-client load test is run against the
live streaming host without that coordination.

A shared server/CDN cache remains a possible future improvement when hosting
access exists. It is not required for the direct API integration and is not
claimed to have been deployed. See [backend capacity](backend-capacity.md).

## Verification

On 23 October 2026, all **290 app/backend tests** passed, including 18 listener
tests. TypeScript, the existing Edge handler's Deno check, and Android/iOS/web
exports passed. Chrome read the actual public API four times, observed polling
intervals of approximately ten seconds, matched the visible count to the API,
and made **zero Supabase listener-count requests**. Simulated HTTP failure and
subsequent recovery also passed without runtime errors. Evidence is in ignored
`.qa/direct-listeners` artifacts. Physical-device checks remain necessary.

```sh
npm run test:listeners
node --test scripts/*.test.cjs
npm run typecheck
npx --yes deno check supabase/functions/listener-stats/index.ts
npx expo export --platform all --output-dir .qa/listener-export
```

Tests run the actual common decoder, existing aggregate handler, direct client
transport, query sharing/persistence settings and hook lifecycle. They cover
valid zero, exact/ambiguous mounts, API errors, cancellation/deadlines, streaming
and native non-streaming bodies, multibyte size limits, invalid/stale HTTP Age,
clock offsets, foreground return, expiry and recovery. The radio integration
checks that real counts replace fixtures in both content modes and that reading
statistics never starts audio.

Browser verification must observe GETs to the real status URL and **no requests
to `/functions/v1/listener-stats`** from the updated app. Other web content requests
may still use their separate public-content Edge reader. Device checks should
compare the count with the real status response while accounting for timing and
other listeners, then exercise background playback, pause/stop and system controls.

References: [Icecast statistics](https://www.icecast.org/docs/icecast-latest/server_stats/),
[React Native networking](https://reactnative.dev/docs/network),
[TanStack focus refresh](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching).
