# Local Setup

## Prerequisites

Install:
- Git
- Node.js 20 LTS or newer
- npm
- Expo Go on a physical Android/iOS phone for quick testing
- Android Studio only if you want to use an Android emulator

## Clone and install the Expo app

```bash
git clone https://github.com/alfredc-12/PorSca_POS.git
cd PorSca_POS
npm install
```

Create your local Expo environment file:

```bash
cp .env.example .env
```

On Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

Start Expo:

```bash
npx expo start
```

Useful alternatives:

```bash
npm run android
npm run ios
npm run web
npm run lint
npm run typecheck
```

For a physical phone, keep the computer and phone on the same local network, open Expo Go, and scan the QR code printed by Expo CLI.

## Install and run the backend scaffold

Open a second terminal:

```bash
cd PorSca_POS/server
npm install
cp .env.example .env
npm run dev
```

On Windows PowerShell:

```powershell
cd PorSca_POS/server
npm install
Copy-Item .env.example .env
npm run dev
```

The backend defaults to port `4000`.

Set the Expo app API address in the repository-root `.env`. When testing on a physical phone, do not use `localhost`; use the computer's LAN IP, for example:

```env
EXPO_PUBLIC_API_URL=http://192.168.1.100:4000
```

## PayMongo sandbox

Keep the PayMongo secret key in `server/.env` only:

```env
PAYMONGO_SECRET_KEY=sk_test_your_key_here
```

Never put a secret key in an `EXPO_PUBLIC_*` variable because Expo public variables are included in the client bundle.

The QR Ph backend route is deliberately isolated but not yet wired to a specific PayMongo API contract. Complete that adapter only after the team has sandbox credentials and confirms the current PayMongo QR Ph integration contract.

## After dependency changes

Use Expo's compatibility check:

```bash
npx expo install --check
npx expo-doctor
```

If Expo reports version mismatches, prefer:

```bash
npx expo install --fix
```

rather than manually guessing Expo package versions.
