# Mobile/API contract

**Contract version for this round: `porsca-mobile-api-v2`.** The mobile app uses the single client in [`src/api/client.ts`](../src/api/client.ts). Do not add `fetch` calls to screens or context modules. A Laravel API (`niks0501/PorSca_POS_API`) is the sole backend for local development, staging, and release. The embedded Express scaffold has been retired after Laravel payment parity was verified.

## Configuration

`EXPO_PUBLIC_API_URL` is the Laravel API base, including `/api/v1` and without a trailing slash. It is public configuration and is bundled into the app. It must never contain an API token or PayMongo key. Use a computer LAN IP for a physical phone (`http://192.168.1.100:8000/api/v1`) and never `localhost` on a phone. The preview profile uses the stable staging API base configured in [`eas.json`](../eas.json).

Users sign in with their own email and password. `AuthProvider` obtains a Sanctum token from `POST /auth/login`, saves only the token in native `expo-secure-store` under `porsca.session.v1`, and supplies it at runtime through `ApiClient.setToken()`. No shared token or password is bundled or stored in public Expo configuration. Use HTTPS for staging/release login; LAN HTTP is for isolated development only. Web development keeps the token in memory only and requires login after a page reload.

## Resource boundary

The client sends `X-PorSca-Contract-Version: porsca-mobile-api-v2` and expects JSON. Laravel Resource responses may be wrapped in `{ "data": ... }`; the client unwraps that envelope. Protected routes receive `Authorization: Bearer <session-token>` from the runtime token setter. Error responses should be `{ "error": "...", "details": ... }`, `{ "error": { "code": "...", "message": "...", "details": ... } }`, or `{ "message": "..." }` with an appropriate HTTP status. Paths below are relative to `/api/v1`; the contract version is v2 but the URL prefix remains `/api/v1`.

| Capability | Method | Path | Client method |
| --- | --- | --- | --- |
| Health (public) | GET | `/health` | `health()` |
| Login (public, rate-limited) | POST | `/auth/login` | `login()` |
| Current user | GET | `/auth/me` | `me()` |
| Logout | POST | `/auth/logout` | `logout()` |
| Admin users | GET/POST | `/users` | `listUsers()` / `createCashier()` |
| Admin user update/deactivate | PATCH/POST | `/users/:id` / `/users/:id/deactivate` | `updateUser()` / `deactivateUser()` |
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
| Payment status (stored read) | GET | `/payments/:id` | `getPaymentStatus()` |
| Payment refresh (provider-verified) | POST | `/payments/:id/refresh` | `refreshPayment()` |

Laravel product responses are wrapped in `{ data: ... }`. A product has `id`, `sku`, `barcode`, `name`, `category`, `price` (integer PHP centavos on the wire), and a `stock` object containing `quantity`, `reorder_level`, `status`, `low_stock`, and `out_of_stock`. The mobile client normalizes prices to pesos for the existing UI and converts them back to centavos for product writes. Product search is case-insensitive by name; barcode lookup is exact and returns a structured 404 for an unknown barcode. Inventory rows use the same stock state names: `in_stock`, `low_stock`, or `out_of_stock`.

Product create requests contain `name`, `barcode` (8–64 digits), `category`, `price` (non-negative integer centavos), `stock` (non-negative integer), and optional `sku`/`reorder_level`. Product edits use PATCH with any supported subset of those fields. Product stock updates use `stock` and optional `reorder_level`. Duplicate barcodes, invalid price/stock values, and other validation failures return HTTP 422 as `{ error: { code: "validation_error", message, details } }`; the mobile form keeps the entered values so the admin can correct and retry.

### Authentication and roles

Login sends `{ email, password, device_name: "PorSca POS" }` without an Authorization header. Success is `{ data: { token, token_type: "Bearer", user: { id, name, email, role, is_active } } }`. Invalid credentials or an inactive account return `401`; validation errors return `422`; throttled attempts return `429`. There is no public registration.

`GET /auth/me` returns `{ data: { user: { id, name, email, role, is_active } } }`. Native startup loads the saved token and validates it with `me()` before opening protected routes; it never trusts a cached role. A transport failure leaves the saved token available for explicit retry but keeps the POS closed. `POST /auth/logout` revokes the current token and returns `204` with no body. The app clears local session/cart/payment state immediately even if revocation cannot reach the API; in that case the server token remains valid until revocation or expiry.

Sanctum tokens expire after **30 days** by default (`43200` minutes). Every current-session `401`, even outside auth endpoints or without JSON, clears the runtime token and saved token and returns the app to login. A late `401` from a previous session cannot clear a newer login. A `403` is a permission denial, not automatic logout.

Both active roles (`admin`, `cashier`) can read catalog/inventory, create cash sales and QR payments, refresh payments, and read **all sales/transactions**. Cashier history is read-only and not scoped per cashier. Only admins may create/edit products or change stock. The mobile app hides product write controls and protects the product-form route for cashiers; Laravel role middleware remains the security authority even if someone calls those endpoints directly.

Cashier account management is available from the admin-only phone Users screen. All user routes require an active authenticated admin; Laravel's `role:admin` middleware is the security authority, while navigation and route guards only hide the screen from cashiers. `GET /users` returns `{ data: { items: [{ id, name, email, role, is_active, created_at }] } }`. `POST /users` accepts `{ name, email, password }`, requires a unique valid email and an 8–255 character password, forces `role: cashier` and `is_active: true`, and returns `201 { data: { user } }`. `PATCH /users/:id` accepts supported partial fields `name`, `email`, `password`, and `is_active` and returns `{ data: { user } }`; setting `is_active: true` reactivates an account, while setting it false also revokes its tokens. `POST /users/:id/deactivate` has no request body, sets the account inactive, revokes its tokens, and returns `204` with no body. The screen asks for explicit confirmation before deactivation and offers reactivation through the supported PATCH update. Roles and permissions are not editable from the phone. These shapes were confirmed against the API development implementation at [`335eb36447f8997f43485d6c7d44583acdf9334a`](https://github.com/niks0501/PorSca_POS_API/tree/335eb36447f8997f43485d6c7d44583acdf9334a) and its `UserManagementTest` feature tests.

The API admin seed uses private `ADMIN_EMAIL`/`ADMIN_PASSWORD` configuration; no account credentials belong in this repository.

The paired RBAC API implementation was inspected on development at `335eb36447f8997f43485d6c7d44583acdf9334a`. Promote compatible mobile/API contract-v2 revisions together; do not pair this client with a shared-token v1 API.

Cash sale requests contain `idempotencyKey`, `paymentMethod: "cash"`, `cashReceived`, and line items (`productId`, `quantity`). Money values sent to Laravel are integer PHP centavos (`₱100.00` is `10000`). `total` and line `unitPrice` may be sent for client compatibility, but Laravel ignores them and recomputes authoritative prices and totals. The mobile client sends `POST /sales/checkout` with an `Idempotency-Key` header. A new sale returns the completed sale with `201`; retrying the same key and identical cart/cash returns that sale with `200`. A reused key with a different request returns `409`; insufficient cash returns `422`; insufficient stock returns `409` without creating a sale or changing stock.

Completed cash sales are loaded for the Transactions screen with `GET /sales?per_page=100`. Each sale includes `id`, `status: "completed"`, `payment_method`, `total_amount`, `cash_received`, `change_amount`, `completed_at`, and item price snapshots. The mobile client normalizes the wire amounts to pesos and displays the completed state, payment method, amount received, and change.

### Mobile client behaviour on these endpoints (no contract change)

- **Barcode canonicalisation.** iOS reports UPC-A as EAN-13 with a leading zero, so `getProductByBarcode()` tries the EAN-13 leading-zero form of a 12-digit symbol and the 12-digit form of a leading-zero EAN-13 symbol. The second attempt happens only after a `404`. The stored barcode is untouched; the alternates live in the mobile client.
- **Search shape.** A query matching `^\d{8,64}$` is an exact lookup and is sent as `?barcode=`; anything else is sent as `?search=`. The offline filter uses the same predicate and the same name-only matching, so online and offline return the same rows for text and for short numeric queries. Search requests are debounced by 280 ms with one in-flight read per query; a repeated same-query invocation shares that read instead of discarding it.
- **Pre-checkout revalidation.** Before a cart is handed to checkout the client re-reads each line with `GET /products/:id` and compares price and stock with the cart snapshot. A `404` marks that line as no longer in the catalog. Each result carries a cart signature: if the cart changes while the lines are being read (or while the review is open) the client re-reads the cart and never applies a stale review. Laravel remains the pricing authority, and `POST /sales/checkout` is still the only way a sale is recorded.
- **Cash retry safety.** An idempotency key is bound to the exact mobile payload, per-line price included. A plain retry after a transport failure reuses the key. If the payload changed after an unacknowledged attempt, the client looks the earlier idempotency key up in `GET /sales` and refuses to send a revised sale until that receipt is resolved. A receipt missing from `GET /sales?per_page=100` is conclusively absent only when the response has a complete first page (`current_page = last_page = 1` and `total` equals the returned item count). Incomplete, missing, or inconsistent pagination leaves the original attempt unresolved; page-1 absence never authorizes a new key on its own.
- **QR sale lifecycle.** After a paid attempt's inventory/history verification succeeds, its basket signature and key are retired so a later identical basket creates a new pending payment. Pending/uncertain retries keep their original key. Failed verification and `paid_unfulfilled` retain the original attempt for recovery or reconciliation.

QR Ph requests contain `idempotencyKey` and line items (`productId`, `quantity`); Laravel recomputes the amount from current prices. Payment responses contain `id`, `status` (`pending`, `paid`, `paid_unfulfilled`, `failed`, `cancelled`, or `expired`), `amount`, the provider QR payload when available, and settlement fields (`failure_reason`, `reservation_expires_at`). `GET /payments/:id` returns the stored state only. `POST /payments/:id/refresh` asks the PayMongo sandbox for the latest verified outcome and settles it server-side; it is never a cancellation. Laravel exposes no cashier cancel action (`cancelled` remains readable for legacy attempts), so the app offers Leave Payment instead of Cancel: leaving keeps the cart and the pending attempt expires server-side. A `paid_unfulfilled` payment received money but could not fulfil stock, so the app refreshes inventory and history, keeps the cart, and offers no new payment until the operator reconciles.

## Safety rules

- PayMongo secret keys, webhook signing secrets, and provider requests stay on Laravel. The mobile bundle only receives a transaction-specific QR or payment status.
- The API must authorize a sale only after a confirmed payment. Failed, cancelled, expired, or pending payments create no sale and change no stock.
- `Idempotency-Key` is required on sale and QR payment requests. A retry of the same key must return the original result rather than create another sale or deduct stock again.
- Backend transaction processing owns the final inventory deduction. The opt-in demo catalog substitutes reads only after sign-in; it never bypasses auth or records a local sale.
- API changes require a contract version update and paired mobile/API promotion notes.

Backend automation is owned by the API track. Reference its Postman/Newman contract and report its exact collection/commit in the QA cycle record; do not copy that collection into this repository.
