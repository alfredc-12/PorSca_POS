import { beforeEach } from 'mocha';
import {
  appiumTest,
  byId,
  expect,
  finishReceipt,
  prepareAppiumCase,
  restartAppPreservingData,
  scrollToTop,
  searchAndSelect,
  tap,
  reveal,
} from './support/appium';
import { productSearch, qrExpectedStatus, qrStatusMessages } from './support/fixtures';

beforeEach(prepareAppiumCase);

async function assertUnresolvedQrAttemptIsLocked() {
  if (!['pending', 'unknown', 'paid_unfulfilled'].includes(qrExpectedStatus)) return;
  await expect(byId('leave-qr-payment')).toBeDisplayed();
  if (await byId('retry-qr-payment').isDisplayed().catch(() => false)) {
    throw new Error('An unresolved or reconciliation-locked QR attempt must not offer a new payment.');
  }
  await expect(byId('checkout-payment-cash')).toBeDisabled();
}

describe('durable checkout recovery', () => {
  appiumTest('restores the retained QR attempt after restarting the Android app', async () => {
    await searchAndSelect(productSearch);
    await tap('payment-qrph');
    await tap('proceed-to-payment');
    await tap('start-qrph-payment');

    if (qrExpectedStatus === 'paid') {
      // A provider-confirmed payment is terminal and goes directly to its
      // receipt; there is no unresolved attempt to recover after that point.
      await finishReceipt('qrph');
      return;
    }

    await (await reveal(byId('qr-payment-status'))).waitForDisplayed();
    await expect(byId('qr-payment-status')).toHaveText(
      qrStatusMessages[qrExpectedStatus as keyof typeof qrStatusMessages],
    );
    await assertUnresolvedQrAttemptIsLocked();
    await tap('leave-qr-payment');
    await scrollToTop();
    await byId('pos-search-input').waitForDisplayed();

    // Force-stop the process without clearing app data. Secure session and the
    // durable checkout handle must survive; leaving a QR attempt never cancels it.
    await restartAppPreservingData();
    await (await reveal(byId('cart-quantity'))).waitForDisplayed();
    await tap('proceed-to-payment');
    await (await reveal(byId('qr-payment-status'))).waitForDisplayed();
    await expect(byId('qr-payment-status')).toHaveText(
      qrStatusMessages[qrExpectedStatus as keyof typeof qrStatusMessages],
    );
    await assertUnresolvedQrAttemptIsLocked();
    await tap('leave-qr-payment');
  });
});
