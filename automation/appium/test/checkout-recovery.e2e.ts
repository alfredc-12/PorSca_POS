import { beforeEach } from 'mocha';
import {
  appiumTest,
  assertEqual,
  byId,
  expect,
  finishReceipt,
  prepareAppiumCase,
  restartAppPreservingData,
  scrollToTop,
  searchAndSelect,
  tap,
  reveal,
  visibleText,
} from './support/appium';
import { productSearch, qrExpectedStatus, qrExpiryExpectation } from './support/fixtures';

beforeEach(prepareAppiumCase);

async function revealQrPresentation() {
  for (const id of ['qr-payment-image', 'qr-payment-code']) {
    await scrollToTop();
    try {
      const element = await reveal(byId(id));
      if (await element.isDisplayed().catch(() => false)) return element;
    } catch {
      continue;
    }
  }
  return undefined;
}

async function assertUnresolvedQrAttemptIsLocked() {
  if (!['pending', 'unknown', 'paid_unfulfilled'].includes(qrExpectedStatus)) return;
  await expect(byId('checkout-payment-cash')).toBeDisabled();
  if (await byId('retry-qr-payment').isDisplayed().catch(() => false)) {
    throw new Error('An unresolved or reconciliation-locked QR attempt must not offer a new payment.');
  }
  if (await byId('cancel-sale-entry').isDisplayed().catch(() => false)
    || await byId('confirm-cancel-sale').isDisplayed().catch(() => false)) {
    throw new Error('An unresolved or reconciliation-locked QR attempt must not offer checkout cancellation.');
  }
  await scrollToTop();
  if (qrExpectedStatus === 'pending' || qrExpectedStatus === 'unknown') {
    if (!await revealQrPresentation()) throw new Error('The server-returned QR image or symbol is not visible on Android.');
  }
  expect((await visibleText(byId('qr-practice-notice'))).toLowerCase()).toContain('not payable');
  const countdown = await reveal(byId('qr-expiry-countdown'));
  await countdown.waitForDisplayed();
  const expiry = await countdown.getText();
  if (qrExpiryExpectation === 'countdown') {
    if (!/^Time remaining: \d{2}:\d{2}$/.test(expiry)) throw new Error(`The configured fixture should show a server-backed QR countdown, saw: ${expiry}`);
  } else if (expiry !== 'Expiry time unavailable') {
    throw new Error(`The configured fixture should show the unavailable expiry fallback, saw: ${expiry}`);
  }
  await (await reveal(byId('leave-qr-payment'))).waitForDisplayed();
}

async function cartSnapshot() {
  return {
    quantity: await visibleText(byId('cart-quantity')),
    lineTotal: await visibleText(byId('cart-line-total')),
    total: await visibleText(byId('cart-total')),
  };
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

    // The keyless local fixture can advance from pending to unknown after the
    // automatic poll. Recovery asserts the unresolved attempt stays locked, not
    // one exact status string.
    await (await reveal(byId('qr-payment-status'))).waitForDisplayed();
    await assertUnresolvedQrAttemptIsLocked();
    await tap('leave-qr-payment');
    await scrollToTop();
    await byId('pos-search-input').waitForDisplayed();
    const checkoutBeforeRestart = await cartSnapshot();

    // Force-stop the process without clearing app data. Secure session and the
    // durable checkout handle must survive; leaving a QR attempt never cancels it.
    await restartAppPreservingData();
    await (await reveal(byId('cart-quantity'))).waitForDisplayed();
    const checkoutAfterRestart = await cartSnapshot();
    assertEqual(checkoutAfterRestart.quantity, checkoutBeforeRestart.quantity, 'Recovered checkout quantity');
    assertEqual(checkoutAfterRestart.lineTotal, checkoutBeforeRestart.lineTotal, 'Recovered checkout line total');
    assertEqual(checkoutAfterRestart.total, checkoutBeforeRestart.total, 'Recovered checkout total');
    await tap('proceed-to-payment');
    await (await reveal(byId('qr-payment-status'))).waitForDisplayed();
    await assertUnresolvedQrAttemptIsLocked();
    await tap('leave-qr-payment');
  });
});
