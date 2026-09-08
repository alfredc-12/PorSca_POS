import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render } from '@testing-library/react-native';
import CheckoutScreen from '@/app/checkout';
import { router } from 'expo-router';
import { usePos } from '@/src/context/PosContext';
import { ApiClientError } from '@/src/api/client';
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

function setContext(overrides: Record<string, unknown> = {}) {
  mockUsePos.mockReturnValue({
    total: 35,
    cart,
    completeSale: jest.fn(),
    completeCashSale: jest.fn().mockResolvedValue(sale),
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
