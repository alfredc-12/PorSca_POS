# Mobile/API contract

**Contract version for this round: `porsca-mobile-api-v1`.** The mobile app uses the single client in [`src/api/client.ts`](../src/api/client.ts). Do not add `fetch` calls to screens or context modules. A Laravel API (`niks0501/PorSca_POS_API`) is the sole backend for staging and release; the Express directory in this repository is only a deprecated local scaffold until Laravel parity is accepted.

## Configuration

`EXPO_PUBLIC_API_URL` is the Laravel API base, including `/api/v1` and without a trailing slash. It is public configuration and is bundled into the app. It must never contain an API token or PayMongo key. Use a computer LAN IP for a physical phone (`http://192.168.1.100:8000/api/v1`) and never `localhost` on a phone. The preview profile uses the stable staging API base.

Protected local/staging requests use `EXPO_PUBLIC_API_TOKEN` when the environment provides one; `src/api/client.ts` sends it as a Bearer token. Never commit a real staging or production token, and never put PayMongo credentials in any mobile environment variable.

## Resource boundary

The client sends `X-PorSca-Contract-Version: porsca-mobile-api-v1` and expects JSON. Laravel Resource responses may be wrapped in `{ "data": ... }`; the client unwraps that envelope. Authorized routes also receive `Authorization: Bearer <local-or-staging-token>` when `EXPO_PUBLIC_API_TOKEN` is configured; PayMongo/provider secrets never belong in the mobile bundle. Error responses should be `{ "error": "...", "details": ... }` or `{ "message": "..." }` with an appropriate HTTP status.

| Capability | Method | Path | Client method |
| --- | --- | --- | --- |
| Health | GET | `/health` | `health()` |
| Products | GET/POST | `/products` | `listProducts()` / `createProduct()` |
| Product | GET/PATCH | `/products/:id` | `getProduct()` / `updateProduct()` |
| Barcode lookup | GET | `/products/barcode/:barcode` | `getProductByBarcode()` (404 when unknown) |
| Product stock | PATCH | `/products/:id/stock` | `updateInventory()` (the `/inventory/:id` alias is also supported) |
| Inventory | GET | `/inventory` | `listInventory()` |
| Sale | POST | `/sales/checkout` | `createSale()` |
| Completed sales | GET | `/sales` | `listSales()` |
| Transactions | GET | `/transactions` | `listTransactions()` |
| Transaction | GET | `/transactions/:id` | `getTransaction()` |
| QR Ph payment | POST | `/payments` | `createQrPhPayment()` |
| Payment status | GET | `/payments/:id` | `getPaymentStatus()` |
| Cancel payment | POST | `/payments/:id/status` | `cancelPayment()` |

Laravel product responses are wrapped in `{ data: ... }`. A product has `id`, `sku`, `barcode`, `name`, `category`, `price` (integer PHP centavos on the wire), and a `stock` object containing `quantity`, `reorder_level`, `status`, `low_stock`, and `out_of_stock`. The mobile client normalizes prices to pesos for the existing UI and converts them back to centavos for product writes. Product search is case-insensitive by name; barcode lookup is exact and returns a structured 404 for an unknown barcode. Inventory rows use the same stock state names: `in_stock`, `low_stock`, or `out_of_stock`.

Product create requests contain `name`, `barcode` (8–64 digits), `category`, `price` (non-negative integer centavos), `stock` (non-negative integer), and optional `sku`/`reorder_level`. Product edits use PATCH with any supported subset of those fields. Product stock updates use `stock` and optional `reorder_level`. Duplicate barcodes, invalid price/stock values, and other validation failures return HTTP 422 as `{ error: { code: "validation_error", message, details } }`; the mobile form keeps the entered values so the cashier can correct and retry.

Protected catalog, inventory, product-management, sales, transaction, and payment routes require `Authorization: Bearer <API_TOKEN>`. Local/staging clients may provide that token through their environment; real provider secrets remain server-side and must never be bundled.

Cash sale requests contain `idempotencyKey`, `paymentMethod: "cash"`, `cashReceived`, and line items (`productId`, `quantity`). Money values sent to Laravel are integer PHP centavos (`₱100.00` is `10000`). `total` and line `unitPrice` may be sent for client compatibility, but Laravel ignores them and recomputes authoritative prices and totals. The mobile client sends `POST /sales/checkout` with an `Idempotency-Key` header. A new sale returns the completed sale with `201`; retrying the same key and identical cart/cash returns that sale with `200`. A reused key with a different request returns `409`; insufficient cash returns `422`; insufficient stock returns `409` without creating a sale or changing stock.

Completed cash sales are loaded for the Transactions screen with `GET /sales?per_page=100`. Each sale includes `id`, `status: "completed"`, `payment_method`, `total_amount`, `cash_received`, `change_amount`, `completed_at`, and item price snapshots. The mobile client normalizes the wire amounts to pesos and displays the completed state, payment method, amount received, and change.

QR Ph requests contain `idempotencyKey` and line items (`productId`, `quantity`); Laravel recomputes the amount from current prices. Payment responses contain `id`, `status` (`pending`, `paid`, `failed`, `cancelled`, or `expired`), `amount`, and the provider QR payload when available.

## Safety rules

- PayMongo secret keys, webhook signing secrets, and provider requests stay on Laravel. The mobile bundle only receives a transaction-specific QR or payment status.
- The API must authorize a sale only after a confirmed payment. Failed, cancelled, expired, or pending payments create no sale and change no stock.
- `Idempotency-Key` is required on sale and QR payment requests. A retry of the same key must return the original result rather than create another sale or deduct stock again.
- Backend transaction processing owns the final inventory deduction. The mobile in-memory provider remains a demonstration fallback until Laravel parity is verified.
- API changes require a contract version update and paired mobile/API promotion notes.

Backend automation is owned by the API track. Reference its Postman/Newman contract and report its exact collection/commit in the QA cycle record; do not copy that collection into this repository.
