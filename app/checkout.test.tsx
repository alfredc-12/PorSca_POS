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
    completeSale: jest.fn(),
    completeCashSale: jest.fn().mockResolvedValue(sale),
    clearCart: jest.fn(),
    startQrPhPayment: jest.fn().mockResolvedValue(pendingQrPayment),
    refreshQrPhPayment: jest.fn().mockResolvedValue(pendingQrPayment),
    cancelQrPhPayment: jest.fn().mockResolvedValue({ ...pendingQrPayment, status: 'cancelled' }),
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
    expect(alertSpy).toHaveBeenCalledWith('Insufficient cash', expect.stringContaining('confirm again.'));
  });

  it('surfaces Laravel stock conflicts with a recovery action and preserves the cart', async () => {
    const completeCashSale = jest.fn().mockRejectedValue(new ApiClientError('Insufficient stock for Mineral Water 1L.', 409, 'insufficient_stock'));
    setContext({ completeCashSale });
    const { getByTestId, getByText } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '100');
    await act(async () => {
      fireEvent.press(getByTestId('confirm-cash-payment'));
    });

    expect(getByText(/Refresh inventory and remove the unavailable item/)).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith('Insufficient stock', expect.stringContaining('try again.'));
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
    expect(view.getByTestId('cancel-qr-payment')).toBeTruthy();
  });

  it.each<[Payment['status'], string]>([
    ['failed', 'Payment failed. No sale was recorded and stock was not changed.'],
    ['cancelled', 'Payment was cancelled. No sale was recorded and stock was not changed.'],
    ['expired', 'Payment expired. Start a new QR Ph payment; stock was not changed.'],
  ])('shows the %s state without completing a sale', async (status, message) => {
    const clearCart = jest.fn();
    setContext({ startQrPhPayment: jest.fn().mockResolvedValue({ ...pendingQrPayment, status }), clearCart });
    const view = await openQrCheckout();

    expect(view.getByText(message)).toBeTruthy();
    expect(view.getByTestId('retry-qr-payment')).toBeTruthy();
    expect(clearCart).not.toHaveBeenCalled();
  });

  it('refreshes inventory and history only after Laravel returns paid', async () => {
    const paidPayment = { ...pendingQrPayment, status: 'paid' as const, saleId: 'sale-1' };
    const confirmQrPhPayment = jest.fn().mockResolvedValue(undefined);
    const clearCart = jest.fn();
    setContext({ startQrPhPayment: jest.fn().mockResolvedValue(paidPayment), confirmQrPhPayment, clearCart });
    await openQrCheckout();

    expect(confirmQrPhPayment).toHaveBeenCalledWith(paidPayment);
    expect(clearCart).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalledWith('Payment recorded', expect.stringContaining('confirmed by Laravel'), expect.any(Array));
  });

  it('shows a recoverable verification state after a Laravel status error', async () => {
    const refreshQrPhPayment = jest.fn().mockRejectedValue(new ApiClientError('Unable to reach PorSca API: timeout'));
    setContext({ refreshQrPhPayment });
    const view = await openQrCheckout();

    await act(async () => {
      fireEvent.press(view.getByTestId('refresh-qr-payment'));
    });

    expect(view.getByTestId('qr-payment-status')).toHaveTextContent(/Payment verification needs attention/);
    expect(view.getByTestId('qr-payment-error')).toHaveTextContent(/Retry verification/);
    expect(view.getByTestId('retry-qr-verification')).toBeTruthy();
    expect(view.getByTestId('cancel-qr-payment')).toBeTruthy();
  });
});
