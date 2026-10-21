import { beforeEach } from 'mocha';
import {
  appiumTest,
  assertEqual,
  byDescription,
  byId,
  prepareAppiumCase,
  readMoney,
  searchAndSelect,
  tapElement,
  visibleText,
} from './support/appium';
import { productSearch, productText } from './support/fixtures';

beforeEach(prepareAppiumCase);

describe('POS cart totals', () => {
  appiumTest('recalculates line, subtotal, and total as quantity changes', async () => {
    await searchAndSelect(productSearch);
    const unitPrice = readMoney(await visibleText(byId('cart-unit-price')));

    assertEqual(await visibleText(byId('cart-quantity')), '1', 'Initial cart quantity');
    assertEqual(readMoney(await visibleText(byId('cart-line-total'))), unitPrice, 'Single-unit line total');
    assertEqual(readMoney(await visibleText(byId('cart-subtotal'))), unitPrice, 'Single-unit subtotal');
    assertEqual(readMoney(await visibleText(byId('cart-total'))), unitPrice, 'Single-unit total');

    await tapElement(byDescription(`Increase ${productText}`));
    assertEqual(await visibleText(byId('cart-quantity')), '2', 'Quantity after increment');
    assertEqual(readMoney(await visibleText(byId('cart-line-total'))), unitPrice * 2, 'Two-unit line total');
    assertEqual(readMoney(await visibleText(byId('cart-subtotal'))), unitPrice * 2, 'Two-unit subtotal');
    assertEqual(readMoney(await visibleText(byId('cart-total'))), unitPrice * 2, 'Two-unit total');

    await tapElement(byDescription(`Decrease ${productText}`));
    assertEqual(await visibleText(byId('cart-quantity')), '1', 'Quantity after decrement');
    assertEqual(readMoney(await visibleText(byId('cart-line-total'))), unitPrice, 'Restored line total');
    assertEqual(readMoney(await visibleText(byId('cart-subtotal'))), unitPrice, 'Restored subtotal');
    assertEqual(readMoney(await visibleText(byId('cart-total'))), unitPrice, 'Restored total');
  });
});
