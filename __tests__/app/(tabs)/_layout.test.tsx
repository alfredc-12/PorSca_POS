import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { router } from 'expo-router';
import { useAuth } from '@/src/context/AuthContext';
import TabsLayout from '@/app/(tabs)/_layout';

jest.mock('expo-router', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { Text, View } = jest.requireActual<typeof import('react-native')>('react-native');
  const Tabs = Object.assign(
    function Tabs({ children }: { children: React.ReactNode }) {
      return React.createElement(View, { testID: 'tabs' }, children);
    },
    { Screen: function TabScreen({ name, options }: { name: string; options: { title: string } }) {
      return React.createElement(Text, { testID: `tab-${name}` }, options.title);
    } },
  );
  function Redirect() { return null; }
  return { Redirect, router: { push: jest.fn() }, Tabs };
});

jest.mock('@/src/context/AuthContext', () => ({ useAuth: jest.fn() }));
jest.mock('react-native-safe-area-context', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  function SafeAreaView({ children, style }: { children: React.ReactNode; style?: import('react-native').StyleProp<import('react-native').ViewStyle> }) {
    return React.createElement(View, { style }, children);
  }
  return { SafeAreaView };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: () => null }));

const useAuthMock = useAuth as jest.Mock;
const signedIn = { status: 'signed-in', user: { id: 1, name: 'Store Admin', email: 'admin@example.test', role: 'admin', is_active: true }, isAdmin: true, signOut: jest.fn() };

beforeEach(() => {
  jest.clearAllMocks();
});

describe('admin Users navigation', () => {
  it('shows the Users entry and routes admins to account management', () => {
    useAuthMock.mockReturnValue(signedIn);
    const screen = render(<TabsLayout />);

    fireEvent.press(screen.getByRole('button', { name: 'Manage users' }));

    expect(router.push).toHaveBeenCalledWith('/users');
    expect(screen.getByTestId('tab-pos')).toBeTruthy();
    expect(screen.getByTestId('tab-inventory')).toBeTruthy();
    expect(screen.getByTestId('tab-transactions')).toBeTruthy();
  });

  it('does not expose the Users entry to cashiers', () => {
    useAuthMock.mockReturnValue({ ...signedIn, user: { ...signedIn.user, id: 2, role: 'cashier' }, isAdmin: false });
    const screen = render(<TabsLayout />);

    expect(screen.queryByRole('button', { name: 'Manage users' })).toBeNull();
  });
});
