/*
 * Formal Android/Appium smoke seam. These cases stay opt-in and are run only
 * against a freshly prepared backend fixture and the matching app build.
 */

import { $$ } from '@wdio/globals';
import { beforeEach } from 'mocha';
import {
  appiumTest,
  byId,
  byText,
  expect,
  finishReceipt,
  prepareAppiumCase,
  presentPhysicalBarcodeFixture,
  searchAndSelect,
  startCashCheckout,
  tap,
  tapElement,
  typeCashReceived,
  reveal,
} from './support/appium';
import {
  barcodeFixture,
  cashReceived,
  productSearch,
  stockAttempts,
  stockCaseTimeoutMs,
  stockSearch,
} from './support/fixtures';

beforeEach(prepareAppiumCase);

describe('PorSca required cashier smoke flows', () => {
  appiumTest('search to cash checkout', async () => {
    await startCashCheckout(productSearch);
    await tap('confirm-cash-payment');
    await finishReceipt('cash');
  });

  // The physical label remains a deliberate human-held smoke step. The
  // barcode-fixture spec covers the deterministic exact-lookup substitute.
  appiumTest('barcode scan to cash checkout', async () => {
    await presentPhysicalBarcodeFixture(barcodeFixture);
    await tap('proceed-to-payment');
    await typeCashReceived(cashReceived);
    await tap('confirm-cash-payment');
    await finishReceipt('cash');
  });

  appiumTest('rejects insufficient stock', async () => {
    for (let count = 0; count < stockAttempts; count += 1) {
      await searchAndSelect(stockSearch);
      if (await byId('cart-limit-notice').isDisplayed().catch(() => false)) break;
    }
    await byId('cart-limit-notice').waitForDisplayed();
    await byText('Reduce the quantity before adding more.').waitForDisplayed();
  }, stockCaseTimeoutMs);

  appiumTest('rejects insufficient cash', async () => {
    await searchAndSelect(productSearch);
    await tap('proceed-to-payment');
    await typeCashReceived('1');
    await byId('cash-tender-feedback').waitForDisplayed();
    await byText('Add cash before confirming.').waitForDisplayed();
    await expect(await reveal(byId('confirm-cash-payment'))).toBeDisabled();
  });

  appiumTest('shows a successful cash sale in transaction history', async () => {
    await startCashCheckout(productSearch);
    await tap('confirm-cash-payment');
    await finishReceipt('cash');
    await byText('Transactions').waitForDisplayed();
    await byText('Completed').waitForDisplayed();
    await byText('Cash').waitForDisplayed();
  });

  appiumTest('does not show duplicate history rows after a repeated confirmation', async () => {
    await startCashCheckout(productSearch);
    // The first tap disables the action while the idempotent request is in
    // flight. A second tap is therefore harmless and cannot create a duplicate.
    await tapElement(byId('confirm-cash-payment'));
    await tapElement(byId('confirm-cash-payment')).catch(() => undefined);
    const receiptId = await finishReceipt('cash');
    const rows = await $$(`android=new UiSelector().resourceId(${JSON.stringify(`transaction-${receiptId}`)})`);
    if (rows.length !== 1) throw new Error(`Expected one history row for receipt ${receiptId}, found ${rows.length}.`);
    await byText('Completed').waitForDisplayed();
  });
});
