# PorSca POS

## What this is

PorSca POS is a phone app for a small shop. A cashier can search or scan a product, take cash or QR Ph payment, and track stock and sales.

QR Ph checkout is routed through the Laravel API. The app receives only a transaction QR/payment status; provider credentials stay on Laravel and are never part of Expo configuration.

## What you need first

- Node.js 20 LTS or newer
- npm
- Expo Go on a phone, or Android Studio with an emulator
- Git

## Development environment

The development profile connects to a Laravel API running on your computer. Use Expo Go for a quick local session; use an EAS development build when you need the installed development app. For a physical phone, use your computer's LAN IP and keep both devices on the same network. Never use `localhost` on a phone.

### Build and install the development app

Build the Android development app yourself, or install an APK shared by a teammate. EAS internal Android builds produce an installable APK. The development profile's API URL in `eas.json` is only an example; set it to your computer's LAN address when creating your build. A build already made by a teammate has that teammate's URL baked in, so rebuild it to use your own API.

1. Install EAS CLI:

   ```bash
   npm install --global eas-cli
   ```

   Success: `eas --version` prints the installed version. Sign in to your Expo account if prompted.

2. From the mobile project directory, start a development Android build:

   ```bash
   eas build --profile development --platform android
   ```

   Success: EAS finishes the build and provides a link to the APK. Before building, set the development profile's `EXPO_PUBLIC_API_URL` to `http://<computer-LAN-IP>:8000/api/v1` (no trailing slash) in your local build configuration. Use no real secrets; public variables are bundled into the app.

3. Install the APK on the Android device. Open the EAS build link on the device and follow the install prompt, or download the APK and install it using Android's package installer. For a teammate's APK, use the shared build link or file in the same way. Allow installation when Android asks, if needed.

   Success: PorSca POS appears in the app list and opens as a development build.

4. Start the JavaScript development server in the mobile project directory:

   ```bash
   npm run start
   ```

   Success: Expo reports that the server is ready. Keep it running and connect the development app to this server on the same network.

5. Confirm the configured API URL uses your computer's LAN IP, not `localhost`. With a teammate-shared APK, its API URL cannot be changed after installation: ask for a rebuild using your LAN address, or build your own APK.

   Success: `GET http://<computer-LAN-IP>:8000/health` returns successfully, and the app loads products from the API. A health response plus a product load proves the backend connection; seeded in-memory data alone does not.

1. Install packages and create your local environment file:

   ```bash
   npm install
   cp .env.example .env
   ```

   Success: dependencies install and `.env` exists. Set these variables (the API URL ends in `/api/v1`, with no trailing slash):

   ```env
   EXPO_PUBLIC_API_URL=http://<computer-LAN-IP>:8000/api/v1
   EXPO_PUBLIC_API_TOKEN=<local-api-token-if-required>
   ```

   The token is needed only when the local API uses bearer auth. Expo public variables are bundled into the app: use no real secrets and never put provider credentials here.

2. Start the local API in a separate checkout using [docs/SETUP.md](docs/SETUP.md). Start it with the documented `php artisan serve --host=0.0.0.0 --port=8000` command. Success: the API is listening on port 8000 and `GET http://<computer-LAN-IP>:8000/health` responds successfully. From a phone, use the same LAN address in `.env`.

3. Start Expo:

   ```bash
   npm run start
   ```

   Success: Expo shows a QR code. Open it with Expo Go, or use an installed EAS development build. The development EAS profile is an internal build with a developer-LAN API URL example in `eas.json`; replace that address for your network. The profile does not set an API token, so configure `EXPO_PUBLIC_API_TOKEN` when the API requires it.

4. Confirm the app can reach the backend by checking the health endpoint and then loading products in the app. If the API is unavailable, the app can use seeded in-memory data; that does not prove the backend connection works.

5. Run the local checks:

   ```bash
   npm run verify
   ```

   Success: lint, TypeScript, and the fast Jest/RNTL tests all pass.

## Build and API pairing

Use the development app with the `development` API branch for daily integration, and the preview app with the `staging` API branch for formal testing. Mixing app builds and API branches makes failures ambiguous because the app configuration and API changes may not match.

## Staging environment

The EAS `preview` profile is the internal staging/SQA build. It points at the stable staging API origin configured in `eas.json` and is built manually only after every check in the [preview gate](docs/WORKFLOW.md#previewstaging-build-gate) is green. Follow that gate before running:

```bash
eas build --profile preview --platform android
```

Success: EAS completes the internal preview build. Install it on the test device. The preview profile sets `EXPO_PUBLIC_APP_ENV=staging` and `EXPO_PUBLIC_API_URL` to the configured staging base, including `/api/v1` and with no trailing slash. Set `EXPO_PUBLIC_API_TOKEN` through the approved build environment if staging requires bearer auth; never commit or document a real token. Do not replace the configured staging origin with a phone's `localhost` address.

Prove the staging connection by requesting `<staging-api-origin>/health` and confirming a successful response, then load products in the installed app. A successful health response and product load show the app is reaching Laravel, not just its in-memory fallback.

The `production` profile is reserved for a separately approved production configuration. It sets only `EXPO_PUBLIC_APP_ENV=production`; production hosting, API URL, and credentials are not defined here.

## Run the local Laravel API

Use an isolated API checkout under `/tmp`, never a shared staging checkout or this mobile worktree. Follow the complete pairing procedure in [docs/SETUP.md](docs/SETUP.md). The local API uses synthetic data and does not require real provider credentials.

```bash
cd /tmp/porsca-pos-api-staging
git fetch origin
git checkout staging
git reset --hard origin/staging
composer install
cp .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed --force
php artisan serve --host=0.0.0.0 --port=8000
```

Point the mobile `.env` at `http://<computer-LAN-IP>:8000/api/v1` and provide only the local API bearer token when enabled. A local QR creation without provider keys remains pending; paid, failed, cancelled, and expired results require the API's sandbox fixture or verified webhook flow.

## Check it works

Run `npm run verify`, then search for a seeded product, add it, choose Cash, enter an amount, and confirm. A successful Laravel sale appears in Transactions and stock is refreshed from Laravel.

## Learn more

- [Local setup](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Mobile/API contract](docs/API-CONTRACT.md)
- [Development and QA workflow](docs/WORKFLOW.md)
- [Android/Appium smoke scaffold](automation/appium/README.md)
- [Approved design](DESIGN.md)
- [Cashier product flow](PRODUCT.md)
