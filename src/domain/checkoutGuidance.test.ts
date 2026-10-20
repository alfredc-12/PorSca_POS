import { checkoutGuidance } from './checkoutGuidance';
import { cancelledPurchaseCopy, changedBasketCopy } from './checkoutDivergenceCopy';
import { CheckoutMachine, openCheckout } from './checkoutMachine';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
const base = openCheckout('c', 2500);
const pending: CheckoutMachine = { ...base, state: 'payment-unresolved', attempts: [{ id: '7', method: 'qr', amountCentavos: 2500, payment: 'pending', contradictions: [] }] };
const authority: AuthorityCheckout = { id: 'c', storeId: 's', state: 'completed', revision: 1, amountCentavos: 2500, currency: 'PHP', items: [], attempts: [], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' }, exceptions: [], history: [] };
const completed = { ...pending, state: 'completed' as const, saleId: '9' };
describe('cashier guidance from trusted truth', () => {
  it('leaves idle and verified non-payability outside the guidance categories', () => {
    for (const state of ['open', 'ready-for-new-attempt'] as const) expect(checkoutGuidance({ machine: { ...base, state } })).toBeUndefined();
  });
  it('treats a cancelled purchase as terminal and offers only to clear it', () => {
    const guidance = checkoutGuidance({ machine: { ...base, state: 'abandoned' } });
    expect(guidance).toMatchObject({ category: 'changed', headline: cancelledPurchaseCopy.headline, action: 'recover', label: cancelledPurchaseCopy.clear, locked: true, admin: false });
    const text = `${guidance!.body} ${guidance!.safety}`;
    expect(text).toMatch(/already cancelled/);
    expect(text).toMatch(/cannot be recovered|nothing is owed/);
    expect(text).toMatch(/Your cart is still here/);
    expect(text).not.toMatch(/Recover the earlier basket|pay for it/);
  });
  it('keeps pending after reservation release and restores it after unknown', () => {
    expect(checkoutGuidance({ machine: { ...pending, reservation: 'released' } })).toMatchObject({ category: 'pending', body: 'We are still waiting for the payment.', action: 'check', locked: true });
    expect(checkoutGuidance({ machine: { ...pending, attempts: [{ ...pending.attempts[0], payment: 'unknown' }] } })).toMatchObject({ category: 'interrupted' });
    expect(checkoutGuidance({ machine: pending })).toMatchObject({ category: 'pending' });
  });
  it('does not complete received money without a committed sale', () => {
    expect(checkoutGuidance({ machine: { ...pending, attempts: [{ ...pending.attempts[0], finalEvidence: { outcome: 'paid', reference: 'e' }, payment: 'paid' }] } })).toMatchObject({ category: 'pending', body: 'Payment is received. Still recording the sale.' });
  });
  it('gates QR completion on reads and offers receipt-only retry', () => {
    expect(checkoutGuidance({ machine: completed, authority })).toMatchObject({ category: 'interrupted', action: 'refresh', label: 'Refresh receipt' });
    expect(checkoutGuidance({ machine: completed, authority, receipt: 'running' })).toMatchObject({ category: 'pending', body: 'The sale is recorded. Updating stock and history.', action: 'wait' });
    expect(checkoutGuidance({ machine: completed, authority, receipt: 'failed' })).toMatchObject({ category: 'interrupted', action: 'refresh' });
    expect(checkoutGuidance({ machine: completed, authority, receipt: 'ready' })).toMatchObject({ category: 'completed', body: 'Payment confirmed. Stock and history updated.' });
  });
  it.each(['inconsistent', 'identity', 'permission'] as const)('locks %s before a read failure or completion', recoveryFailure => {
    expect(checkoutGuidance({ machine: completed, authority, receipt: 'failed', progress: { recoveryFailure } })).toMatchObject({ category: 'administrator', action: 'administrator', label: 'Call the shop administrator now.', locked: true });
  });
  it('never downgrades paid-unfulfilled or an older contradiction', () => {
    expect(checkoutGuidance({ machine: { ...completed, state: 'paid-but-unfulfilled', reconciliationRequired: true }, receipt: 'failed' })).toMatchObject({ category: 'administrator', body: 'Payment was received, but the sale could not be completed.' });
    expect(checkoutGuidance({ machine: { ...completed, reconciliationRequired: true }, authority, receipt: 'failed' })).toMatchObject({ category: 'administrator', body: 'Conflicting payment records found. This purchase is locked.' });
  });
  it('offers recovery for a changed basket without implying a payment is unconfirmed', () => {
    const guidance = checkoutGuidance({ machine: base, progress: { basketDiverged: true } });
    expect(guidance).toMatchObject({ category: 'changed', headline: changedBasketCopy.headline, action: 'recover', label: changedBasketCopy.recover, locked: true, admin: false });
    const text = `${guidance!.body} ${guidance!.safety}`;
    expect(text).toMatch(/No payment was taken/);
    expect(text).toMatch(/Recover the earlier basket/);
    expect(text).toMatch(/cancel/);
    expect(text).toMatch(/keep this cart/);
    expect(text).toMatch(/cancelled purchase cannot be recovered/);
    expect(text).not.toMatch(/could not confirm|may already be recorded|may still be charged|Do not take another payment/);
  });
  it('keeps unconfirmed money and a live tender ahead of a changed basket', () => {
    expect(checkoutGuidance({ machine: { ...pending, attempts: [{ ...pending.attempts[0], payment: 'unknown' }] }, progress: { basketDiverged: true } })).toMatchObject({ category: 'interrupted' });
    expect(checkoutGuidance({ machine: pending, progress: { basketDiverged: true } })).toMatchObject({ category: 'pending', action: 'check' });
    expect(checkoutGuidance({ machine: completed, authority, receipt: 'ready', progress: { basketDiverged: true } })).toMatchObject({ category: 'completed' });
    expect(checkoutGuidance({ machine: { ...pending, attempts: [{ ...pending.attempts[0], method: 'cash' }] }, progress: { basketDiverged: true, uncertainTender: 'cash', cashInput: '100.00' } })).toMatchObject({ category: 'interrupted', action: 'recover' });
  });
  it('puts a cancelled purchase ahead of a changed basket', () => {
    expect(checkoutGuidance({ machine: { ...base, state: 'abandoned' }, progress: { basketDiverged: true } })).toMatchObject({ headline: cancelledPurchaseCopy.headline, label: cancelledPurchaseCopy.clear });
  });
  it('keeps cancelled and changed guidance when a recovery failure has no live tender', () => {
    expect(checkoutGuidance({ machine: { ...base, state: 'abandoned' }, progress: { recoveryFailure: 'interrupted' } })).toMatchObject({ headline: cancelledPurchaseCopy.headline, label: cancelledPurchaseCopy.clear });
    expect(checkoutGuidance({ authority: { ...authority, state: 'abandoned', sale: null }, progress: { recoveryFailure: 'interrupted' } })).toMatchObject({ headline: cancelledPurchaseCopy.headline, label: cancelledPurchaseCopy.clear });
    expect(checkoutGuidance({ machine: base, progress: { basketDiverged: true, recoveryFailure: 'interrupted' } })).toMatchObject({ category: 'changed', headline: changedBasketCopy.headline, label: changedBasketCopy.recover });
    expect(checkoutGuidance({ machine: { ...pending, state: 'abandoned' }, progress: { recoveryFailure: 'interrupted' } })).toMatchObject({ category: 'pending', action: 'check' });
  });

  it('offers exact cash replay only without a known attempt', () => {
    expect(checkoutGuidance({ machine: base, progress: { uncertainTender: 'cash', cashInput: '100.00' } })).toMatchObject({ action: 'cash-retry', locked: true });
    expect(checkoutGuidance({ machine: { ...pending, attempts: [{ ...pending.attempts[0], method: 'cash' }] }, progress: { uncertainTender: 'cash', cashInput: '100.00' } })).toMatchObject({ action: 'recover' });
  });
  it('offers the exact cash retry when only an older non-payable QR attempt is recorded', () => {
    const oldQr = { ...pending, state: 'ready-for-new-attempt' as const, attempts: [{ ...pending.attempts[0], payment: 'non-payable' as const, finalEvidence: { outcome: 'non-payable' as const, reference: 'verified' } }] };
    expect(checkoutGuidance({ machine: oldQr, progress: { uncertainTender: 'cash', cashInput: '100.00' } })).toMatchObject({ category: 'interrupted', action: 'cash-retry', label: 'Retry saving cash payment', locked: true });
  });
  it('offers exact QR replay while historical QR evidence cannot identify the outstanding submission', () => {
    const firstFailed = { ...pending, state: 'ready-for-new-attempt' as const, attempts: [{ ...pending.attempts[0], payment: 'non-payable' as const, finalEvidence: { outcome: 'non-payable' as const, reference: 'verified' } }] };
    for (const machine of [firstFailed, pending, completed]) {
      expect(checkoutGuidance({ machine, authority: machine === completed ? authority : undefined, progress: { uncertainTender: 'qrph' } })).toMatchObject({ category: 'interrupted', action: 'start', label: 'Retry QR Ph Payment', locked: true });
    }
    expect(checkoutGuidance({ machine: firstFailed, progress: { uncertainTender: 'qrph' }, operation: 'qr-create' })).toMatchObject({ category: 'pending', action: 'wait' });
  });
  it('uses recovery for stored cash pending and exact QR retry for no-id uncertainty', () => {
    expect(checkoutGuidance({ machine: { ...pending, attempts: [{ ...pending.attempts[0], method: 'cash' }] } })).toMatchObject({ body: 'We are still waiting for this cash sale.', action: 'recover' });
    expect(checkoutGuidance({ machine: base, progress: { uncertainTender: 'qrph' }, verificationFailed: true })).toMatchObject({ action: 'start' });
  });
});
