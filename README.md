# OFFERME

An Addis Ababa secondhand marketplace for local meetups. Buyers inspect the item and pay the seller directly. OFFERME does not collect purchase money, hold escrow or provide delivery/riders.

Repository: https://github.com/Eyobhailu24/OfferMe

## Independent projects

- `backend/`: NestJS/PostgreSQL API, auth, media, exchange/reputation, moderation, notification worker and operational tools.
- `website/`: Next.js responsive buyer/seller/admin website.
- `app/`: Expo/React Native Android and iOS clients.

Each project owns its dependencies, lockfile, source and API definitions. There are no shared source packages or cross-project runtime imports. Work in `C:\Users\eyoba\Documents\WEB PROJECTS\Offerup`.

## Local development

Use a supported Node.js version (the CI/container configuration uses Node 24) and PostgreSQL. The Windows database helper defaults to PostgreSQL 18 under Program Files; set `PG_BIN` for another installation.

From `backend`:

```powershell
npm.cmd ci
npm.cmd run db:local
npm.cmd run dev
```

From `website`:

```powershell
npm.cmd ci
npm.cmd run dev
```

Website: http://127.0.0.1:3100. API: http://127.0.0.1:4100. API documentation: `/docs`. Use the 127.0.0.1 website origin consistently for cookies.

The database helper uses a separate cluster in `backend/.local/postgres`, bound to 127.0.0.1:55433. It does not modify an existing PostgreSQL service. Normal development data starts empty; tests create isolated databases and storage directories.

Use each `.env.example` as a reference and preserve any existing `.env`. With `optbypass=true`, development OTP codes appear in the backend terminal even if SMS credentials exist; no SMS is sent. With `optbypass=false`, valid AfroMessage credentials are required. Production forbids console OTP bypass.

Normal new uploads require the selected cloud provider: `AWS=true` uses S3 and `AWS=false` uses Cloudinary. Missing provider configuration returns an error rather than silently storing uploads on disk. Automated tests use an explicit local adapter and need no live SMS/storage credentials.

For the app:

```powershell
cd app
npm.cmd ci
npm.cmd start
```

Android emulator defaults to `http://10.0.2.2:4100`; iOS simulator defaults to `http://127.0.0.1:4100`. `npm.cmd run android:local` forwards API/Metro ports through ADB when needed. For a physical device, set `EXPO_PUBLIC_API_URL` to a reachable development API, bind the backend to `HOST=0.0.0.0` on a trusted network, and use an installed development build for native-only modules/push. Production requires HTTPS.

Drafts, selected pending photos and pending messages survive app restarts. Server retries reuse identifiers. Approximate location is optional; manual Addis-area selection remains available. Meetup entry uses Addis Ababa time (UTC+3).

## Automated checks

Start the isolated local database before backend/browser tests. Run from the relevant project directory.

Backend:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
npm.cmd run contracts
```

`contracts` exports OpenAPI plus separate generated definitions into each client. Regenerate before committing API changes. The test suite includes authorization, concurrency, media/publication retries, reservations, offers, reports, reviews, notification suppression/retries, TOTP/replay, socket sign-out, operator recovery/erasure and an encrypted backup/restore drill.

Website:

```powershell
npm.cmd run typecheck
npm.cmd run check:locales
npm.cmd run test:unit
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

The browser journey uses ports 3101/4101, a temporary database and a token-protected localhost teardown listener on 4102. Test OTP capture exists only in that test entry point. Never run concurrent browser suites against those ports.

App:

```powershell
npx.cmd expo install --check
npm.cmd run typecheck
npm.cmd run check:jsx
npm.cmd run check:locales
npm.cmd test
npm.cmd run check:fingerprint
npm.cmd run export
```

The native JSX check catches text directly inside layout components. Unit tests cover durable outbox restart/retry/account-isolation behavior. Android/iOS exports validate bundles and assets; they do not create signed APK/AAB/IPA releases or establish physical-device behavior.

`.github/workflows/verify.yml` runs the server/browser and native checks independently, checks generated contracts and audits all three dependency trees. The native minimatch override is limited to Expo fingerprint tooling and is accompanied by fingerprint/export verification; it avoids an incompatible Expo downgrade.

## Release and operations

Read [RELEASE_HANDOFF.md](./RELEASE_HANDOFF.md) for provider/environment setup, deployment examples, backups, operator procedures, signing/app links and the owner acceptance checklist. See [OFFERUP_ETHIOPIA_IMPLEMENTATION_PLAN.md](./OFFERUP_ETHIOPIA_IMPLEMENTATION_PLAN.md) for verified milestone status and deferred scope.

Core implementation is locally verifiable. Production hosting, live provider delivery, cloud-object recovery, signed builds, physical-device QA, fluent translation approval and operating policies remain release gates. No production deployment is performed by the verification workflow.
