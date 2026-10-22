import { beforeEach } from 'mocha';
import {
  appiumTest,
  byId,
  closeKeyboard,
  finishReceipt,
  prepareAppiumCase,
  scrollToTop,
  startCashCheckout,
  tap,
} from './support/appium';
import { productSearch } from './support/fixtures';

beforeEach(prepareAppiumCase);

describe('transaction history filters', () => {
  appiumTest('filters a new cash receipt by tender and searches by receipt id', async () => {
    await startCashCheckout(productSearch);
    await tap('confirm-cash-payment');
    const receiptId = await finishReceipt('cash');
    const receiptRowId = `transaction-${receiptId}`;

    await scrollToTop();
    await tap('transaction-filter-cash');
    await byId(receiptRowId).waitForDisplayed();

    await tap('transaction-filter-qr-ph');
    await byId(receiptRowId).waitForDisplayed({ reverse: true });

    await tap('transaction-filter-all');
    const search = byId('transaction-search-input');
    await search.setValue(receiptId);
    await closeKeyboard();
    await byId(receiptRowId).waitForDisplayed();
  });
});
