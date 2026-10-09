# Mobile/API contract

**Development checkout contract: `porsca-mobile-api-v3` (not yet promoted to staging).** The mobile app uses the single client in [`src/api/client.ts`](../src/api/client.ts). Do not add `fetch` calls to screens or context modules. A Laravel API (`niks0501/PorSca_POS_API`) is the sole backend for local development, staging, and release. The embedded Express scaffold has been retired after Laravel payment parity was verified.

## Configuration

`EXPO_PUBLIC_API_URL` is the Laravel API base, including `/api/v1` and without a trailing slash. It is public configuration and is bundled into the app. It must never contain an API token or PayMongo key. Use a computer LAN IP for a physical phone (`http://192.168.1.100:8000/api/v1`) and never `localhost` on a phone. The preview profile uses the stable staging API base configured in [`eas.json`](../eas.json).

Users sign in with their own email and password. `AuthProvider` obtains a Sanctum token from `POST /auth/login`, saves only the token in native `expo-secure-store` under `porsca.session.v1`, and supplies it at runtime through `ApiClient.setToken()`. No shared token or password is bundled or stored in public Expo configuration. Use HTTPS for staging/release login; LAN HTTP is for isolated development only. Web development keeps the token in memory only and requires login after a page reload.

## Resource boundary

The client sends `X-PorSca-Contract-Version: porsca-mobile-api-v3` and expects JSON. Laravel Resource responses may be wrapped in `{ "data": ... }`; the client unwraps that envelope. Protected routes receive `Authorization: Bearer <session-token>` from the runtime token setter. Error responses should be `{ "error": "...", "details": ... }`, `{ "error": { "code": "...", "message": "...", "details": ... } }`, or `{ "message": "..." }` with an appropriate HTTP status. Paths below are relative to `/api/v1`; the contract version is v3 but the URL prefix remains `/api/v1`.

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
| Durable purchase | GET/POST | `/checkouts` | `listCheckouts()` / `createCheckout()` |
| Completed sales | GET | `/sales` | `listSales()` |
| Transactions | GET | `/transactions` | `listTransactions()` |
| Transaction | GET | `/transactions/:id` | `getTransaction()` |
| Checkout session | GET | `/checkout-session` | `checkoutSession()` |
| Stored checkout | GET | `/checkouts/:id` | `getCheckout()` |
| Recovery / quote / abandonment | POST | `/checkouts/:id/recover`, `/revalidate`, `/abandon` | `recoverCheckout()` / `revalidateCheckout()` / `abandonCheckout()` |
| Cash receipt | POST | `/checkouts/:id/cash` | `checkoutCash()` |
| QR attempts | GET/POST | `/checkouts/:id/attempts` | `listCheckoutAttempts()` / `createCheckoutAttempt()` |
| Attempt / hold | GET | `/checkouts/:id/attempts/:attempt`, `/reservation` | `getCheckoutAttempt()` / `checkoutReservation()` |
| Provider verification | POST | `/checkouts/:id/attempts/:attempt/refresh` | `refreshCheckoutAttempt()` |
| Admin simulation capability | POST | `/checkouts/:id/attempts/:attempt/simulation-capability` | `checkoutSimulationCapability()` |
| Admin reconciliation reads | GET | `/reconciliation-cases`, `/reconciliation-cases/:id` | `listReconciliationCases()` / `getReconciliationCase()` |

Laravel product responses are wrapped in `{ data: ... }`. A product has `id`, `sku`, `barcode`, `name`, `category`, `price` (integer PHP centavos on the wire), and a `stock` object containing `quantity`, `reorder_level`, `status`, `low_stock`, and `out_of_stock`. The mobile client normalizes prices to pesos for the existing UI and converts them back to centavos for product writes. Product search is case-insensitive by name; barcode lookup is exact and returns a structured 404 for an unknown barcode. Inventory rows use the same stock state names: `in_stock`, `low_stock`, or `out_of_stock`.

Product create requests contain `name`, `barcode` (8–64 digits), `category`, `price` (non-negative integer centavos), `stock` (non-negative integer), and optional `sku`/`reorder_level`. Product edits use PATCH with any supported subset of those fields. Product stock updates use `stock` and optional `reorder_level`. Duplicate barcodes, invalid price/stock values, and other validation failures return HTTP 422 as `{ error: { code: "validation_error", message, details } }`; the mobile form keeps the entered values so the admin can correct and retry.

### Authentication and roles

Login sends `{ email, password, device_name: "PorSca POS" }` without an Authorization header. Success is `{ data: { token, token_type: "Bearer", user: { id, name, email, role, is_active } } }`. Invalid credentials or an inactive account return `401`; validation errors return `422`; throttled attempts return `429`. There is no public registration.

`GET /auth/me` returns `{ data: { user: { id, name, email, role, is_active } } }`. Native startup loads the saved token and validates it with `me()` before opening protected routes; it never trusts a cached role. A transport failure leaves the saved token available for explicit retry but keeps the POS closed. `POST /auth/logout` revokes the current token and returns `204` with no body. The app clears local session/cart/payment state immediately even if revocation cannot reach the API; in that case the server token remains valid until revocation or expiry.

Sanctum tokens expire after **30 days** by default (`43200` minutes). Every current-session `401`, even outside auth endpoints or without JSON, clears the runtime token and saved token and returns the app to login. A late `401` from a previous session cannot clear a newer login. A `403` is a permission denial, not automatic logout.

Both active roles (`admin`, `cashier`) can read catalog/inventory, create cash sales and QR payments, refresh payments, and read **all sales/transactions**. Cashier history is read-only and not scoped per cashier. Only admins may create/edit products or change stock. The mobile app hides product write controls and protects the product-form route for cashiers; Laravel role middleware remains the security authority even if someone calls those endpoints directly.

Cashier account management is available from the admin-only phone Users screen. All user routes require an active authenticated admin; Laravel's `role:admin` middleware is the security authority, while navigation and route guards only hide the screen from cashiers. `GET /users` returns `{ data: { items: [{ id, name, email, role, is_active, created_at }] } }`. `POST /users` accepts `{ name, email, password }`, requires a unique valid email and an 8–255 character password, forces `role: cashier` and `is_active: true`, and returns `201 { data: { user } }`. `PATCH /users/:id` accepts supported partial fields `name`, `email`, `password`, and `is_active` and returns `{ data: { user } }`; setting `is_active: true` reactivates an account, while setting it false also revokes its tokens. `POST /users/:id/deactivate` has no request body, sets the account inactive, revokes its tokens, and returns `204` with no body. The screen asks for explicit confirmation before deactivation and offers reactivation through the supported PATCH update. Roles and permissions are not editable from the phone. These shapes were confirmed against the API development implementation at [`335eb36447f8997f43485d6c7d44583acdf9334a`](https://github.com/niks0501/PorSca_POS_API/tree/335eb36447f8997f43485d6c7d44583acdf9334a) and its `UserManagementTest` feature tests.

The API admin seed uses private `ADMIN_EMAIL`/`ADMIN_PASSWORD` configuration; no account credentials belong in this repository.

The paired RBAC API implementation was inspected on development at `335eb36447f8997f43485d6c7d44583acdf9334a`. Catalog/auth/history retain their v2 shapes. Checkout requires the matching durable authority v3 revision. This development integration does not promote either repository; exact mobile/API revisions require a separate paired staging PR and human QA approval.

## Durable checkout lifecycle (v3)

The authority resources require the v3 header (409 otherwise). The authoritative backend contract is `PorSca_POS_API/docs/CHECKOUT-CONTRACT.md`; URL prefix remains `/api/v1`. Legacy `createSale`, `createQrPhPayment`, and payment reads remain client compatibility methods only; the POS never uses them for a new purchase.

- Creation: `POST /checkouts` with `{ items: [{ productId, quantity }] }` (positive JSON integers) and an `Idempotency-Key`. Laravel assigns the checkout UUID, authoritative price snapshots, `revision` and `amountCentavos`. A new purchase, even an identical basket, uses a new creation key.
- Cash: `{ revision, acceptedAmountCentavos, cashReceivedCentavos }`. QR: `{ revision, acceptedAmountCentavos }`. Both require stable tender keys, persisted before sending; an uncertain response retains the exact key/payload. Money is integer centavos, bounded to 0–4294967295; the existing UI/catalog peso-number seam converts only at the boundary.
- Cash text uses strict digits with at most two decimal places; blank, signs, exponent, comma and whitespace forms are invalid. Exact and denomination presets fill input only; only explicit cash confirmation asserts physical receipt.
- Quote changes require server revalidation, disclosure of the recovered snapshot, and a subsequent explicit confirmation. Never silently accept a changed amount. A different basket cannot reuse the device's durable purchase: recover the original or safely abandon it first.
- Checkout states: `open`, `payment_unresolved`, `ready_for_attempt`, `completed`, `paid_unfulfilled`, `provider_contradiction`, `abandoned`. Attempt verification states are independently `pending`, `unknown`, `paid`, `non_payable`, `contradiction`. Only a committed `sale` in a completed checkout is sale success.
- `checkoutMachine.ts` owns active UI tender locks, strict cash grammar, and pending-to-unknown verification transitions; the v3 adapter feeds it stored authority observations, not UI claims. Pending/unknown QR blocks Cash. Failed verification becomes reversible unknown; later server pending restores pending. QR/hold expiry never establishes non-payability or permits a new tender. First verified outcome stands; contradictory observations remain in Laravel, lock tender, and expose read-only exception markers. No local paid control or provider-outcome injection exists.
- Recovery GET/show/recover uses stored truth, not provider I/O. Refresh performs provider verification through Laravel. Opening the POS fetches every unresolved discovery page and resolves each listed checkout with show; operators can recover an interrupted purchase. The device handle (checkout id, creation/tender keys, basket signature) survives restart/sign-out via native SecureStore or browser localStorage, namespaced by API base. It stores no credentials or capability URL. Missing/unavailable authority records surface a recovery error, never a paid result.
- QR completion is retained until authoritative inventory/history reads succeed; sign-out cannot discard the handle. Paid-but-unfulfilled and contradictions remain locked. Abandonment requires an attributed 8–500-character reason, is server-authorized and terminal, and retires the device identity so the next purchase receives a new UUID.
- Admin-only capability and reconciliation reads check the live checkout-session role; Laravel still enforces authorization. Simulation additionally requires explicitly approved staging sandbox eligibility. Capability retrieval never changes payment state; no reconciliation write UI is added.

Completed sales/history retain v2 wire fields (`total_amount`, `cash_received`, `change_amount`, item snapshots), normalized to pesos for the existing Transactions screen.

### Unchanged catalog and cart review behavior

- **Barcode canonicalisation.** iOS reports UPC-A as EAN-13 with a leading zero, so `getProductByBarcode()` tries the EAN-13 leading-zero form of a 12-digit symbol and the 12-digit form of a leading-zero EAN-13 symbol. The second attempt happens only after a `404`. The stored barcode is untouched; the alternates live in the mobile client.
- **Search shape.** A query matching `^\d{8,64}$` is an exact lookup and is sent as `?barcode=`; anything else is sent as `?search=`. The offline filter uses the same predicate and the same name-only matching, so online and offline return the same rows for text and for short numeric queries. Search requests are debounced by 280 ms with one in-flight read per query; a repeated same-query invocation shares that read instead of discarding it.
- **Pre-checkout revalidation.** Before a cart is handed to checkout the client re-reads each line with `GET /products/:id` and compares price and stock with the cart snapshot. A `404` marks that line as no longer in the catalog. Each result carries a cart signature: if the cart changes while the lines are being read (or while the review is open) the client re-reads the cart and never applies a stale review. Laravel remains the pricing authority, and only the durable authority can record a sale.

## Safety rules

- PayMongo secret keys, webhook signing secrets, and provider requests stay on Laravel. The mobile bundle only receives a transaction-specific QR or payment status.
- Laravel validates and records cash sales through the durable checkout cash endpoint. QR Ph creates a sale only after Laravel confirms provider payment; pending, failed, cancelled, expired, and `paid_unfulfilled` QR attempts create no sale or stock change.
- `Idempotency-Key` is required on sale and QR payment requests. A retry of the same key must return the original result rather than create another sale or deduct stock again.
- Backend transaction processing owns the final inventory deduction. The opt-in demo catalog substitutes reads only after sign-in; it never bypasses auth or records a local sale.
- API changes require a contract version update and paired mobile/API promotion notes.

Backend automation is owned by the API track. Reference its Postman/Newman contract and report its exact collection/commit in the QA cycle record; do not copy that collection into this repository.
