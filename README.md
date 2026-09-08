# PorSca POS

## What this is

PorSca POS is a phone app for a small shop. A cashier can search or scan a product, take cash or QR Ph payment, and track stock and sales.

QR Ph checkout is routed through the Laravel API. The app receives only a transaction QR/payment status; provider credentials stay on Laravel and are never part of Expo configuration.

## What you need first

- Node.js 20 LTS or newer
- npm
- Expo Go on a phone, or Android Studio with an emulator
- Git

## Run the mobile app

1. Install the app packages:

   ```bash
   npm install
   ```

2. Create the local settings file:

   ```bash
   cp .env.example .env
   ```

   Set `EXPO_PUBLIC_API_URL` to the Laravel `/api/v1` address. For a phone, use the computer's LAN IP rather than `localhost`.

3. Start Expo:

   ```bash
   npm run start
   ```

   Open the printed QR code in Expo Go, or run `npm run android`, `npm run ios`, or `npm run web`.

4. Run the local checks:

   ```bash
   npm run verify
   ```

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
