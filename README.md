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

The development profile connects to a Laravel API running on your computer. It is a true dev-client build and requires `expo-dev-client`; use Expo Go for a quick local session or an EAS development build when you need the installed development app. For a physical phone, use your computer's LAN IP and keep both devices on the same network. Never use `localhost` on a phone. See [Build profiles](docs/SETUP.md#build-profiles) for the EAS environment and project link.

### Find your computer's LAN address

Use the address for the Wi-Fi or Ethernet adapter that is on the same network as your phone. Ignore loopback addresses and virtual adapters. Windows PowerShell (built-in NetTCPIP module):

```powershell
Get-NetIPConfiguration
```

Read the IPv4 address under the connected Wi-Fi or Ethernet adapter. In Linux/WSL2, use the host computer's LAN address visible to your phone (not the WSL virtual adapter address); on Linux with NetworkManager:

```bash
hostname -I
```

If WSL2's reported address is not reachable by the phone, find the Windows host LAN IPv4 address using the PowerShell command above.

### Configure local environment

From the repository root, install packages and copy the example environment file. In PowerShell:

```powershell
npm install
Copy-Item .env.example .env
```

In bash (Linux or WSL2):

```bash
npm install
cp .env.example .env
```

Set `EXPO_PUBLIC_API_URL` in `.env` to `http://<computer-LAN-IP>:8000/api/v1` (no trailing slash). The optional `EXPO_PUBLIC_API_TOKEN` is the non-production bearer token configured by the maintainer of the local API. Obtain it from that API maintainer; the mobile app cannot generate or retrieve it. If the local API does not require bearer authentication, omit the variable. Never use a real production secret or provider credential: Expo public variables are bundled into the app.

PowerShell can set the value for the current session (replace the placeholder with the LAN address found above and the optional token supplied by the API maintainer):

```powershell
$env:EXPO_PUBLIC_API_URL = 'http://<computer-LAN-IP>:8000/api/v1'
$env:EXPO_PUBLIC_API_TOKEN = '<local-api-token-if-required>'
```

Bash equivalent:

```bash
export EXPO_PUBLIC_API_URL='http://<computer-LAN-IP>:8000/api/v1'
export EXPO_PUBLIC_API_TOKEN='<local-api-token-if-required>'
```

Alternatively, put those assignments in the local `.env`; do not commit `.env` or real tokens.

### Run the app

Start the local API in a separate checkout using [docs/SETUP.md](docs/SETUP.md). Run the documented `php artisan serve --host=0.0.0.0 --port=8000` command there. Then start Expo from the mobile repository root:

```powershell
npm run start
```

```bash
npm run start
```

Expo shows a QR code. Open it with Expo Go, or use an installed EAS development build. Keep the phone and computer on the same network. To check the API health endpoint, PowerShell uses its built-in web request command:

```powershell
(Invoke-WebRequest -Uri 'http://<computer-LAN-IP>:8000/health').StatusCode
```

Bash uses curl:

```bash
curl --fail --show-error 'http://<computer-LAN-IP>:8000/health'
```

A successful health response and a product load in the app show that it reached the backend; seeded in-memory data alone does not.

### Build and install the development app

Build the Android development app yourself, or install an APK shared by a teammate. EAS internal Android builds produce an installable APK. The development profile's API URL in `eas.json` is only an example; set it to your computer's LAN address when creating your build. A build already made by a teammate has that teammate's URL baked in, so rebuild it to use your own API.

Install EAS CLI (both shells):

```powershell
npm install --global eas-cli
```

```bash
npm install --global eas-cli
```

From the mobile project directory, start a development Android build (both shells):

```powershell
eas build --profile development --platform android
```

```bash
eas build --profile development --platform android
```

Success: EAS finishes the build and provides a link to the APK. Before building, set the development profile's `EXPO_PUBLIC_API_URL` to your LAN-based API URL in your local build configuration. Use no real secrets; public variables are bundled into the app.

Install the APK on the Android device by opening the EAS build link on the device and following the install prompt, or download the APK and install it using Android's package installer. For a teammate's APK, use the shared build link or file in the same way. Allow installation when Android asks, if needed. Success: PorSca POS appears in the app list and opens as a development build.

With a teammate-shared APK, the API URL cannot be changed after installation: ask for a rebuild using your LAN address, or build your own APK. Run the health check above and load products to confirm the backend connection.

### Local checks

Run the canonical checks from the mobile repository root, identically in either shell:

```powershell
npm run verify
```

```bash
npm run verify
```

Success: lint, TypeScript, and the fast Jest/React Native Testing Library tests all pass.

## Build and API pairing

Use the development app with the `development` API branch for daily integration, and the preview app with the `staging` API branch for formal testing. Mixing app builds and API branches makes failures ambiguous because the app configuration and API changes may not match.

## Staging environment

The EAS `preview` profile is the internal staging/SQA build. It points at the stable staging API origin configured in `eas.json` and is built manually only after every check in the [preview gate](docs/WORKFLOW.md#previewstaging-build-gate) is green. Run from the mobile repository root in either shell:

```powershell
eas build --profile preview --platform android
```

```bash
eas build --profile preview --platform android
```

Success: EAS completes the internal preview build. Install it on the test device. The preview profile sets `EXPO_PUBLIC_APP_ENV=staging` and `EXPO_PUBLIC_API_URL` to the configured staging base, including `/api/v1` and with no trailing slash. Set `EXPO_PUBLIC_API_TOKEN` through the approved build environment if staging requires bearer auth; ask the staging API maintainer for access rather than placing credentials in docs. Never commit or document a real token. Do not replace the configured staging origin with a phone's `localhost` address.

Prove the staging connection by requesting `<staging-api-origin>/health` and confirming a successful response, then load products in the installed app. PowerShell request form:

```powershell
(Invoke-WebRequest -Uri '<staging-api-origin>/health').StatusCode
```

Bash request form:

```bash
curl --fail --show-error '<staging-api-origin>/health'
```

A successful health response and product load show the app is reaching Laravel, not just its in-memory fallback.

The `production` profile is reserved for a separately approved production configuration. It sets only `EXPO_PUBLIC_APP_ENV=production`; production hosting, API URL, and credentials are not defined here.

## Run the local Laravel API

Use an isolated API checkout under `/tmp`, never a shared staging checkout or this mobile worktree. Follow the complete pairing procedure in [docs/SETUP.md](docs/SETUP.md). The local API uses synthetic data and does not require real provider credentials. These shell-specific commands run in that separate API checkout.

PowerShell:

```powershell
Set-Location /tmp/porsca-pos-api-staging
git fetch origin
git checkout staging
git reset --hard origin/staging
composer install
Copy-Item .env.example .env
php artisan key:generate
php artisan migrate:fresh --seed --force
php artisan serve --host=0.0.0.0 --port=8000
```

Bash (Linux/WSL2):

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

Run the check in either shell:

```powershell
npm run verify
```

```bash
npm run verify
```

Then search for a seeded product, add it, choose Cash, enter an amount, and confirm. A successful Laravel sale appears in Transactions and stock is refreshed from Laravel.

## Learn more

- [Local setup](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Mobile/API contract](docs/API-CONTRACT.md)
- [Development and QA workflow](docs/WORKFLOW.md)
- [Android/Appium smoke scaffold](automation/appium/README.md)
- [Approved design](DESIGN.md)
- [Cashier product flow](PRODUCT.md)
