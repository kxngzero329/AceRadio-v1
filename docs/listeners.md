# Live listener count

The app displays the active connection count for the exact broadcast it plays:
`https://studio.ace.radio/stream`. The verified source is the public Icecast JSON
endpoint at `https://studio.ace.radio/status-json.xsl`.

This measures connections to that stream across the mobile app, website and other
players, including background audio. It is not a count of unique people or open
apps. Multiple devices can represent one person; listeners behind external relays
are not necessarily visible individually to this server. All shows use the same
station stream, so the number is the station audience rather than separate show
audiences. Checking statistics does not open an audio connection or inflate it.

## Data flow and accuracy

- The public, read-only `listener-stats` Supabase Edge Function fetches only the
  fixed Icecast statistics URL. Caller-supplied URLs never change its destination.
- It requires exactly one `/stream` entry advertised under the verified
  `studio.ace.radio` / `studio.arc.radio` names. The latter is Icecast's internal
  advertised hostname. Missing/ambiguous mounts, invalid counts, upstream errors
  and timeouts return 503, never a fabricated zero. An actual zero is valid.
- The function returns only the aggregate count, public stream URL, sampling time,
  sample age and schema version. It exposes no listener identities, IP addresses,
  raw server statistics or credentials and has no database access.
- Warm workers cache a sample for at most ten seconds and deduplicate concurrent
  upstream reads. This is an opportunistic per-worker cache, not a global cache;
  separate/cold workers can make independent reads. Upstream failures have a
  five-second cooldown. There is no counter table or database write.
- HTTP responses use `Cache-Control: no-store`. Public CORS and GET/OPTIONS are
  supported. `verify_jwt = false` is intentional: the aggregate is public already,
  and no listener sign-in or API key is needed to read it.
- The app has one shared query, refreshed about every 15 seconds while visible,
  with foreground/reconnect refresh. It does not poll while backgrounded. The
  streaming server continues counting background audio connections independently.
- The UI expires a sample at 30 seconds, including server-reported age and request
  latency. It uses elapsed sample age instead of comparing the phone's calendar
  clock with the server's sampling timestamp. Errors or expired/unavailable data
  show “Live radio” (or the card's plain LIVE badge). No sample count is used as a
  fallback, even in bundled content mode.
- Listener samples are excluded from the persisted catalogue. Updating statistics
  does not start, pause, reconnect, or change the metadata of the audio transport.

This is a frequently refreshed reading, not an instantaneous unique-person total.
Under normal conditions it may lag a connection change by the server cache plus
the app's refresh interval. A fresh count is shown on Home, the full player and
live show cards; the existing narrow-card layout can show the plain LIVE badge.

## Deployment and configuration

The function is deployed to the linked `aceradio_db` project. Existing local/EAS
`EXPO_PUBLIC_SUPABASE_URL` values select it; no new app environment variables or
privileged keys are needed. An unconfigured checkout shows “Live radio”.

To repeat an authorised deployment, use:

```sh
npm run backend:deploy-listeners              # dry run
npm run backend:deploy-listeners -- --apply --confirm-project dbgpfqyighcaquxwzkfe
```

The script deploys only this function and checks the linked project against the
confirmation/import manifest. It does not modify database tables or content.
Install a preview containing the new app code to enable the display on a phone.

## Verification

Verified on 15 October 2026: all **90 tests** passed (15 listener, 21 content,
30 radio, 16 navigation and 8 web input), along with app TypeScript, Deno's strict
function check, and Android/iOS/web bundle exports. The deployed public endpoint
and direct Icecast source both reported 13 connections during the comparison;
GET without credentials and browser OPTIONS/CORS also passed. Physical phone
checks remain necessary for the installed preview.

```sh
npm run test:listeners
npm run test:radio
npm run test:content
npm run test:navigation
npm run test:web-input
npm run typecheck
npx --yes deno check supabase/functions/listener-stats/index.ts
npx expo export --platform all --output-dir .qa/listener-export
curl https://dbgpfqyighcaquxwzkfe.supabase.co/functions/v1/listener-stats
```

Tests execute the actual parser, HTTP handler, client transport, freshness logic,
query/persistence settings and hook lifecycle. They cover zero, wrong/ambiguous
mounts, malformed responses, stale upstream caches, concurrent reads, timeouts,
network failures, background return, sample expiration and recovery. The radio
integration test confirms that real counts replace fixtures in both content modes
and that reading counts never starts audio.

On a phone, compare the displayed count with the source using the sampling time,
allowing for the short refresh/cache delay. Check that pause/stop, background
listening and system controls work while statistics refresh or are unavailable.

References: [Icecast statistics](https://www.icecast.org/docs/icecast-latest/server_stats/),
[Supabase function configuration](https://supabase.com/docs/guides/functions/function-configuration),
[TanStack focus refresh](https://tanstack.com/query/latest/docs/framework/react/guides/window-focus-refetching).
