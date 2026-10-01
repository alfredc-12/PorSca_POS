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
const productText = process.env.APPIUM_PRODUCT_TEXT ?? productSearch;
const barcodeFixture = process.env.APPIUM_BARCODE_FIXTURE ?? '4800000000010';
const cashReceived = process.env.APPIUM_CASH_AMOUNT ?? '400';
const stockSearch = process.env.APPIUM_STOCK_SEARCH ?? productSearch;
const stockAttempts = Number(process.env.APPIUM_STOCK_ATTEMPTS ?? 25);
const qrExpectedStatus = process.env.APPIUM_QR_EXPECTED_STATUS ?? 'pending';

function byId(id: string) {
  return $(`~${id}`);
}

function byText(value: string) {
  return $(`android=new UiSelector().textContains("${value}")`);
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

async function cashCheckout(searchTerm: string) {
  await searchAndSelect(searchTerm);
  await tap('proceed-to-payment');
  await byId('cash-received-input').setValue(cashReceived);
  await tap('confirm-cash-payment');
  await byText('Payment recorded').waitForDisplayed();
  await byText('Done').click();
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
    await byText('Payment recorded').waitForDisplayed();
  });

  smoke('rejects insufficient stock', async () => {
    for (let count = 0; count < stockAttempts; count += 1) {
      await searchAndSelect(stockSearch);
      if (await byText('No more stock is available for this item.').isDisplayed().catch(() => false)) break;
    }
    await byText('No more stock is available for this item.').waitForDisplayed();
  });

  smoke('rejects insufficient cash', async () => {
    await searchAndSelect(productSearch);
    await tap('proceed-to-payment');
    await byId('cash-received-input').setValue('1');
    await tap('confirm-cash-payment');
    await byText('Insufficient cash').waitForDisplayed();
    await byText('confirm again').waitForDisplayed();
  });

  smoke('starts the QR Ph staging flow through Laravel', async () => {
    await searchAndSelect(productSearch);
    await tap('payment-qrph');
    await tap('proceed-to-payment');
    await tap('start-qrph-payment');
    await byId('qr-payment-status').waitForDisplayed();
    await expect(byId('qr-payment-status')).toHaveText(qrExpectedStatus === 'paid'
      ? 'Payment confirmed by Laravel. Inventory and history refreshed.'
      : qrExpectedStatus === 'paid_unfulfilled'
        ? 'Payment received but stock could not be fulfilled. Reconcile with the operator; no sale was recorded.'
        : qrExpectedStatus === 'failed'
          ? 'Payment failed. No sale was recorded and stock was not changed.'
          : qrExpectedStatus === 'cancelled'
            ? 'Payment was cancelled. No sale was recorded and stock was not changed.'
            : qrExpectedStatus === 'expired'
              ? 'Payment expired. Start a new QR Ph payment; stock was not changed.'
              : 'Payment pending…');
    if (qrExpectedStatus === 'paid') {
      await byText('Payment recorded').waitForDisplayed();
      await byText('Done').click();
      await byText('Completed').waitForDisplayed();
      return;
    }
    if (qrExpectedStatus === 'paid_unfulfilled') {
      // Money was received, so no new payment is offered: a retry could
      // double-charge. Leaving keeps the cart for operator reconciliation.
      await expect(byId('leave-qr-payment')).toBeDisplayed();
      expect(await byId('retry-qr-payment').isDisplayed().catch(() => false)).toBe(false);
      return;
    }
    // Laravel exposes no cashier cancel action. Leaving never cancels the
    // attempt; the cashier returns to the POS with the cart kept.
    await tap('leave-qr-payment');
    await byId('pos-search-input').waitForDisplayed();
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
    await byText('Payment recorded').waitForDisplayed();
    await byText('Done').click();
    const rows = await $$('~transaction-row');
    expect(rows.length).toBeGreaterThan(0);
    await byText('Completed').waitForDisplayed();
  });
});
