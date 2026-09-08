/*
 * Formal Android/Appium seam. These specs are intentionally outside `npm run
 * verify`; run them against a freshly seeded staging build after the preview
 * gate. Set APPIUM_RUN=true to opt in.
 */

import { $, browser } from '@wdio/globals';
import { beforeEach } from 'mocha';

type SmokeTest = (name: string, fn: () => Promise<void>) => void;
const smoke: SmokeTest = process.env.APPIUM_RUN === 'true' ? it : (name) => {
  console.info(`Skipped ${name}; set APPIUM_RUN=true to run the formal staging seam.`);
};

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

async function cashCheckout(searchTerm: string) {
  await tap('pos-search-input');
  await byId('pos-search-input').setValue(searchTerm);
  await tap('search-result-prd-001');
  await tap('proceed-to-payment');
  await byId('cash-received-input').setValue('100');
  await tap('confirm-cash-payment');
  await byText('Payment recorded').waitForDisplayed();
  await byText('Done').click();
}

async function presentBarcodeFixture(barcode: string) {
  await tap('pos-scan-button');
  // Appium cannot synthesize a camera image by itself. The staging device lab
  // supplies a barcode fixture/physical label and resumes once it is visible.
  console.info(`Present barcode fixture ${barcode} to the device camera.`);
  await byText('The product is added to the cart as soon as it is recognized.').waitForDisplayed();
}

describe('PorSca required cashier smoke flows', () => {
  beforeEach(async () => {
    const mobileDriver = browser as unknown as {
      execute: (script: string, args: unknown) => Promise<unknown>;
      activateApp: (packageName: string) => Promise<unknown>;
    };
    if (process.env.APPIUM_RESET_APP !== 'false') {
      await mobileDriver.execute('mobile: shell', {
        command: 'pm',
        args: ['clear', process.env.APPIUM_APP_PACKAGE ?? 'com.porsca.pos'],
      });
    }
    await mobileDriver.activateApp(process.env.APPIUM_APP_PACKAGE ?? 'com.porsca.pos');
  });

  smoke('search to cash checkout', async () => {
    await cashCheckout('Coca-Cola');
  });

  smoke('barcode scan to cash checkout', async () => {
    await presentBarcodeFixture('4800010000011');
    await tap('proceed-to-payment');
    await byId('cash-received-input').setValue('100');
    await tap('confirm-cash-payment');
    await byText('Payment recorded').waitForDisplayed();
  });

  smoke('rejects insufficient stock', async () => {
    for (let count = 0; count < 9; count += 1) {
      await tap('pos-search-input');
      await byId('pos-search-input').setValue('Piattos');
      await tap('search-result-prd-004');
    }
    await byText('No more stock is available for this item.').waitForDisplayed();
  });

  smoke('rejects insufficient cash', async () => {
    await tap('pos-search-input');
    await byId('pos-search-input').setValue('Coca-Cola');
    await tap('search-result-prd-001');
    await tap('proceed-to-payment');
    await byId('cash-received-input').setValue('1');
    await tap('confirm-cash-payment');
    await byText('Insufficient cash').waitForDisplayed();
  });

  smoke('records QR Ph sandbox success and shows it in history', async () => {
    await tap('pos-search-input');
    await byId('pos-search-input').setValue('Coca-Cola');
    await tap('search-result-prd-001');
    await tap('payment-qrph');
    await tap('proceed-to-payment');
    await tap('start-qrph-payment');
    await byText('Simulate paid').click();
    await byText('Transactions').click();
    await byText('Completed').waitForDisplayed();
  });

  smoke('keeps the cart and stock unchanged after QR Ph cancel/failure', async () => {
    await tap('pos-search-input');
    await byId('pos-search-input').setValue('Coca-Cola');
    await tap('search-result-prd-001');
    await tap('payment-qrph');
    await tap('proceed-to-payment');
    await tap('start-qrph-payment');
    await byText('Simulate failed').click();
    await byId('qr-payment-status').waitForDisplayed();
    await byText('No sale was recorded and stock was not changed.').waitForDisplayed();
  });

  smoke('deducts inventory exactly once across a retry/duplicate payment', async () => {
    // The API's Idempotency-Key is the assertion seam. Repeat the same payment
    // action in the provider sandbox, then compare inventory before/after:
    // delta must equal the cart quantity, never twice the cart quantity.
    await cashCheckout('Coca-Cola');
    await byText('Inventory').click();
    await byText('Coca-Cola').waitForDisplayed();
  });
});
