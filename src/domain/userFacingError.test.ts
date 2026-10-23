import { describeFailure, newReference, supportCodeLine } from '@/src/domain/userFacingError';
import { cancelledPurchaseCopy, changedBasketCopy, unobservedBasketCopy } from '@/src/domain/checkoutDivergenceCopy';

const RAW = {
  message: 'Illuminate\\Database\\QueryException: SQLSTATE[23000] (fetch failed at https://api.example.test)',
  details: { exception: 'Illuminate\\Database\\QueryException', file: '/app/Sale.php', line: 42 },
};

const FORBIDDEN = /SQLSTATE|Illuminate|QueryException|Exception|fetch|EXPO_PUBLIC_|Laravel|https?:\/\//i;

function described(screen: Parameters<typeof describeFailure>[1]['screen'], failure: Parameters<typeof describeFailure>[0] = RAW, basketObserved?: boolean) {
  const result = describeFailure(failure, { screen, basketObserved });
  return result;
}

describe('describeFailure', () => {
  it('never puts the API message or details in the visible copy', () => {
    const screens = ['cash-sale', 'qr-verification', 'qr-payment', 'product-save', 'staff-list', 'staff-save', 'shop-server', 'session-restore', 'sign-in'] as const;
    for (const screen of screens) {
      const failure = described(screen);
      expect(`${failure.title} ${failure.body}`).not.toMatch(FORBIDDEN);
    }
  });

  it('issues a PRS code from the unambiguous alphabet', () => {
    const { reference } = described('cash-sale');
    expect(reference).toMatch(/^PRS-[23456789ABCDEFGHJKMNPQRSTVWXYZ]{6}$/);
    expect(supportCodeLine({ ...described('cash-sale'), reference })).toBe(`Support code: ${reference}`);
  });

  it('generates distinct references and clamps a hostile random source', () => {
    expect(newReference(() => 1)).toBe('PRS-ZZZZZZ');
    expect(newReference(() => 0)).toBe('PRS-222222');
    const many = new Set(Array.from({ length: 200 }, () => newReference()));
    expect(many.size).toBeGreaterThan(190);
  });

  it('maps each cash-sale recovery class to one action', () => {
    expect(described('cash-sale', { status: 409, code: 'revalidation_required' })).toMatchObject({ title: 'Review the price before payment', action: 'fix-fields', actionLabel: 'Check the current price' });
    expect(described('cash-sale', { code: 'insufficient_stock' })).toMatchObject({ title: 'Stock changed', actionLabel: 'Refresh and remove', action: 'retry' });
    expect(described('cash-sale', { code: 'insufficient_cash' })).toMatchObject({ title: 'Not enough cash', actionLabel: 'Confirm again' });
    expect(described('cash-sale', { code: 'cash_attempt_unresolved' })).toMatchObject({ title: 'Check the earlier attempt first', action: 'check-transactions' });
    expect(described('cash-sale', { code: 'qr_payment_unresolved' })).toMatchObject({ title: 'Check the QR Ph payment first', action: 'check-payment' });
    expect(described('cash-sale', { status: 409, message: 'The idempotency key was already used.' })).toMatchObject({ title: 'This sale is already being saved', action: 'check-transactions' });
    expect(described('cash-sale', { code: 'product_missing' })).toMatchObject({ title: 'Product no longer available' });
    expect(described('cash-sale', { status: 500 })).toMatchObject({ title: 'Payment interrupted', action: 'retry' });
  });

  it('describes a changed basket without claiming money may already be recorded', () => {
    const failure = described('cash-sale', { status: 409, code: 'checkout_basket_diverged' }, true);
    expect(failure).toMatchObject({ title: changedBasketCopy.failureTitle, body: changedBasketCopy.failureBody, actionLabel: changedBasketCopy.failureActionLabel });
    expect(failure.body).toMatch(/No payment was taken/);
    expect(failure.body).toMatch(/Recover the earlier basket/);
    expect(failure.body).toMatch(/cancel/);
    expect(failure.body).toMatch(/keep this cart/);
    expect(failure.body).toMatch(/already-cancelled purchase cannot be recovered/);
    expect(`${failure.title} ${failure.body}`).not.toMatch(/ring up|ringing up|already being saved|may already be recorded|could not confirm|Check Transactions/i);
  });

  it('describes an unobserved changed basket without promising a cancellation', () => {
    const failure = described('cash-sale', { status: 409, code: 'checkout_basket_diverged' }, false);
    expect(failure).toMatchObject({ title: unobservedBasketCopy.failureTitle, body: unobservedBasketCopy.failureBody, actionLabel: unobservedBasketCopy.failureActionLabel });
    expect(failure.body).toMatch(/No payment was taken/);
    expect(failure.body).toMatch(/no confirmed open purchase to cancel/);
    expect(failure.body).toMatch(/Recover the earlier basket/);
    expect(failure.body).not.toMatch(/or cancel this purchase|keep this cart/);
  });

  it('describes a cancelled purchase without payment uncertainty', () => {
    const failure = described('cash-sale', { status: 409, code: 'checkout_purchase_cancelled' });
    expect(failure).toMatchObject({ title: cancelledPurchaseCopy.headline, body: `${cancelledPurchaseCopy.body} ${cancelledPurchaseCopy.safety}`, actionLabel: cancelledPurchaseCopy.clear });
    expect(`${failure.title} ${failure.body}`).not.toMatch(/QR Ph|unresolved|could not confirm|may already be recorded|Do not take another payment/i);
  });

  it('keeps a QR Ph decline and a reconciliation apart', () => {
    expect(described('qr-payment', { code: 'failed' })).toMatchObject({ title: "The customer's payment did not go through", action: 'new-payment' });
    expect(described('qr-payment', { code: 'paid_unfulfilled' })).toMatchObject({ title: 'Administrator required', action: 'contact-operator' });
  });

  it('tells the cashier why they were signed out, without a code', () => {
    const failure = described('session-expired', { status: 401 });
    expect(failure.title).toBe('You have been signed out');
    expect(failure.body).toContain('Sign in again');
    expect(failure.reference).toBeUndefined();
  });

  it('withholds a code from plain credential rejections and unconfigured devices', () => {
    expect(described('sign-in', { status: 401, message: RAW.message }).reference).toBeUndefined();
    expect(described('sign-in', { status: 429 }).reference).toBeUndefined();
    const setup = described('session-restore', { code: 'server_not_configured', message: RAW.message });
    expect(setup).toMatchObject({ title: 'This phone is not connected to the shop server yet', action: 'none' });
    expect(setup.reference).toBeUndefined();
  });

  it('issues a code for a connection failure while signed out (Y1)', () => {
    expect(described('sign-in', { message: 'Unable to reach PorSca API: timeout' }).reference).toMatch(/^PRS-/);
    expect(described('session-restore', { message: 'Unable to reach PorSca API: timeout' }).reference).toMatch(/^PRS-/);
  });
});
