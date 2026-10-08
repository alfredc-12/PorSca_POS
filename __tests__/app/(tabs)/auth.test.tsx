import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import TabsLayout from '@/app/(tabs)/_layout';
import InventoryScreen from '@/app/(tabs)/inventory';

let mockStatus = 'signed-in';
let mockIsAdmin = false;
const mockSignOut = jest.fn();
const mockPush = jest.fn();
const mockRefreshInventory = jest.fn();

jest.mock('@/src/context/AuthContext', () => ({
  useAuth: () => ({ status: mockStatus, isAdmin: mockIsAdmin, user: { name: 'Shop Staff', role: mockIsAdmin ? 'admin' : 'cashier' }, signOut: mockSignOut }),
}));
jest.mock('@/src/context/PosContext', () => ({
  usePos: () => ({
    inventoryProducts: [{ id: '1', name: 'Coffee', barcode: '4800000000012', price: 25, stock: 20 }],
    inventoryState: 'ready', inventoryUsingFallback: false, refreshInventory: mockRefreshInventory,
  }),
}));
jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  const Tabs = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Tabs.Screen = ({ name }: { name: string }) => <Text>{`tab:${name}`}</Text>;
  return { Tabs, Redirect: ({ href }: { href: string }) => <Text>{href}</Text>, router: { push: (...args: unknown[]) => mockPush(...args) } };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

describe('signed-in tabs and cashier controls', () => {
  beforeEach(() => {
    mockStatus = 'signed-in'; mockIsAdmin = false;
    mockSignOut.mockReset(); mockPush.mockReset(); mockRefreshInventory.mockReset();
  });

  it('guards the tab group during restoration and signed-out deep links', () => {
    mockStatus = 'loading';
    const screen = render(<TabsLayout />);
    expect(screen.queryByText('tab:pos')).toBeNull();
    mockStatus = 'signed-out';
    screen.rerender(<TabsLayout />);
    expect(screen.getByText('/login')).toBeTruthy();
    expect(screen.queryByText('tab:transactions')).toBeNull();
  });

  it('keeps all three tabs visible for cashiers and offers sign out', () => {
    const screen = render(<TabsLayout />);
    ['pos', 'inventory', 'transactions'].forEach((tab) => expect(screen.getByText(`tab:${tab}`)).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });

  it('shows read-only inventory without add/edit actions to a cashier', () => {
    const screen = render(<InventoryScreen />);
    expect(screen.getByText('Coffee')).toBeTruthy();
    expect(screen.queryByText('Add Product')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Edit Coffee' })).toBeNull();
    fireEvent.press(screen.getByLabelText('Coffee'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('retains inventory add and edit actions for admins', () => {
    mockIsAdmin = true;
    const screen = render(<InventoryScreen />);
    fireEvent.press(screen.getByText('Add Product'));
    expect(screen.getByTestId('product-name-input').props.value).toBe('');
    fireEvent.press(screen.getByRole('button', { name: 'Close product editor' }));
    fireEvent.press(screen.getByRole('button', { name: 'Edit Coffee' }));
    expect(screen.getByTestId('product-name-input').props.value).toBe('Coffee');
    expect(screen.getByTestId('product-barcode-input').props.editable).toBe(false);
    expect(mockPush).not.toHaveBeenCalled();
  });
});
