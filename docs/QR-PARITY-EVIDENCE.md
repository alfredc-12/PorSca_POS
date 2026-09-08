# QR Ph launch evidence

This record supports the mobile QR Ph launch and retirement of the embedded Express scaffold. Laravel staging revision `6d6abc9bc6be8845fa33ed64b6e01831024ef9f1` was checked through the GitHub API before the local verification run.

## Laravel parity

The isolated checkout at `/tmp/porsca-pos-api-staging` was reset to `origin/staging`, configured with synthetic local data, and run without provider credentials. The former scaffold's capabilities map to Laravel as follows:

| Former capability | Laravel contract and verification |
| --- | --- |
| Health | `GET /api/v1/health` returned a healthy local Laravel response. |
| QR creation | `POST /api/v1/payments` returned `pending`, an amount, and a transaction QR payload. |
| Payment status | `GET /api/v1/payments/:id` returned the payment state. |
| Cancellation/status refresh | `POST /api/v1/payments/:id/status` returned the API-confirmed state. |
| Provider webhook | `POST /api/v1/webhooks/paymongo` verifies the server-side signature and settles through Laravel; the API lifecycle suite covers paid, failed, cancelled, expired, duplicate, invalid-signature, and network-uncertain cases. |

A repeated QR creation request with the same `Idempotency-Key` returned the same payment ID. A local QR fixture without provider credentials remained pending. A local cash checkout completed through `POST /api/v1/sales/checkout`, and the subsequent sales/history and inventory reads showed one sale and one stock decrement.

`composer verify` passed on the paired API checkout: 32 tests, 227 assertions, Pint passed.

## Mobile verification

`npm run verify` passed on this branch:

- Expo lint passed.
- TypeScript passed.
- 9 Jest/RNTL suites passed, 49 tests passed.

The QR suites cover Laravel creation, returned QR payload rendering, pending, paid, failed, cancelled, expired, recoverable verification, concurrent starts, and same-key transport retries. QR success calls the Laravel-backed inventory/history refresh only after a `paid` response; no mobile QR fallback creates a sale.

The Appium seam in [`automation/appium/test/smoke.e2e.ts`](../automation/appium/test/smoke.e2e.ts) starts QR through the Laravel API and asserts a configurable provider result. `pending` is the stable no-credential fixture; `paid`, `failed`, `cancelled`, and `expired` are available when the approved sandbox supplies those outcomes. `npm run typecheck --prefix automation/appium` passed. Device/provider execution remains part of the staging QA gate.

## Secret audit

The mobile build inputs are limited to `EXPO_PUBLIC_APP_ENV`, `EXPO_PUBLIC_API_URL`, and the optional local/staging `EXPO_PUBLIC_API_TOKEN`. No PayMongo secret or webhook secret is present in `.env.example`, `eas.json`, `app.json`, or any `EXPO_PUBLIC_*` setting. The Express directory and its secret-bearing `.env.example` were removed.
