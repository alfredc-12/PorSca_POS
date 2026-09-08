# PorSca POS

## What this is

PorSca POS is a phone app for a small shop. A cashier can search or scan a product, take cash or QR Ph payment, and track stock and sales.

QR Ph is in practice mode in this app. You do not need payment keys to run it. The practice button simulates a paid result. Real payment keys stay on the server.

## What you need first

- Node.js 20 LTS or newer
- npm
- Expo Go on a phone, or Android Studio with an emulator
- Git

## Run it

1. Install the app packages:

   ```bash
   npm install
   ```

   Success looks like an npm install with no error.

2. Create the local settings file:

   ```bash
   cp .env.example .env
   ```

   Success looks like a new `.env` file. Its example address is for a computer on your LAN.

3. Start Expo:

   ```bash
   npm run start
   ```

   Success looks like an Expo QR code and a local development server.

4. Open the app. Scan the Expo QR code with Expo Go, or use one of these commands:

   ```bash
   npm run android
   npm run ios
   npm run web
   ```

   Success looks like the POS screen with the seeded products.

5. Run the local checks:

   ```bash
   npm run verify
   ```

   Success looks like lint, typecheck, and fast tests all passing.

## Run both together

Use two terminals. Start the API first.

Terminal 1, from the repository root:

```bash
cd server
npm install
cp .env.example .env
npm run dev
```

Success looks like `PorSca POS API listening` in the terminal. Payment keys are optional for local practice.

Terminal 2, from the repository root:

```bash
cp .env.example .env
npm run start
```

Before opening the app on a real phone, change `EXPO_PUBLIC_API_URL` in `.env` to the computer's network address, such as `http://192.168.1.100:4000`. Keep the phone and computer on the same network. Never use `localhost` on a real phone. Success looks like the app opens and the seeded POS flow is available. New contributors can use the QR Ph practice mode without any keys.

## Check it works

Run:

```bash
npm run verify
```

Then, in the app, search for `Coca-Cola`, add it, choose Cash, enter `100`, and confirm. Success looks like a completed receipt in Transactions and stock reduced by one.

## If something goes wrong

- **`npm install` fails:** use Node.js 20 LTS or newer, then run `npm install` again. Success is an install with no error.
- **The phone cannot reach the API:** run `npm run dev` in `server`, use the computer's LAN IP in `.env`, and keep both devices on the same network. Success is the API listening and the app loading.
- **The camera does not scan:** allow camera access, then open Scanner again. Success is the live scan frame.
- **QR Ph asks for keys:** use `Start QR Ph Sandbox Flow` and choose the practice result. No keys are needed for local practice.

## Learn more

- [Local setup](docs/SETUP.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Mobile/API contract](docs/API-CONTRACT.md)
- [Development and QA workflow](docs/WORKFLOW.md)
- [Android/Appium smoke scaffold](automation/appium/README.md)
- [Approved design](DESIGN.md)
- [Cashier product flow](PRODUCT.md)
