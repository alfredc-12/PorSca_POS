import React, { useState } from 'react';
import { Alert, Button, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CheckoutScreen from '@/app/checkout';
import { PosProvider, usePos } from '@/src/context/PosContext';
import { ApiClient, ApiClientError, Payment } from '@/src/api/client';
import { Product, Sale } from '@/src/types';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ method: 'cash' }),
}));
jest.mock('@/src/components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const product: Product = { id: 'prd-001', barcode: '4800010000011', name: 'Coca-Cola 500mL', price: 25, stock: 48 };

const pendingPayment: Payment = { id: 'payment-1', status: 'pending', amount: 2500 };

const sale: Sale = {
  id: 'sale-1',
  createdAt: '2026-09-08T12:00:00Z',
  total: 25,
  paymentMethod: 'cash',
  status: 'paid',
  cashReceived: 100,
  change: 75,
  items: [{ product, quantity: 1 }],
};

/** The provider outlives the checkout route: only the screen unmounts on Leave. */
function Shop() {
  const { addProductChecked } = usePos();
  const [checkoutOpen, setCheckoutOpen] = useState(false);

  return (
    <View>
      <Button testID="shop-seed-cart" title="Seed cart" onPress={() => addProductChecked(product)} />
      <Button testID="shop-leave-checkout" title="Leave checkout" onPress={() => setCheckoutOpen(false)} />
      <Button testID="shop-open-checkout" title="Open checkout" onPress={() => setCheckoutOpen(true)} />
      {checkoutOpen ? <CheckoutScreen /> : null}
    </View>
  );
}

function shopClient(overrides: Record<string, unknown> = {}) {
  return {
    isConfigured: true,
    listProducts: jest.fn().mockResolvedValue([]),
    listInventory: jest.fn().mockResolvedValue([]),
    listSales: jest.fn().mockResolvedValue([]),
    createQrPhPayment: jest.fn().mockResolvedValue(pendingPayment),
    refreshPayment: jest.fn().mockResolvedValue(pendingPayment),
    createSale: jest.fn().mockResolvedValue(sale),
    ...overrides,
  } as unknown as ApiClient;
}

async function startPendingQrPayment(view: ReturnType<typeof render>) {
  fireEvent.press(view.getByTestId('shop-open-checkout'));
  fireEvent.press(view.getByTestId('checkout-payment-qrph'));
  fireEvent.press(view.getByTestId('start-qrph-payment'));
  await waitFor(() => expect(view.getByTestId('qr-payment-status')).toBeTruthy());
}

describe('checkout after leaving and reopening a pending QR payment', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('records no cash while the provider still holds the QR attempt', async () => {
    const createSale = jest.fn().mockResolvedValue(sale);
    const client = shopClient({ createSale });
    const view = render(<PosProvider client={client}><Shop /></PosProvider>);

    fireEvent.press(view.getByTestId('shop-seed-cart'));
    await startPendingQrPayment(view);

    fireEvent.press(view.getByTestId('shop-leave-checkout'));
    expect(view.queryByTestId('confirm-cash-payment')).toBeNull();
    fireEvent.press(view.getByTestId('shop-open-checkout'));

    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    expect(createSale).not.toHaveBeenCalled();
    expect(view.getByTestId('checkout-cash-error')).toHaveTextContent(/QR Ph payment.*unresolved/);
    expect(alertSpy).toHaveBeenCalledWith('Check the QR Ph payment first', expect.stringContaining('still unresolved'));
  });

  it('records cash once the retained QR attempt reached a terminal status', async () => {
    const createSale = jest.fn().mockResolvedValue(sale);
    const client = shopClient({ createSale, refreshPayment: jest.fn().mockResolvedValue({ ...pendingPayment, status: 'failed' }) });
    const view = render(<PosProvider client={client}><Shop /></PosProvider>);

    fireEvent.press(view.getByTestId('shop-seed-cart'));
    await startPendingQrPayment(view);
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    expect(view.getByText('Payment failed. No sale was recorded and stock was not changed.')).toBeTruthy();

    fireEvent.press(view.getByTestId('shop-leave-checkout'));
    fireEvent.press(view.getByTestId('shop-open-checkout'));

    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    expect(createSale).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Payment recorded', expect.stringContaining('was completed successfully'), expect.any(Array));
  });

  it('records no cash after the cart changed and checkout was reopened', async () => {
    const createSale = jest.fn().mockResolvedValue(sale);
    const client = shopClient({ createSale });
    const view = render(<PosProvider client={client}><Shop /></PosProvider>);

    fireEvent.press(view.getByTestId('shop-seed-cart'));
    await startPendingQrPayment(view);

    fireEvent.press(view.getByTestId('shop-leave-checkout'));
    fireEvent.press(view.getByTestId('shop-seed-cart'));
    fireEvent.press(view.getByTestId('shop-open-checkout'));

    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    expect(createSale).not.toHaveBeenCalled();
    expect(view.getByTestId('checkout-cash-error')).toHaveTextContent(/QR Ph payment.*unresolved/);
    expect(alertSpy).toHaveBeenCalledWith('Check the QR Ph payment first', expect.stringContaining('still unresolved'));
  });

  it('records cash after Laravel definitively rejected the QR attempt', async () => {
    const createQrPhPayment = jest.fn().mockRejectedValue(new ApiClientError('The cart has no valid items.', 422, 'validation_error'));
    const createSale = jest.fn().mockResolvedValue(sale);
    const client = shopClient({ createQrPhPayment, createSale });
    const view = render(<PosProvider client={client}><Shop /></PosProvider>);

    fireEvent.press(view.getByTestId('shop-seed-cart'));
    fireEvent.press(view.getByTestId('shop-open-checkout'));
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });

    // The refusal is an answer, not a provider attempt: leaving and reopening
    // must not leave a retained key blocking cash for the basket.
    fireEvent.press(view.getByTestId('shop-leave-checkout'));
    fireEvent.press(view.getByTestId('shop-open-checkout'));

    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    expect(createSale).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Payment recorded', expect.stringContaining('was completed successfully'), expect.any(Array));
  });

  it('offers no QR Ph start while a cash sale is being recorded', async () => {
    let resolveSale!: (value: Sale) => void;
    const createSale = jest.fn().mockReturnValue(new Promise<Sale>((done) => { resolveSale = done; }));
    const createQrPhPayment = jest.fn().mockResolvedValue(pendingPayment);
    const client = shopClient({ createSale, createQrPhPayment });
    const view = render(<PosProvider client={client}><Shop /></PosProvider>);

    fireEvent.press(view.getByTestId('shop-seed-cart'));
    fireEvent.press(view.getByTestId('shop-open-checkout'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    fireEvent.press(view.getByTestId('confirm-cash-payment'));
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    fireEvent.press(view.getByTestId('start-qrph-payment'));

    expect(createQrPhPayment).not.toHaveBeenCalled();
    await act(async () => { resolveSale(sale); });
  });

  it('keeps the exact-payload cash retry available after a QR start is refused for it', async () => {
    const createSale = jest.fn()
      .mockRejectedValueOnce(new ApiClientError('Unable to reach PorSca API: timeout'))
      .mockResolvedValueOnce(sale);
    const createQrPhPayment = jest.fn().mockResolvedValue(pendingPayment);
    const client = shopClient({ createSale, createQrPhPayment });
    const view = render(<PosProvider client={client}><Shop /></PosProvider>);

    fireEvent.press(view.getByTestId('shop-seed-cart'));
    fireEvent.press(view.getByTestId('shop-open-checkout'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    // The transport failure left an unacknowledged cash attempt. Its QR start
    // is refused, but the refusal is not a QR outcome: the same cash payload
    // must still be retryable with the key it already used.
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    expect(createQrPhPayment).not.toHaveBeenCalled();
    expect(view.queryByTestId('qr-payment-status')).toBeNull();

    fireEvent.press(view.getByTestId('checkout-payment-cash'));
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    expect(createSale).toHaveBeenCalledTimes(2);
    expect(createSale.mock.calls[1][0].idempotencyKey).toBe(createSale.mock.calls[0][0].idempotencyKey);
    expect(alertSpy).toHaveBeenCalledWith('Payment recorded', expect.stringContaining('was completed successfully'), expect.any(Array));
  });
});
