/**
 * The one authoritative source for changed-cart (basket divergence) copy.
 *
 * Divergence means the draft cart no longer matches the retained purchase and
 * no tender was sent for it, so the cashier needs to choose between the
 * retained purchase and the cart they are editing. The cart belongs to the
 * cashier: cancelling keeps it, explicit recovery of an open purchase replaces
 * it with the earlier basket, and a purchase that was already cancelled has no
 * basket left to recover.
 *
 * Every surface that explains divergence (checkout guidance, the cash-sale
 * failure card, the tender lock reason, sale help, and the POS recovery
 * notice) renders these strings so wording cannot drift from behavior. A
 * retained earlier basket with no observed checkout uses the recovery-only
 * `unobservedBasketCopy` instead, because cancellation is not available yet.
 */

const noPayment = 'No payment was taken for this cart.';
const replaceOrKeep = 'Recover the earlier basket to replace this cart and pay for it, or cancel this purchase to keep this cart.';
const alreadyCancelled = 'An already-cancelled purchase cannot be recovered.';

export const changedBasketCopy = {
  headline: 'The cart changed',
  body: `The cart changed after this purchase was opened. ${noPayment}`,
  safety: `${replaceOrKeep} ${alreadyCancelled}`,
  recover: 'Recover the earlier basket',
  tenderLock: `${noPayment} ${replaceOrKeep}`,
  helpHint: 'Open help to recover the earlier basket, or to cancel that purchase and keep this cart.',
  failureTitle: 'The cart changed after checkout started',
  failureBody: `${noPayment} ${replaceOrKeep} ${alreadyCancelled}`,
  failureActionLabel: 'Recover the earlier basket',
  autoRecoveryNotice: (retainedListed: boolean) => retainedListed
    ? 'Automatic checkout recovery paused because the cart was not empty. This cart was not replaced. The retained purchase is listed below. Recovering an open purchase replaces this cart with its earlier basket. An already-cancelled purchase cannot be recovered.'
    : 'Automatic checkout recovery paused because the cart was not empty. No retained purchase was found in checkout discovery, and this cart was not replaced.',
} as const;

/**
 * A retained earlier basket with no observed checkout. Recovery is the only
 * real action; cancellation is not offered because no open purchase is behind
 * the retained device identity yet.
 */
export const unobservedBasketCopy = {
  headline: 'The cart changed',
  body: 'The cart changed after checkout preparation began. No payment was taken for this cart, and this phone has no confirmed open purchase to cancel.',
  safety: 'Recover the earlier basket to replace this cart and pay for it. Do not take payment for this cart until that device purchase is resolved.',
  recover: 'Recover the earlier basket',
  tenderLock: 'No payment was taken for this cart. Recover the earlier basket before taking payment.',
  helpHint: 'Open help to recover the earlier basket. This phone has no confirmed purchase that can be cancelled yet.',
  helpUnavailable: 'This phone has no confirmed open purchase to cancel. Recover the earlier basket, then cancel it or pay for it; do not take payment for this cart yet.',
  failureTitle: 'The cart changed after checkout started',
  failureBody: `${noPayment} This phone has no confirmed open purchase to cancel. Recover the earlier basket to replace this cart and pay for it.`,
  failureActionLabel: 'Recover the earlier basket',
} as const;

export const cancelledPurchaseCopy = {
  headline: 'This purchase was cancelled',
  body: 'The earlier purchase was already cancelled, so nothing is owed for it and it cannot be recovered.',
  safety: 'Your cart is still here. Clear the cancelled purchase, then ring up this cart as a new sale.',
  clear: 'Clear the cancelled purchase',
  clearNotice: 'We could not clear the cancelled purchase. It is still showing; try clearing it again before ringing up this cart.',
} as const;

export const cancellationFailedCopy = {
  headline: 'Cancellation not confirmed',
  body: 'We could not confirm that this purchase was cancelled. It may still be open.',
  safety: 'Do not take another payment. Try cancelling again to keep this cart, or recover the earlier basket to replace this cart and pay for it.',
  notice: 'We could not confirm the cancellation. This purchase may still be open; try cancelling again to keep this cart, or recover the earlier basket to replace this cart.',
  helpHint: 'Open help to cancel again and keep this cart, or recover the earlier basket and replace this cart.',
  tenderLock: 'Do not take another payment while the cancellation is unconfirmed.',
} as const;
