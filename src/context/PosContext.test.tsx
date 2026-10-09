import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ApiClient, ApiClientError } from '@/src/api/client';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { PosProvider, usePos } from './PosContext';
import { CheckoutHandle, CheckoutStorage, CheckoutStorageCorruptionError } from '@/src/domain/durableCheckout';

const product = { id: '1', name: 'Coffee', barcode: '12345678', price: 25, stock: 20 };
const open: AuthorityCheckout = { id: 'durable-uuid', storeId: 'shop', state: 'open', revision: 1, amountCentavos: 2500, currency: 'PHP', items: [{ productId: 1, name: 'Coffee', quantity: 1, unitPriceCentavos: 2500 }], attempts: [], sale: null, exceptions: [], history: [] };
const pending: AuthorityCheckout = { ...open, state: 'payment_unresolved', attempts: [{ id: 7, method: 'qrph', amountCentavos: 2500, currency: 'PHP', status: 'pending', financialStatus: 'pending', firstVerifiedOutcome: null, qrPayload: 'QR', qrExpiresAt: null, reservation: null }] };
const paid: AuthorityCheckout = { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', financialStatus: 'paid', firstVerifiedOutcome: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: '2026-10-09' } };
const paidUnfulfilled: AuthorityCheckout = { ...pending, state: 'paid_unfulfilled', attempts: [{ ...pending.attempts[0], status: 'paid', financialStatus: 'paid_unfulfilled', firstVerifiedOutcome: 'paid' }] };
function fixture() {
  let handle: CheckoutHandle | null = null;
  const store: CheckoutStorage = { load: async () => handle, save: async value => { handle = value ? JSON.parse(JSON.stringify(value)) : null; } };
  const client = {
    isConfigured: true, baseUrl: 'https://shop.test/api/v1',
    listProducts: jest.fn().mockResolvedValue([product]), listInventory: jest.fn().mockResolvedValue([]), listSales: jest.fn().mockResolvedValue([]), getProduct: jest.fn().mockResolvedValue(product),
    createCheckout: jest.fn().mockResolvedValue(open), getCheckout: jest.fn().mockResolvedValue(pending), recoverCheckout: jest.fn().mockResolvedValue(pending),
    createCheckoutAttempt: jest.fn().mockResolvedValue(pending), refreshCheckoutAttempt: jest.fn().mockResolvedValue(pending),
    listCheckouts: jest.fn().mockResolvedValue({ items: [pending], pagination: { current_page: 1, last_page: 1, total: 1 } }),
    checkoutCash: jest.fn().mockResolvedValue({ ...open, state: 'completed', sale: { ...paid.sale!, method: 'cash', cashReceivedCentavos: 10000, changeAmountCentavos: 7500 } }),
    createSale: jest.fn(), createQrPhPayment: jest.fn(), refreshPayment: jest.fn(),
  };
  client.getCheckout.mockResolvedValue(open);
  const wrapper = ({ children }: { children: React.ReactNode }) => <PosProvider client={client as unknown as ApiClient} checkoutStore={store}>{children}</PosProvider>;
  return { client, store, wrapper, handle: () => handle };
}
async function add(result: { current: ReturnType<typeof usePos> }) { await act(async () => { result.current.addProductChecked(product); }); }

describe('POS durable checkout integration', () => {
  it('records cash through v3 and refreshes inventory/history, never legacy checkout', async () => {
    const { wrapper, client, handle } = fixture();
    const { result } = renderHook(() => usePos(), { wrapper });
    await add(result);
    await act(async () => { expect(await result.current.completeCashSale('100')).toMatchObject({ id: '9', total: 25, change: 75 }); });
    expect(client.checkoutCash).toHaveBeenCalledWith('durable-uuid', { revision: 1, acceptedAmountCentavos: 2500, cashReceivedCentavos: 10000 }, expect.any(String));
    expect(client.createSale).not.toHaveBeenCalled();
    expect(result.current.cart).toHaveLength(0);
    expect(handle()).toBeNull();
    expect(client.listSales).toHaveBeenCalled();
    expect(client.listInventory).toHaveBeenCalled();
  });
  it('blocks simultaneous cash and QR without another network tender', async () => {
    const { wrapper, client } = fixture();
    let finish!: (checkout: AuthorityCheckout) => void;
    client.createCheckoutAttempt.mockReturnValue(new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => usePos(), { wrapper });
    await add(result);
    await act(async () => {
      const started = result.current.startQrPhPayment();
      await expect(result.current.completeCashSale('100')).rejects.toThrow(/in progress/);
      finish(pending); await started;
    });
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('restores pending QR on open POS after provider unmount/restart via Laravel discovery and stored identity', async () => {
    const { wrapper, client, handle } = fixture();
    const first = renderHook(() => usePos(), { wrapper });
    await add(first.result);
    await act(async () => { await first.result.current.startQrPhPayment(); });
    expect(handle()?.id).toBe('durable-uuid'); first.unmount();
    client.getCheckout.mockResolvedValue(pending);
    const restarted = renderHook(() => usePos(), { wrapper });
    await act(async () => { await restarted.result.current.openPosCheckouts(); });
    expect(client.listCheckouts).toHaveBeenCalledWith(1);
    expect(client.getCheckout).toHaveBeenCalledWith('durable-uuid');
    expect(client.recoverCheckout).toHaveBeenCalledWith('durable-uuid');
    expect(restarted.result.current.unresolvedQrPayment()).toMatchObject({ id: '7', status: 'pending' });
    expect(restarted.result.current.cart).toHaveLength(1);
    expect(restarted.result.current.checkoutMachine?.state).toBe('payment-unresolved');
    await act(async () => { await expect(restarted.result.current.completeCashSale('100')).rejects.toThrow(/unresolved/); });
    expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
  it('discovers other operators interrupted checkouts across pages and resolves each show', async () => {
    const { wrapper, client } = fixture();
    client.listCheckouts.mockResolvedValueOnce({ items: [pending], pagination: { current_page: 1, last_page: 2, total: 2 } }).mockResolvedValueOnce({ items: [{ ...pending, id: 'another-uuid' }], pagination: { current_page: 2, last_page: 2, total: 2 } });
    client.getCheckout.mockImplementation(async id => ({ ...pending, id }));
    const { result } = renderHook(() => usePos(), { wrapper });
    await act(async () => { await result.current.openPosCheckouts(); });
    expect(client.getCheckout).toHaveBeenCalledWith('another-uuid');
    expect(result.current.recoverableCheckouts).toHaveLength(2);
    await act(async () => { await result.current.recoverCheckout('durable-uuid'); });
    expect(result.current.unresolvedQrPayment()?.id).toBe('7');
  });
  it.each(['inventory', 'history'])('keeps paid-but-unfulfilled QR unresolved when %s verification fails', async failedRead => {
    const { wrapper, client, handle } = fixture();
    const { result } = renderHook(() => usePos(), { wrapper });
    await add(result);
    await act(async () => { await result.current.startQrPhPayment(); });
    client.recoverCheckout.mockResolvedValue(paidUnfulfilled);
    if (failedRead === 'inventory') client.listInventory.mockRejectedValueOnce(new ApiClientError('offline'));
    else client.listSales.mockRejectedValueOnce(new ApiClientError('offline'));
    await act(async () => {
      await expect(result.current.confirmQrPhPayment({ id: '7', status: 'paid_unfulfilled', amount: 25 })).rejects.toThrow(/Retry inventory and history verification/);
    });
    expect(handle()?.id).toBe('durable-uuid');
    expect(result.current.cart).toHaveLength(1);
  });
  it('keeps paid-but-unverified QR recoverable across sign-out/remount until history verification succeeds', async () => {
    const { wrapper, client, handle } = fixture();
    const first = renderHook(() => usePos(), { wrapper });
    await add(first.result);
    await act(async () => { await first.result.current.startQrPhPayment(); });
    client.refreshCheckoutAttempt.mockResolvedValue(paid); client.recoverCheckout.mockResolvedValue(paid);
    client.listSales.mockRejectedValueOnce(new ApiClientError('offline'));
    await act(async () => {
      const payment = await first.result.current.refreshQrPhPayment('7');
      await expect(first.result.current.confirmQrPhPayment(payment)).rejects.toThrow(/verification/);
    });
    expect(handle()?.id).toBe('durable-uuid'); first.unmount();
    client.listSales.mockResolvedValue([]);
    const second = renderHook(() => usePos(), { wrapper });
    await act(async () => {
      await second.result.current.recoverCheckout();
      await second.result.current.confirmQrPhPayment({ id: '7', amount: 25, status: 'paid' });
    });
    expect(handle()).toBeNull(); expect(second.result.current.cart).toHaveLength(0);
  });
  it('does not auto-restore over cashier edits made during server discovery', async () => {
    const { wrapper, client } = fixture();
    let finishDiscovery!: (page: { items: AuthorityCheckout[]; pagination: { current_page: number; last_page: number; total: number } }) => void;
    client.listCheckouts.mockReturnValueOnce(new Promise(resolve => { finishDiscovery = resolve; }));
    const { result } = renderHook(() => usePos(), { wrapper });
    let discovery!: Promise<void>;
    act(() => { discovery = result.current.openPosCheckouts(); });
    await add(result);
    await add(result);
    await act(async () => {
      finishDiscovery({ items: [pending], pagination: { current_page: 1, last_page: 1, total: 1 } });
      await discovery;
    });
    expect(result.current.cart[0].quantity).toBe(2);
    expect(result.current.recoverableCheckouts).toHaveLength(1);
    expect(result.current.checkoutRecoveryError).toBeTruthy();
    expect(client.recoverCheckout).not.toHaveBeenCalled();
  });
  it('does not auto-restore over cashier edits made during authority recovery', async () => {
    const { wrapper, client } = fixture();
    const first = renderHook(() => usePos(), { wrapper });
    await add(first.result);
    await act(async () => { await first.result.current.startQrPhPayment(); });
    first.unmount();
    client.recoverCheckout.mockClear();
    let finishRecovery!: (checkout: AuthorityCheckout) => void;
    client.recoverCheckout.mockReturnValueOnce(new Promise(resolve => { finishRecovery = resolve; }));
    const second = renderHook(() => usePos(), { wrapper });
    let recovery!: Promise<void>;
    act(() => { recovery = second.result.current.openPosCheckouts(); });
    await waitFor(() => expect(client.recoverCheckout).toHaveBeenCalled());
    await add(second.result);
    await add(second.result);
    await act(async () => {
      finishRecovery(pending);
      await recovery;
    });
    expect(second.result.current.cart[0].quantity).toBe(2);
    expect(second.result.current.recoverableCheckouts).toHaveLength(1);
    expect(second.result.current.checkoutRecoveryError).toBeTruthy();
  });
  it('does not auto-restore over cashier edits made during recovered-product reads', async () => {
    const { wrapper, client } = fixture();
    const first = renderHook(() => usePos(), { wrapper });
    await add(first.result);
    await act(async () => { await first.result.current.startQrPhPayment(); });
    first.unmount();
    client.getProduct.mockClear();
    let finishProduct!: (value: typeof product) => void;
    client.getProduct.mockReturnValueOnce(new Promise(resolve => { finishProduct = resolve; }));
    const second = renderHook(() => usePos(), { wrapper });
    let recovery!: Promise<void>;
    act(() => { recovery = second.result.current.openPosCheckouts(); });
    await waitFor(() => expect(client.getProduct).toHaveBeenCalled());
    await add(second.result);
    await add(second.result);
    await act(async () => {
      finishProduct(product);
      await recovery;
    });
    expect(second.result.current.cart[0].quantity).toBe(2);
    expect(second.result.current.recoverableCheckouts).toHaveLength(1);
    expect(second.result.current.checkoutRecoveryError).toBeTruthy();
  });
  it('offers corrupt-identity discard only after empty server discovery and keeps its reason', async () => {
    const { wrapper, client, store } = fixture();
    store.load = jest.fn().mockRejectedValue(new CheckoutStorageCorruptionError('legacy basket [[null,1]]'));
    client.listCheckouts.mockResolvedValue({ items: [pending], pagination: { current_page: 1, last_page: 1, total: 1 } });
    const { result } = renderHook(() => usePos(), { wrapper });
    await act(async () => { await result.current.openPosCheckouts(); });
    expect(result.current.canDiscardCorruptCheckout).toBe(false);
    client.listCheckouts.mockResolvedValue({ items: [], pagination: { current_page: 1, last_page: 1, total: 0 } });
    await act(async () => { await result.current.openPosCheckouts(); });
    expect(result.current.canDiscardCorruptCheckout).toBe(true);
    await act(async () => {
      await expect(result.current.discardCorruptCheckout('Operator approved discard')).resolves.toBe('Operator approved discard');
    });
    expect(result.current.canDiscardCorruptCheckout).toBe(false);
    expect(result.current.authorityCheckout).toBeUndefined();
    expect(result.current.cart).toHaveLength(0);
  });
  it('reports a missing retained authority record as unrecoverable, never paid', async () => {
    const { wrapper, client, handle } = fixture();
    const first = renderHook(() => usePos(), { wrapper });
    await add(first.result);
    await act(async () => { await first.result.current.startQrPhPayment(); }); first.unmount();
    client.recoverCheckout.mockRejectedValue(new ApiClientError('not found', 404));
    const second = renderHook(() => usePos(), { wrapper });
    await act(async () => { await second.result.current.openPosCheckouts(); });
    expect(second.result.current.checkoutRecoveryError).toMatch(/no authority record/);
    expect(second.result.current.unresolvedQrPayment()).toBeUndefined();
    expect(handle()?.id).toBe('durable-uuid');
  });
  it('preserves cashier edits while retiring an automatically recovered abandoned checkout', async () => {
    const { wrapper, client, store, handle } = fixture();
    const first = renderHook(() => usePos(), { wrapper });
    await add(first.result);
    await act(async () => { await first.result.current.startQrPhPayment(); });
    first.unmount();
    const persist = store.save.bind(store);
    let finishRetire!: () => void;
    store.save = jest.fn(async value => {
      if (value === null) await new Promise<void>(resolve => { finishRetire = resolve; });
      await persist(value);
    });
    client.recoverCheckout.mockResolvedValue({ ...open, state: 'abandoned' });
    const second = renderHook(() => usePos(), { wrapper });
    let recovery!: Promise<void>;
    act(() => { recovery = second.result.current.openPosCheckouts(); });
    await waitFor(() => expect(store.save).toHaveBeenCalledWith(null));
    await add(second.result);
    await add(second.result);
    await act(async () => {
      finishRetire();
      await recovery;
    });
    expect(second.result.current.cart[0].quantity).toBe(2);
    expect(handle()).toBeNull();
  });
  it('resolves a lost cash response on restart without charging the purchase twice', async () => {
    const { wrapper, client, handle } = fixture();
    const first = renderHook(() => usePos(), { wrapper }); await add(first.result);
    client.checkoutCash.mockRejectedValueOnce(new ApiClientError('lost response'));
    await act(async () => { await expect(first.result.current.completeCashSale('100')).rejects.toThrow('lost response'); });
    const completedCash: AuthorityCheckout = { ...paid, sale: { ...paid.sale!, method: 'cash', cashReceivedCentavos: 10000, changeAmountCentavos: 7500 } };
    client.recoverCheckout.mockResolvedValue(completedCash);
    first.unmount();
    const second = renderHook(() => usePos(), { wrapper });
    await act(async () => { await second.result.current.openPosCheckouts(); });
    expect(client.checkoutCash).toHaveBeenCalledTimes(1);
    expect(handle()).toBeNull();
    expect(second.result.current.sales[0]).toMatchObject({ id: '9', paymentMethod: 'cash' });
    expect(second.result.current.cart).toHaveLength(0);
  });

  it('ignores a caller-supplied paid status unless Laravel records a completed sale', async () => {
    const { wrapper } = fixture(); const { result } = renderHook(() => usePos(), { wrapper });
    await add(result); await act(async () => { await result.current.startQrPhPayment(); });
    await act(async () => { await expect(result.current.confirmQrPhPayment({ id: '7', status: 'paid', amount: 25 })).rejects.toThrow(/unresolved/); });
    expect(result.current.cart).toHaveLength(1);
  });
});

describe('POS unrelated cart and search behavior', () => {
  it('restores Clear All undo but drops it when checkout begins', async () => {
    const { wrapper } = fixture(); const { result } = renderHook(() => usePos(), { wrapper }); await add(result);
    act(() => result.current.clearCart()); expect(result.current.cartUndo?.lineCount).toBe(1);
    act(() => result.current.undoClearCart()); expect(result.current.cart).toHaveLength(1);
    act(() => result.current.clearCart()); act(() => result.current.beginCheckout()); act(() => result.current.undoClearCart());
    expect(result.current.cart).toHaveLength(0);
  });
  it('shares a concurrent same-query search and permits retry after failure', async () => {
    const { wrapper, client } = fixture(); const { result } = renderHook(() => usePos(), { wrapper });
    await act(async () => { await Promise.all([result.current.searchProducts('coffee'), result.current.searchProducts('coffee')]); });
    expect(client.listProducts).toHaveBeenCalledTimes(1);
    client.listProducts.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await result.current.searchProducts('coffee'); }); expect(result.current.catalogState).toBe('unavailable');
    await act(async () => { await result.current.searchProducts('coffee'); }); expect(result.current.catalogState).toBe('ready');
  });
});
