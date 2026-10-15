import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import TransactionDetailScreen from '@/app/transaction-detail';
import { usePos } from '@/src/context/PosContext';
import { Sale } from '@/src/types';

jest.mock('expo-router', () => ({ useLocalSearchParams: () => ({ id: '42' }) }));
jest.mock('@/src/context/PosContext', () => ({ usePos: jest.fn() }));
jest.mock('@/src/components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
const refreshSales = jest.fn();
const sale: Sale = {
  id: '42', createdAt: '2026-09-08T12:00:00Z', total: 74, paymentMethod: 'cash', status: 'paid', cashReceived: 100, change: 26,
  items: [{ product: { id: '4', name: 'Historical water', barcode: '123', price: 37, stock: 0 }, quantity: 2 }],
};
function setup(receipt: Sale | undefined = sale, salesState = 'ready') {
  (usePos as jest.Mock).mockReturnValue({ sales: receipt ? [receipt] : [], salesState, refreshSales });
  return render(<TransactionDetailScreen />);
}
beforeEach(() => jest.clearAllMocks());
it('shows historical item snapshots, quantities, totals and cash receipt facts', () => {
  const screen = setup();
  for (const text of ['42', 'Completed', 'Cash', 'Historical water', '2 × ₱37.00', 'Total quantity', '2', '₱100.00', '₱26.00']) expect(screen.getByText(text)).toBeTruthy();
  expect(screen.getAllByText('₱74.00')).toHaveLength(2);
  expect(refreshSales).not.toHaveBeenCalled();
});
it('shows QR method without inventing cash details', () => {
  const screen = setup({ ...sale, paymentMethod: 'qrph', cashReceived: undefined, change: undefined });
  expect(screen.getByText('QR Ph / PayMongo')).toBeTruthy();
  expect(screen.queryByText('Cash received')).toBeNull();
});
it('does not manufacture missing cash values', () => {
  const screen = setup({ ...sale, cashReceived: undefined, change: undefined });
  expect(screen.getAllByText('Not available')).toHaveLength(2);
});
it('keeps last loaded receipt visible with a stale warning and retry', () => {
  const screen = setup(sale, 'unavailable');
  expect(screen.getByTestId('transaction-receipt')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Retry history' }));
  expect(refreshSales).toHaveBeenCalledTimes(1);
});
it('handles a missing receipt without falling back to another sale', () => {
  (usePos as jest.Mock).mockReturnValue({ sales: [{ ...sale, id: 'other' }], salesState: 'ready', refreshSales });
  const screen = render(<TransactionDetailScreen />);
  expect(screen.getByText('Receipt not available')).toBeTruthy();
  expect(screen.queryByTestId('transaction-receipt')).toBeNull();
});
