# Backend request reduction and capacity checks

Reviewed on 23 October 2026. This change targets the notification worker's
unnecessary round trips while retaining one-minute reminder checks. It does not
change the stream, public R2 delivery, account behaviour, guest favourites,
notification payloads, consent rules, preview/production audience settings or
provider credentials.

**Deployed and verified on 23 October 2026.** All 287 app/backend regressions,
TypeScript and Deno checks passed. Two ordinary post-deployment minute runs
returned HTTP 200 with `idle=true`; top-level PostgREST statistics recorded
exactly two `push_worker_begin` calls. All eight existing sent delivery records
and their successful receipts, the registered-device count, three original cron
IDs/schedules, 32 R2 media references and custom setting names/update timestamps
were preserved. The five new indexes, private maintenance RLS and service-only
RPC grants were verified live. No test notifications were sent to production.

## What changed

Migration `20261023080000_push_worker_batching.sql` adds two **service-role-only**
RPCs and private hourly maintenance state. Anonymous and signed-in clients cannot
call these RPCs or read the new state.

- `push_worker_begin` acquires the existing per-environment lease, performs
  maintenance only when its durable hourly gate is due, fetches receipts and
  claims the first batch. An entirely idle run releases its lease inside this
  same transaction, requiring **one API call instead of five**.
- `push_worker_flush` saves up to 100 delivery acknowledgements or 100 receipt
  acknowledgements in one transaction. It can claim the next batch using the
  **same environment and allowlist**. A matching unexpired worker lease is
  required and renewed as a heartbeat. Invalid batches roll back atomically.
- Active runs still release their worker lease in `finally`. The existing
  minute cron is retained. Maintenance runs at most once per hour across both
  environments without introducing another cron job or HTTP request.
- Expiry and eligibility are still checked on every claim. Hourly deletion of
  expired records does not mean an expired device remains eligible for an hour.
  The existing retention durations are unchanged.
- Added indexes cover historical delivery retention, expired active leases,
  device expiry, one-time reminder expiry and rate-limit retention. They avoid
  scanning growing sent-job history for these maintenance operations.

The previous sender RPCs remain available to the server for compatibility and
rollback. There is no new public access to notification tokens or jobs.

| Scenario, without retries or due receipts | Previous database API requests | Batched requests |
| ----------------------------------------- | -----------------------------: | ---------------: |
| Completely idle minute                    |                              5 |                1 |
| Idle hour                                 |                            300 |               60 |
| 1,000 reminders, batches of 100           |            Approximately 1,015 |               12 |

These are **network/API round trips**, not the number of SQL row updates. Each
recipient still has its own durable delivery/receipt record. This does not reduce
all Supabase traffic by 80%: the publisher, listener history and legitimate
account/admin operations continue independently.

## Reliability and limits

- Public callers still cannot authorise dispatch. The worker's existing private
  credential and kill switch remain mandatory.
- Eligibility still uses the authoritative schedule, device consent, guest or
  account favourites, current settings, and the distinct reminder/live phases.
- The existing per-environment lease prevents overlapping workers. Its heartbeat
  prevents a slow acknowledged batch from losing ownership to a new minute run.
- Expo sends remain sequential batches of at most 100, with 250 ms between
  batches. Each run is capped at 25 batches and checks the existing 40-second
  budget before claiming another batch. An already claimed batch is completed
  even if its claim response arrives after that budget; subsequent work stays
  queued. Network timeouts and the lease bound failures.
- HTTP 429/5xx persist retry states and stop further sends in that run. Existing
  exponential retry timing and attempt caps remain authoritative.
- An ambiguous send is still marked `uncertain`, never blindly resent. A lost
  acknowledgement can leave a subsequent preclaimed batch quarantined by its
  lease; after expiry it is also `uncertain`. This preserves the existing bias
  against duplicate notifications, rather than promising exactly-once delivery.
- Visible notification payloads for Android and iOS remain version 1, with
  expiry, sound, channel, collapse ID and existing navigation metadata.
- Receipt checks now follow new sends, so a slow receipt provider cannot consume
  the send budget after jobs have already been leased. Unchecked receipts remain
  durable for the next minute. Batched invalid-token handling still checks the
  original sent token, preserving a newly rotated token.

Expo limits messages per request and project throughput; this implementation
uses bounded batches rather than opening a connection per listener. See
[Expo sending guidance](https://docs.expo.dev/push-notifications/sending-notifications/)
and [throughput and delivery behaviour](https://docs.expo.dev/push-notifications/faq/).

## What was tested

The isolated PostgreSQL-compatible regression fixture creates **1,000 devices**:
500 guests and 500 accounts, spanning Android and iOS. With the real migration,
real eligibility/claim/acknowledgement SQL and the actual dispatch handler, it
processes 1,000 advance reminders followed by 1,000 favourite-live alerts.
Each phase uses 12 database API calls. A repeated minute sends no duplicates and
uses one idle call. The push provider is **simulated**; the 250 ms pacing is
asserted but sleeps are omitted from this benchmark. Its elapsed time is not a
production latency guarantee.

Other tests cover idle lease release, overlapping workers, empty/phone-only
allowlists, preview isolation, anonymous/authenticated permission denial, atomic
rollback, expired/forged leases, hourly cleanup, backpressure, retry behaviour,
ambiguous sends, lost acknowledgements, receipt batching and token rotation.
The full app/backend regression suite and TypeScript/Deno checks must pass before
deployment. Test code never registers fake users/devices or sends load-test
notifications against production.

Ignored results: `.qa/push-batching/capacity.json`, test/type logs, setting metadata
before/after, aggregate live verification, and previous worker source for rollback.
No private credential values or production device tokens are logged.

## What “1,000 users” means

The tested workload supports a **1,000-device notification burst**. It is not a
certification of 1,000 simultaneously active phones on the current Supabase or
Cloudflare plan. Registered users, concurrent users and concurrent listeners
are different workloads.

Current steady-state estimates if **all 1,000 users are active for an entire
hour**, excluding retries/startup/writes:

| Surface                                             | Approximate hourly requests | Destination                                          |
| --------------------------------------------------- | --------------------------: | ---------------------------------------------------- |
| Native public pointer, once/minute                  |                      60,000 | R2; unchanged JSON is reused                         |
| Live listener count, every 15 seconds               |                     240,000 | Supabase Edge; no database reads inside that handler |
| Account sync, every 30 seconds, all 1,000 signed in |                     120,000 | Supabase database API                                |
| Idle reminder worker                                |                          60 | Supabase database API, independent of phone count    |
| Public content publisher                            |          60 revision checks | Supabase database API, independent of phone count    |

Queries are shared across components in each client, and client background/focus
rules suppress inactive polling. Those controls do not eliminate real active
usage. Listener history is a separate once-per-minute collector. Audio bandwidth
continues to go to the station stream server, not Supabase.

Before a public release approaching 1,000 concurrent users:

1. Replace the temporary **rate-limited `r2.dev` address** with production delivery
   on an owned custom domain. A public development URL is not a reliable
   production capacity commitment. Preserve existing URLs until supported builds
   have migrated. [Cloudflare public bucket guidance](https://developers.cloudflare.com/r2/buckets/public-buckets/).
2. Monitor Supabase database CPU/query latency, Edge invocation quotas, egress,
   storage growth and provider errors against the actual plan. Small API calls
   and image downloads have different bandwidth costs; the old cached-egress
   warning is not a count of requests. [Supabase egress](https://supabase.com/docs/guides/platform/manage-your-usage/egress).
3. Run a controlled concurrent-client test against a staging deployment with the
   intended hosting/plan. Include sign-in bursts, account/favourite sync, admin
   reads and representative slow networks; avoid testing 1,000 accounts on live
   production by surprise.
4. Account for real active listener polling. At larger concurrency, a suitable
   shared edge cache/transport for listener statistics may be needed; this patch
   preserves the existing freshness and correct counts rather than silently
   reducing the refresh frequency.
5. Check growth/retention of listener history and delivery records over time.
   Existing original Supabase image objects and legacy public APIs remain for
   older installed builds, so adopting new clients is part of reducing usage.

## Deployment and rollback

```sh
# Read-only review of the isolated shared-history migration plan:
npm run backend:deploy-push-batching
# Apply only this migration, then deploy only push-dispatch:
npm run backend:deploy-push-batching -- --apply --confirm-project dbgpfqyighcaquxwzkfe
```

The deployment script fetches remote migration history in an isolated ignored
workspace; it does not repair, revert or apply unrelated website migrations.
Deploy schema before the handler. No app rebuild is required for this backend
optimisation. **Never rerun `backend:setup-push`**, which reconfigures sending.

Verify existing custom setting names/update timestamps, exact cron job IDs and
schedules, media counts, delivery record/receipt counts, new service-only grants
and private RLS. Observe an ordinary scheduled minute returning `idle` through the
new RPC. Cron “succeeded” by itself only confirms the HTTP request was queued;
check the HTTP result too. Never print Vault secrets or worker bearer headers.

For rollback, redeploy the previous `push-dispatch` handler/index from Git or the
ignored pre-deployment backup. The original RPCs are retained, so no destructive
schema rollback is needed. Leave new indexes/private state in place for review;
never delete delivery history, reset jobs or blindly resend uncertain messages.
