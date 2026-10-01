import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, renderRouter, waitFor } from 'expo-router/testing-library';
import { ApiClient } from '@/src/api/client';
import { AuthProvider } from '@/src/context/AuthContext';
import { RootNavigator } from '@/app/_layout';
import Index from '@/app/index';
import LoginScreen from '@/app/login';
import TabsLayout from '@/app/(tabs)/_layout';

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('@/src/context/PosContext', () => ({ PosProvider: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

const cashier = { id: 2, name: 'Cashier', email: 'cashier@example.test', role: 'cashier', is_active: true };
function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function setup(initialUrl = '/', savedToken: string | null = null) {
  const fetchImpl = jest.fn().mockResolvedValue(response({ data: { token: 'token', token_type: 'Bearer', user: cashier } }));
  const client = new ApiClient({ baseUrl: 'https://api.example.test', fetchImpl });
  const store = { get: async () => savedToken, set: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
  const screen = renderRouter({
    _layout: () => <AuthProvider client={client} store={store}><RootNavigator /></AuthProvider>,
    index: Index,
    login: LoginScreen,
    '(tabs)/_layout': TabsLayout,
    '(tabs)/pos': () => <Text>Signed-in POS</Text>,
    '(tabs)/inventory': () => <Text>Read-only inventory</Text>,
    '(tabs)/transactions': () => <Text>All sales</Text>,
    scanner: () => <Text>Protected scanner</Text>,
    checkout: () => <Text>Protected checkout</Text>,
    'product-form': () => <Text>Admin product form</Text>,
  }, { initialUrl });
  return { ...screen, client, fetchImpl, store };
}

describe('real Expo Router authentication flow', () => {
  afterEach(() => jest.useRealTimers());

  it.each(['/checkout', '/scanner', '/inventory', '/product-form'])('redirects a signed-out deep link %s to login', async (initialUrl) => {
    const screen = setup(initialUrl);
    await waitFor(() => expect(screen.getPathname()).toBe('/login'));
    expect(screen.getByLabelText('Password')).toBeTruthy();
    expect(screen.fetchImpl).not.toHaveBeenCalled();
  });

  it('navigates from login to tabs, then clears a 401 session and returns to login', async () => {
    const screen = setup();
    await waitFor(() => expect(screen.getPathname()).toBe('/login'));
    fireEvent.changeText(screen.getByLabelText('Email'), 'cashier@example.test');
    fireEvent.changeText(screen.getByLabelText('Password'), 'secret');
    fireEvent.press(screen.getByRole('button', { name: 'Sign in' }));
    await waitFor(() => expect(screen.getPathname()).toBe('/pos'));
    expect(screen.getByText('Signed-in POS')).toBeTruthy();
    expect(screen.store.set).toHaveBeenCalledWith('token');
    screen.fetchImpl.mockResolvedValue(response(undefined, 401));
    await act(async () => { await expect(screen.client.listSales()).rejects.toMatchObject({ status: 401 }); });
    await waitFor(() => expect(screen.getPathname()).toBe('/login'));
    expect(screen.queryByText('Signed-in POS')).toBeNull();
    expect(screen.store.remove).toHaveBeenCalled();
  });

  it('redirects a restored cashier admin-route deep link to the POS and signs out through the header', async () => {
    const screen = setup('/product-form', 'saved-token');
    await waitFor(() => expect(screen.getPathname()).toBe('/pos'));
    expect(screen.queryByText('Admin product form')).toBeNull();
    screen.fetchImpl.mockResolvedValue(response(undefined, 204));
    fireEvent.press(screen.getByRole('button', { name: 'Sign out' }));
    await waitFor(() => expect(screen.getPathname()).toBe('/login'));
    expect(screen.store.remove).toHaveBeenCalled();
  });
});
