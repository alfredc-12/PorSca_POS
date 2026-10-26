import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { canCancelCheckout, checkoutBadge, isOpenCheckout, isPaymentLocked, shortCheckoutId } from './salesHolds';

const base: AuthorityCheckout = {
  id: '87cbfa19-1234-5678-9abc-def012345678', storeId: 'shop', state: 'open', revision: 1,
  amountCentavos: 2250, currency: 'PHP', items: [], attempts: [], sale: null, exceptions: [], history: [],
};

it('labels checkout state using authority records without inferring finality from UI data', () => {
  expect(checkoutBadge(base)).toBe('Ready for tender');
  expect(checkoutBadge({ ...base, state: 'payment_unresolved', attempts: [{ id: 1, method: 'qrph', amountCentavos: 2250, currency: 'PHP', status: 'pending', financialStatus: 'pending', firstVerifiedOutcome: null, qrPayload: null, qrExpiresAt: null, reservation: null }] })).toBe('Payment waiting');
  expect(checkoutBadge({ ...base, state: 'payment_unresolved', attempts: [{ id: 1, method: 'qrph', amountCentavos: 2250, currency: 'PHP', status: 'unknown', financialStatus: 'pending', firstVerifiedOutcome: null, qrPayload: null, qrExpiresAt: null, reservation: null }] })).toBe('Payment interrupted');
  expect(checkoutBadge({ ...base, state: 'provider_contradiction' })).toBe('Admin review');
  expect(checkoutBadge({ ...base, state: 'abandoned' })).toBe('Cancelled');
  expect(checkoutBadge({ ...base, state: 'completed', sale: { id: 1, method: 'cash', amountCentavos: 2250, cashReceivedCentavos: 3000, changeAmountCentavos: 750, completedAt: '2026-10-20T10:00:00Z' } })).toBe('Completed');
  expect(checkoutBadge({ ...base, state: 'completed' })).toBe('Admin review');
  expect(checkoutBadge({ ...base, state: 'ready_for_attempt', attempts: [{ id: 1, method: 'qrph', amountCentavos: 2250, currency: 'PHP', status: 'paid', financialStatus: 'paid', firstVerifiedOutcome: 'paid', qrPayload: null, qrExpiresAt: null, reservation: null }] })).toBe('Admin review');
});

it('allows cancellation only for open or ready server checkouts with no payment lock', () => {
  expect(canCancelCheckout(base)).toBe(true);
  expect(canCancelCheckout({ ...base, state: 'payment_unresolved' })).toBe(false);
  expect(canCancelCheckout({ ...base, state: 'ready_for_attempt', exceptions: [{ caseId: 1, reason: 'review', state: 'open' }] })).toBe(false);
  const unknownAttempt = { id: 1, method: 'qrph' as const, amountCentavos: 2250, currency: 'PHP' as const, status: 'unknown' as const, financialStatus: 'pending' as const, firstVerifiedOutcome: null, qrPayload: null, qrExpiresAt: null, reservation: null };
  expect(canCancelCheckout({ ...base, state: 'ready_for_attempt', attempts: [unknownAttempt] })).toBe(false);
  expect(isPaymentLocked({ ...base, state: 'payment_unresolved' })).toBe(true);
  expect(isOpenCheckout(base)).toBe(true);
  expect(isOpenCheckout({ ...base, state: 'abandoned' })).toBe(false);
});

it('formats a short id', () => {
  expect(shortCheckoutId(base.id)).toBe('87CBFA19');
});
