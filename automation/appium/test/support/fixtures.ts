export const appiumEnabled = process.env.APPIUM_RUN === 'true';
export const productSearch = process.env.APPIUM_PRODUCT_SEARCH ?? 'Sinandomeng Rice';
export const productText = process.env.APPIUM_PRODUCT_TEXT ?? 'Sinandomeng Rice 5kg';
export const barcodeFixture = process.env.APPIUM_BARCODE_FIXTURE ?? '4800000000019';
export const cashReceived = process.env.APPIUM_CASH_AMOUNT ?? '400';
export const stockSearch = process.env.APPIUM_STOCK_SEARCH ?? productSearch;
export const stockAttempts = Number(process.env.APPIUM_STOCK_ATTEMPTS ?? 25);
// The quantity-limit case may add one item at a time until the recorded stock
// is reached, so its deadline is longer than the suite-wide timeout.
export const stockCaseTimeoutMs = Number(process.env.APPIUM_STOCK_TIMEOUT_MS ?? 240000);
export const qrExpectedStatus = process.env.APPIUM_QR_EXPECTED_STATUS ?? 'pending';
export const qrStatusMessages = {
  pending: 'Payment pending…',
  unknown: 'Payment interrupted',
  paid: 'Payment confirmed. Stock and history updated.',
  paid_unfulfilled: 'Administrator required',
  failed: 'Payment failed. No sale was recorded and stock was not changed.',
  cancelled: 'Payment was cancelled. No sale was recorded and stock was not changed.',
  expired: 'Payment expired. Start a new QR Ph payment; stock was not changed.',
} as const;
if (!Object.hasOwn(qrStatusMessages, qrExpectedStatus)) {
  throw new Error(`Unsupported APPIUM_QR_EXPECTED_STATUS: ${qrExpectedStatus}`);
}
export const qrExpiryExpectation = process.env.APPIUM_QR_EXPIRY_EXPECTED ?? 'countdown';
if (qrExpiryExpectation !== 'countdown' && qrExpiryExpectation !== 'unavailable') {
  throw new Error(`Unsupported APPIUM_QR_EXPIRY_EXPECTED: ${qrExpiryExpectation}`);
}

// Metro LAN origin for a development (dev-client) build. Unset for a
// standalone/preview artifact, where no development launcher appears.
export const devServerUrl = process.env.APPIUM_DEV_SERVER_URL;
export const devServerLaunchTimeoutMs = Number(process.env.APPIUM_DEV_SERVER_LAUNCH_TIMEOUT_MS ?? 90000);
export const appPackage = process.env.APPIUM_APP_PACKAGE ?? 'com.porsca.pos';
