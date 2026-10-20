# Accounts, permissions and account sync

Account schema deployed to `dbgpfqyighcaquxwzkfe` on 16 October 2026; email/password-only mobile flow updated on 19 October 2026. The public catalogue and station stream remain independent of authentication. This document supersedes the older local-only favourites and `content_staff` descriptions.

## What listeners see

Settings now has an Account entry. Saved shows also explains how to keep favourites across devices. `/account` provides signup and sign-in with **email and password only**, authenticated password changes, display-name editing, device-favourites import, sign-out and account deletion. Successful signup signs the listener in immediately. Display names default to `Listener` and can be edited after signup. Verification codes, verification links and forgotten-password/reset screens are not available in this version.

The shared top header opens `/account` from a circular profile button. Guests see a user icon; signed-in listeners see up to two initials from their display name. New accounts still named `Listener` use their email username as a fallback, excluding any plus alias. The avatar updates with profile edits and sign-out, uses a 44-point touch target and keeps an accessible account label. Settings remains available through the bottom navigation.

Guests can continue listening and saving shows on their device. Creating a new
account automatically adds their guest favourites to that account, keeping the
original guest copy on the phone. Saved shows remain visible while the durable
account outbox syncs. The new account also inherits the guest's reminder choices
and that phone's existing explicit notification consent and one-time requests;
signup never prompts for permission or creates consent that was not already given.

This transfer is triggered only by successful signup. Signing into an existing
account keeps the explicit device-import option, so another person's guest
choices are not silently assigned to it. Import preserves existing account
choices, including removed favourites and established reminder settings.

An owner-scoped `aceradio:signup-transfer:v1:<project>:<user>` journal resumes an
interrupted signup transfer on the next launch. Imports use batches of at most
50 operations and wait for outbox capacity. Each batch is persisted together;
restarts, offline writes, account changes and unavailable storage cannot assign
the transfer to another account. Failure to prepare a transfer is explained
without presenting an already-created account as a failed signup.

Signed-in screens show syncing, pending saves, retry and conflict information. A failed first account load has loading/error states rather than an empty collection presented as successfully loaded. Account changes keep the radio and navigation mounted.

Account preference sync remains separate from device permission and registration.
Show reminders now add account-synced scope/timing, plus explicit permission and
consent on each installation; guest favourites/reminder choices remain on the
phone. See [push reminder setup](push-notifications.md). The running sleep timer,
playback state and device permissions remain device/session state.

## Current Auth configuration and future SMTP setup

The connected project's public `/auth/v1/settings` endpoint was checked on
19 October 2026: email authentication and signup are enabled, and
`mailer_autoconfirm` is **true** (Confirm email is off, as configured by the
project owner). Signup uses the regular public `auth.signUp({ email, password })`
API. Supabase saves the identity and hashed password in `auth.users`,
auto-confirms the account and returns a session. The existing database trigger
creates its `profiles`, `user_roles` and `user_settings` rows transactionally.
No password or Auth credential is copied into a public table.

The local `supabase/config.toml` now also has
`auth.email.enable_confirmations = false`. No hosted Auth setting, schema,
policy or existing user was modified for this change. The client preserves the
existing password policy: 10–128 characters with uppercase, lowercase and a
number for new passwords. Existing-account sign-in does not enforce signup
strength rules against older passwords.

`EXPO_PUBLIC_AUTH_EMAIL_CODES_READY` no longer gates registration and is not
read by the mobile app. Old `.env.local`/EAS values can remain harmlessly in
place. The variable, SMTP configuration script and email templates are retained
for future email setup tooling. No SMTP credentials are needed for the current
signup/sign-in flow. If the server unexpectedly stops returning a signup
session, the app explains that sign-in did not finish rather than displaying
an email-code screen or pretending the user is signed in.

To add verification/recovery later:

1. Configure a production SMTP sender, verified domain and sender DNS records in
   Supabase; keep credentials there, never in app variables or source control.
2. Implement the mobile confirmation/recovery flows and test actual delivery,
   resend limits and expired codes before enabling them for users.
3. The existing `backend:configure-auth` script inspects settings by default.
   Its explicitly confirmed `--apply` mode is for that future email rollout:
   it requires SMTP and turns confirmation **on**. Do not use it for the current
   password-only flow. `--security-only --apply` preserves the current
   confirmation setting while applying its security fields.
4. Existing unconfirmed accounts are not bulk-confirmed or modified. If one
   cannot sign in, review that specific account in Supabase instead of weakening
   account policies. New password-only registrations are auto-confirmed.

## Account screen polish and Expo Go warnings

The account screens share the app's black/surface palette, Outfit headings,
Manrope text, logo header and existing corner radii. Sign-in/signup use a compact
form card, focus borders, accessible password visibility, a single primary CTA
and a smaller mode-switch action. Errors appear inside the form. Narrow phones
use smaller gutters/card padding; the page remains scrollable with the keyboard
open. Submission guards, field autofill, secure storage, favourites and the
account-management actions are preserved.

The installed Supabase SDK (2.117.3) already coordinates concurrent refreshes.
The deprecated custom `processLock` option has been removed in accordance with
[Supabase's migration guidance](https://github.com/supabase/supabase-js/blob/master/packages/core/auth-js/migrations/lockless-coordination.md).
Storage keys, persistence and token auto-refresh remain unchanged. An installed-
SDK regression test covers signup, session restoration after a fresh client and
concurrent refresh deduplication.

Password-only authentication uses the SDK's default flow configuration, with
URL session detection disabled. Signup no longer creates an unused PKCE
challenge, so it does not invoke the native WebCrypto fallback. No OAuth or
redirect-based email flow is exposed. Before adding redirect-based auth,
configure PKCE with native S256 support rather than accepting a plain challenge.

`SplashScreen.setOptions` is skipped when Expo Constants identifies Expo Go
(`ExecutionEnvironment.StoreClient`). Native development/release builds retain
the existing splash transition, as does the app's startup overlay. Reload Expo
Go fully to replace any old initialized auth client after these changes.

## Exactly two roles

`public.profiles` contains every user's display name and revision; private Auth email/password data is not copied into it. `public.user_roles` has one row per profile with exactly `user` or `admin`. Signup always assigns `user`, regardless of signup metadata. Neither ordinary users nor app admins can alter roles through the public API.

Promote the intended real studio account through the trusted Supabase Table Editor, or SQL:

```sql
update public.user_roles
set role = 'admin'
where user_id = 'ACTUAL_STUDIO_AUTH_USER_UUID';
```

No real admin account was invented or promoted during implementation. The initial shared studio account is selected by you. `admin` authorizes future catalogue/Storage management; those privileged operations additionally require an MFA `aal2` session. The Account screen supports authenticator enrollment and verification, including QR/manual setup. Ordinary account preferences do not require MFA.

The accounts migration preserves the existing content policy helper name, `is_content_editor()`, but replaces its implementation with `is_account_admin()`. It then removes the old `app_private.content_staff` table. There is one current permission source, with no remaining editor role. The migration refuses to silently promote any existing legacy editor; the live project had no memberships before migration.

Admin status does not give access to another listener's favourites/settings. Deleting an admin account requires transferring/demoting its role first; both the deletion authorization function and an Auth-user deletion trigger protect it. Role revocation is checked against the database for privileged writes, even while an older MFA JWT remains valid.

## Database boundary

New migrations: `20261016100000_accounts_and_sync.sql` and `20261016110000_account_security.sql`. The latter indexes favourite/cleanup lookups and requires MFA for deletion when the account has an enrolled factor. Earlier deployed migrations remain unchanged.

| Object | Behaviour |
| --- | --- |
| `profiles` | Own Auth-confirmed account read; constrained display name; revision and timestamps |
| `user_roles` | Own Auth-confirmed role read; trusted dashboard/server writes only |
| `user_settings` | Own notification preference, revision and timestamp |
| `user_favorites` | Own show IDs, saved/removed state and per-show revision; removed rows remain as tombstones |
| `app_private.account_operations` | Retry IDs/results, inaccessible to app clients; rolling fourteen-day cleanup on writes |
| `app_private.account_rate_limits` | Private per-account write counters |
| `get_account_data()` | One consistent owner-only snapshot; requires an existing verified Auth account |
| `apply_account_changes(changes)` | Validated owner-only transactional writes; no caller-selected user ID |
| `assert_account_deletion_allowed()` | Requires verified identity, recent password authentication and a non-admin account |

`is_verified_account()` retains its original name and checks Supabase's `email_confirmed_at`, which is automatically set for new signups while Confirm email is off. It does not establish that the listener owns that inbox. No policy was relaxed or bypassed.

All account tables have RLS and explicit grants. Public clients have no direct insert/update/delete grants, so they cannot bypass RPC validation or limits. Private functions revoke public execution and use an empty search path. Trusted functions return only the caller's data. The public catalogue RPC remains published-only and uses its existing security model.

Writes accept at most fifty operations and 32 KiB per call. A per-account transaction lock makes revision checks, counters and updates consistent across concurrent devices. Limits are ninety new operations/minute, two thousand/day and ten display-name changes/hour. Replaying an already-recorded operation does not consume another write or increment a revision. Invalid batches roll back.

Client auth calls also have in-flight guards, persisted hashed-email cooldowns, safe error messages and request deadlines. They supplement Supabase's server Auth limits. Local cooldowns are not treated as a security boundary. A public launch should also review CAPTCHA/abuse protection against expected signup traffic.

## Caching and offline behaviour

`AccountSync` is a separate shared store from the existing public TanStack catalogue cache. Public content persists exactly as before; private account data is never added to that public query cache.

Account snapshot keys include the project URL and user UUID. Valid snapshots are usable for seven days. User edits update the UI immediately, then enter a durable outbox and sync after a short debounce. Auth credentials are excluded from this cache. Separate immutable operation records prevent browser tabs from replacing each other's pending saves when they write the shared snapshot.

Refresh happens every thirty seconds while foregrounded/connected and on foreground/network return. Only one account request runs at once. Network calls have a fifteen-second deadline. Failures back off from two seconds to sixty seconds; a server write-limit response waits at least a minute. Background/offline polling stops. Pending changes retain the same operation IDs across retries and app restarts.

Each operation includes the revision it was based on. A newer save from another device causes a conflict response rather than overwriting that save. The client loads the latest values, drops the conflicting operation and its dependent edits, and explains that the user should review the result. Deleted favourites remain revisioned false rows so stale clients cannot silently restore them. Outbox changes expire after seven days, before server retry records expire, and the UI reports expired work.

The original guest favourites key and notification preference are preserved. Sign-out warns before discarding unsynced account work. Session/account changes cancel the old owner's work and remove that owner's cached snapshot/outbox. Cache identity validation and request lifecycle guards prevent late responses from appearing in another account. Clearing an account cache waits for queued storage writes so a late save cannot recreate it after sign-out.

Native Auth tokens are stored entirely in Expo SecureStore, split into small Unicode-safe chunks with an atomic manifest for larger sessions. There is no plaintext AsyncStorage fallback for Auth tokens. Browser sessions persist in localStorage; the installed Supabase SDK coordinates refreshes internally without a custom lock. Browser script security remains important. Passwords and MFA secrets are not persisted by the UI or logged.

## Account deletion

`account-delete` is deployed as an Edge Function. Its public gateway JWT check is disabled because the handler explicitly validates the bearer token with Supabase Auth. It rejects missing tokens, arbitrary target IDs, missing confirmation and oversized bodies.

The caller must re-enter their password and, if enrolled, verify their authenticator. The database checks the verified identity, password authentication time within five minutes, enrolled-factor/MFA assurance, deletion rate limit and admin protection. Only then does the function use its server-only credential to call Auth's managed user deletion API for that exact caller. Profile, roles, favourites, settings and private sync bookkeeping cascade away. The app then removes its session/cache. The endpoint never accepts a service key from the app or returns one.

## Verification and remaining release checks

The local account suite exercises actual PostgreSQL migrations, triggers, grants, RLS, RPCs, counters, revision conflicts and cascade deletion in PGlite. Auth/Storage platform primitives are substituted there; the live checks below cover their hosted integration.

```sh
npm run typecheck
npm run test:accounts
node --test scripts/content.test.cjs scripts/listeners.test.cjs scripts/radio.test.cjs scripts/navigation.test.cjs scripts/web-responder.test.cjs
npx deno check supabase/functions/account-delete/index.ts
npx expo export --platform all --output-dir .qa/accounts-export
npm run backend:verify
```

Verified for the password-only update on 19 October 2026:

- TypeScript and all **158 automated tests** pass. `test:accounts` includes
  18 database/sync/storage/deletion tests and eight password-authentication/client-session tests.
- Android, iOS and web exports succeed.
- Real public signup immediately returns a session and a Supabase-auto-confirmed
  user. Its trigger-created private profile defaults to `Listener`, the role is
  `user`, and preferences start at their defaults.
- Two isolated browser contexts verify explicit guest-favourite import,
  cross-device favourites, heart removal, offline add/reconnect, profile changes,
  session restoration after reload, sign-out cache removal and switching users.
- Another account cannot read the first account's favourites or grant itself
  the admin role. Wrong-password and duplicate-signup messages are actionable.
- No verification/recovery/OTP requests are made. There are no browser page
  errors. The polished sign-in/signup layouts fit 320, 390, 430 and 768 px
  widths. Browser checks also cover focused borders, password visibility,
  accessible busy/disabled controls, inline errors and short-screen scrolling.
- All temporary live accounts from these checks were removed using the existing
  authenticated `account-delete` function. No existing user was changed.

The unchanged admin MFA and deletion policies are covered by the account suite;
real admin enrollment and MFA-backed permissions were also checked during the
original account implementation. Current browser artifacts and the export log
are ignored under `.qa/accounts-password-*`.

Physical Android/iPhone checks are still required for secure-session restoration, keyboard/autofill, offline relaunch, interruptions and audio continuity in fresh binaries. The new native dependencies require a fresh build. SMTP delivery and email quotas must be tested before adding email confirmation or recovery. Password-only registration is available now with the verified auto-confirm configuration.

The dependency audit reports 31 existing affected packages (20 high, 11 moderate), all already present at unchanged versions in the original lockfile. They are largely in the Expo/React Native/build dependency trees, with runtime dependencies also included. The audit proposes incompatible framework downgrades for several entries, so no force-fix was applied. Review these advisories and compatible framework/patch updates before a public release; the ignored audit output is `.qa/accounts-dependency-audit.json`.

Next feature work is the global chat plus moderation, using these accounts and roles. Private conversations and the larger administration website remain later work.
