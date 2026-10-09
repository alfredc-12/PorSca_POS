import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CheckoutScreen from '@/app/checkout';
import { router } from 'expo-router';
import { usePos } from '@/src/context/PosContext';
import { ApiClientError, Payment } from '@/src/api/client';
import { CartLine, Sale } from '@/src/types';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({ method: 'cash' }),
}));
jest.mock('@/src/context/PosContext', () => ({ usePos: jest.fn() }));
jest.mock('@/src/components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const product = { id: '1', barcode: '4800000000041', name: 'Mineral Water 1L', price: 35, stock: 10, category: 'Beverages' as const };
const cart: CartLine[] = [{ product, quantity: 1 }];
const sale: Sale = {
  id: '42',
  createdAt: '2026-09-08T12:00:00Z',
  total: 35,
  paymentMethod: 'cash',
  status: 'paid',
  cashReceived: 100,
  change: 65,
  items: cart,
};

const mockReplace = router.replace as jest.Mock;
const mockUsePos = usePos as jest.Mock;

const pendingQrPayment: Payment = {
  id: 'pay-1',
  status: 'pending',
  amount: 3500,
  qrPayload: 'data:image/png;base64,qr-fixture',
  qrCode: 'data:image/png;base64,qr-fixture',
};

function setContext(overrides: Record<string, unknown> = {}) {
  mockUsePos.mockReturnValue({
    total: 35,
    cart,
    apiConfigured: true,
    completeSale: jest.fn(),
    completeCashSale: jest.fn().mockResolvedValue(sale),
    resetCart: jest.fn(),
    startQrPhPayment: jest.fn().mockResolvedValue(pendingQrPayment),
    refreshQrPhPayment: jest.fn().mockResolvedValue(pendingQrPayment),
    confirmQrPhPayment: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  });
}

describe('CheckoutScreen cash states', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setContext();
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('rejects underpaid cash with a visible shortfall and keeps the checkout available', () => {
    const completeCashSale = jest.fn();
    setContext({ completeCashSale });
    const { getByTestId, getByText } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '20');
    fireEvent.press(getByTestId('confirm-cash-payment'));

    expect(getByText('You are ₱15.00 short. Enter at least ₱35.00 and confirm again.')).toBeTruthy();
    expect(completeCashSale).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalledWith('Not enough cash', expect.stringContaining('confirm again.'));
  });

  it('surfaces Laravel stock conflicts with a recovery action and preserves the cart', async () => {
    const completeCashSale = jest.fn().mockRejectedValue(new ApiClientError('Insufficient stock for Mineral Water 1L.', 409, 'insufficient_stock'));
    setContext({ completeCashSale });
    const { getByTestId, getByText } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '100');
    await act(async () => {
      fireEvent.press(getByTestId('confirm-cash-payment'));
    });

    expect(getByText(/Some items are no longer available/)).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith('Stock changed', expect.stringContaining('try again.'));
  });

  it('records a successful cash response and offers the authoritative history route', async () => {
    const completeCashSale = jest.fn().mockResolvedValue(sale);
    setContext({ completeCashSale });
    const { getByTestId } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '100');
    await act(async () => {
      fireEvent.press(getByTestId('confirm-cash-payment'));
    });

    expect(completeCashSale).toHaveBeenCalledWith(100);
    expect(alertSpy).toHaveBeenCalledWith('Payment recorded', '42 was completed successfully.', expect.any(Array));
    const actions = alertSpy.mock.calls[0][2] as { onPress?: () => void }[];
    actions[0].onPress?.();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/transactions');
  });

  it('ignores a second confirm tap while a cash sale is in flight', async () => {
    let resolve!: (sale: Sale) => void;
    const completeCashSale = jest.fn().mockReturnValue(new Promise<Sale>((done) => { resolve = done; }));
    setContext({ completeCashSale });
    const { getByTestId } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '100');
    fireEvent.press(getByTestId('confirm-cash-payment'));
    fireEvent.press(getByTestId('confirm-cash-payment'));
    expect(completeCashSale).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(sale); });
    expect(completeCashSale).toHaveBeenCalledTimes(1);
  });

  it('blocks checkout entirely when Laravel is not configured, even in demo mode', () => {
    const completeCashSale = jest.fn();
    setContext({ apiConfigured: false, completeCashSale });
    const view = render(<CheckoutScreen />);

    // A deep link or stale navigation to this route cannot record a local sale
    // (defect F1).
    expect(view.getByTestId('checkout-offline-notice')).toHaveTextContent(/No sale was recorded and stock was not changed/);
    expect(view.queryByTestId('cash-received-input')).toBeNull();
    expect(view.queryByTestId('confirm-cash-payment')).toBeNull();
    expect(view.queryByTestId('checkout-payment-qrph')).toBeNull();
    expect(completeCashSale).not.toHaveBeenCalled();
  });
});

describe('CheckoutScreen Laravel QR Ph states', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setContext();
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  async function openQrCheckout() {
    const view = render(<CheckoutScreen />);
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    fireEvent.press(view.getByTestId('start-qrph-payment'));
    await waitFor(() => expect(view.getByTestId('qr-payment-status')).toBeTruthy());
    return view;
  }

  it('creates a Laravel payment, displays the returned QR payload, and remains pending', async () => {
    const startQrPhPayment = jest.fn().mockResolvedValue(pendingQrPayment);
    setContext({ startQrPhPayment });
    const view = await openQrCheckout();

    expect(startQrPhPayment).toHaveBeenCalledWith(false);
    expect(view.getByTestId('qr-payment-image')).toBeTruthy();
    expect(view.getByText('Payment pending…')).toBeTruthy();
    expect(view.getByTestId('refresh-qr-payment')).toBeTruthy();
    expect(view.getByTestId('leave-qr-payment')).toBeTruthy();
    expect(view.queryByTestId('retry-qr-payment')).toBeNull();
  });

  // Supplemental INV-03 / AC-08/32/34/36 coverage overlaps the protected
  // baseline oracle, but uses today's Laravel-backed checkout interface.
  it('offers no local paid simulation and cannot complete a pending QR through cashier actions', async () => {
    const completeCashSale = jest.fn();
    const confirmQrPhPayment = jest.fn();
    const resetCart = jest.fn();
    setContext({ completeCashSale, confirmQrPhPayment, resetCart });
    const view = await openQrCheckout();
    expect(view.queryByText(/simulate\s+(paid|success)/i)).toBeNull();
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    fireEvent.press(view.getByTestId('leave-qr-payment'));
    act(() => {
      for (const call of alertSpy.mock.calls) {
        for (const button of (call[2] ?? []) as { text?: string; onPress?: () => void }[]) {
          expect(button.text ?? '').not.toMatch(/simulate\s+(paid|success)/i);
          button.onPress?.();
        }
      }
    });
    expect(completeCashSale).not.toHaveBeenCalled();
    expect(confirmQrPhPayment).not.toHaveBeenCalled();
    expect(resetCart).not.toHaveBeenCalled();
  });

  // Supplemental INV-04 / AC-16 coverage overlaps the protected cash oracle.
  it.each(['pending', 'verification', 'creating', 'unknown'] as const)(
    'refuses cash while QR is %s, preserving the cart', async (state) => {
      let resolve!: (payment: Payment) => void;
      const completeCashSale = jest.fn().mockResolvedValue(sale);
      const resetCart = jest.fn();
      const startQrPhPayment = state === 'creating'
        ? jest.fn().mockReturnValue(new Promise<Payment>((done) => { resolve = done; }))
        : state === 'unknown'
          ? jest.fn().mockRejectedValue(new Error('Request outcome unknown'))
          : jest.fn().mockResolvedValue(pendingQrPayment);
      setContext({ completeCashSale, resetCart, startQrPhPayment,
        refreshQrPhPayment: jest.fn().mockRejectedValue(new Error('Status unavailable')) });
      const view = await openQrCheckout();
      if (state === 'verification') {
        await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
      }
      fireEvent.press(view.getByTestId('checkout-payment-cash'));
      fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
      await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });
      expect(completeCashSale).not.toHaveBeenCalled();
      expect(resetCart).not.toHaveBeenCalled();
      expect(view.getByTestId('checkout-cash-error')).toHaveTextContent(/QR payment.*unresolved/);
      if (state === 'creating') await act(async () => { resolve(pendingQrPayment); });
    },
  );

  it.each(['failed', 'cancelled', 'expired'] as const)('allows cash after server-confirmed QR %s', async (status) => {
    const completeCashSale = jest.fn().mockResolvedValue(sale);
    setContext({ completeCashSale, startQrPhPayment: jest.fn().mockResolvedValue({ ...pendingQrPayment, status }) });
    const view = await openQrCheckout();
    fireEvent.press(view.getByTestId('checkout-payment-cash'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });
    expect(completeCashSale).toHaveBeenCalledWith(100);
  });

  it('leaves a pending payment without cancelling it and keeps the cart', async () => {
    const mockBack = router.back as jest.Mock;
    const startQrPhPayment = jest.fn().mockResolvedValue(pendingQrPayment);
    setContext({ startQrPhPayment });
    const view = await openQrCheckout();

    fireEvent.press(view.getByTestId('leave-qr-payment'));

    // There is no cashier cancel endpoint: leaving never settles or voids the
    // attempt, so no further payment request is made and the cart is kept.
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(startQrPhPayment).toHaveBeenCalledTimes(1);
  });

  it.each<[Payment['status'], string]>([
    ['failed', 'Payment failed. No sale was recorded and stock was not changed.'],
    ['cancelled', 'Payment was cancelled. No sale was recorded and stock was not changed.'],
    ['expired', 'Payment expired. Start a new QR Ph payment; stock was not changed.'],
  ])('shows the %s state without completing a sale', async (status, message) => {
    const resetCart = jest.fn();
    setContext({ startQrPhPayment: jest.fn().mockResolvedValue({ ...pendingQrPayment, status }), resetCart });
    const view = await openQrCheckout();

    expect(view.getByText(message)).toBeTruthy();
    expect(view.getByTestId('retry-qr-payment')).toBeTruthy();
    expect(resetCart).not.toHaveBeenCalled();
  });

  it('shows paid_unfulfilled for reconciliation without starting a new payment', async () => {
    const unfulfilled = { ...pendingQrPayment, status: 'paid_unfulfilled' as const, failureReason: 'stock_reconciliation_required' };
    const confirmQrPhPayment = jest.fn().mockResolvedValue(undefined);
    const resetCart = jest.fn();
    setContext({ startQrPhPayment: jest.fn().mockResolvedValue(unfulfilled), confirmQrPhPayment, resetCart });
    const view = await openQrCheckout();

    expect(confirmQrPhPayment).toHaveBeenCalledWith(unfulfilled);
    expect(resetCart).not.toHaveBeenCalled();
    expect(view.getByText('Payment received but stock could not be fulfilled. Reconcile with the operator; no sale was recorded.')).toBeTruthy();
    expect(view.getByTestId('qr-payment-failure')).toHaveTextContent(/Payment received, sale not recorded/);
    expect(view.getByText(/Support code: PRS-/)).toBeTruthy();
    // A new payment could double-charge money already received.
    expect(view.queryByTestId('retry-qr-payment')).toBeNull();
    expect(view.getByTestId('refresh-qr-payment')).toBeTruthy();
    expect(view.getByTestId('leave-qr-payment')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith('Payment received, sale not recorded', expect.stringContaining('reconcile'));
  });
  it('refreshes inventory and history only after Laravel returns paid', async () => {
    const paidPayment = { ...pendingQrPayment, status: 'paid' as const, saleId: 'sale-1' };
    const confirmQrPhPayment = jest.fn().mockResolvedValue(undefined);
    const resetCart = jest.fn();
    setContext({ startQrPhPayment: jest.fn().mockResolvedValue(paidPayment), confirmQrPhPayment, resetCart });
    await openQrCheckout();

    expect(confirmQrPhPayment).toHaveBeenCalledWith(paidPayment);
    expect(resetCart).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Payment recorded', expect.stringContaining('confirmed by the shop server'), expect.any(Array));
  });

  it('shows a recoverable verification state after a Laravel status error', async () => {
    const refreshQrPhPayment = jest.fn().mockRejectedValue(new ApiClientError('Unable to reach PorSca API: timeout'));
    setContext({ refreshQrPhPayment });
    const view = await openQrCheckout();

    await act(async () => {
      fireEvent.press(view.getByTestId('refresh-qr-payment'));
    });

    expect(view.getByTestId('qr-payment-status')).toHaveTextContent(/Payment verification needs attention/);
    expect(view.getByTestId('qr-payment-error')).toHaveTextContent(/Do not hand over the goods/);
    expect(view.getByText(/Support code: PRS-/)).toBeTruthy();
    expect(view.getByTestId('retry-qr-verification')).toBeTruthy();
    expect(view.getByTestId('leave-qr-payment')).toBeTruthy();
  });

  it('records cash after Laravel definitively rejected the QR attempt', async () => {
    const completeCashSale = jest.fn().mockResolvedValue(sale);
    setContext({
      completeCashSale,
      startQrPhPayment: jest.fn().mockRejectedValue(new ApiClientError('The cart has no valid items.', 422, 'validation_error')),
    });
    const view = render(<CheckoutScreen />);
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });

    expect(view.getByTestId('qr-payment-error')).toHaveTextContent(/No sale was recorded/);

    fireEvent.press(view.getByTestId('checkout-payment-cash'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    expect(completeCashSale).toHaveBeenCalledWith(100);
  });

  it('leaves cash retryable after a QR start is refused because that cash attempt is unresolved', async () => {
    const completeCashSale = jest.fn().mockResolvedValue(sale);
    setContext({
      completeCashSale,
      startQrPhPayment: jest.fn().mockRejectedValue(new ApiClientError('A cash payment for this cart is still unresolved.', undefined, 'cash_attempt_unresolved')),
    });
    const view = render(<CheckoutScreen />);
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });

    // The refusal is not a QR outcome: no verification status and no QR retry
    // affordance appear, and the cash attempt stays the thing to retry.
    expect(view.getByTestId('qr-payment-error')).toHaveTextContent(/Check the earlier attempt first/);
    expect(view.queryByTestId('qr-payment-status')).toBeNull();
    expect(view.getByTestId('start-qrph-payment')).toHaveTextContent('Start QR Ph Payment');

    fireEvent.press(view.getByTestId('checkout-payment-cash'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    expect(completeCashSale).toHaveBeenCalledWith(100);
  });

  it('offers no QR Ph start while a cash sale is being recorded', async () => {
    let resolveSale!: (value: Sale) => void;
    const completeCashSale = jest.fn().mockReturnValue(new Promise<Sale>((done) => { resolveSale = done; }));
    const startQrPhPayment = jest.fn().mockResolvedValue(pendingQrPayment);
    setContext({ completeCashSale, startQrPhPayment });
    const view = render(<CheckoutScreen />);

    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    fireEvent.press(view.getByTestId('confirm-cash-payment'));
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));

    const startButton = view.getByTestId('start-qrph-payment');
    expect(startButton).toBeDisabled();
    fireEvent.press(startButton);
    expect(startQrPhPayment).not.toHaveBeenCalled();

    await act(async () => { resolveSale(sale); });
  });
});
