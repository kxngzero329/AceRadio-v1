# Accounts, permissions and account sync

Implemented and deployed to `dbgpfqyighcaquxwzkfe` on 16 October 2026. The public catalogue and station stream remain independent of authentication. This document supersedes the older local-only favourites and `content_staff` descriptions.

## What listeners see

Settings now has an Account entry. Saved shows also explains how to keep favourites across devices. `/account` provides signup, email-code verification, sign-in, recovery by email code, password changes, display-name editing, device-favourites import, sign-out and account deletion.

Guests can continue listening and saving shows on their device. After sign-in, favourites and notification preferences belong to that account. Existing device choices are offered for explicit import; they are not silently assigned to whichever person signs in. Import adds missing favourites without reversing an existing account removal or replacing an established notification preference.

Signed-in screens show syncing, pending saves, retry and conflict information. A failed first account load has loading/error states rather than an empty collection presented as successfully loaded. Account changes keep the radio and navigation mounted.

Notification preference sync does not register push tokens or request system notification permission. The running sleep timer, playback state, device permissions and future installation push tokens are device/session state.

## Email setup still required

The project currently has **no custom SMTP provider**. The free-tier default sender restricts recipient addresses and refuses custom email templates. This was confirmed through the Management API; no SMTP credentials were guessed or changed.

The app therefore defaults `EXPO_PUBLIC_AUTH_EMAIL_CODES_READY` to **false**. Existing accounts can sign in, but registration/recovery clearly explain that email setup is pending. Public signup and recovery controls must remain gated until delivery is configured. The flag is a release/UI switch; all security is enforced independently by Supabase and database policies.

The hosted Auth configuration has been verified with confirmation enabled, a ten-character uppercase/lowercase/number password policy, six-digit codes, a ten-minute expiry, a sixty-second email resend interval and TOTP support. Existing hosted Auth rate quotas were preserved, including the default sender's two emails/hour and thirty verification requests per five minutes. Local `supabase/config.toml` mirrors the code/password settings.

To finish production email setup:

1. Configure a real SMTP sender and verified domain in Supabase Authentication settings. Keep credentials there, never in `EXPO_PUBLIC_*` or source control. Verify the provider's sender-domain DNS records.
2. Review the branded confirmation/recovery templates in `supabase/templates/`. They use `{{ .Token }}` and require no app-link redirect for these flows.
3. Run `npm run backend:configure-auth` to inspect readiness without changing settings.
4. Run `npm run backend:configure-auth -- --apply --confirm-project dbgpfqyighcaquxwzkfe`. This requires SMTP, updates only the reviewed Auth fields/templates, verifies them and sets `EXPO_PUBLIC_AUTH_EMAIL_CODES_READY=true` in ignored `.env.local`.
5. Restart Metro and test actual delivery to real inboxes, including resend, expired/wrong codes and recovery. Review the project's email quota against provider capacity and expected signup volume; the setup script preserves quotas rather than raising them automatically.
6. After delivery tests, run `npm run backend:configure-eas -- --auth-only --environment development --environment preview --environment production --apply --confirm-project dbgpfqyighcaquxwzkfe` to publish only the public email-readiness flag to those EAS environments. This does not change the content source or deploy a build.

On Windows use `npm.cmd` where PowerShell blocks `npm.ps1`. `--security-only` on the Auth configuration script applies security fields without templates or enabling email flows; that mode has already been applied. Configuration backups contain only the changed non-secret Auth fields and are ignored under `.qa/supabase/`.

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
| `profiles` | Own verified account read; constrained display name; revision and timestamps |
| `user_roles` | Own verified role read; trusted dashboard/server writes only |
| `user_settings` | Own notification preference, revision and timestamp |
| `user_favorites` | Own show IDs, saved/removed state and per-show revision; removed rows remain as tombstones |
| `app_private.account_operations` | Retry IDs/results, inaccessible to app clients; rolling fourteen-day cleanup on writes |
| `app_private.account_rate_limits` | Private per-account write counters |
| `get_account_data()` | One consistent owner-only snapshot; requires an existing verified Auth account |
| `apply_account_changes(changes)` | Validated owner-only transactional writes; no caller-selected user ID |
| `assert_account_deletion_allowed()` | Requires verified identity, recent password authentication and a non-admin account |

All account tables have RLS and explicit grants. Public clients have no direct insert/update/delete grants, so they cannot bypass RPC validation or limits. Private functions revoke public execution and use an empty search path. Trusted functions return only the caller's data. The public catalogue RPC remains published-only and uses its existing security model.

Writes accept at most fifty operations and 32 KiB per call. A per-account transaction lock makes revision checks, counters and updates consistent across concurrent devices. Limits are ninety new operations/minute, two thousand/day and ten display-name changes/hour. Replaying an already-recorded operation does not consume another write or increment a revision. Invalid batches roll back.

Client auth calls also have in-flight guards, persisted hashed-email cooldowns, safe error messages and request deadlines. They supplement Supabase's server Auth limits. Local cooldowns are not treated as a security boundary. A public launch should also review CAPTCHA/abuse protection against expected signup traffic.

## Caching and offline behaviour

`AccountSync` is a separate shared store from the existing public TanStack catalogue cache. Public content persists exactly as before; private account data is never added to that public query cache.

Account snapshot keys include the project URL and user UUID. Valid snapshots are usable for seven days. User edits update the UI immediately, then enter a durable outbox and sync after a short debounce. Auth credentials are excluded from this cache. Separate immutable operation records prevent browser tabs from replacing each other's pending saves when they write the shared snapshot.

Refresh happens every thirty seconds while foregrounded/connected and on foreground/network return. Only one account request runs at once. Network calls have a fifteen-second deadline. Failures back off from two seconds to sixty seconds; a server write-limit response waits at least a minute. Background/offline polling stops. Pending changes retain the same operation IDs across retries and app restarts.

Each operation includes the revision it was based on. A newer save from another device causes a conflict response rather than overwriting that save. The client loads the latest values, drops the conflicting operation and its dependent edits, and explains that the user should review the result. Deleted favourites remain revisioned false rows so stale clients cannot silently restore them. Outbox changes expire after seven days, before server retry records expire, and the UI reports expired work.

The original guest favourites key and notification preference are preserved. Sign-out warns before discarding unsynced account work. Session/account changes cancel the old owner's work and remove that owner's cached snapshot/outbox. Cache identity validation and request lifecycle guards prevent late responses from appearing in another account. Clearing an account cache waits for queued storage writes so a late save cannot recreate it after sign-out.

Native Auth tokens are stored entirely in Expo SecureStore, split into small Unicode-safe chunks with an atomic manifest for larger sessions. There is no plaintext AsyncStorage fallback for Auth tokens. Browser sessions use Supabase's browser storage/locking; browser script security remains important. Signup/recovery codes, passwords and MFA secrets are not persisted by the UI or logged.

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

Verified during implementation:

- All eighteen new account tests and ninety existing tests pass, with TypeScript and Deno checks.
- Android/iOS/web exports succeed.
- Hosted test accounts verify six-digit codes, default user roles, anonymous denial, private-data isolation and blocked direct role writes.
- Two isolated browser contexts exercise guest import, profile/settings sync, offline removal/reconnect, sign-out cleanup and switching accounts. The shared browser transport remains active through sign-in/out; its audio element is doubled for this account test.
- Browser signup and recovery screens use privileged test-code generation in place of email sending; actual public OTP verification, password update and deployed account deletion succeed. This does **not** establish SMTP deliverability.
- Real admin authenticator enrollment, QR rendering, code verification, MFA-backed permissions and immediate database role revocation pass. Password changes and deletion also pass for an enrolled account after demotion, with the required authenticator step.
- No browser page errors; account layouts checked at 320, 390 and 768 px. Temporary live test accounts/MFA factors are deleted after verification; no real admin remains.

Physical Android/iPhone checks are still required for secure-session restoration, keyboard/autofill, offline relaunch, interruptions and audio continuity in fresh binaries. The new native dependencies require a fresh build. SMTP delivery and email quotas must be tested before enabling public registration.

The dependency audit reports 31 existing affected packages (20 high, 11 moderate), all already present at unchanged versions in the original lockfile. They are largely in the Expo/React Native/build dependency trees, with runtime dependencies also included. The audit proposes incompatible framework downgrades for several entries, so no force-fix was applied. Review these advisories and compatible framework/patch updates before a public release; the ignored audit output is `.qa/accounts-dependency-audit.json`.

Next feature work is the global chat plus moderation, using these accounts and roles. Private conversations and the larger administration website remain later work.
