/**
 * Regression net for the plain-English feedback plan
 * (data/porsca-mobile-feedback-plain-20261004/report.md, §9 step 7).
 *
 * Every path below drives a real failure through the app with a wire-shaped
 * payload — a SQL exception, a JavaScript error, or a payment provider's
 * decline code — and asserts that none of it reaches the rendered screen. The
 * test fails on the pre-change base and passes once the shared failure module
 * owns the words.
 */
import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClient, apiClient, ApiClientError } from '@/src/api/client';
import { AuthProvider } from '@/src/context/AuthContext';
import { PosProvider, usePos } from '@/src/context/PosContext';
import { TokenStore } from '@/src/auth/tokenStore';
import LoginScreen from '@/app/login';
import CheckoutScreen from '@/app/checkout';
import ProductFormScreen from '@/app/product-form';
import UsersScreen from '@/app/users';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn().mockResolvedValue(null),
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
}));
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Redirect: ({ href }: { href: string }) => <RNText>{href}</RNText>,
    router: { replace: jest.fn(), back: jest.fn(), push: jest.fn() },
    useLocalSearchParams: () => ({ method: 'cash' }),
  };
});
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const admin = { id: '1', name: 'Store Admin', email: 'admin@example.test', role: 'admin' as const, is_active: true };

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

function memoryStore(token: string | null): TokenStore {
  return {
    get: jest.fn().mockResolvedValue(token),
    set: jest.fn().mockResolvedValue(undefined),
    remove: jest.fn().mockResolvedValue(undefined),
  };
}

/** Signed-in admin client; every read answers with the admin user. */
function signedInClient() {
  return new ApiClient({
    baseUrl: 'https://api.example.test/api/v1',
    fetchImpl: jest.fn().mockResolvedValue(response({ data: { user: admin } })) as unknown as typeof fetch,
  });
}

const FORBIDDEN = /SQLSTATE|Illuminate|QueryException|Exception|fetch|EXPO_PUBLIC_|Laravel|https?:\/\/|PAYMONGO|card_declined|txn_/i;

function expectNoRawText(view: ReturnType<typeof render>) {
  expect(JSON.stringify(view.toJSON())).not.toMatch(FORBIDDEN);
}

const product = { id: '1', barcode: '4800000000041', name: 'Mineral Water 1L', price: 35, stock: 10, category: 'Beverages' as const };

function CheckoutWithSeededCart({ client }: { client: ApiClient }) {
  const { products, cart, addProductChecked } = usePos();
  return (
    <>
      <Pressable testID="seed-cart" onPress={() => addProductChecked(products[0])}><Text>seed</Text></Pressable>
      {cart.length > 0 ? <CheckoutScreen /> : null}
    </>
  );
}

const pendingQr = { id: 'pay-1', status: 'pending' as const, amount: 3500, qrPayload: 'data:image/png;base64,fixture' };

function checkoutClient(overrides: Record<string, jest.Mock>) {
  return {
    isConfigured: true,
    listProducts: jest.fn().mockResolvedValue([product]),
    listInventory: jest.fn().mockResolvedValue([]),
    listSales: jest.fn().mockResolvedValue([]),
    createSale: jest.fn().mockRejectedValue(new ApiClientError(
      'The sale was not confirmed.',
      500,
      'server_error',
      { exception: 'Illuminate\\Database\\QueryException', message: 'SQLSTATE[23000]: Integrity constraint violation' },
    )),
    createQrPhPayment: jest.fn().mockResolvedValue(pendingQr),
    refreshPayment: jest.fn(),
    ...overrides,
  } as unknown as ApiClient;
}

async function openSeededCheckout(client: ApiClient, qr = false) {
  const view = render(<PosProvider client={client} demoCatalogEnabled><CheckoutWithSeededCart client={client} /></PosProvider>);
  await act(async () => { fireEvent.press(view.getByTestId('seed-cart')); });
  if (qr) {
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
  }
  return view;
}

describe('no raw error text reaches the screen', () => {
  beforeEach(() => jest.clearAllMocks());

  it('sign-in failure: a JavaScript runtime error is not shown', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetchImpl: jest.fn().mockRejectedValue(new TypeError("Failed to execute 'fetch' on 'Window': Illegal invocation")) as unknown as typeof fetch,
    });
    const view = render(<AuthProvider client={client} store={memoryStore(null)}><LoginScreen /></AuthProvider>);
    await waitFor(() => expect(view.queryByTestId('login-form-card')).toBeTruthy());
    fireEvent.changeText(view.getByLabelText('Email'), 'cashier@example.test');
    fireEvent.changeText(view.getByLabelText('Password'), 'password');
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Sign in' })); });
    await waitFor(() => expect(view.queryByTestId('login-failure')).toBeTruthy());
    expectNoRawText(view);
  });

  it('session restore: a SQL connection error is not shown while signed out', async () => {
    const client = new ApiClient({
      baseUrl: 'https://api.example.test/api/v1',
      fetchImpl: jest.fn().mockRejectedValue(new Error('SQLSTATE[HY000] [2002] Connection refused')) as unknown as typeof fetch,
    });
    const view = render(<AuthProvider client={client} store={memoryStore('saved-token')}><LoginScreen /></AuthProvider>);
    await waitFor(() => expect(view.queryByTestId('login-session-failure')).toBeTruthy());
    expectNoRawText(view);
  });

  it('cash sale: a database exception and its details never render', async () => {
    const view = await openSeededCheckout(checkoutClient({}));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });
    await waitFor(() => expect(view.getByTestId('checkout-cash-error')).toBeTruthy());
    expectNoRawText(view);
  });

  it('QR Ph verification: the transport error never renders', async () => {
    const client = checkoutClient({ refreshPayment: jest.fn().mockRejectedValue(new ApiClientError("Unable to reach PorSca API: Failed to execute 'fetch' on 'Window': Illegal invocation")) });
    const view = await openSeededCheckout(client, true);
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    await waitFor(() => expect(view.getByTestId('qr-payment-error')).toBeTruthy());
    expectNoRawText(view);
  });

  it('QR Ph decline: the provider decline code and transaction reference never render', async () => {
    const declined = { ...pendingQr, status: 'failed' as const, failureReason: 'card_declined: PAYMONGO_ERR_INSUFFICIENT_FUNDS (txn_1QxLmZ2eZvKYlo2C / 402)' };
    const client = checkoutClient({ createQrPhPayment: jest.fn().mockResolvedValue(declined) });
    const view = await openSeededCheckout(client, true);
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    await waitFor(() => expect(view.getByTestId('qr-payment-status')).toBeTruthy());
    expectNoRawText(view);
  });

  it('product save: the API exception is not printed on the form', async () => {
    const client = {
      isConfigured: true,
      listProducts: jest.fn().mockResolvedValue([]),
      listInventory: jest.fn().mockResolvedValue([]),
      createProduct: jest.fn().mockRejectedValue(new ApiClientError(
        'Illuminate\\Database\\QueryException: SQLSTATE[23000]',
        500,
        'server_error',
      )),
    } as unknown as ApiClient;
    const view = render(
      <AuthProvider client={signedInClient()} store={memoryStore('valid-token')}>
        <PosProvider client={client} demoCatalogEnabled><ProductFormScreen /></PosProvider>
      </AuthProvider>,
    );
    await waitFor(() => expect(view.queryByTestId('save-product-button')).toBeTruthy());
    fireEvent.changeText(view.getByTestId('product-name-input'), 'House Blend Coffee');
    fireEvent.changeText(view.getByTestId('product-barcode-input'), '4800000000099');
    fireEvent.changeText(view.getByTestId('product-price-input'), '185');
    fireEvent.changeText(view.getByTestId('product-stock-input'), '12');
    await act(async () => { fireEvent.press(view.getByTestId('save-product-button')); });
    await waitFor(() => expect(view.getByTestId('product-form-error')).toBeTruthy());
    expectNoRawText(view);
  });

  it('staff list: the server error is not printed on the users screen', async () => {
    jest.spyOn(apiClient, 'listUsers').mockRejectedValue(new ApiClientError('SQLSTATE[HY000] [2002] Connection refused', 500, 'server_error'));
    const view = render(<AuthProvider client={signedInClient()} store={memoryStore('valid-token')}><UsersScreen /></AuthProvider>);
    await waitFor(() => expect(view.getByTestId('data-state-unavailable')).toBeTruthy());
    expectNoRawText(view);
  });
});
