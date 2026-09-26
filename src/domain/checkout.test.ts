import { hasMissingProductDetail, saleFailureCopy } from '@/src/domain/checkout';

describe('checkout failure copy', () => {
  it('explains a deleted product instead of showing generic validation text', () => {
    const failure = saleFailureCopy({
      status: 422,
      code: 'validation_error',
      message: 'The given data was invalid.',
      details: { 'items.0.product_id': ['The selected items.0.product_id is invalid.'] },
    });

    expect(failure.title).toBe('Product no longer available');
    expect(failure.message).toContain('no longer in the catalog');
    expect(failure.message).toContain('cart is still here');
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

    expect(failure.title).toBe('Insufficient stock');
    expect(failure.message).toContain('Refresh inventory and remove the unavailable item');
  });

  it('names the first validation detail when the failure is another field', () => {
    const failure = saleFailureCopy({
      status: 422,
      code: 'validation_error',
      details: { cash_received: ['Cash received is below the amount due.'] },
    });

    expect(failure.title).toBe('Unable to complete sale');
    expect(failure.message).toContain('Cash received is below the amount due.');
  });

  it('falls back to a retryable message for a transport failure', () => {
    const failure = saleFailureCopy({ message: 'Unable to reach PorSca API: timeout' });

    expect(failure.title).toBe('Unable to complete sale');
    expect(failure.message).toContain('retry safely');
  });
});
