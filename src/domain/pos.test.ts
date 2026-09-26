import { CartLine, PaymentStatus, Product } from '@/src/types';
import {
  addProductToCart,
  calculateCartTotal,
  canRecordPaidSale,
  cashChange,
  deductStock,
  isBarcodeQuery,
  paymentError,
  searchProducts,
} from '@/src/domain/pos';

const cola: Product = { id: 'cola', barcode: '480001', name: 'Coca-Cola', price: 25, stock: 2, category: 'Beverages' };
const noodles: Product = { id: 'noodles', barcode: '480002', name: 'Lucky Me', price: 13, stock: 10, category: 'Noodles' };

function line(product: Product, quantity: number): CartLine {
  return { product, quantity };
}

describe('POS business rules', () => {
  it('calculates cart totals from quantity and unit price', () => {
    expect(calculateCartTotal([line(cola, 2), line(noodles, 1)])).toBe(63);
  });

  it('allows stock-safe additions and rejects out-of-stock or over-stock additions', () => {
    const first = addProductToCart([], cola);
    const second = addProductToCart(first.cart, cola);
    const rejected = addProductToCart(second.cart, cola);
    const out = addProductToCart([], { ...cola, stock: 0 });

    expect(first.ok).toBe(true);
    expect(second.cart[0].quantity).toBe(2);
    expect(rejected).toMatchObject({ ok: false, message: 'Only 2 of Coca-Cola in stock, and this cart already has 2. Reduce the quantity before adding more.' });
    expect(out).toMatchObject({ ok: false, message: 'Coca-Cola has no stock left. Restock it from Inventory before selling it.' });
  });

  it('calculates exact cash change and reports a shortfall', () => {
    expect(cashChange(63, 100)).toEqual({ sufficient: true, change: 37, shortfall: 0 });
    expect(cashChange(63, 50)).toEqual({ sufficient: false, change: 0, shortfall: 13 });
  });

  it('searches by name, barcode, and category while keeping an empty query unfiltered', () => {
    const products = [cola, noodles];
    expect(searchProducts(products, '')).toEqual(products);
    expect(searchProducts(products, '480002')).toEqual([noodles]);
    expect(searchProducts(products, 'beverages')).toEqual([cola]);
    expect(searchProducts(products, 'not-found')).toEqual([]);
  });

  it('treats a barcode-shaped query as an exact lookup online and offline alike', () => {
    const products = [{ ...cola, barcode: '4800010000011' }, { ...noodles, barcode: '4800019999999' }];

    expect(isBarcodeQuery('480001')).toBe(false);
    expect(isBarcodeQuery('4800010000011')).toBe(true);
    expect(isBarcodeQuery('coke 500')).toBe(false);

    expect(searchProducts(products, '4800010000011')).toEqual([products[0]]);
    expect(searchProducts(products, '4800010000')).toEqual([]);
    expect(searchProducts(products, ' 4800010000011 ')).toEqual([products[0]]);
    // A query too short to be a barcode keeps the substring behaviour of a text search.
    expect(searchProducts(products, '480001')).toEqual(products);
  });

  it('deducts inventory exactly once only after the complete cart passes validation', () => {
    const result = deductStock([cola, noodles], [line(cola, 2), line(noodles, 1)]);
    expect(result).toEqual([
      { ...cola, stock: 0 },
      { ...noodles, stock: 9 },
    ]);
    expect(deductStock([cola], [line(cola, 3)])).toBeNull();
  });

  it.each<[PaymentStatus, string | null]>([
    ['pending', 'Payment is still pending. Keep the QR screen open or try again later.'],
    ['failed', 'Payment failed. No sale was recorded and stock was not changed.'],
    ['cancelled', 'Payment was cancelled. No sale was recorded and stock was not changed.'],
    ['expired', 'Payment expired. Start a new QR Ph payment; stock was not changed.'],
    ['paid', null],
  ])('handles payment state %s without recording an unpaid sale', (status, message) => {
    expect(canRecordPaidSale(status)).toBe(status === 'paid');
    expect(paymentError(status)).toBe(message);
  });
});
