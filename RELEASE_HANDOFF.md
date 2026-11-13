# OFFERME release handoff

Updated November 12, 2026. Repository: https://github.com/Eyobhailu24/OfferMe

This is a release candidate source tree with local automated verification. It has not been deployed, signed for either app store, tested on a physical iPhone/Android phone, or exercised against live SMS/push/storage credentials. A passing bundle export is not a signed native release.

## What the software now provides

- Independent NestJS backend, Next.js website and Expo Android/iOS app, with separate manifests/lockfiles and independent generated API definitions.
- Phone OTP sessions, chosen public display names, private phone numbers, owner/member/admin authorization and production administrator TOTP verification.
- All 15 general-category groups, subcategories, required category details, explicit defects, Addis-area validation, optional approximate location pins, filters, starter multilingual search aliases, deterministic cursor pagination and nearby radius queries.
- Listings, image processing and thumbnail derivatives, owned media, idempotent photo uploads/publication, local drafts and pending photo uploads. Website files use IndexedDB; native photo copies use app document storage and drafts use SQLite.
- Favorites and saved searches. Saved-search alerts remain a post-pilot feature under the implementation plan.
- Persisted chat, account-scoped durable message outboxes, reconnect refresh, read cursors, muting, offers/counteroffers/expiry, meetup confirmation/rescheduling/cancellation/no-show reports and buyer-specific expiring reservations.
- Participant-reported sales, explicit outside-platform sales, buyer confirmation, one review per participant per eligible exchange and public reputation. These are not processor-verified purchases.
- Reports for listings/people/messages/reviews, blocking/unblocking, moderator case access, review hiding/restoration, listing removal/restoration, account suspension and support/appeal queues with audit events.
- Account exports, deletion requests and controlled operator erasure/recovery procedures. No public endpoint transfers an account to another phone number merely because someone requests it.
- English, Amharic and Afaan Oromo catalogs, including category/safety/admin/error copy. Machine-drafted wording still needs fluent human approval.
- Generic push payloads, durable notification jobs, retries/receipt checks, device registration and block/mute/preferences enforcement. Live delivery is disabled until explicitly configured.
- Request IDs and structured logs without request bodies/OTP codes in production, DB readiness, protected queue health, encrypted backup/restore tooling, CI and deployment examples.

## Verification recorded November 12, 2026

- Backend: 22 tests passed against isolated PostgreSQL databases, including encrypted database/media restore, cross-platform migration checksums, authorization, retries, concurrency, account recovery/erasure and TOTP/socket lifecycle. TypeScript build and contract generation passed.
- Website: TypeScript check, production build, three outbox unit tests, 269-key localization check and the full Chromium marketplace journey passed. Desktop/mobile screenshots were inspected; the 390px overflow assertion passed.
- Native: TypeScript, SDK dependency compatibility, JSX, 269-key localization, three outbox unit tests and fingerprint checks passed. Both Android and iOS Hermes bundles/assets exported successfully. Physical-device flows and signed releases are not verified.
- Dependency audits: zero reported vulnerabilities in each of the three independent lockfiles at verification time.
- Deployment examples: Compose configuration syntax passed; Docker image execution and the optional PostGIS extension path remain unverified locally.

GitHub Actions repeats the automated software checks on pushes and pull requests. Its actual run result is separate from these local results. Fresh database startup can print Better Auth's pre-migration missing-table warning; the tests then migrate and verify sign-in against the initialized schema.

## Founder setup before release

| Task | What you supply or verify |
| --- | --- |
| Hosting and data flows | Approved hosting/data locations for database, media, auth, messages, logs, push tokens and backups; review these with your local advisers. |
| Domains | Website and API HTTPS domains, DNS, certificates and app identifiers. |
| SMS | AfroMessage eligibility, credentials, approved sender/identifier and real delivery tests on both supported mobile networks. |
| Media | S3 bucket/region/role or Cloudinary configuration, appropriate access/retention settings and a live upload/read/delete test. |
| Push | EAS project, FCM/APNs credentials, approved data-flow/consent setup and actual foreground/background/killed-app delivery tests. |
| Administrator access | `ADMIN_PHONES` plus a unique authenticator secret per administrator. Never reuse the fake test secrets. |
| Native releases | Apple/Google developer accounts, signing credentials, installable builds, store descriptions/screenshots, privacy disclosures and physical-device testing. |
| Language and policy | Fluent review of both independent client catalogs; approved privacy/terms/prohibited-item/support/recovery policies and support hours. |
| Pilot | Authentic Addis listings, moderation coverage, real exchange observations and representative device/network/load measurements. |

## Backend environment and startup

Use `backend/.env.example` as a reference. Keep live secrets outside Git. Existing `.env` files must not be overwritten.

Production requires `NODE_ENV=production`, `DATABASE_URL`, a sufficiently long `BETTER_AUTH_SECRET`, HTTPS `WEB_ORIGIN` and `BETTER_AUTH_URL`, `optbypass=false`, AfroMessage credentials and a configured media provider. `AWS=true` selects S3; `AWS=false` selects Cloudinary. Missing cloud configuration never silently switches new uploads to local disk. Tests use an explicit isolated disk adapter.

Run migrations before production starts:

```powershell
cd backend
npm.cmd ci
npm.cmd run db:migrate
npm.cmd run build
npm.cmd start
```

Run the production worker as a separate process from the same backend build:

```powershell
npm.cmd run worker:start
```

Development starts housekeeping in the API process; production requires the worker. It expires offers/reservations, removes eligible orphaned media and handles notification/erasure cleanup. Unpublished server photos older than 30 days can be collected; selected native photos still waiting for upload remain in the app's own document storage until uploaded or discarded.

`TRUSTED_PROXY_IPS` must describe the actual immediate trusted proxy addresses in your deployment. Do not copy loopback values into a container deployment without checking the network path. Isolate direct origin access. Configure the website's build-time `API_URL` and `NEXT_PUBLIC_SOCKET_URL` consistently with your proxy and public API origin.

Set `EXPO_PUSH_ENABLED=true` only after configuring and testing push. `EXPO_ACCESS_TOKEN` supports Expo push security. A successful push ticket means submission to the provider, not confirmed reading or guaranteed delivery. An ambiguous network failure can still produce a duplicate generic notification; message persistence and client retry IDs protect the actual chat history.

Operational checks: `GET /v1/health` is liveness, `GET /v1/ready` checks PostgreSQL, and administrator-authenticated `GET /v1/admin/health` reports notification states and exhausted media cleanups. Failed notification jobs can be deliberately retried using `POST /v1/admin/jobs/:id/retry`.

## Administrator second factor

Set normalized administrator phone numbers in `ADMIN_PHONES`. Supply `ADMIN_TOTP_SECRETS` as a JSON object mapping those numbers to separate random base32 secrets of at least 32 characters. Provision each secret into the administrator's authenticator through your protected operator process. Production refuses configured administrators without a secret.

After phone sign-in, Account asks for the authenticator code before rendering moderation tools. Successful verification grants this session 15 minutes of administrator access. Reused codes are rejected and repeated failures are throttled. Keep recovery arrangements outside the marketplace account itself.

## Account recovery and erasure

Recovery requires human ownership verification. A person who lost their old number can sign in with a reachable new number, leave that new account otherwise unused, and submit an Account > Support > Recovery request. Do not approve transfers based only on a caller knowing a phone number or listing title.

After applying your approved recovery policy, the protected operator command first performs a dry run:

```powershell
npm.cmd run account:recover -- --request=REQUEST_ID --target=ORIGINAL_USER_ID --operator=ADMIN_USER_ID
```

Only after verification, append `--execute`. The procedure refuses suspended/deletion-pending/admin accounts and new accounts with marketplace activity. It preserves the original account ID/listings/history, moves the freshly verified reachable number, revokes both accounts' sessions and records an audit event. Existing active accounts need a separately reviewed merge procedure; this command deliberately does not merge two populated accounts.

Deletion is also a controlled operator workflow:

```powershell
npm.cmd run account:erase -- --request=DELETION_REQUEST_ID
```

Append `--execute` only after the request and applicable retention requirements have been reviewed. Erasure removes phone/profile identifiers, revokes sessions/devices, sanitizes the account's listing/message/review text, queues media deletion and retains pseudonymous shared exchange/audit records. It does not silently erase other participants' history. Backups, third-party retention and local device caches must be covered by your approved policy. A deletion support ticket cannot be marked resolved through the ordinary support endpoint instead of performing erasure.

## Backups and restore verification

The automated suite creates an encrypted database/media snapshot, restores it into a new isolated database, checks record counts and local images, and rejects corrupted artifacts. This validates the local tooling, not your production recovery-point/recovery-time targets.

Use PostgreSQL client tools matching the server version. Set `PG_BIN` when required. Set `BACKUP_ENCRYPTION_KEY` to a separately stored 32-byte hex key. Production refuses an unencrypted backup request. Run backup tooling on protected, encrypted storage: the dump is briefly materialized before the final encrypted artifact is written.

```powershell
npm.cmd run backup -- --directory=.local/backups/approved-snapshot
```

For a restore drill, set `RESTORE_DATABASE_URL` to a new database on the same PostgreSQL server named `offerme_restore_*`, then run:

```powershell
npm.cmd run restore -- --directory=.local/backups/approved-snapshot
```

The restore refuses the original database and existing database creation fails rather than overwriting data. Remote targets also require `ALLOW_REMOTE_RESTORE=true`. Keep the encryption key separate from the archive. Cloud objects need provider versioning/replication and a separate object restore drill; a DB dump containing object pointers is not a backup of cloud image bytes. Set up your provider's scheduled backups/PITR, retention, alerts and measured restore drill to meet the plan's proposed 15-minute RPO and four-hour RTO.

## Nearby search and containers

Nearby radius queries work with ordinary PostgreSQL using approximate coordinates. Public responses exclude pin coordinates and round displayed distances. To use indexed PostGIS queries, run `backend/deployment/postgis.sql` with an appropriate role, then set `POSTGIS_ENABLED=true`. That optional extension path needs verification on your chosen host; PostGIS is not installed on this workstation.

Dockerfiles, `backend/deployment/compose.example.yml` and `Caddyfile.example` are provided. Compose syntax is checked. Container images were not built or run locally because the Docker daemon is not running. Supply a private `backend/.env.production`, actual domains and runtime configuration before using them. With the containers built, migrations can run with `node dist/scripts/migrate.js` in a one-off API container before starting API/worker traffic.

## Signed native builds and app links

Configure `EXPO_PUBLIC_API_URL`, `EXPO_PUBLIC_WEB_URL` and `EAS_PROJECT_ID` in the selected EAS environment. The production profile requires HTTPS URLs and the project ID. Ignored local `.env` files are not a substitute for remote build environment configuration. See [Expo environment variables](https://docs.expo.dev/eas/environment-variables/) and [build profiles](https://docs.expo.dev/build/eas-json/).

`app/eas.json` provides development, internal-preview and production profiles. Examples for the owner after EAS/signing setup:

```powershell
cd app
npx.cmd eas-cli build --profile preview --platform android
npx.cmd eas-cli build --profile production --platform ios
```

The website publishes association data only after `APPLE_TEAM_ID` and `ANDROID_SHA256_FINGERPRINTS` are configured. Verify the real HTTPS association files and installed-app links. `EXPO_PUBLIC_*` values are public bundle configuration; backend secrets never belong there.

## Physical-device acceptance checklist

- Android and iPhone: sign in, restart, resume/expire/revoke a session, and sign out.
- Choose photos, deny library/location access, interrupt an upload, close the app, resume the draft and retry without duplicates.
- Send several messages offline, restart, reconnect and verify one server copy per message.
- Offer/counter, reserve/cancel/expire, reschedule/cancel a meetup, report a no-show, record a sale, confirm it and review.
- Exercise block/unblock, muted/disabled notifications, background/killed-app push and notification taps.
- Test font scaling, Ethiopic text, Oromo spelling, low-memory devices and slow/unreliable networks.
- Confirm direct seller payment after inspection and no checkout, escrow, delivery or rider flow.

Optional identity verification, saved-search alerts, richer ranking/responsiveness signals, listing video, AI descriptions and paid promotion remain deferred under the plan. Do not treat their absence as unfinished core checkout or delivery work; those transaction services are outside OFFERME's scope.
