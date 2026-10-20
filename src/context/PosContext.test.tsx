import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react-native';
import { ApiClient, ApiClientError } from '@/src/api/client';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { PosProvider, usePos, useCheckout } from './PosContext';
import { CheckoutHandle, CheckoutStorage, CheckoutStorageCorruptionError } from '@/src/domain/durableCheckout';
import { canAcceptCheckoutTender } from '@/src/domain/checkoutMachine';

const product = { id: '1', name: 'Coffee', barcode: '12345678', price: 25, stock: 20 };
const open: AuthorityCheckout = { id: 'durable-uuid', storeId: 'shop', state: 'open', revision: 1, amountCentavos: 2500, currency: 'PHP', items: [{ productId: 1, name: 'Coffee', quantity: 1, unitPriceCentavos: 2500 }], attempts: [], sale: null, exceptions: [], history: [] };
const pending: AuthorityCheckout = { ...open, state: 'payment_unresolved', attempts: [{ id: 7, method: 'qrph', amountCentavos: 2500, currency: 'PHP', status: 'pending', financialStatus: 'pending', firstVerifiedOutcome: null, qrPayload: 'QR', qrExpiresAt: null, reservation: null }] };
const paid: AuthorityCheckout = { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', financialStatus: 'paid', firstVerifiedOutcome: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: '2026-10-09' } };
const paidUnfulfilled: AuthorityCheckout = { ...pending, state: 'paid_unfulfilled', attempts: [{ ...pending.attempts[0], status: 'paid', financialStatus: 'paid_unfulfilled', firstVerifiedOutcome: 'paid' }] };
const readyForQrRetry: AuthorityCheckout = { ...pending, state: 'ready_for_attempt', attempts: [{ ...pending.attempts[0], status: 'non_payable', financialStatus: 'expired', firstVerifiedOutcome: 'non_payable' }] };
function fixture() {
  let handle: CheckoutHandle | null = null;
  const store: CheckoutStorage = { load: async () => handle, save: async value => { handle = value ? JSON.parse(JSON.stringify(value)) : null; } };
  const client = {
    isConfigured: true, baseUrl: 'https://shop.test/api/v1',
    listProducts: jest.fn().mockResolvedValue([product]), listInventory: jest.fn().mockResolvedValue([]), listSales: jest.fn().mockResolvedValue([]), getProduct: jest.fn().mockResolvedValue(product),
    updateInventory: jest.fn(), updateProduct: jest.fn(),
    createCheckout: jest.fn().mockResolvedValue(open), getCheckout: jest.fn().mockResolvedValue(pending), recoverCheckout: jest.fn().mockResolvedValue(pending),
    createCheckoutAttempt: jest.fn().mockResolvedValue(pending), refreshCheckoutAttempt: jest.fn().mockResolvedValue(pending),
    revalidateCheckout: jest.fn().mockResolvedValue(pending), abandonCheckout: jest.fn().mockResolvedValue({ ...open, state: 'abandoned' }),
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
  it('keeps a replacement purchase recoverable when an unmounted provider receives an old cash response', async () => {
    const { wrapper, client, handle } = fixture();
    const cashReceipt: AuthorityCheckout = { ...open, state: 'completed', sale: { ...paid.sale!, method: 'cash', cashReceivedCentavos: 10000, changeAmountCentavos: 7500 } };
    let finishCash!: (value: AuthorityCheckout) => void;
    client.checkoutCash.mockImplementationOnce(() => new Promise(resolve => { finishCash = resolve; }));
    const first = renderHook(() => usePos(), { wrapper }); await add(first.result);
    let oldCash!: Promise<unknown>;
    act(() => { oldCash = first.result.current.completeCashSale('100'); });
    await waitFor(() => expect(client.checkoutCash).toHaveBeenCalledTimes(1));
    first.unmount();
    client.recoverCheckout.mockResolvedValue(cashReceipt);
    const second = renderHook(() => usePos(), { wrapper });
    await act(async () => { await second.result.current.recoverCheckout(); });
    expect(handle()).toBeNull();
    const replacement: AuthorityCheckout = { ...open, id: 'replacement-uuid' };
    const replacementPayment: AuthorityCheckout = { ...pending, id: replacement.id };
    client.createCheckout.mockResolvedValue(replacement);
    client.createCheckoutAttempt.mockResolvedValue(replacementPayment);
    await add(second.result);
    await act(async () => { await second.result.current.startQrPhPayment(); });
    const replacementHandle = handle();
    expect(replacementHandle).toMatchObject({ id: replacement.id, tender: { key: expect.any(String) } });
    await act(async () => { finishCash(cashReceipt); await oldCash; });
    expect(handle()).toEqual(replacementHandle);
    second.unmount();
    client.recoverCheckout.mockResolvedValue(replacementPayment);
    client.getCheckout.mockResolvedValue(replacementPayment);
    const restarted = renderHook(() => usePos(), { wrapper });
    await act(async () => { await restarted.result.current.recoverCheckout(); });
    expect(restarted.result.current.authorityCheckout?.id).toBe(replacement.id);
    expect(restarted.result.current.checkoutMachine?.state).toBe('payment-unresolved');
    expect(handle()).toEqual(replacementHandle);
    await act(async () => { await expect(restarted.result.current.completeCashSale('100')).rejects.toThrow(/unresolved or checkout is locked/); });
    expect(client.checkoutCash).toHaveBeenCalledTimes(1);
  });
  it('keeps a cash-unresolved refusal recovery-only even when a stale open read has no attempt', async () => {
    const { wrapper, client } = fixture(); const { result } = renderHook(() => usePos(), { wrapper }); await add(result);
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('cash still pending', 409, 'cash_attempt_unresolved'));
    client.recoverCheckout.mockResolvedValue(open);
    await act(async () => { await expect(result.current.startQrPhPayment()).rejects.toThrow('cash still pending'); });
    expect(result.current.checkoutProgress?.uncertainTender).toBe('cash'); expect(result.current.checkoutProgress?.cashInput).toBeUndefined();
    await act(async () => { await result.current.recoverCheckout(); await expect(result.current.completeCashSale('100')).rejects.toThrow(/Recover the earlier cash sale/); });
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('keeps checkout subscribers isolated from catalog, search, inventory and history updates', async () => {
    const { client, store } = fixture(); let renders = 0;
    function CheckoutProbe() { useCheckout(); renders += 1; return null; }
    const wrapper = ({ children }: { children: React.ReactNode }) => <PosProvider client={client as unknown as ApiClient} checkoutStore={store}><CheckoutProbe />{children}</PosProvider>;
    const { result } = renderHook(() => usePos(), { wrapper }); await add(result);
    const initial = renders;
    await act(async () => { await result.current.refreshProducts(); await result.current.refreshInventory(); await result.current.refreshSales(); await result.current.searchProducts('Coffee'); });
    expect(renders).toBe(initial);
    await act(async () => { await result.current.startQrPhPayment(); }); expect(renders).toBeGreaterThan(initial);
    const pendingRenders = renders;
    client.refreshCheckoutAttempt.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { await expect(result.current.refreshQrPhPayment('7')).rejects.toThrow('offline'); });
    expect(renders).toBeGreaterThan(pendingRenders); expect(result.current.checkoutMachine?.attempts[0].payment).toBe('unknown');
  });
  it('shares overlapping catalog, inventory and history work and retries failed reads', async () => {
    const { wrapper, client } = fixture();
    let products!: (value: typeof product[]) => void;
    let history!: (value: never[]) => void;
    client.listProducts.mockImplementation(() => new Promise(resolve => { products = resolve; }));
    client.listSales.mockImplementation(() => new Promise(resolve => { history = resolve; }));
    const { result } = renderHook(() => usePos(), { wrapper });
    let calls!: Promise<boolean>[];
    act(() => { calls = [result.current.refreshProducts(), result.current.refreshInventory(), result.current.refreshInventory(), result.current.refreshSales(), result.current.refreshSales()]; });
    expect(client.listProducts).toHaveBeenCalledTimes(1);
    expect(client.listInventory).toHaveBeenCalledTimes(1);
    expect(client.listSales).toHaveBeenCalledTimes(1);
    await act(async () => { products([product]); history([]); expect(await Promise.all(calls)).toEqual([true, true, true, true, true]); });
    client.listSales.mockRejectedValueOnce(new Error('offline')).mockResolvedValue([]);
    await act(async () => { expect(await result.current.refreshSales()).toBe(false); expect(await result.current.refreshSales()).toBe(true); });
    expect(result.current.salesState).toBe('ready');
  });
  it('starts confirmation reads after commitment and cannot publish older pre-sale history or inventory', async () => {
    const { wrapper, client } = fixture();
    let oldHistory!: (value: never[]) => void;
    let oldCatalog!: (value: typeof product[]) => void;
    client.listSales.mockImplementationOnce(() => new Promise(resolve => { oldHistory = resolve; }));
    client.listProducts.mockImplementationOnce(() => new Promise(resolve => { oldCatalog = resolve; }));
    const { result } = renderHook(() => usePos(), { wrapper }); await add(result);
    let oldSales!: Promise<boolean>; let oldInventory!: Promise<boolean>;
    act(() => { oldSales = result.current.refreshSales(); oldInventory = result.current.refreshInventory(); });
    await act(async () => { await result.current.startQrPhPayment(); });
    client.recoverCheckout.mockResolvedValue(paid);
    client.listProducts.mockResolvedValue([{ ...product, stock: 19 }]);
    await act(async () => { await result.current.confirmQrPhPayment({ id: '7', amount: 25, status: 'paid' }); });
    expect(client.listSales).toHaveBeenCalledTimes(2); expect(client.listProducts).toHaveBeenCalledTimes(2);
    await act(async () => { oldHistory([]); oldCatalog([{ ...product, stock: 100 }]); expect(await oldSales).toBe(false); expect(await oldInventory).toBe(false); });
    expect(result.current.products[0].stock).toBe(19);
    expect(result.current.salesState).toBe('ready'); expect(result.current.inventoryState).toBe('ready');
    expect(result.current.consumeSalesHandoff()).toBe(true); expect(result.current.consumeSalesHandoff()).toBe(false);
  });
  it('returns a committed cash receipt before slow reads, and failed background reads preserve it', async () => {
    const { wrapper, client, handle } = fixture();
    let rejectHistory!: (error: Error) => void;
    client.listSales.mockImplementation(() => new Promise((_resolve, reject) => { rejectHistory = reject; }));
    const { result } = renderHook(() => usePos(), { wrapper }); await add(result);
    await act(async () => { expect(await result.current.completeCashSale('100')).toMatchObject({ id: '9', cashReceived: 100, change: 75 }); });
    expect(handle()).toBeNull(); expect(result.current.cart).toHaveLength(0); expect(result.current.salesState).toBe('loading');
    expect(result.current.checkoutCompletion?.sale).toMatchObject({ total: 25, cashReceived: 100, change: 75 });
    await act(async () => { rejectHistory(new Error('offline')); });
    expect(result.current.salesState).toBe('unavailable'); expect(result.current.checkoutCompletion?.sale.id).toBe('9');
    expect(client.checkoutCash).toHaveBeenCalledTimes(1);
    act(() => result.current.acknowledgeCheckout()); expect(result.current.checkoutCompletion).toBeUndefined();
    await add(result); expect(result.current.checkoutCompletion).toBeUndefined();
  });
  it('keeps cash receipt truth and its handle when retirement storage fails, without another cash post', async () => {
    const { wrapper, client, store, handle } = fixture();
    const original = store.save; store.save = async (value, expectedKey) => { if (value === null) throw new Error('storage unavailable'); await original(value, expectedKey); };
    const { result } = renderHook(() => usePos(), { wrapper }); await add(result);
    await act(async () => { expect(await result.current.completeCashSale('100')).toMatchObject({ id: '9', change: 75 }); });
    expect(result.current.checkoutCompletion?.sale.id).toBe('9'); expect(result.current.checkoutMachine?.state).toBe('completed'); expect(handle()?.id).toBe('durable-uuid');
    await waitFor(() => expect(result.current.salesState).toBe('ready'));
    expect(result.current.consumeSalesHandoff()).toBe(false);
    const cashReceipt = { ...open, state: 'completed' as const, sale: { ...paid.sale!, method: 'cash' as const, cashReceivedCentavos: 10000, changeAmountCentavos: 7500 } };
    client.recoverCheckout.mockResolvedValue(cashReceipt); store.save = original;
    await act(async () => { await result.current.recoverCheckout(); });
    expect(handle()).toBeNull(); expect(client.checkoutCash).toHaveBeenCalledTimes(1);
  });
  it('does not publish the history handoff when recovered cash retirement fails', async () => {
    const { wrapper, client, store, handle } = fixture();
    const { result } = renderHook(() => usePos(), { wrapper }); await add(result);
    client.checkoutCash.mockRejectedValueOnce(new ApiClientError('lost response'));
    await act(async () => { await expect(result.current.completeCashSale('100')).rejects.toThrow('lost response'); });
    expect(handle()?.id).toBe('durable-uuid');
    client.recoverCheckout.mockResolvedValue({ ...open, state: 'completed', sale: { ...paid.sale!, method: 'cash', cashReceivedCentavos: 10000, changeAmountCentavos: 7500 } });
    const save = store.save.bind(store);
    store.save = async (value, expectedKey) => { if (value === null) throw new Error('storage unavailable'); await save(value, expectedKey); };

    await act(async () => { await result.current.recoverCheckout(); });
    await waitFor(() => expect(result.current.salesState).toBe('ready'));
    expect(handle()?.id).toBe('durable-uuid');
    expect(result.current.consumeSalesHandoff()).toBe(false);
    expect(client.checkoutCash).toHaveBeenCalledTimes(1);
  });
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
  it('forwards explicit terminal QR retry to rotate the stored attempt key', async () => {
    const { wrapper, client, handle } = fixture();
    const first = renderHook(() => usePos(), { wrapper });
    await add(first.result);
    await act(async () => { await first.result.current.startQrPhPayment(); });
    const previousKey = handle()?.tender?.key;
    first.unmount();
    client.getCheckout.mockResolvedValue(readyForQrRetry);
    client.recoverCheckout.mockResolvedValue(readyForQrRetry);
    const replacement: AuthorityCheckout = { ...readyForQrRetry, state: 'payment_unresolved', attempts: [...readyForQrRetry.attempts, { ...pending.attempts[0], id: 8 }] };
    client.createCheckoutAttempt.mockResolvedValueOnce(replacement);
    const second = renderHook(() => usePos(), { wrapper });
    await act(async () => { await second.result.current.recoverCheckout(); });
    await act(async () => { await second.result.current.startQrPhPayment(true); });
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(2);
    expect(client.createCheckoutAttempt.mock.calls[1][2]).not.toBe(previousKey);
    expect(handle()?.tender?.key).toBe(client.createCheckoutAttempt.mock.calls[1][2]);
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
  it('keeps paid-but-unfulfilled reconciliation read-only and never adjusts stock or a sale', async () => {
    const { wrapper, client, handle } = fixture();
    const { result } = renderHook(() => usePos(), { wrapper });
    await add(result);
    await act(async () => { await result.current.startQrPhPayment(); });
    client.recoverCheckout.mockResolvedValue(paidUnfulfilled);
    await act(async () => {
      await result.current.confirmQrPhPayment({ id: '7', amount: 25, status: 'paid_unfulfilled' });
    });

    expect(result.current.checkoutMachine?.state).toBe('paid-but-unfulfilled');
    expect(result.current.checkoutMachine?.reconciliationRequired).toBe(true);
    expect(canAcceptCheckoutTender(result.current.checkoutMachine)).toBe(false);
    expect(result.current.cart).toHaveLength(1);
    expect(handle()?.id).toBe('durable-uuid');
    expect(client.listInventory).toHaveBeenCalled();
    expect(client.listSales).toHaveBeenCalled();
    expect(client.updateInventory).not.toHaveBeenCalled();
    expect(client.updateProduct).not.toHaveBeenCalled();
    expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);

    await act(async () => {
      await expect(result.current.revalidateCheckout()).rejects.toThrow(/administrator reconciliation/);
    });
    expect(client.revalidateCheckout).not.toHaveBeenCalled();
    await act(async () => {
      await expect(result.current.abandonCheckout('Administrator reviewed externally')).rejects.toThrow(/administrator reconciliation/);
    });
    expect(client.abandonCheckout).not.toHaveBeenCalled();
    expect(client.updateInventory).not.toHaveBeenCalled();
    expect(client.updateProduct).not.toHaveBeenCalled();
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
    const creationKey = handle()!.key;
    const persist = store.save.bind(store);
    let finishRetire!: () => void;
    store.save = jest.fn(async (value: CheckoutHandle | null, expectedKey?: string) => {
      if (value === null) await new Promise<void>(resolve => { finishRetire = resolve; });
      await persist(value, expectedKey);
    });
    client.recoverCheckout.mockResolvedValue({ ...readyForQrRetry, state: 'abandoned' });
    const second = renderHook(() => usePos(), { wrapper });
    let recovery!: Promise<void>;
    act(() => { recovery = second.result.current.openPosCheckouts(); });
    await waitFor(() => expect(store.save).toHaveBeenCalledWith(null, creationKey));
    await add(second.result);
    await add(second.result);
    await act(async () => {
      finishRetire();
      await recovery;
    });
    expect(second.result.current.cart[0].quantity).toBe(3);
    expect(handle()).toBeNull();
  });
  it('recovers the committed receipt when cash is retried after a cart price change', async () => {
    const { wrapper, client, handle } = fixture();
    const { result } = renderHook(() => usePos(), { wrapper }); await add(result);
    client.checkoutCash.mockRejectedValueOnce(new ApiClientError('lost response'));
    await act(async () => { await expect(result.current.completeCashSale('100')).rejects.toThrow('lost response'); });
    const updatedProduct = { ...product, name: 'Renamed Coffee', price: 30 };
    client.listProducts.mockResolvedValue([updatedProduct]);
    await act(async () => { await result.current.refreshProducts(); });
    await act(async () => { result.current.clearCart(); result.current.addProductChecked(updatedProduct); });
    expect(result.current.cart[0].product.price).toBe(30);
    client.getCheckout.mockResolvedValue({ ...open, state: 'completed', sale: { ...paid.sale!, method: 'cash', cashReceivedCentavos: 10000, changeAmountCentavos: 7500 } });
    const receipt = {
      id: '9', total: 25, cashReceived: 100, change: 75,
      items: [{ product: { id: '1', name: 'Coffee', price: 25 }, quantity: 1 }],
    };
    await act(async () => { expect(await result.current.completeCashSale('100')).toMatchObject(receipt); });
    await waitFor(() => expect(result.current.salesState).toBe('ready'));
    expect(result.current.checkoutCompletion?.sale).toMatchObject(receipt);
    expect(result.current.sales[0]).toMatchObject(receipt);
    expect(client.checkoutCash).toHaveBeenCalledTimes(1);
    expect(handle()).toBeNull();
    expect(result.current.cart).toHaveLength(0);
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
    expect(second.result.current.sales[0]).toMatchObject({ id: '9', paymentMethod: 'cash', items: [{ product: { id: '1', name: 'Coffee', price: 25 }, quantity: 1 }] });
    expect(second.result.current.cart).toHaveLength(0);
  });

  it('builds QR receipt items from the committed checkout and preserves a cart changed before and during reads', async () => {
    const { wrapper, client, handle } = fixture();
    const { result } = renderHook(() => usePos(), { wrapper });
    await add(result);
    await act(async () => { await result.current.startQrPhPayment(); });

    await act(async () => { result.current.addProductChecked({ id: '2', name: 'Tea', barcode: '22222222', price: 8, stock: 20 }); });
    const committed: AuthorityCheckout = {
      ...paid,
      items: [{ productId: 1, name: 'Authority Coffee', quantity: 1, unitPriceCentavos: 2500 }],
    };
    client.recoverCheckout.mockResolvedValue(committed);
    let finishInventory!: (value: Awaited<ReturnType<ApiClient['listInventory']>>) => void;
    let finishHistory!: (value: Awaited<ReturnType<ApiClient['listSales']>>) => void;
    client.listInventory.mockImplementation(() => new Promise(resolve => { finishInventory = resolve; }));
    client.listSales.mockImplementation(() => new Promise(resolve => { finishHistory = resolve; }));

    let confirmation!: ReturnType<typeof result.current.confirmQrPhPayment>;
    await act(async () => {
      confirmation = result.current.confirmQrPhPayment({ id: '7', status: 'paid', amount: 25 });
      await waitFor(() => {
        expect(client.listInventory).toHaveBeenCalledTimes(1);
        expect(client.listSales).toHaveBeenCalledTimes(1);
      });
    });
    await act(async () => { result.current.addProductChecked({ id: '3', name: 'Cocoa', barcode: '33333333', price: 12, stock: 20 }); });
    expect(result.current.checkoutCompletion).toBeUndefined();
    expect(handle()?.id).toBe('durable-uuid');

    await act(async () => { finishInventory([]); });
    await waitFor(() => expect(result.current.inventoryState).toBe('ready'));
    expect(result.current.checkoutCompletion).toBeUndefined();
    expect(handle()?.id).toBe('durable-uuid');
    await act(async () => {
      finishHistory([]);
      await expect(confirmation).resolves.toMatchObject({
        id: '9',
        items: [{ product: { id: '1', name: 'Authority Coffee', price: 25 }, quantity: 1 }],
      });
    });
    expect(result.current.checkoutCompletion?.sale.items).toEqual([
      { product: { id: '1', barcode: '', name: 'Authority Coffee', price: 25, stock: 0 }, quantity: 1 },
    ]);
    expect(result.current.cart.map(line => line.product.id)).toEqual(['1', '2', '3']);
    expect(handle()).toBeNull();
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('does not publish the history handoff when QR retirement fails', async () => {
    const { wrapper, client, store, handle } = fixture();
    const { result } = renderHook(() => usePos(), { wrapper }); await add(result);
    await act(async () => { await result.current.startQrPhPayment(); });
    const save = store.save.bind(store);
    store.save = async (value, expectedKey) => { if (value === null) throw new Error('storage unavailable'); await save(value, expectedKey); };
    client.recoverCheckout.mockResolvedValue(paid);

    await act(async () => { await expect(result.current.confirmQrPhPayment({ id: '7', status: 'paid', amount: 25 })).rejects.toThrow('storage unavailable'); });
    expect(client.listSales).toHaveBeenCalledTimes(1);
    expect(handle()?.id).toBe('durable-uuid');
    expect(result.current.checkoutCompletion).toBeUndefined();
    expect(result.current.consumeSalesHandoff()).toBe(false);
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
