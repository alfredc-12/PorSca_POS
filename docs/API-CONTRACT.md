# Mobile/API contract

**Contract version for this round: `porsca-mobile-api-v1`.** The mobile app uses the single client in [`src/api/client.ts`](../src/api/client.ts). Do not add `fetch` calls to screens or context modules. A Laravel API (`niks0501/PorSca_POS_API`) is the sole backend for staging and release; the Express directory in this repository is only a deprecated local scaffold until Laravel parity is accepted.

## Configuration

`EXPO_PUBLIC_API_URL` is the API origin, without a trailing slash. It is public configuration and is bundled into the app. It must never contain a PayMongo key. Use a computer LAN IP for a physical phone (`http://192.168.1.100:4000`) and never `localhost` on a phone. The preview profile uses the stable staging API origin.

## Resource boundary

The client sends `X-PorSca-Contract-Version: porsca-mobile-api-v1` and expects JSON. Laravel Resource responses may be wrapped in `{ "data": ... }`; the client unwraps that envelope. Error responses should be `{ "error": "...", "details": ... }` or `{ "message": "..." }` with an appropriate HTTP status.

| Capability | Method | Path | Client method |
| --- | --- | --- | --- |
| Health | GET | `/health` | `health()` |
| Products | GET/POST | `/api/products` | `listProducts()` / `createProduct()` |
| Product | GET/PATCH | `/api/products/:id` | `getProduct()` / `updateProduct()` |
| Inventory | GET | `/api/inventory` | `listInventory()` |
| Inventory stock | PATCH | `/api/inventory/:productId` | `updateInventory()` |
| Sale | POST | `/api/sales` | `createSale()` |
| Transactions | GET | `/api/transactions` | `listTransactions()` |
| Transaction | GET | `/api/transactions/:id` | `getTransaction()` |
| QR Ph payment | POST | `/api/payments/qrph` | `createQrPhPayment()` |
| Payment status | GET | `/api/payments/:id` | `getPaymentStatus()` |
| Cancel payment | POST | `/api/payments/:id/cancel` | `cancelPayment()` |

Product fields are `id`, `barcode`, `name`, `price`, `stock`, and optional `category`. Sale requests contain `idempotencyKey`, line items (`productId`, `quantity`, `unitPrice`), `total`, `paymentMethod`, and optional `paymentId`.

QR Ph requests contain `transactionId`, `amount`, and `idempotencyKey`. Payment responses contain `id`, `status` (`pending`, `paid`, `failed`, `cancelled`, or `expired`), `amount`, and optional `qrCode`/`expiresAt`.

## Safety rules

- PayMongo secret keys, webhook signing secrets, and provider requests stay on Laravel. The mobile bundle only receives a transaction-specific QR or payment status.
- The API must authorize a sale only after a confirmed payment. Failed, cancelled, expired, or pending payments create no sale and change no stock.
- `Idempotency-Key` is required on sale and QR payment requests. A retry of the same key must return the original result rather than create another sale or deduct stock again.
- Backend transaction processing owns the final inventory deduction. The mobile in-memory provider remains a demonstration fallback until Laravel parity is verified.
- API changes require a contract version update and paired mobile/API promotion notes.

Backend automation is owned by the API track. Reference its Postman/Newman contract and report its exact collection/commit in the QA cycle record; do not copy that collection into this repository.
