# Local setup

## Prerequisites

Install:

- Git
- Node.js 20 LTS or newer
- npm
- A newly built PorSca development app on a physical Android/iOS phone
- An active API-managed admin or cashier account
- Android Studio if you want an Android emulator

No PayMongo key is needed for local practice or for `npm run verify`.

## Run the Expo app

From the repository root:

```bash
npm install
cp .env.example .env
npm run start
```

Open the printed QR code in the new native development build, or run `npm run android` / `npm run ios` with that build installed. `npm run web` is a development-only session with memory-only token storage. Sign in before opening the POS. Then run the canonical gate:

```bash
npm run verify
```

`verify` runs lint, TypeScript, and the fast Jest/React Native Testing Library suite, including login, secure-storage, session-restoration, 401, route-guard, and cashier read-only tests. No device build is needed to run it.

## API URL

The mobile app has one network boundary: `src/api/client.ts`. Set the Laravel `/api/v1` base in the repository-root `.env`:

```env
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000/api/v1
```

For a physical phone, replace the example address with the computer's LAN IP. Keep both devices on the same network. Never use `localhost` on a phone. Sign in with your own account in the app. The returned 30-day Sanctum token is saved in `expo-secure-store` under `porsca.session.v1`, never in `.env`. Startup validates it with `/auth/me` before showing any signed-in route. Every current-session `401` clears it and returns to login. Use Sign out in the tab header before sharing a device. No password, token, or PayMongo/provider secret belongs in an Expo public variable; those variables are included in the client bundle.

The backend is Laravel from `niks0501/PorSca_POS_API`. Its `/api/v1` paths and the contract version are in [API-CONTRACT.md](API-CONTRACT.md). Laravel is the only backend authority; the former embedded Express scaffold has been removed.

## Offline demo catalog

The app does not substitute fake backend data by default. The seeded demo catalog is opt-in:

```env
# Off unless this is exactly 1.
EXPO_PUBLIC_ALLOW_DEMO_CATALOG=1
```

The flag never bypasses sign-in or startup session validation. After signing in, an unreachable API produces an explicit offline state, no seeded products, and no locally recorded sale when the flag is off; the cart stays editable so the cashier can reconnect. When it is on, seeded data may substitute catalog reads only; it cannot record a sale. See [CART-SCANNER-EVIDENCE.md](CART-SCANNER-EVIDENCE.md) for the offline test cases.

## Run Laravel locally for mobile development

Use a separate API checkout on the development branch under `/tmp`, never the release owner's staging checkout or this mobile worktree. Configure its isolated local database and private `ADMIN_EMAIL`/`ADMIN_PASSWORD` after copying `.env` and before seeding, using the [API setup guide](https://github.com/niks0501/PorSca_POS_API/blob/development/docs/SETUP.md). Do not put these credentials in the mobile `.env`:

```bash
cd /tmp/porsca-pos-api-development
git fetch origin
git checkout development
git reset --hard origin/development
composer install
cp .env.example .env # configure the local database and admin account; keep it private
php artisan key:generate
php artisan migrate:fresh --seed --force
php artisan serve --host=0.0.0.0 --port=8000
```

Point `EXPO_PUBLIC_API_URL` at `http://<computer-LAN-IP>:8000/api/v1` for a physical device. The API checkout uses the Laravel development revision and its synthetic seed; do not reset the shared staging database from this procedure. Sign in with the seeded admin account. Staff setup remains API-only: admins create cashier accounts through `/users`, not a phone admin screen. Cashiers see all sales read-only and cannot edit products or stock.

## QR Ph local and staging flow

The checkout screen creates QR Ph payments only through Laravel. Laravel returns the transaction-specific QR payload and the mobile app polls the documented payment status endpoint. Pending, failed, cancelled, expired, and verification-uncertain states keep the cart and stock unchanged; only a Laravel-confirmed paid response triggers the inventory/history refresh.

A local API without provider credentials can create a synthetic pending payment. Do not add provider credentials to this repository or to any `EXPO_PUBLIC_*` variable. Paid sandbox results and webhook verification belong in the isolated Laravel checkout or the approved staging environment.

## Build profiles

The EAS profiles in [`eas.json`](../eas.json) are `development`, `preview`, and `production`. The `development` profile is a true dev-client build pinned to the `development` EAS environment and requires `expo-dev-client`. The linked Expo project and matching slug are configured in [`app.json`](../app.json).

**Native rebuild required for contract v2:** `expo-secure-store` adds a native module/config plugin. Rebuild and install the development app with `eas build --profile development --platform android` (or `eas build --profile development --platform ios` for iOS). An OTA update cannot retrofit this module into an old binary. Preview must likewise be rebuilt with `eas build --profile preview --platform android` only after the preview gate passes. This implementation does not run device builds. See [Environment profiles](WORKFLOW.md#environment-profiles) for staging over-the-air update behavior. Preview is a staging/SQA artifact and may be built only after the [preview gate](WORKFLOW.md#previewstaging-build-gate) is green. Never spend the limited preview quota to test a failed CI, API, migration, seed, or webhook setup.

## Optional Android automation

The formal Appium seam is in [`automation/appium/README.md`](../automation/appium/README.md). It is intentionally not required by every pull request. Backend Postman/Newman automation belongs to the API track and is referenced by the shared QA cycle record rather than copied here.
