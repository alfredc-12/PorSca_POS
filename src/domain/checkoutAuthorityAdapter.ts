import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { CheckoutMachine, CheckoutState } from './checkoutMachine';

const states: Record<AuthorityCheckout['state'], CheckoutState> = {
  open: 'open', payment_unresolved: 'payment-unresolved', ready_for_attempt: 'ready-for-new-attempt',
  completed: 'completed', paid_unfulfilled: 'paid-but-unfulfilled', provider_contradiction: 'payment-unresolved', abandoned: 'abandoned',
};

/** Only use on Laravel resources. Capability URLs, timers and UI status are not evidence. */
export function authorityObservation(checkout: AuthorityCheckout): CheckoutMachine {
  return {
    id: checkout.id, state: states[checkout.state], amountCentavos: checkout.amountCentavos,
    saleId: checkout.sale ? String(checkout.sale.id) : undefined,
    reconciliationRequired: checkout.state === 'provider_contradiction' || checkout.state === 'paid_unfulfilled' || checkout.attempts.some(a => a.status === 'contradiction'),
    reservation: checkout.attempts.some(a => a.reservation?.state === 'held') ? 'held' : checkout.attempts.some(a => a.reservation) ? 'released' : 'none',
    attempts: checkout.attempts.map(a => ({
      id: String(a.id), method: a.method === 'qrph' ? 'qr' : 'cash', amountCentavos: a.amountCentavos,
      payment: a.firstVerifiedOutcome === 'non_payable' ? 'non-payable' : a.firstVerifiedOutcome === 'paid' ? 'paid' : a.status === 'unknown' ? 'unknown' : 'pending',
      finalEvidence: a.firstVerifiedOutcome ? { outcome: a.firstVerifiedOutcome === 'paid' ? 'paid' : 'non-payable', reference: `authority:${checkout.id}:${a.id}:first` } : undefined,
      // The first outcome remains unchanged; contradiction detail is retained server-side.
      contradictions: a.status === 'contradiction' && a.firstVerifiedOutcome ? [{ outcome: a.firstVerifiedOutcome === 'paid' ? 'non-payable' : 'paid', reference: `authority:${checkout.id}:${a.id}:contradiction` }] : [],
    })),
  };
}
