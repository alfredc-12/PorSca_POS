import { beforeEach } from 'mocha';
import {
  appiumTest,
  assertEqual,
  byId,
  byText,
  prepareAppiumCase,
  readMoney,
  searchFor,
  tap,
  visibleText,
} from './support/appium';
import { barcodeFixture, productText } from './support/fixtures';

beforeEach(prepareAppiumCase);

describe('deterministic barcode fixture lookup', () => {
  appiumTest('exact barcode search resolves the configured product into the cart', async () => {
    await searchFor(barcodeFixture);
    await byText(productText).waitForDisplayed();
    const unitPrice = readMoney(await visibleText(byId('search-product-stock')));

    await tap('search-result');
    await byText(productText).waitForDisplayed();
    assertEqual(await visibleText(byId('cart-quantity')), '1', 'Cart quantity after exact barcode lookup');
    assertEqual(readMoney(await visibleText(byId('cart-unit-price'))), unitPrice, 'Cart price matches barcode lookup');
  });
});
