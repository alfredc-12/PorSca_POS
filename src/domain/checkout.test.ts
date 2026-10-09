import { hasMissingProductDetail, isDefinitiveQrRejection, saleFailureCopy } from '@/src/domain/checkout';

// The words are asserted here; the on-device record store is exercised in
// src/observability/diagnostics.test.ts, so this suite stays pure.
jest.mock('@/src/observability/diagnostics', () => ({
  describeAndRecordFailure: (failure: unknown, context: { screen: string }) =>
    jest.requireActual('@/src/domain/userFacingError').describeFailure(failure, context),
}));

describe('checkout failure copy', () => {
  it('explains a deleted product instead of showing generic validation text', () => {
    const failure = saleFailureCopy({
      status: 422,
      code: 'validation_error',
      message: 'The given data was invalid.',
      details: { 'items.0.product_id': ['The selected items.0.product_id is invalid.'] },
    });

    expect(failure.title).toBe('Product no longer available');
    expect(failure.body).toContain('no longer in the catalog');
    expect(failure.body).toContain('cart is still here');
    expect(failure.body).not.toContain('items.0.product_id');
    expect(failure.reference).toMatch(/^PRS-/);
  });

  it('recognises the deleted-product detail in either key spelling', () => {
    expect(hasMissingProductDetail({ 'items.1.product_id': ['invalid'] })).toBe(true);
    expect(hasMissingProductDetail({ 'items.1.productId': ['invalid'] })).toBe(true);
    expect(hasMissingProductDetail({ 'items.1.quantity': ['invalid'] })).toBe(false);
    expect(hasMissingProductDetail(undefined)).toBe(false);
    expect(hasMissingProductDetail(['items.0.product_id'])).toBe(false);
  });

  it('keeps the stock conflict recovery action', () => {
    const failure = saleFailureCopy({ status: 409, code: 'insufficient_stock', message: 'Insufficient stock for Mineral Water 1L.' });

    expect(failure.title).toBe('Stock changed');
    expect(failure.body).toContain('Refresh stock and remove the item');
    expect(failure.body).not.toContain('Mineral Water');
  });

  it('distinguishes an idempotency replay conflict from a stock conflict', () => {
    const replay = saleFailureCopy({ status: 409, message: 'The idempotency key was already used for a different request.' });

    expect(replay.title).toBe('This sale is already being saved');
    expect(replay.body).toContain('Check Transactions');
    expect(replay.body).not.toContain('Refresh stock');

    const coded = saleFailureCopy({ status: 409, code: 'idempotency_conflict' });
    expect(coded.title).toBe('This sale is already being saved');
  });

  it('points an unresolved earlier cash attempt at the transaction history', () => {
    const failure = saleFailureCopy({ code: 'cash_attempt_unresolved', message: 'An earlier cash attempt could not be confirmed.' });

    expect(failure.title).toBe('Check the earlier attempt first');
    expect(failure.body).toContain('Check Transactions');
    expect(failure.body).not.toContain('retry safely');
  });

  it('never prints another field validation detail from the API', () => {
    const failure = saleFailureCopy({
      status: 422,
      code: 'validation_error',
      message: 'The given data was invalid.',
      details: { cash_received: ['Cash received is below the amount due.'] },
    });

    expect(failure.title).toBe('The sale was not saved');
    expect(failure.body).not.toContain('Cash received is below the amount due.');
    expect(`${failure.title} ${failure.body}`).not.toMatch(/SQLSTATE|Illuminate|Exception|fetch/i);
  });

  it('falls back to a plain retryable message for a transport failure', () => {
    const failure = saleFailureCopy({ message: 'Unable to reach PorSca API: timeout' });

    expect(failure.title).toBe('The sale was not saved');
    expect(failure.body).toContain('Check the connection');
    expect(failure.body).not.toContain('Unable to reach PorSca API');
    expect(failure.reference).toMatch(/^PRS-/);
  });

  it('treats a 4xx refusal that answers the QR attempt as definitive', () => {
    expect(isDefinitiveQrRejection({ status: 400, code: 'validation_error' })).toBe(true);
    expect(isDefinitiveQrRejection({ status: 401 })).toBe(true);
    expect(isDefinitiveQrRejection({ status: 404 })).toBe(true);
    expect(isDefinitiveQrRejection({ status: 422, code: 'validation_error' })).toBe(true);
  });

  it('keeps an unresolved QR attempt possible after transport, server, and uncertain 4xx answers', () => {
    expect(isDefinitiveQrRejection({ message: 'Unable to reach PorSca API: timeout' })).toBe(false);
    expect(isDefinitiveQrRejection({ status: 500 })).toBe(false);
    expect(isDefinitiveQrRejection({ status: 503 })).toBe(false);
    expect(isDefinitiveQrRejection({ status: 408 })).toBe(false);
    expect(isDefinitiveQrRejection({ status: 409, code: 'idempotency_conflict' })).toBe(false);
    expect(isDefinitiveQrRejection({ status: 425 })).toBe(false);
    expect(isDefinitiveQrRejection({ status: 429 })).toBe(false);
  });
});
