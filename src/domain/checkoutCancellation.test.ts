import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { openCheckout } from './checkoutMachine';
import { canSafelyAbandonCheckout } from './checkoutCancellation';

const open: AuthorityCheckout = {
  id: 'checkout-1', storeId: '1', state: 'open', revision: 1, amountCentavos: 3500, currency: 'PHP',
  items: [], attempts: [], sale: null, exceptions: [], history: [],
};

const attempt = (status: AuthorityCheckout['attempts'][number]['status'], financialStatus: AuthorityCheckout['attempts'][number]['financialStatus'] = 'pending') => ({
  id: 1, method: 'qrph' as const, amountCentavos: 3500, currency: 'PHP' as const, status, financialStatus,
  firstVerifiedOutcome: null, qrPayload: 'practice-payload', qrExpiresAt: null, reservation: null,
});

describe('safe checkout cancellation gate', () => {
  it('allows an authoritative open checkout and a ready checkout after a verified non-payable attempt', () => {
    expect(canSafelyAbandonCheckout(open, openCheckout(open.id, open.amountCentavos))).toBe(true);
    const ready = { ...open, state: 'ready_for_attempt' as const, attempts: [attempt('non_payable', 'expired')] };
    expect(canSafelyAbandonCheckout(ready, { ...openCheckout(open.id, open.amountCentavos), state: 'ready-for-new-attempt' })).toBe(true);
  });

  it.each(['pending', 'unknown', 'paid', 'contradiction'] as const)(
    'never offers cancellation for a %s QR attempt', status => {
      const unsafe = { ...open, state: status === 'paid' ? 'completed' as const : 'payment_unresolved' as const, attempts: [attempt(status)] };
      expect(canSafelyAbandonCheckout(unsafe, openCheckout(open.id, open.amountCentavos))).toBe(false);
    },
  );

  it('fails closed for paid, abandoned, or exception-locked checkouts', () => {
    expect(canSafelyAbandonCheckout({ ...open, state: 'completed', sale: { id: 1, method: 'qrph', amountCentavos: 3500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: '2026-10-23T00:00:00Z' } })).toBe(false);
    expect(canSafelyAbandonCheckout({ ...open, state: 'abandoned' })).toBe(false);
    expect(canSafelyAbandonCheckout({ ...open, exceptions: [{ caseId: 1, reason: 'provider_contradiction', state: 'open' }] })).toBe(false);
    expect(canSafelyAbandonCheckout(open, { ...openCheckout(open.id, open.amountCentavos), reconciliationRequired: true })).toBe(false);
  });
});
