import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { canAcceptCheckoutTender, CheckoutMachine } from './checkoutMachine';

/** Only an authoritative open/ready checkout with no unresolved money can be abandoned. */
export function canSafelyAbandonCheckout(checkout?: AuthorityCheckout, machine?: CheckoutMachine) {
  if (!checkout || (checkout.state !== 'open' && checkout.state !== 'ready_for_attempt') || checkout.sale || checkout.exceptions.length > 0) {
    return false;
  }
  if (machine && (!canAcceptCheckoutTender(machine) || machine.reconciliationRequired)) return false;
  return checkout.attempts.every(attempt =>
    attempt.status === 'non_payable' && (attempt.financialStatus === 'failed' || attempt.financialStatus === 'expired'),
  );
}
