import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import TransactionsScreen from '@/app/(tabs)/transactions';
import { usePos } from '@/src/context/PosContext';
import { Sale } from '@/src/types';

const mockRefreshSales = jest.fn();
const mockPush = jest.fn();
jest.mock('expo-router', () => ({ router: { push: (...args: unknown[]) => mockPush(...args) } }));

jest.mock('@/src/context/PosContext', () => ({ usePos: jest.fn() }));
jest.mock('@/src/components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const completedCashSale: Sale = {
  id: '42',
  createdAt: '2026-09-08T12:00:00Z',
  total: 37,
  paymentMethod: 'cash',
  status: 'paid',
  cashReceived: 50,
  change: 13,
  items: [{
    product: { id: '4', barcode: '4800000000041', name: 'Mineral Water 1L', price: 37, stock: 0 },
    quantity: 1,
  }],
};

const mockUsePos = usePos as jest.Mock;

function setSales(sales: Sale[], salesState: 'idle' | 'loading' | 'ready' | 'unavailable' = 'ready', salesError?: string) {
  mockUsePos.mockReturnValue({ sales, salesState, salesError, refreshSales: mockRefreshSales });
}

describe('TransactionsScreen history states', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setSales([completedCashSale]);
  });

  it('refreshes Laravel history and exposes completed cash payment details', () => {
    const { getAllByText, getByTestId, getByText } = render(<TransactionsScreen />);

    expect(mockRefreshSales).toHaveBeenCalledTimes(1);
    expect(getByTestId('transaction-42')).toBeTruthy();
    expect(getByTestId('transaction-filter-cash')).toBeTruthy();
    expect(getAllByText('Completed', { exact: true }).length).toBeGreaterThan(0);
    expect(getByText('Received ₱50.00 • Change ₱13.00')).toBeTruthy();
    expect(getByText('₱37.00')).toBeTruthy();
  });

  it('consumes a verified one-use history handoff without a mount request, but a later mount refreshes', () => {
    const consumeSalesHandoff = jest.fn().mockReturnValueOnce(true).mockReturnValue(false);
    mockUsePos.mockReturnValue({ sales: [completedCashSale], salesState: 'ready', refreshSales: mockRefreshSales, consumeSalesHandoff });
    const first = render(<TransactionsScreen />);
    expect(first.getByTestId('transaction-42')).toBeTruthy(); expect(mockRefreshSales).not.toHaveBeenCalled();
    first.unmount(); render(<TransactionsScreen />); expect(mockRefreshSales).toHaveBeenCalledTimes(1);
  });

  it('shows a retryable unavailable state without hiding the last known sale', () => {
    setSales([completedCashSale], 'unavailable', 'Laravel history request failed.');
    const { getByRole, getByTestId, getByText } = render(<TransactionsScreen />);

    expect(getByText('Laravel history request failed.')).toBeTruthy();
    expect(getByTestId('transaction-42')).toBeTruthy();
    fireEvent.press(getByRole('button', { name: 'Retry history' }));
    expect(mockRefreshSales).toHaveBeenCalledTimes(2);
  });

  it('pages rendered rows while search finds older receipts without loading more', () => {
    setSales(Array.from({ length: 150 }, (_, i) => ({ ...completedCashSale, id: `receipt-${i + 1}` })));
    const { getByPlaceholderText, getByText, getByTestId, queryByTestId } = render(<TransactionsScreen />);
    expect(queryByTestId('transaction-receipt-51')).toBeNull();
    fireEvent.press(getByText('Show more transactions (50 of 150)'));
    expect(getByTestId('transaction-receipt-51')).toBeTruthy();
    fireEvent.changeText(getByPlaceholderText('Search receipt, product, or amount...'), 'receipt-150');
    expect(getByTestId('transaction-receipt-150')).toBeTruthy();
  });

  it('opens the selected receipt from a transaction row', () => {
    const screen = render(<TransactionsScreen />);
    fireEvent.press(screen.getByTestId('transaction-42'));
    expect(mockPush).toHaveBeenCalledWith({ pathname: '/transaction-detail', params: { id: '42' } });
  });

  it('filters completed sales by payment method and searchable receipt details', () => {
    const qrSale: Sale = { ...completedCashSale, id: '43', paymentMethod: 'qrph', cashReceived: undefined, change: undefined };
    setSales([completedCashSale, qrSale]);
    const { getByPlaceholderText, getByTestId, queryByTestId } = render(<TransactionsScreen />);

    fireEvent.press(getByTestId('transaction-filter-cash'));
    expect(queryByTestId('transaction-42')).toBeTruthy();
    expect(queryByTestId('transaction-43')).toBeNull();

    fireEvent.changeText(getByPlaceholderText('Search receipt, product, or amount...'), 'Mineral Water');
    expect(queryByTestId('transaction-42')).toBeTruthy();
  });
});
