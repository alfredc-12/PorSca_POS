import { beforeEach } from 'mocha';
import {
  androidDriver,
  appiumTest,
  assertEqual,
  byId,
  expect,
  prepareAppiumCase,
  reveal,
  searchAndSelect,
  tap,
  visibleText,
} from './support/appium';
import { productSearch } from './support/fixtures';

beforeEach(prepareAppiumCase);

async function cartSnapshot() {
  return {
    quantity: await visibleText(byId('cart-quantity')),
    lineTotal: await visibleText(byId('cart-line-total')),
    total: await visibleText(byId('cart-total')),
  };
}

describe('safe server-backed checkout cancellation', () => {
  appiumTest('validates an attributed reason and keeps the edited cart without recording a sale', async () => {
    await searchAndSelect(productSearch);
    const before = await cartSnapshot();
    await tap('proceed-to-payment');

    await (await reveal(byId('cancel-sale-entry'))).waitForDisplayed();
    await tap('cancel-sale-entry');
    const reason = await reveal(byId('cancel-sale-reason-input'));
    await reason.waitForDisplayed();
    await reason.setValue('short');
    const confirm = byId('confirm-cancel-sale');
    await expect(confirm).toBeDisabled();

    await reason.clearValue();
    await reason.setValue('Customer changed their mind');
    await androidDriver().hideKeyboard().catch(() => false);
    await expect(confirm).toBeEnabled();
    await tap('confirm-cancel-sale');

    const cancelledNotice = await reveal(byId('checkout-cancelled-notice'));
    await cancelledNotice.waitForDisplayed();
    expect((await cancelledNotice.getText()).toLowerCase()).toContain('cart is unchanged');
    expect(await byId('checkout-completed-receipt').isDisplayed().catch(() => false)).toBe(false);

    // Cancellation abandons only the Laravel checkout; navigating back shows
    // the cashier's unchanged draft instead of a receipt or an empty cart.
    await androidDriver().execute('mobile: pressKey', { keycode: 4 });
    await byId('pos-search-input').waitForDisplayed();
    const after = await cartSnapshot();
    assertEqual(after.quantity, before.quantity, 'Cart quantity after cancellation');
    assertEqual(after.lineTotal, before.lineTotal, 'Cart line total after cancellation');
    assertEqual(after.total, before.total, 'Cart total after cancellation');
  });
});
