import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { authorityObservation } from './checkoutAuthorityAdapter';
import { canAcceptCheckoutTender } from './checkoutMachine';

export type CheckoutBadge = 'Ready for tender' | 'Payment waiting' | 'Payment interrupted' | 'Admin review' | 'Cancelled' | 'Completed';

export const cancellationMarkerUnclearedNotice = 'Cancellation was accepted by the shop server, but this device could not clear its local marker. Do not take another payment for this sale.';

export function checkoutBadge(checkout: AuthorityCheckout): CheckoutBadge {
  const completedSale = checkout.state === 'completed' && Boolean(checkout.sale);
  const paymentStillUnresolved = checkout.attempts.some(attempt => attempt.status === 'pending' || attempt.status === 'unknown');
  if (checkout.exceptions.length > 0 || checkout.state === 'paid_unfulfilled' || checkout.state === 'provider_contradiction'
    || (checkout.state === 'completed' && paymentStillUnresolved)
    || checkout.attempts.some(attempt => attempt.status === 'contradiction' || (attempt.status === 'paid' && !completedSale))) return 'Admin review';
  if (checkout.state === 'abandoned') return 'Cancelled';
  if (checkout.state === 'completed') return checkout.sale ? 'Completed' : 'Admin review';
  if (checkout.state === 'payment_unresolved') {
    const latest = checkout.attempts[checkout.attempts.length - 1];
    return latest?.status === 'pending' ? 'Payment waiting' : 'Payment interrupted';
  }
  return 'Ready for tender';
}

export function isOpenCheckout(checkout: AuthorityCheckout) {
  return checkout.state !== 'completed' && checkout.state !== 'abandoned';
}

export function isPaymentLocked(checkout: AuthorityCheckout) {
  const completedSale = checkout.state === 'completed' && Boolean(checkout.sale);
  return checkout.state === 'payment_unresolved'
    || checkout.state === 'paid_unfulfilled'
    || checkout.state === 'provider_contradiction'
    || checkout.attempts.some(attempt => attempt.status === 'pending' || attempt.status === 'unknown' || attempt.status === 'contradiction' || (attempt.status === 'paid' && !completedSale));
}

export function canCancelCheckout(checkout: AuthorityCheckout) {
  const observation = authorityObservation(checkout);
  return (checkout.state === 'open' || checkout.state === 'ready_for_attempt')
    && checkout.exceptions.length === 0
    && !observation.reconciliationRequired
    && canAcceptCheckoutTender(observation)
    && !isPaymentLocked(checkout);
}

export function shortCheckoutId(id: string) {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}
