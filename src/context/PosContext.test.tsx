import React, { useState } from 'react';
import { Button, Text, View } from 'react-native';
import { act, fireEvent, render, renderHook, waitFor } from '@testing-library/react-native';
import { ApiClient, ApiClientError, Payment } from '@/src/api/client';
import { PosProvider, usePos } from '@/src/context/PosContext';
import { Sale } from '@/src/types';

const sale: Sale = {
  id: 'sale-1',
  createdAt: '2026-09-08T12:00:00Z',
  total: 25,
  paymentMethod: 'cash',
  status: 'paid',
  cashReceived: 100,
  change: 75,
  items: [{ product: { id: 'prd-001', barcode: '4800010000011', name: 'Coca-Cola 500mL', price: 25, stock: 48 }, quantity: 1 }],
};

function Harness() {
  const { products, cart, sales, addProductChecked, completeCashSale, replaceCartLines } = usePos();
  const [result, setResult] = useState('');
  const product = products[0];

  return (
    <View>
      <Button testID="add-product" title="Add product" onPress={() => addProductChecked(product)} />
      <Button
        testID="reprice-product"
        title="Reprice product"
        onPress={() => replaceCartLines([{ product: { ...product, price: 30 }, quantity: 1 }])}
      />
      <Button
        testID="complete-sale"
        title="Complete sale"
        onPress={() => {
          void completeCashSale(100).then(() => setResult('completed')).catch((error: Error) => setResult(error.message));
        }}
      />
      <Text>{`cart:${cart.length} sales:${sales.length} result:${result}`}</Text>
    </View>
  );
}

function SearchHarness() {
  const { searchProducts, catalogState, searchResults, catalogError } = usePos();

  return (
    <View>
      <Button testID="search-once" title="Search" onPress={() => { void searchProducts('coffee'); }} />
      <Button
        testID="search-twice"
        title="Search twice"
        onPress={() => { void searchProducts('coffee'); void searchProducts('coffee'); }}
      />
      <Text>{`state:${catalogState} results:${searchResults.length} error:${catalogError ?? ''}`}</Text>
    </View>
  );
}

function QrHarness() {
  const { products, cart, addProductChecked, startQrPhPayment, refreshQrPhPayment, confirmQrPhPayment } = usePos();
  const [result, setResult] = useState('');
  const [status, setStatus] = useState('');

  return (
    <View>
      <Button testID="add-qr-product" title="Add QR product" onPress={() => addProductChecked(products[0])} />
      <Button
        testID="start-qr"
        title="Start QR"
        onPress={() => {
          void startQrPhPayment().then(() => setResult('created')).catch((error: Error) => setResult(error.message));
        }}
      />
      <Button
        testID="refresh-qr"
        title="Refresh QR"
        onPress={() => {
          void refreshQrPhPayment('payment-1').then((payment) => setStatus(payment.status)).catch((error: Error) => setStatus(error.message));
        }}
      />
      <Button
        testID="confirm-qr"
        title="Confirm QR"
        onPress={() => {
          void confirmQrPhPayment({ id: 'payment-1', status: 'paid_unfulfilled', amount: 2500 })
            .then(() => setResult('confirmed')).catch((error: Error) => setResult(error.message));
        }}
      />
      <Text>{`qr-result:${result}`}</Text>
      <Text>{`qr-status:${status}`}</Text>
      <Text>{`qr-cart:${cart.length}`}</Text>
    </View>
  );
}

function UndoHarness() {
  const { products, cart, cartUndo, addProductChecked, clearCart, undoClearCart, beginCheckout } = usePos();

  return (
    <View>
      <Button testID="undo-add" title="Add" onPress={() => addProductChecked(products[0])} />
      <Button testID="undo-clear" title="Clear" onPress={() => clearCart()} />
      <Button testID="undo-undo" title="Undo" onPress={() => undoClearCart()} />
      <Button testID="undo-begin" title="Begin" onPress={() => beginCheckout()} />
      <Text>{`cart:${cart.length} undo:${cartUndo ? cartUndo.lineCount : 0}`}</Text>
    </View>
  );
}

function makeClient(createSale: jest.Mock) {
  return {
    isConfigured: true,
    createSale,
    resolveCashSaleAttempt: jest.fn().mockResolvedValue('unknown'),
    listInventory: jest.fn().mockResolvedValue([{
      productId: 'prd-001',
      sku: 'COLA-001',
      barcode: '4800010000011',
      productName: 'Coca-Cola 500mL',
      quantity: 47,
      reorderLevel: 5,
      status: 'in_stock',
    }]),
    listProducts: jest.fn().mockResolvedValue([{
      id: 'prd-001',
      sku: 'COLA-001',
      barcode: '4800010000011',
      name: 'Coca-Cola 500mL',
      price: 2500,
      stock: { quantity: 47, reorder_level: 5, status: 'in_stock' },
    }]),
    listSales: jest.fn().mockResolvedValue([sale]),
  } as unknown as ApiClient;
}

function makeQrClient(createQrPhPayment: jest.Mock) {
  return {
    isConfigured: true,
    createQrPhPayment,
  } as unknown as ApiClient;
}

function makeQrStageClient(overrides: Record<string, jest.Mock> = {}) {
  return {
    isConfigured: true,
    createQrPhPayment: jest.fn(),
    refreshPayment: jest.fn(),
    listInventory: jest.fn().mockResolvedValue([]),
    listProducts: jest.fn().mockResolvedValue([]),
    listSales: jest.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as ApiClient;
}

const pendingPayment: Payment = { id: 'payment-1', status: 'pending', amount: 2500 };

describe('PosProvider cart undo', () => {
  it('restores a cleared cart, then refuses to restore one a checkout has taken over', async () => {
    const { getByTestId, getByText } = render(
      <PosProvider client={makeClient(jest.fn())} demoCatalogEnabled><UndoHarness /></PosProvider>,
    );

    fireEvent.press(getByTestId('undo-add'));
    fireEvent.press(getByTestId('undo-clear'));
    await waitFor(() => expect(getByText('cart:0 undo:1')).toBeTruthy());

    fireEvent.press(getByTestId('undo-undo'));
    await waitFor(() => expect(getByText('cart:1 undo:0')).toBeTruthy());

    fireEvent.press(getByTestId('undo-clear'));
    await waitFor(() => expect(getByText('cart:0 undo:1')).toBeTruthy());

    fireEvent.press(getByTestId('undo-begin'));
    await waitFor(() => expect(getByText('cart:0 undo:0')).toBeTruthy());

    fireEvent.press(getByTestId('undo-undo'));
    expect(getByText('cart:0 undo:0')).toBeTruthy();
  });
});

describe('PosProvider Laravel cash checkout', () => {
  it('uses one idempotent request for concurrent retries and refreshes backend history/inventory', async () => {
    const createSale = jest.fn().mockResolvedValue(sale);
    const client = makeClient(createSale);
    const { getByTestId, getByText } = render(
      <PosProvider client={client} demoCatalogEnabled><Harness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-product'));
    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
      fireEvent.press(getByTestId('complete-sale'));
    });

    await waitFor(() => expect(getByText('cart:0 sales:1 result:completed')).toBeTruthy());
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(createSale.mock.calls[0][0]).toMatchObject({
      paymentMethod: 'cash',
      cashReceived: 10000,
      total: 2500,
      items: [{ productId: 'prd-001', quantity: 1, unitPrice: 2500 }],
    });
    expect(client.listInventory).toHaveBeenCalledTimes(1);
    expect(client.listProducts).toHaveBeenCalledTimes(1);
    expect(client.listSales).toHaveBeenCalledTimes(1);
  });

  it('retains the idempotency key after a transport error so a retry is safe', async () => {
    const createSale = jest.fn()
      .mockRejectedValueOnce(new ApiClientError('Unable to reach PorSca API: timeout'))
      .mockResolvedValueOnce(sale);
    const { getByTestId, getByText } = render(
      <PosProvider client={makeClient(createSale)} demoCatalogEnabled><Harness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-product'));
    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
    });
    await waitFor(() => expect(getByText(/result:Unable to reach PorSca API: timeout/)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
    });
    await waitFor(() => expect(getByText('cart:0 sales:1 result:completed')).toBeTruthy());

    expect(createSale).toHaveBeenCalledTimes(2);
    expect(createSale.mock.calls[0][0].idempotencyKey).toBe(createSale.mock.calls[1][0].idempotencyKey);
  });

  it('refuses to replay an uncertain cash attempt at the old price after repricing', async () => {
    const createSale = jest.fn().mockRejectedValueOnce(new ApiClientError('Unable to reach PorSca API: timeout'));
    const client = makeClient(createSale);
    const { getByTestId, getByText } = render(
      <PosProvider client={client} demoCatalogEnabled><Harness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-product'));
    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
    });
    await waitFor(() => expect(getByText(/result:Unable to reach PorSca API: timeout/)).toBeTruthy());

    // Laravel actually recorded the first sale, but the response was lost.
    const attemptedKey = createSale.mock.calls[0][0].idempotencyKey;
    expect(attemptedKey).toMatch(/^mobile-cash-/);
    client.resolveCashSaleAttempt = jest.fn().mockResolvedValue('found');

    // The cashier revalidates, accepts the new price, and retries the sale.
    fireEvent.press(getByTestId('reprice-product'));
    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
    });

    await waitFor(() => expect(getByText(/already recorded on the shop server/)).toBeTruthy());
    // The old-price sale was never replayed and no second sale was sent.
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(getByText(/cart:1 sales:0/)).toBeTruthy();
  });

  it('charges the revised price once an uncertain attempt is confirmed as unrecorded', async () => {
    const revisedSale: Sale = {
      ...sale,
      total: 30,
      items: [{ product: { ...sale.items[0].product, price: 30 }, quantity: 1 }],
    };
    const createSale = jest.fn()
      .mockRejectedValueOnce(new ApiClientError('Unable to reach PorSca API: timeout'))
      .mockResolvedValueOnce(revisedSale);
    const client = makeClient(createSale);
    // A complete receipt read confirms the uncertain key is absent; the
    // ordinary history read is still used for the post-sale refresh.
    client.resolveCashSaleAttempt = jest.fn().mockResolvedValue('not-found');
    client.listSales = jest.fn().mockResolvedValue([revisedSale]);
    const { getByTestId, getByText } = render(
      <PosProvider client={client} demoCatalogEnabled><Harness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-product'));
    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
    });
    await waitFor(() => expect(getByText(/result:Unable to reach PorSca API: timeout/)).toBeTruthy());
    const attemptedKey = createSale.mock.calls[0][0].idempotencyKey;

    fireEvent.press(getByTestId('reprice-product'));
    await act(async () => {
      fireEvent.press(getByTestId('complete-sale'));
    });
    await waitFor(() => expect(getByText('cart:0 sales:1 result:completed')).toBeTruthy());

    expect(createSale).toHaveBeenCalledTimes(2);
    expect(createSale.mock.calls[1][0].idempotencyKey).not.toBe(attemptedKey);
    expect(createSale.mock.calls[1][0]).toMatchObject({ total: 3000, items: [{ productId: 'prd-001', quantity: 1, unitPrice: 3000 }] });
  });
});

describe('PosProvider catalog search', () => {
  it('does not strand a search when the same query is invoked twice before it resolves', async () => {
    let resolveProducts: (products: unknown[]) => void = () => undefined;
    const listProducts = jest.fn().mockImplementation(() => new Promise((resolve) => { resolveProducts = resolve; }));
    const client = { isConfigured: true, listProducts } as unknown as ApiClient;
    const { getByTestId, getByText } = render(
      <PosProvider client={client}><SearchHarness /></PosProvider>,
    );

    await act(async () => {
      fireEvent.press(getByTestId('search-twice'));
    });
    // The duplicate invocation shares the in-flight read instead of discarding
    // its only answer and leaving the catalog loading forever (defect F4).
    expect(listProducts).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveProducts([{ id: 'prd-001', barcode: '4800010000016', name: 'Coffee 30g', price: 9 }]);
      await Promise.resolve();
    });

    await waitFor(() => expect(getByText(/state:ready results:1/)).toBeTruthy());
  });

  it('allows the same query to be retried after the catalog was unavailable', async () => {
    const listProducts = jest.fn()
      .mockRejectedValueOnce(new ApiClientError('Unable to reach PorSca API: timeout'))
      .mockResolvedValueOnce([{ id: 'prd-001', barcode: '4800010000016', name: 'Coffee 30g', price: 9 }]);
    const client = { isConfigured: true, listProducts } as unknown as ApiClient;
    const { getByTestId, getByText } = render(
      <PosProvider client={client}><SearchHarness /></PosProvider>,
    );

    await act(async () => {
      fireEvent.press(getByTestId('search-once'));
    });
    await waitFor(() => expect(getByText(/state:unavailable results:0/)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('search-once'));
    });

    await waitFor(() => expect(getByText(/state:ready results:1/)).toBeTruthy());
    expect(listProducts).toHaveBeenCalledTimes(2);
  });
});

describe('PosProvider Laravel QR Ph checkout', () => {
  it('uses one Laravel payment request for concurrent starts and preserves its key', async () => {
    const createQrPhPayment = jest.fn().mockResolvedValue(pendingPayment);
    const { getByTestId, getByText } = render(
      <PosProvider client={makeQrClient(createQrPhPayment)} demoCatalogEnabled><QrHarness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-qr-product'));
    await act(async () => {
      fireEvent.press(getByTestId('start-qr'));
      fireEvent.press(getByTestId('start-qr'));
    });

    await waitFor(() => expect(getByText('qr-result:created')).toBeTruthy());
    expect(createQrPhPayment).toHaveBeenCalledTimes(1);
    expect(createQrPhPayment.mock.calls[0][0]).toMatchObject({
      items: [{ productId: 'prd-001', quantity: 1 }],
    });
    expect(createQrPhPayment.mock.calls[0][0].idempotencyKey).toMatch(/^mobile-qr-/);
  });

  it('retries a transport failure with the same idempotency key rather than creating a new completion', async () => {
    const createQrPhPayment = jest.fn()
      .mockRejectedValueOnce(new ApiClientError('Unable to reach PorSca API: timeout'))
      .mockResolvedValueOnce(pendingPayment);
    const { getByTestId, getByText } = render(
      <PosProvider client={makeQrClient(createQrPhPayment)} demoCatalogEnabled><QrHarness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-qr-product'));
    await act(async () => {
      fireEvent.press(getByTestId('start-qr'));
    });
    await waitFor(() => expect(getByText(/qr-result:Unable to reach PorSca API: timeout/)).toBeTruthy());

    await act(async () => {
      fireEvent.press(getByTestId('start-qr'));
    });
    await waitFor(() => expect(getByText('qr-result:created')).toBeTruthy());

    expect(createQrPhPayment).toHaveBeenCalledTimes(2);
    expect(createQrPhPayment.mock.calls[0][0].idempotencyKey).toBe(createQrPhPayment.mock.calls[1][0].idempotencyKey);
  });

  it('verifies status through the provider-verified refresh endpoint instead of a stored read', async () => {
    const refreshPayment = jest.fn().mockResolvedValue({ ...pendingPayment, status: 'paid', saleId: 'sale-9' });
    const client = makeQrStageClient({ refreshPayment });
    const { getByTestId, getByText } = render(
      <PosProvider client={client} demoCatalogEnabled><QrHarness /></PosProvider>,
    );

    await act(async () => {
      fireEvent.press(getByTestId('refresh-qr'));
    });

    await waitFor(() => expect(getByText('qr-status:paid')).toBeTruthy());
    expect(refreshPayment).toHaveBeenCalledWith('payment-1');
    expect(refreshPayment).toHaveBeenCalledTimes(1);
  });

  it('refreshes authoritative state after paid_unfulfilled without clearing the cart', async () => {
    const client = makeQrStageClient();
    const { getByTestId, getByText } = render(
      <PosProvider client={client} demoCatalogEnabled><QrHarness /></PosProvider>,
    );

    fireEvent.press(getByTestId('add-qr-product'));
    await act(async () => {
      fireEvent.press(getByTestId('confirm-qr'));
    });

    // Money was received but no sale was recorded, so inventory and history
    // are re-read while the cart is kept for operator reconciliation.
    await waitFor(() => expect(getByText('qr-result:confirmed')).toBeTruthy());
    expect(client.listInventory).toHaveBeenCalled();
    expect(client.listSales).toHaveBeenCalled();
    expect(getByText('qr-cart:1')).toBeTruthy();
  });

  it('starts a fresh pending payment for each fulfilled identical basket, retaining same-attempt retries', async () => {
    const secondPayment = { ...pendingPayment, id: 'payment-2' };
    const createQrPhPayment = jest.fn()
      .mockResolvedValueOnce(pendingPayment)
      .mockResolvedValueOnce(secondPayment);
    const refreshPayment = jest.fn()
      .mockResolvedValueOnce({ ...pendingPayment, status: 'paid', saleId: 'sale-1' })
      .mockResolvedValueOnce({ ...secondPayment, status: 'paid', saleId: 'sale-2' });
    const client = makeQrStageClient({ createQrPhPayment, refreshPayment });
    const wrapper = ({ children }: { children: React.ReactNode }) => <PosProvider client={client}>{children}</PosProvider>;
    const { result } = renderHook(() => usePos(), { wrapper });
    const product = sale.items[0].product;

    act(() => { result.current.addProductChecked(product); });
    await act(async () => {
      await result.current.startQrPhPayment();
      await result.current.confirmQrPhPayment(await result.current.refreshQrPhPayment(pendingPayment.id));
    });
    expect(result.current.cart).toHaveLength(0);

    act(() => { result.current.addProductChecked(product); });
    await act(async () => {
      const attempts = await Promise.all([result.current.startQrPhPayment(), result.current.startQrPhPayment()]);
      expect(attempts).toEqual([secondPayment, secondPayment]);
      await result.current.confirmQrPhPayment(attempts[0]);
    });
    expect(result.current.cart).toHaveLength(1);
    expect(createQrPhPayment).toHaveBeenCalledTimes(2);
    expect(createQrPhPayment.mock.calls[1][0].idempotencyKey).not.toBe(createQrPhPayment.mock.calls[0][0].idempotencyKey);

    await act(async () => {
      await result.current.confirmQrPhPayment(await result.current.refreshQrPhPayment(secondPayment.id));
    });
    expect(result.current.cart).toHaveLength(0);
    expect(client.listInventory).toHaveBeenCalledTimes(2);
    expect(client.listSales).toHaveBeenCalledTimes(2);
  });

  it('keeps the paid attempt available while fulfillment verification is unavailable', async () => {
    const paid = { ...pendingPayment, status: 'paid' as const, saleId: 'sale-1' };
    const createQrPhPayment = jest.fn().mockResolvedValue(pendingPayment);
    const listInventory = jest.fn().mockRejectedValueOnce(new ApiClientError('Offline')).mockResolvedValue([]);
    const client = makeQrStageClient({ createQrPhPayment, listInventory, refreshPayment: jest.fn().mockResolvedValue(paid) });
    const wrapper = ({ children }: { children: React.ReactNode }) => <PosProvider client={client}>{children}</PosProvider>;
    const { result } = renderHook(() => usePos(), { wrapper });
    act(() => { result.current.addProductChecked(sale.items[0].product); });

    await act(async () => {
      await result.current.startQrPhPayment();
      await result.current.refreshQrPhPayment(pendingPayment.id);
      await expect(result.current.confirmQrPhPayment(paid)).rejects.toThrow('verification is unavailable');
    });
    expect(result.current.cart).toHaveLength(1);
    await act(async () => {
      expect(await result.current.startQrPhPayment()).toEqual(paid);
      await result.current.confirmQrPhPayment(paid);
    });
    expect(createQrPhPayment).toHaveBeenCalledTimes(1);
    expect(result.current.cart).toHaveLength(0);
  });

  it('never retires a paid-unfulfilled attempt or creates another payment for its basket', async () => {
    const unfulfilled = { ...pendingPayment, status: 'paid_unfulfilled' as const };
    const createQrPhPayment = jest.fn().mockResolvedValue(pendingPayment);
    const client = makeQrStageClient({ createQrPhPayment, refreshPayment: jest.fn().mockResolvedValue(unfulfilled) });
    const wrapper = ({ children }: { children: React.ReactNode }) => <PosProvider client={client}>{children}</PosProvider>;
    const { result } = renderHook(() => usePos(), { wrapper });
    act(() => { result.current.addProductChecked(sale.items[0].product); });

    await act(async () => {
      await result.current.startQrPhPayment();
      await result.current.confirmQrPhPayment(await result.current.refreshQrPhPayment(pendingPayment.id));
      expect(await result.current.startQrPhPayment()).toEqual(unfulfilled);
    });
    expect(result.current.cart).toHaveLength(1);
    expect(createQrPhPayment).toHaveBeenCalledTimes(1);
  });

  it('refuses cash while the cart still has a provider-unresolved QR attempt', async () => {
    const createQrPhPayment = jest.fn().mockResolvedValue(pendingPayment);
    const createSale = jest.fn().mockResolvedValue(sale);
    const client = makeQrStageClient({ createQrPhPayment, createSale });
    const wrapper = ({ children }: { children: React.ReactNode }) => <PosProvider client={client}>{children}</PosProvider>;
    const { result } = renderHook(() => usePos(), { wrapper });
    act(() => { result.current.addProductChecked(sale.items[0].product); });

    await act(async () => { await result.current.startQrPhPayment(); });

    await act(async () => {
      await expect(result.current.completeCashSale(100)).rejects.toMatchObject({ code: 'qr_payment_unresolved' });
    });
    expect(createSale).not.toHaveBeenCalled();
    expect(result.current.cart).toHaveLength(1);
  });

  it('refuses cash while a QR creation for the cart has no answer yet', async () => {
    const createQrPhPayment = jest.fn().mockReturnValue(new Promise<Payment>(() => undefined));
    const createSale = jest.fn().mockResolvedValue(sale);
    const client = makeQrStageClient({ createQrPhPayment, createSale });
    const wrapper = ({ children }: { children: React.ReactNode }) => <PosProvider client={client}>{children}</PosProvider>;
    const { result } = renderHook(() => usePos(), { wrapper });
    act(() => { result.current.addProductChecked(sale.items[0].product); });
    act(() => { void result.current.startQrPhPayment(); });

    await act(async () => {
      await expect(result.current.completeCashSale(100)).rejects.toMatchObject({ code: 'qr_payment_unresolved' });
    });
    expect(createSale).not.toHaveBeenCalled();
  });

  it('permits cash once the retained QR attempt reached a terminal provider status', async () => {
    const createQrPhPayment = jest.fn().mockResolvedValue({ ...pendingPayment, status: 'failed' as const });
    const createSale = jest.fn().mockResolvedValue(sale);
    const client = makeQrStageClient({ createQrPhPayment, createSale });
    const wrapper = ({ children }: { children: React.ReactNode }) => <PosProvider client={client}>{children}</PosProvider>;
    const { result } = renderHook(() => usePos(), { wrapper });
    act(() => { result.current.addProductChecked(sale.items[0].product); });

    await act(async () => { await result.current.startQrPhPayment(); });
    await act(async () => { expect(await result.current.completeCashSale(100)).toEqual(sale); });
    expect(createSale).toHaveBeenCalledTimes(1);
    expect(result.current.cart).toHaveLength(0);
  });
});

it('refuses a changed cash retry when its lost receipt may be beyond the first history page', async () => {
  const createRequests: unknown[] = [];
  const fetchImpl = jest.fn(async (url: string, options?: RequestInit) => {
    if (url.endsWith('/sales/checkout')) {
      createRequests.push(JSON.parse(options!.body as string));
      throw new Error('Response lost after commit');
    }
    if (url.endsWith('/sales?per_page=100')) {
      return {
        ok: true, status: 200,
        json: async () => ({ data: {
          items: Array.from({ length: 100 }, (_, index) => ({ id: index + 2, status: 'completed', idempotency_key: `other-${index}`, total_amount: 2500 })),
          pagination: { current_page: 1, last_page: 2, per_page: 100, total: 101 },
        } }),
      } as Response;
    }
    throw new Error(`Unexpected API read: ${url}`);
  });
  const client = new ApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
  const wrapper = ({ children }: { children: React.ReactNode }) => <PosProvider client={client}>{children}</PosProvider>;
  const { result } = renderHook(() => usePos(), { wrapper });
  const product = sale.items[0].product;
  act(() => { result.current.addProductChecked(product); });
  await act(async () => {
    await expect(result.current.completeCashSale(100)).rejects.toThrow('Response lost after commit');
  });
  act(() => { result.current.replaceCartLines([{ product: { ...product, price: 30 }, quantity: 1 }]); });
  await act(async () => {
    await expect(result.current.completeCashSale(100)).rejects.toMatchObject({ code: 'cash_attempt_unresolved' });
  });
  expect(createRequests).toHaveLength(1);
  expect(result.current.cart).toHaveLength(1);

  // The unresolved attempt survives a blocked retry, so it cannot be bypassed
  // by changing the cash amount and asking again.
  await act(async () => {
    await expect(result.current.completeCashSale(200)).rejects.toMatchObject({ code: 'cash_attempt_unresolved' });
  });
  expect(createRequests).toHaveLength(1);
});
