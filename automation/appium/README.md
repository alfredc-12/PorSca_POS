# Android/Appium smoke seam

This is the formal native Android frontend automation seam. It is deliberately not part of the per-PR `npm run verify` gate while the device lab and Expo build quota are limited. Run it only after the documented [preview gate](../../docs/WORKFLOW.md#previewstaging-build-gate) is green. The installed preview build must already point at the stable Laravel staging URL.

## Run exactly

From a fresh preview APK/install and the recorded staging seed, connect an Android emulator/device, install the UiAutomator2 driver, and run:

```bash
cd automation/appium
npm ci
APPIUM_RUN=true \
APPIUM_DEVICE_NAME="<connected Android device or emulator>" \
APPIUM_APP_PACKAGE=com.porsca.pos \
APPIUM_PRODUCT_SEARCH="Sinandomeng Rice" \
APPIUM_PRODUCT_TEXT="Sinandomeng Rice 5kg" \
APPIUM_BARCODE_FIXTURE=4800000000010 \
APPIUM_CASH_AMOUNT=400 \
APPIUM_STOCK_SEARCH="Sinandomeng Rice" \
APPIUM_STOCK_ATTEMPTS=25 \
npm run smoke
```

`APPIUM_PRODUCT_SEARCH`, `APPIUM_PRODUCT_TEXT`, `APPIUM_BARCODE_FIXTURE`, and `APPIUM_CASH_AMOUNT` may be changed together for a different staging fixture. The defaults match the Laravel `qa-baseline-2026-02` seed. `APPIUM_RESET_APP` defaults to `true`; set it to `false` only when deliberately continuing a device run. Appium clears the app between cases, but it does not reset the staging database; the human owner must prepare and preserve the recorded API baseline.

For the barcode case, the test opens the native camera and waits for a human to present the physical label/fixture whose value is `APPIUM_BARCODE_FIXTURE`. Appium cannot synthesize a camera image. The test then asserts the product name, successful cash receipt, and history text through native UI only.

The eight specs in `test/smoke.e2e.ts` cover:

- search → cash checkout;
- barcode scan → cash checkout;
- insufficient-stock rejection;
- insufficient-cash rejection;
- QR Ph sandbox success;
- QR Ph failure/cancel with no sale;
- history showing a successful sale; and
- exactly-once inventory deduction when a payment is retried/duplicated.

The last assertion is backed by the API `Idempotency-Key` contract and must compare the inventory delta with the cart quantity. Capture Appium screenshots/video/logs as cycle evidence; keep large raw files in artifact storage rather than source control.

Backend automation is owned by the API track. Run and link its Postman/Newman collection from `niks0501/PorSca_POS_API`; do not duplicate that collection here. Record its exact collection/API commit in the shared QA cycle record.
