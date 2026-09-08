# Android/Appium smoke scaffold

This is the formal native Android frontend automation seam. It is deliberately not part of the per-PR `npm run verify` gate while the device lab and Expo build quota are limited. Run it only after the documented [preview gate](../../docs/WORKFLOW.md#previewstaging-build-gate) is green.

## Run

```bash
cd automation/appium
npm install
APPIUM_RUN=true \
APPIUM_DEVICE_NAME="<connected Android device or emulator>" \
APPIUM_APP_PACKAGE=com.porsca.pos \
npm run smoke
```

Install the Appium UiAutomator2 driver in the lab if it is not already installed. Start from a fresh preview APK/install and the recorded staging seed. Set `APPIUM_BARCODE_FIXTURE`/the lab fixture process for the camera step; Appium cannot synthesize a camera barcode image by itself, so `presentBarcodeFixture` pauses at the documented physical-fixture seam.

The specs in `test/smoke.e2e.ts` cover:

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
