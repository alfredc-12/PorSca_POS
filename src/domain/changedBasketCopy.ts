const cartChanged = 'The cart changed after this purchase was opened, so the earlier basket was kept.';
const noPayment = 'No payment was taken for this cart.';
const recoverOrCancel = 'Recover the retained purchase to replace this cart with its earlier basket, or cancel it.';
const alreadyCancelled = 'An already-cancelled purchase cannot be recovered.';
const divergenceBody = `${noPayment} ${recoverOrCancel} ${alreadyCancelled}`;

export const changedBasketCopy = {
  headline: 'The cart changed',
  body: `${cartChanged} ${noPayment}`,
  safety: `${recoverOrCancel} ${alreadyCancelled}`,
  actionLabel: 'Recover the earlier basket',
  failureTitle: 'The cart changed after checkout started',
  failureBody: divergenceBody,
  failureActionLabel: 'Recover the earlier basket',
  tenderLockReason: divergenceBody,
  saleHelpHint: 'Open help to recover the retained purchase or to cancel it.',
  autoRecoveryNotice: (retainedListed: boolean) => retainedListed
    ? `Automatic checkout recovery paused because the cart was not empty. This cart was not replaced. The retained purchase is listed below. Recovering an open purchase replaces this cart with its earlier basket. ${alreadyCancelled}`
    : 'Automatic checkout recovery paused because the cart was not empty. No retained purchase was found in checkout discovery, and this cart was not replaced.',
};
