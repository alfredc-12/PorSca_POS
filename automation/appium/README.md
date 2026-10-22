# Android/Appium smoke seam

This is the formal native Android frontend automation seam. It is deliberately not part of the per-PR `npm run verify` gate while the device lab and Expo build quota are limited. The installed app build must point at the backend under test. A staging/formal run uses the preview build and starts only after the documented [preview gate](../../docs/WORKFLOW.md#previewstaging-build-gate) is green. A Development run uses an installed development (dev-client) build served by Metro with the [local Laravel API](../../docs/SETUP.md#run-laravel-locally-for-mobile-development); no preview gate applies to it.

## Run exactly

### Environment matrix

Both environments run the same Appium smoke suite, fixture variables, and assertions. Only the backend-specific values below change:

| Value | Development | Staging |
| --- | --- | --- |
| App build | Development (dev-client) build | Preview build |
| Build API URL | LAN URL of the development API | Stable staging API URL |
| `APPIUM_LOGIN_EMAIL` / `APPIUM_LOGIN_PASSWORD` | Active development ADMIN account | Active staging admin account for the full suite; cashier is sufficient for cashier-only smoke cases |
| `APPIUM_QR_EXPECTED_STATUS` | `pending` for the keyless local API; its automatic 2.5 s poll can advance the attempt to `unknown`, rendered as `Payment interrupted` | `paid` for the approved sandbox success flow; the matching value for other approved outcomes |
| `APPIUM_DEV_SERVER_URL` | Set to Metro LAN URL (for example `http://192.168.100.84:8081`) | Unset |

Everything else remains identical: Appium smoke suite, device setup, fixture variables and values, and assertions. The fixture data must be prepared on the backend under test; defaults below reflect the shared `qa-baseline-2026-10` catalog seed.

From a freshly rebuilt contract-v3-compatible Android APK/install (with `expo-secure-store`) and the recorded backend fixture, connect an Android emulator/device and install the UiAutomator2 driver. Set `APPIUM_LOGIN_EMAIL` and `APPIUM_LOGIN_PASSWORD` in your private shell environment for an active cashier/admin account on the backend under test; do not commit or copy them into logs or QA records. The seam signs in after each app reset before checking the POS. Then run the block for the backend under test.

Development (dev-client build, local API, Metro running):

```bash
cd automation/appium
npm ci
APPIUM_RUN=true \
APPIUM_DEVICE_NAME="<connected Android device or emulator>" \
APPIUM_APP_PACKAGE=com.porsca.pos \
APPIUM_DEV_SERVER_URL="http://<Metro LAN IP>:8081" \
APPIUM_PRODUCT_SEARCH="Sinandomeng Rice" \
APPIUM_PRODUCT_TEXT="Sinandomeng Rice 5kg" \
APPIUM_BARCODE_FIXTURE=4800000000019 \
APPIUM_CASH_AMOUNT=400 \
APPIUM_STOCK_SEARCH="Sinandomeng Rice" \
APPIUM_STOCK_ATTEMPTS=25 \
APPIUM_QR_EXPECTED_STATUS=pending \
npm run smoke
```

Staging (preview build against the stable staging API):

```bash
cd automation/appium
npm ci
APPIUM_RUN=true \
APPIUM_DEVICE_NAME="<connected Android device or emulator>" \
APPIUM_APP_PACKAGE=com.porsca.pos \
APPIUM_PRODUCT_SEARCH="Sinandomeng Rice" \
APPIUM_PRODUCT_TEXT="Sinandomeng Rice 5kg" \
APPIUM_BARCODE_FIXTURE=4800000000019 \
APPIUM_CASH_AMOUNT=400 \
APPIUM_STOCK_SEARCH="Sinandomeng Rice" \
APPIUM_STOCK_ATTEMPTS=25 \
APPIUM_QR_EXPECTED_STATUS=paid \
npm run smoke
```

`APPIUM_PRODUCT_SEARCH`, `APPIUM_PRODUCT_TEXT`, `APPIUM_BARCODE_FIXTURE`, and `APPIUM_CASH_AMOUNT` may be changed together for a different backend fixture. The defaults match the Laravel `qa-baseline-2026-10` seed. Its printable product labels are aligned as follows:

| Product | Barcode (EAN-13) |
| --- | --- |
| Sinandomeng Rice 5kg | `4800000000019` |
| Barako Coffee 250g | `4800000000026` |
| Laundry Soap 500g | `4800000000033` |
| Mineral Water 1L | `4800000000040` |

`9999999999994` remains an unknown barcode and must not be added to the catalog. `APPIUM_RESET_APP` defaults to `true`; set it to `false` only when deliberately continuing a device run. `APPIUM_STOCK_TIMEOUT_MS` bounds the insufficient-stock case, whose wall time grows with the recorded stock (default `240000`, above the shared 120 s case timeout). Appium clears the app between cases, but it does not reset the backend database; the human owner must prepare and preserve its recorded API baseline.

The Development block sets `APPIUM_DEV_SERVER_URL` to the Metro LAN origin, which the staging block leaves unset for the standalone preview build. A reset launch of a dev-client build lands on the Expo development launcher, which never reopens the remembered server on its own, so after the configured wait the seam opens that server through the dev-client deep link and closes the developer-menu panel that covers the app; `APPIUM_DEV_SERVER_LAUNCH_TIMEOUT_MS` bounds that launch (default `90000`). With the variable unset, no dev server is opened; if neither the login nor the signed-in POS is visible after the first-paint wait, the seam fails fast with `Neither login nor the signed-in POS became available.` before any case body runs.

The physical-label case in `test/smoke.e2e.ts` opens the native camera and waits for a human to present the printed label whose value is `APPIUM_BARCODE_FIXTURE`. The reset grants the Android camera permission itself, so the system dialog never covers the case; Appium cannot synthesize a camera image, so a human still holds the label. The test then asserts the product name, successful cash receipt, and history text through native UI only.

The focused specs in `test/` share session, locator, scrolling, and fixture helpers from `test/support/` and run under the same existing `APPIUM_*` environment contract:

- `cart-totals.e2e.ts` checks line totals, subtotal, and total after quantity increment/decrement;
- `inventory-admin.e2e.ts` checks admin product controls and changes/restores the selected fixture's stock;
- `stock-deduction.e2e.ts` checks exactly one unit is deducted after repeated cash confirmation and no deduction after insufficient cash;
- `checkout-recovery.e2e.ts` restarts the Android process without clearing app data and checks the retained QR attempt is recovered without an unsafe new tender. A provider-confirmed `paid` outcome is terminal and ends at its receipt instead;
- `history-filters.e2e.ts` filters a newly recorded cash receipt by tender and searches for its receipt ID; and
- `barcode-fixture.e2e.ts` types `APPIUM_BARCODE_FIXTURE` into POS search to exercise deterministic exact-barcode lookup without camera input. It does not claim native camera/decoder coverage; the human-held physical-label case remains in `smoke.e2e.ts`.

The shared setup signs in after app reset, handles the optional development-client launcher, and grants camera access. `APPIUM_RESET_APP` clears the app between cases but does not reset the backend. Cash-sale cases and the recovery case create backend records; prepare the approved API fixture before a run and use the recorded QA procedure to reconcile/reset data between runs. Leaving a pending/unknown QR attempt does not cancel or resolve it, and it must not be replaced by another payment until Laravel confirms a terminal non-payable outcome. WDIO runs `checkout-recovery.e2e.ts` last because a pending attempt is intentionally retained rather than unsafely cancelled.

The smoke cases retained in `test/smoke.e2e.ts` cover search → cash checkout, the physical barcode scan → cash checkout, insufficient-stock and insufficient-cash rejection, successful cash history, and one visible history row after repeated cash confirmation. QR Ph status and restart recovery are covered by `checkout-recovery.e2e.ts`. Server-side inventory exactness across a retry/duplicate is also covered by the API `Idempotency-Key` contract and mobile provider tests.

`APPIUM_QR_EXPECTED_STATUS` accepts `pending` for the stable no-credential fixture on the backend under test, or `paid`, `paid_unfulfilled`, `unknown`, `failed`, `cancelled`, or `expired` when the approved sandbox flow supplies that result; any other value fails fast at module load. The keyless Development fixture starts at `pending`, but the checkout's automatic 2500 ms poll can move that same attempt to `unknown`, which renders `Payment interrupted`; recovery accepts either unresolved state and asserts the locked tender rather than an exact status string. For non-`paid` outcomes the test leaves the payment and asserts the return to the POS with the cart kept; for `pending`, `unknown`, and `paid_unfulfilled` it additionally asserts that the tender stays locked (no new payment is offered, cash tendering is disabled). The test never simulates a provider result in the mobile app.

Separately record native session restart/restoration, sign-out, expired/revoked-token redirect, and admin-versus-cashier inventory controls in the QA cycle. Fast Jest/RNTL tests cover these boundaries without claiming native secure-storage/device execution.

The duplicate-confirmation assertion confirms a single history row; server inventory exactness across a retry/duplicate is backed by the API `Idempotency-Key` contract and the mobile provider test. Capture Appium screenshots/video/logs as cycle evidence; keep large raw files in artifact storage rather than source control.

Backend automation is owned by the API track. Run and link its Postman/Newman collection from `niks0501/PorSca_POS_API`; do not duplicate that collection here. Record its exact collection/API commit in the shared QA cycle record.
