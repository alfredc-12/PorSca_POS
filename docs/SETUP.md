# Local setup

## Prerequisites

Install:

- Git
- Node.js 20 LTS or newer
- npm
- Expo Go on a physical Android/iOS phone for quick testing
- Android Studio if you want an Android emulator

No PayMongo key is needed for local practice or for `npm run verify`.

## Run the Expo app

From the repository root:

```bash
npm install
cp .env.example .env
npm run start
```

Open the printed QR code in Expo Go, or run `npm run android`, `npm run ios`, or `npm run web`. Then run the canonical gate:

```bash
npm run verify
```

`verify` runs lint, TypeScript, and the fast Jest/React Native Testing Library suite. The app starts with seeded in-memory data when the API is not reachable. This keeps local checkout practice available while Laravel staging is being prepared.

## API URL

The mobile app has one network boundary: `src/api/client.ts`. Set the Laravel `/api/v1` base in the repository-root `.env`:

```env
EXPO_PUBLIC_APP_ENV=development
EXPO_PUBLIC_API_URL=http://192.168.1.100:8000/api/v1
# Only for a local/staging API configured with bearer auth.
EXPO_PUBLIC_API_TOKEN=local-api-token
```

For a physical phone, replace the example address with the computer's LAN IP. Keep both devices on the same network. Never use `localhost` on a phone. Expo public variables are included in the client bundle, so they must contain configuration only and never secrets.

The release backend is Laravel from `niks0501/PorSca_POS_API`. Its `/api/v1` paths and the contract version are in [API-CONTRACT.md](API-CONTRACT.md). The `server/` directory in this repository is a deprecated local Express scaffold. It remains only so existing checkout demonstrations do not break before Laravel parity is accepted.

## Run the local Express scaffold (optional)

This is not the staging or release backend. Use it only for local health checks and the existing payment-boundary demonstration:

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Success looks like `PorSca POS API listening` in the terminal. The PayMongo secret is optional. If you do use a sandbox key, keep it in `server/.env` only. Never put it in an `EXPO_PUBLIC_*` variable.

## QR Ph practice mode

The checkout screen labels the current QR flow as sandbox/practice mode. `Simulate paid`, `Simulate failed`, and cancel keep provider secrets out of the app and let a new contributor exercise the success and no-sale paths without credentials. The real QR adapter, webhook verification, and final sale authority belong to Laravel.

## Build profiles

The EAS profiles in [`eas.json`](../eas.json) are `development`, `preview`, and `production`. They are not automatic builds. A preview build is a staging/SQA artifact and may be run manually only after the [preview gate](WORKFLOW.md#previewstaging-build-gate) is green. Never spend the limited preview quota to test a failed CI, API, migration, seed, or webhook setup.

## Optional Android automation

The formal Appium seam is in [`automation/appium/README.md`](../automation/appium/README.md). It is intentionally not required by every pull request. Backend Postman/Newman automation belongs to the API track and is referenced by the shared QA cycle record rather than copied here.
