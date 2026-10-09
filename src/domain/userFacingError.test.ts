import { describeFailure, newReference, supportCodeLine } from '@/src/domain/userFacingError';

const RAW = {
  message: 'Illuminate\\Database\\QueryException: SQLSTATE[23000] (fetch failed at https://api.example.test)',
  details: { exception: 'Illuminate\\Database\\QueryException', file: '/app/Sale.php', line: 42 },
};

const FORBIDDEN = /SQLSTATE|Illuminate|QueryException|Exception|fetch|EXPO_PUBLIC_|Laravel|https?:\/\//i;

function described(screen: Parameters<typeof describeFailure>[1]['screen'], failure: Parameters<typeof describeFailure>[0] = RAW) {
  const result = describeFailure(failure, { screen });
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
    expect(described('cash-sale', { code: 'insufficient_stock' })).toMatchObject({ title: 'Stock changed', actionLabel: 'Refresh and remove', action: 'retry' });
    expect(described('cash-sale', { code: 'insufficient_cash' })).toMatchObject({ title: 'Not enough cash', actionLabel: 'Confirm again' });
    expect(described('cash-sale', { code: 'cash_attempt_unresolved' })).toMatchObject({ title: 'Check the earlier attempt first', action: 'check-transactions' });
    expect(described('cash-sale', { code: 'qr_payment_unresolved' })).toMatchObject({ title: 'Check the QR Ph payment first', action: 'check-payment' });
    expect(described('cash-sale', { status: 409, message: 'The idempotency key was already used.' })).toMatchObject({ title: 'This sale is already being saved', action: 'check-transactions' });
    expect(described('cash-sale', { code: 'product_missing' })).toMatchObject({ title: 'Product no longer available' });
    expect(described('cash-sale', { status: 500 })).toMatchObject({ title: 'The sale was not saved', action: 'retry' });
  });

  it('keeps a QR Ph decline and a reconciliation apart', () => {
    expect(described('qr-payment', { code: 'failed' })).toMatchObject({ title: "The customer's payment did not go through", action: 'new-payment' });
    expect(described('qr-payment', { code: 'paid_unfulfilled' })).toMatchObject({ title: 'Payment received, sale not recorded', action: 'contact-operator' });
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
