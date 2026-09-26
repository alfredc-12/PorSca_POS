import { reconcileCart } from '@/src/domain/revalidation';
import { CartLine, Product } from '@/src/types';

const cola: Product = { id: 'cola', barcode: '4800000000019', name: 'Coca-Cola 500mL', price: 25, stock: 48, stockStatus: 'in_stock' };
const noodles: Product = { id: 'noodles', barcode: '4800000000026', name: 'Lucky Me', price: 13, stock: 4, stockStatus: 'low_stock' };

function line(product: Product, quantity: number): CartLine {
  return { product, quantity };
}

describe('pre-checkout revalidation', () => {
  it('reports nothing to review when prices and stock are unchanged', () => {
    const result = reconcileCart([line(cola, 1)], [cola]);

    expect(result.status).toBe('ready');
    expect(result.changes).toEqual([]);
    expect(result.appliedLines).toEqual([line(cola, 1)]);
  });

  it('surfaces a price change and shows the authoritative price in the applied cart', () => {
    const result = reconcileCart([line(cola, 2)], [{ ...cola, price: 27 }]);

    expect(result.status).toBe('review');
    expect(result.changes).toEqual([
      { productId: 'cola', name: 'Coca-Cola 500mL', kind: 'price', quantity: 2, previousPrice: 25, price: 27, blocking: false },
    ]);
    expect(result.appliedLines[0].product.price).toBe(27);
    expect(result.message).toContain('1 price changed');
  });

  it('treats a float artefact as no change at all', () => {
    const result = reconcileCart([line({ ...cola, price: 25.000000001 }, 1)], [cola]);
    expect(result.status).toBe('ready');
  });

  it('blocks when the catalog has less stock than the cart asks for, and clamps on apply', () => {
    const result = reconcileCart([line(cola, 6)], [{ ...cola, stock: 4, stockStatus: 'low_stock' }]);

    expect(result.status).toBe('blocked');
    expect(result.changes[0]).toMatchObject({ kind: 'stock', previousStock: 48, stock: 4, blocking: true });
    expect(result.message).toContain('less stock than the cart asks for');
    // The proposal keeps the line but at a quantity that can actually be sold.
    expect(result.appliedLines).toEqual([line({ ...cola, stock: 4, stockStatus: 'low_stock' }, 4)]);
  });

  it('blocks and drops a line whose product left the catalog', () => {
    const result = reconcileCart([line(cola, 1), line(noodles, 1)], [noodles]);

    expect(result.status).toBe('blocked');
    expect(result.changes).toEqual([
      { productId: 'cola', name: 'Coca-Cola 500mL', kind: 'removed', quantity: 1, blocking: true },
    ]);
    expect(result.message).toContain('no longer in the catalog');
    expect(result.appliedLines).toEqual([line({ ...noodles }, 1)]);
  });

  it('drops a line that has no stock left', () => {
    const result = reconcileCart([line(cola, 1)], [{ ...cola, stock: 0, stockStatus: 'out_of_stock' }]);

    expect(result.status).toBe('blocked');
    expect(result.appliedLines).toEqual([]);
  });

  it('reports both a price change and a remaining-stock change without blocking', () => {
    const result = reconcileCart([line(cola, 1)], [{ ...cola, price: 30, stock: 12, stockStatus: 'in_stock' }]);

    expect(result.status).toBe('review');
    expect(result.changes.map((change) => change.kind)).toEqual(['price', 'stock']);
    expect(result.message).toContain('1 price changed and 1 stock level changed');
    expect(result.appliedLines).toEqual([line({ ...cola, price: 30, stock: 12, stockStatus: 'in_stock' }, 1)]);
  });

  it('keeps the reconciled cart in the cart order', () => {
    const result = reconcileCart([line(noodles, 1), line(cola, 1)], [cola, noodles]);
    expect(result.lines.map((item) => item.product.id)).toEqual(['noodles', 'cola']);
  });
});
