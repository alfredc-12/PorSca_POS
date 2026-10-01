import React from 'react';
import { act, render, waitFor } from '@testing-library/react-native';
import { ApiClient } from '@/src/api/client';
import { AuthProvider } from '@/src/context/AuthContext';
import { RootNavigator } from '@/app/_layout';
import Index from '@/app/index';

jest.mock('expo-router', () => {
  const { Text } = require('react-native');
  const Stack = ({ children }: { children: React.ReactNode }) => <>{children}</>;
  Stack.Screen = ({ name }: { name: string }) => <Text>{`route:${name}`}</Text>;
  Stack.Protected = ({ guard, children }: { guard: boolean; children: React.ReactNode }) => guard ? <>{children}</> : null;
  return { Stack, Redirect: ({ href }: { href: string }) => <Text>{`redirect:${href}`}</Text> };
});
jest.mock('@/src/context/PosContext', () => {
  const { Text } = require('react-native');
  return { PosProvider: ({ children }: { children: React.ReactNode }) => <><Text>protected POS session</Text>{children}</> };
});

const cashier = { id: 2, name: 'Cashier', email: 'cashier@example.test', role: 'cashier', is_active: true };
function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}
function setup(role: 'cashier' | 'admin' | null) {
  const fetchImpl = jest.fn().mockResolvedValue(response({ data: { user: { ...cashier, role } } }));
  const client = new ApiClient({ baseUrl: 'https://api.example.test', fetchImpl });
  const store = { get: async () => role ? 'token' : null, set: async () => {}, remove: jest.fn().mockResolvedValue(undefined) };
  const screen = render(<AuthProvider client={client} store={store}><RootNavigator /><Index /></AuthProvider>);
  return { ...screen, client, fetchImpl, store };
}

describe('signed-in route guards', () => {
  it('gates entry, tabs, scanner, checkout, and product form when signed out', async () => {
    const screen = setup(null);
    expect(screen.queryByText('route:(tabs)')).toBeNull();
    await waitFor(() => expect(screen.getByText('redirect:/login')).toBeTruthy());
    expect(screen.getByText('route:login')).toBeTruthy();
    ['(tabs)', 'scanner', 'checkout', 'product-form'].forEach((route) => expect(screen.queryByText(`route:${route}`)).toBeNull());
    expect(screen.queryByText('protected POS session')).toBeNull();
    expect(screen.fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['cashier', 'admin'] as const)('opens signed-in routes for %s and keeps catalog writes admin-only', async (role) => {
    const screen = setup(role);
    expect(screen.queryByText('protected POS session')).toBeNull();
    await waitFor(() => expect(screen.getByText('redirect:/(tabs)/pos')).toBeTruthy());
    ['(tabs)', 'scanner', 'checkout'].forEach((route) => expect(screen.getByText(`route:${route}`)).toBeTruthy());
    expect(Boolean(screen.queryByText('route:product-form'))).toBe(role === 'admin');
    expect(screen.queryByText('route:login')).toBeNull();
  });

  it('routes to login and unmounts POS session state after any API 401', async () => {
    const screen = setup('admin');
    await waitFor(() => expect(screen.getByText('protected POS session')).toBeTruthy());
    screen.fetchImpl.mockResolvedValue(response(undefined, 401));
    await act(async () => { await expect(screen.client.listProducts()).rejects.toMatchObject({ status: 401 }); });
    expect(screen.getByText('redirect:/login')).toBeTruthy();
    expect(screen.queryByText('protected POS session')).toBeNull();
    expect(screen.queryByText('route:checkout')).toBeNull();
    expect(screen.store.remove).toHaveBeenCalled();
  });
});
