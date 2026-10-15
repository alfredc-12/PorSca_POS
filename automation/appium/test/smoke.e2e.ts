/*
 * Formal Android/Appium seam. These specs are intentionally outside `npm run
 * verify`; run them against a freshly seeded staging build after the preview
 * gate. Set APPIUM_RUN=true to opt in.
 */

import { $$, $, browser, expect } from '@wdio/globals';
import { beforeEach } from 'mocha';

type SmokeTest = (name: string, fn: () => Promise<void>) => void;
const smoke: SmokeTest = process.env.APPIUM_RUN === 'true' ? it : (name) => {
  console.info(`Skipped ${name}; set APPIUM_RUN=true to run the formal staging seam.`);
};

const productSearch = process.env.APPIUM_PRODUCT_SEARCH ?? 'Sinandomeng Rice';
const productText = process.env.APPIUM_PRODUCT_TEXT ?? 'Sinandomeng Rice 5kg';
const barcodeFixture = process.env.APPIUM_BARCODE_FIXTURE ?? '4800000000019';
const cashReceived = process.env.APPIUM_CASH_AMOUNT ?? '400';
const stockSearch = process.env.APPIUM_STOCK_SEARCH ?? productSearch;
const stockAttempts = Number(process.env.APPIUM_STOCK_ATTEMPTS ?? 25);
const qrStatusMessages = {
  pending: 'Payment pending…',
  unknown: 'Payment interrupted',
  paid: 'Payment confirmed. Stock and history updated.',
  paid_unfulfilled: 'Administrator required',
  failed: 'Payment failed. No sale was recorded and stock was not changed.',
  cancelled: 'Payment was cancelled. No sale was recorded and stock was not changed.',
  expired: 'Payment expired. Start a new QR Ph payment; stock was not changed.',
} as const;
const qrExpectedStatus = process.env.APPIUM_QR_EXPECTED_STATUS ?? 'pending';
if (!Object.hasOwn(qrStatusMessages, qrExpectedStatus)) {
  throw new Error(`Unsupported APPIUM_QR_EXPECTED_STATUS: ${qrExpectedStatus}`);
}

function byId(id: string) {
  // React Native testID is an Android resource-id, not a content-description.
  return $(`android=new UiSelector().resourceId(${JSON.stringify(id)})`);
}

function byText(value: string) {
  return $(`android=new UiSelector().textContains(${JSON.stringify(value)})`);
}

async function tap(id: string) {
  await byId(id).waitForDisplayed();
  await byId(id).click();
}

async function searchAndSelect(searchTerm: string) {
  await tap('pos-search-input');
  const searchInput = byId('pos-search-input');
  await searchInput.clearValue();
  await searchInput.setValue(searchTerm);
  await tap('search-result');
}

async function finishReceipt(method: 'cash' | 'qrph') {
  await byText('Payment completed').waitForDisplayed();
  await byText(method === 'cash'
    ? 'Cash payment and sale are recorded.'
    : qrStatusMessages.paid).waitForDisplayed();
  const receipt = byText('Receipt ');
  await receipt.waitForDisplayed();
  const receiptId = (await receipt.getText()).match(/Receipt ([^\s]+)/)?.[1];
  if (!receiptId) throw new Error('The completed payment has no receipt identity.');
  if (method === 'cash') {
    await byText('Cash received ₱').waitForDisplayed();
    await byText('Change to give ₱').waitForDisplayed();
  }
  await byText('Done').click();
  await byId(`transaction-${receiptId}`).waitForDisplayed();
  return receiptId;
}

async function cashCheckout(searchTerm: string) {
  await searchAndSelect(searchTerm);
  await tap('proceed-to-payment');
  await byId('cash-received-input').setValue(cashReceived);
  await tap('confirm-cash-payment');
  return finishReceipt('cash');
}

async function presentBarcodeFixture(barcode: string) {
  await tap('pos-scan-button');
  const allowCamera = byText('Allow Camera');
  if (await allowCamera.isDisplayed().catch(() => false)) {
    await allowCamera.click();
  }
  // Appium cannot synthesize a camera image by itself. The staging device lab
  // supplies a barcode fixture/physical label and resumes once it is visible.
  console.info(`Present barcode fixture ${barcode} to the device camera.`);
  await byText('The product is added to the cart as soon as it is recognized.').waitForDisplayed();
  // Wait for the cart, not just the brief scanner product confirmation.
  await byId('pos-search-input').waitForDisplayed();
  await byText(productText).waitForDisplayed();
}

describe('PorSca required cashier smoke flows', () => {
  beforeEach(async () => {
    const mobileDriver = browser as unknown as {
      execute: (script: string, args: unknown) => Promise<unknown>;
      activateApp: (packageName: string) => Promise<unknown>;
      waitUntil: (condition: () => Promise<boolean>, options: { timeoutMsg: string }) => Promise<unknown>;
    };
    if (process.env.APPIUM_RESET_APP !== 'false') {
      await mobileDriver.execute('mobile: shell', {
        command: 'pm',
        args: ['clear', process.env.APPIUM_APP_PACKAGE ?? 'com.porsca.pos'],
      });
    }
    await mobileDriver.activateApp(process.env.APPIUM_APP_PACKAGE ?? 'com.porsca.pos');
    await mobileDriver.waitUntil(async () =>
      await byId('login-email-input').isDisplayed().catch(() => false) ||
      await byId('pos-search-input').isDisplayed().catch(() => false),
    { timeoutMsg: 'Neither login nor the signed-in POS became available.' });
    if (await byId('login-email-input').isDisplayed().catch(() => false)) {
      const email = process.env.APPIUM_LOGIN_EMAIL;
      const password = process.env.APPIUM_LOGIN_PASSWORD;
      if (!email || !password) throw new Error('Set private APPIUM_LOGIN_EMAIL and APPIUM_LOGIN_PASSWORD for an active staging account.');
      await byId('login-email-input').setValue(email);
      await byId('login-password-input').setValue(password);
      await tap('login-submit');
      await byId('pos-search-input').waitForDisplayed();
    }
  });

  smoke('search to cash checkout', async () => {
    await cashCheckout(productSearch);
  });

  smoke('barcode scan to cash checkout', async () => {
    await presentBarcodeFixture(barcodeFixture);
    await tap('proceed-to-payment');
    await byId('cash-received-input').setValue(cashReceived);
    await tap('confirm-cash-payment');
    await finishReceipt('cash');
  });

  smoke('rejects insufficient stock', async () => {
    for (let count = 0; count < stockAttempts; count += 1) {
      await searchAndSelect(stockSearch);
      if (await byId('cart-limit-notice').isDisplayed().catch(() => false)) break;
    }
    await byId('cart-limit-notice').waitForDisplayed();
    await byText('Reduce the quantity before adding more.').waitForDisplayed();
  });

  smoke('rejects insufficient cash', async () => {
    await searchAndSelect(productSearch);
    await tap('proceed-to-payment');
    await byId('cash-received-input').setValue('1');
    await tap('confirm-cash-payment');
    await byText('Check cash tender').waitForDisplayed();
    await byText('Enter an amount using digits and at most two decimal places, at least ₱').waitForDisplayed();
  });

  smoke('starts the QR Ph staging flow through Laravel', async () => {
    await searchAndSelect(productSearch);
    await tap('payment-qrph');
    await tap('proceed-to-payment');
    await tap('start-qrph-payment');
    if (qrExpectedStatus === 'paid') {
      // Completed checkout renders a receipt instead of qr-payment-status.
      await finishReceipt('qrph');
      return;
    }
    await byId('qr-payment-status').waitForDisplayed();
    await expect(byId('qr-payment-status')).toHaveText(
      qrStatusMessages[qrExpectedStatus as keyof typeof qrStatusMessages],
    );
    if (['pending', 'unknown', 'paid_unfulfilled'].includes(qrExpectedStatus)) {
      // Unresolved attempts and paid-but-unfulfilled purchases stay locked:
      // another tender could double-charge. Leaving does not resolve payment.
      await expect(byId('leave-qr-payment')).toBeDisplayed();
      expect(await byId('retry-qr-payment').isDisplayed().catch(() => false)).toBe(false);
      await expect(byId('checkout-payment-cash')).toBeDisabled();
    }
    // Laravel exposes no cashier cancel action. Leaving never cancels the
    // attempt; the cashier returns to the POS with the cart kept.
    await tap('leave-qr-payment');
    await byId('pos-search-input').waitForDisplayed();
    await byText(productText).waitForDisplayed();
  });

  smoke('shows a successful cash sale in transaction history', async () => {
    await cashCheckout(productSearch);
    await byText('Transactions').waitForDisplayed();
    await byText('Completed').waitForDisplayed();
    await byText('Cash').waitForDisplayed();
  });

  smoke('does not show duplicate history rows after a repeated confirmation', async () => {
    await searchAndSelect(productSearch);
    await tap('proceed-to-payment');
    await byId('cash-received-input').setValue(cashReceived);
    // The first tap disables the action while the idempotent request is in
    // flight. A second tap is therefore harmless and cannot make a duplicate
    // visible transaction. Server exactness is separately covered by the API
    // contract and the mobile provider test.
    await byId('confirm-cash-payment').click();
    await byId('confirm-cash-payment').click().catch(() => undefined);
    const receiptId = await finishReceipt('cash');
    const rows = await $$(`android=new UiSelector().resourceId(${JSON.stringify(`transaction-${receiptId}`)})`);
    expect(rows.length).toBe(1);
    await byText('Completed').waitForDisplayed();
  });
});
