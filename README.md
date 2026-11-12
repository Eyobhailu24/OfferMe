# OFFERME

A local secondhand marketplace for Addis Ababa. People discover items, chat, agree on a price and public meeting place, inspect the item, and pay the seller directly.

## Projects

- `backend/`: NestJS API, PostgreSQL, phone authentication, listings/photos, favorites, conversations, offers, meetups, reporting, blocking and administrator moderation.
- `website/`: responsive Next.js website with buyer and seller flows.
- `app/`: Expo / React Native Android and iOS app with independent screens and client code.

Each project has its own dependencies and lockfile. There is no shared source package. Work directly in `C:\Users\eyoba\Documents\WEB PROJECTS\Offerup`.

## Local development

Use Node.js 22.13 or later and PostgreSQL command-line tools. The local database helper defaults to PostgreSQL 18 under Program Files; set `PG_BIN` for another installation. Commands below use `npm.cmd` because Windows PowerShell can block `npm.ps1`.

In a backend terminal:

```powershell
cd 'C:\Users\eyoba\Documents\WEB PROJECTS\Offerup\backend'
npm.cmd ci
npm.cmd run db:local
npm.cmd run dev
```

In a website terminal:

```powershell
cd 'C:\Users\eyoba\Documents\WEB PROJECTS\Offerup\website'
npm.cmd ci
npm.cmd run dev
```

Open **http://127.0.0.1:3100**. The API is at **http://127.0.0.1:4100**, with documentation at **/docs**. Use the 127.0.0.1 URL consistently so the configured origin and cookies match.

The database helper manages a separate PostgreSQL cluster in `backend/.local/postgres`, bound to 127.0.0.1:55433. It does not change an existing PostgreSQL service. Generated credentials and development secrets are gitignored.

Phone sign-in accepts Ethiopian mobile numbers. Without SMS credentials, verification codes appear in the backend terminal. No live SMS is sent in this mode. For the background preview started during development, logs are in `backend/.local/api-output.log` and `website/.local/web-output.log`. Read a development code with:

```powershell
Get-Content 'C:\Users\eyoba\Documents\WEB PROJECTS\Offerup\backend\.local\api-output.log' -Tail 20
```

The initial marketplace is empty. Post your own listing to try it; browser tests use a separate temporary database, so test accounts/items are not seeded into the marketplace.

## Native app

```powershell
cd 'C:\Users\eyoba\Documents\WEB PROJECTS\Offerup\app'
npm.cmd ci
npm.cmd start
```

- Android emulator: the default API URL is `http://10.0.2.2:4100`. Use Expo Go compatible with SDK 58, or a development build.
- If the emulator cannot reach that address, start the backend and an Android emulator, then run `npm.cmd run android:local` in `app`. This helper forwards API port 4100 and Metro port 8082 over ADB and uses `http://127.0.0.1:4100` inside the device. It also works with one connected USB Android device. With multiple devices, set `OFFERME_ANDROID_SERIAL`. Stop another Metro server on 8082 before using it.
- iOS simulator: the default API URL is `http://127.0.0.1:4100`; running an iOS simulator requires macOS.
- Physical device: set `EXPO_PUBLIC_API_URL` in `app/.env` to your computer's LAN URL, and bind the backend using `HOST=0.0.0.0` on a trusted development network. The computer and phone must be able to reach each other. Production uses HTTPS.
- Native sessions use Better Auth's Expo client and SecureStore. Images are selected with the system image picker.
- Language is selected in Account. English, Amharic and Afaan Oromo are available for core marketplace labels and flows; see the plan for remaining translation work.
- Meetup date/time entry is explicitly Addis Ababa time (UTC+3).

See the environment examples in each project. Do not put SMS tokens or backend secrets in `EXPO_PUBLIC_*` or `NEXT_PUBLIC_*` variables.

## Verification

Backend:

```powershell
npm.cmd run typecheck
npm.cmd test
npm.cmd run build
```

Website:

```powershell
npm.cmd run typecheck
npm.cmd run build
npx.cmd playwright install chromium
npm.cmd run test:e2e
```

Browser tests require the local PostgreSQL instance. They start a separate API on 4101 and website on 3101, create a temporary database, use a test-only OTP capture, and drop that database during teardown. Port 4102 is a localhost-only test cleanup control protected by a random token. These test controls are not part of the normal API entry point. Do not run multiple browser suites concurrently.

App:

```powershell
npx.cmd expo install --check
npm.cmd run check:jsx
npm.cmd run typecheck
npm.cmd run export
```

`check:jsx` catches bare text inside native layout components, which TypeScript accepts but React Native rejects at runtime.

Expo export checks Android and iOS bundling; it does not produce an installable signed APK/IPA or prove physical-device behavior.

Stop the local database with `npm.cmd run db:stop` from `backend` when finished. Stop development servers in their terminals first.

## Implemented flows and remaining work

Both clients support discovery/filters, phone sign-in, photo posting/editing, saved listings, profile names, listing lifecycle management, listing-linked chat, offers, meetup coordination, reports and blocking. The website also has an administrator moderation view. Messages use authenticated socket invalidation plus polling, and retries reuse a message identifier to prevent duplicates.

This is a locally tested development build, not a production release. Reviews/reputation, push notifications, saved searches, full localization review, generated API response contracts, production object storage, PostGIS proximity queries, signed mobile builds and production operations remain. Listing drafts are not yet persisted across app restarts. Production SMS has not been verified.

Production requires a configured database, authentication secret, SMS provider and origins. Run migrations before production startup. Configure `TRUSTED_PROXY_IPS` only for actual reverse proxies, with the origin isolated from untrusted forwarding hops. The API overwrites its internal client-IP header using the socket/trusted-proxy result.

The October 30 Expo dependency audit reported advisories in transitive development tooling (`deepmerge` and Expo CLI's Zod 3 dependency). The suggested automated fix would downgrade Expo across major versions; this has not been applied. Track compatible upstream fixes before release. The unused native OpenAPI generator dependency was removed because its TypeScript 5 peer requirement conflicts with Expo's TypeScript 6 recommendation. Native response types currently live independently in `app/types.ts`.

The detailed status and roadmap are in [OFFERUP_ETHIOPIA_IMPLEMENTATION_PLAN.md](./OFFERUP_ETHIOPIA_IMPLEMENTATION_PLAN.md).
