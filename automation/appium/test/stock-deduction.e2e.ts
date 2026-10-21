import { beforeEach } from 'mocha';
import {
  appiumTest,
  assertEqual,
  byDescription,
  byId,
  expect,
  finishReceipt,
  prepareAppiumCase,
  readStock,
  searchFor,
  selectTab,
  tap,
  tapElement,
  typeCashReceived,
  visibleText,
} from './support/appium';
import { productSearch } from './support/fixtures';

beforeEach(prepareAppiumCase);

describe('authoritative stock deduction', () => {
  appiumTest('a repeated cash confirmation records one receipt and deducts one unit', async () => {
    await searchFor(productSearch);
    const stockBefore = readStock(await visibleText(byId('search-product-stock')));
    await tap('search-result');
    await tap('proceed-to-payment');
    await typeCashReceived(process.env.APPIUM_CASH_AMOUNT ?? '400');

    await tapElement(byId('confirm-cash-payment'));
    // The second tap may find the button disabled by the in-flight request; it
    // must never submit a second cash attempt.
    await tapElement(byId('confirm-cash-payment')).catch(() => undefined);
    await finishReceipt('cash');

    await selectTab('tab-pos');
    await searchFor(productSearch);
    const stockAfter = readStock(await visibleText(byId('search-product-stock')));
    assertEqual(stockAfter, stockBefore - 1, 'Stock after repeated cash confirmation');
  });

  appiumTest('an insufficient cash tender leaves stock unchanged', async () => {
    await searchFor(productSearch);
    const stockBefore = readStock(await visibleText(byId('search-product-stock')));
    await tap('search-result');
    await tap('proceed-to-payment');
    await typeCashReceived('0');
    await byId('cash-tender-feedback').waitForDisplayed();
    await expect(await byId('confirm-cash-payment')).toBeDisabled();
    await tapElement(byDescription('Go back'));

    await selectTab('tab-pos');
    await searchFor(productSearch);
    const stockAfter = readStock(await visibleText(byId('search-product-stock')));
    assertEqual(stockAfter, stockBefore, 'Stock after insufficient cash tender');
  });
});
