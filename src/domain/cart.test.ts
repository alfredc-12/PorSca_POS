import { CartAction, cartReducer, CLEAR_UNDO_WINDOW_MS, cartUnitCount, emptyCartState, reduceCart } from '@/src/domain/cart';
import { CartLine, Product } from '@/src/types';

const cola: Product = { id: 'cola', barcode: '480001', name: 'Coca-Cola', price: 25, stock: 2, category: 'Beverages' };
const noodles: Product = { id: 'noodles', barcode: '480002', name: 'Lucky Me', price: 13, stock: 10, category: 'Noodles' };

function line(product: Product, quantity: number): CartLine {
  return { product, quantity };
}

function withLines(lines: CartLine[]) {
  return { lines, undo: null };
}

describe('cart reducer', () => {
  it('adds through the guarded path and reports the guard message', () => {
    const first = reduceCart(emptyCartState, { type: 'add', product: cola });
    const second = reduceCart(first.state, { type: 'add', product: cola });
    const third = reduceCart(second.state, { type: 'add', product: cola });

    expect(first.change).toMatchObject({ ok: true });
    expect(second.state.lines).toEqual([line(cola, 2)]);
    expect(third.change?.ok).toBe(false);
    expect(third.change?.message).toContain('already has 2');
    expect(third.state).toBe(second.state);
  });

  it('increments from the stored line so the screen cannot supply a stale product', () => {
    const state = withLines([line(cola, 1)]);
    const result = reduceCart(state, { type: 'increment', productId: 'cola' });

    expect(result.change?.ok).toBe(true);
    expect(result.state.lines).toEqual([line(cola, 2)]);

    const missing = reduceCart(state, { type: 'increment', productId: 'gone' });
    expect(missing.change?.ok).toBe(false);
    expect(missing.state).toBe(state);
  });

  it('drops a line when the last unit is decremented', () => {
    const state = withLines([line(cola, 1), line(noodles, 2)]);
    const colaRemoved = reduceCart(state, { type: 'decrement', productId: 'cola' });
    const oneLeft = reduceCart(colaRemoved.state, { type: 'decrement', productId: 'noodles' });
    const empty = reduceCart(oneLeft.state, { type: 'decrement', productId: 'noodles' });
    const emptyAgain = reduceCart(empty.state, { type: 'decrement', productId: 'noodles' });

    expect(colaRemoved.state.lines).toEqual([line(noodles, 2)]);
    expect(oneLeft.state.lines).toEqual([line(noodles, 1)]);
    expect(empty.state.lines).toEqual([]);
    expect(emptyAgain.state).toBe(empty.state);
  });

  it('clears into an undo buffer and restores the exact lines', () => {
    const state = withLines([line(cola, 2), line(noodles, 1)]);
    const cleared = reduceCart(state, { type: 'clear', at: 1_000 });

    expect(cleared.state.lines).toEqual([]);
    expect(cleared.clearedLines).toEqual([line(cola, 2), line(noodles, 1)]);
    expect(cleared.state.undo?.expiresAt).toBe(1_000 + CLEAR_UNDO_WINDOW_MS);

    const undone = reduceCart(cleared.state, { type: 'undo-clear', at: 1_000 + CLEAR_UNDO_WINDOW_MS - 1 });
    expect(undone.restored).toBe(true);
    expect(undone.state.lines).toEqual([line(cola, 2), line(noodles, 1)]);
    expect(undone.state.undo).toBeNull();
  });

  it('refuses to restore a cart after the undo window closes', () => {
    const cleared = reduceCart(withLines([line(cola, 1)]), { type: 'clear', at: 1_000 });
    const late = reduceCart(cleared.state, { type: 'undo-clear', at: 1_000 + CLEAR_UNDO_WINDOW_MS + 1 });

    expect(late.restored).toBe(false);
    expect(late.state.lines).toEqual([]);
    expect(late.state.undo).toBeNull();
  });

  it('drops the undo buffer on the next cart mutation', () => {
    const cleared = reduceCart(withLines([line(cola, 1)]), { type: 'clear', at: 1_000 });
    expect(cleared.state.undo).not.toBeNull();

    const added = reduceCart(cleared.state, { type: 'add', product: noodles });
    expect(added.state.undo).toBeNull();
    expect(reduceCart(added.state, { type: 'undo-clear', at: 1_100 }).restored).toBe(false);
  });

  it('drops the undo buffer when a checkout begins', () => {
    const cleared = reduceCart(withLines([line(cola, 1)]), { type: 'clear', at: 1_000 });
    const handedOver = reduceCart(cleared.state, { type: 'discard-undo' });

    expect(handedOver.state.undo).toBeNull();
    expect(reduceCart(handedOver.state, { type: 'undo-clear', at: 1_100 }).restored).toBe(false);
  });

  it('resets after a recorded sale without offering an undo', () => {
    const state = withLines([line(cola, 1)]);
    expect(reduceCart(state, { type: 'reset' }).state).toEqual(emptyCartState);
  });

  it('replaces lines for a reconciled cart and discards any undo buffer', () => {
    const cleared = reduceCart(withLines([line(cola, 1)]), { type: 'clear', at: 1_000 });
    const reconciled = reduceCart(cleared.state, { type: 'replace-lines', lines: [line(noodles, 3)] });

    expect(reconciled.state).toEqual(withLines([line(noodles, 3)]));
  });

  it('clearing an empty cart offers no undo', () => {
    const result = reduceCart(emptyCartState, { type: 'clear', at: 1_000 });
    expect(result.state).toBe(emptyCartState);
    expect(result.state.undo).toBeNull();
  });

  it('counts units for labels', () => {
    expect(cartUnitCount([line(cola, 2), line(noodles, 3)])).toBe(5);
    expect(cartUnitCount([])).toBe(0);
  });

  it('keeps the dispatched state and the reduction state identical', () => {
    const actions: CartAction[] = [
      { type: 'add', product: cola },
      { type: 'add', product: cola },
      { type: 'decrement', productId: 'cola' },
      { type: 'clear', at: 5_000 },
      { type: 'undo-clear', at: 5_100 },
      { type: 'reset' },
      { type: 'replace-lines', lines: [line(noodles, 2)] },
    ];

    actions.reduce((state, action) => {
      expect(cartReducer(state, action)).toEqual(reduceCart(state, action).state);
      return cartReducer(state, action);
    }, emptyCartState);
  });
});
