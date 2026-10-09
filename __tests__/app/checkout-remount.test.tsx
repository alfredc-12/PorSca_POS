import React, { useState } from 'react';
import { Alert, Button, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CheckoutScreen from '@/app/checkout';
import { PosProvider, usePos } from '@/src/context/PosContext';
import { ApiClient, ApiClientError } from '@/src/api/client';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { CheckoutHandle, CheckoutStorage } from '@/src/domain/durableCheckout';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useLocalSearchParams: () => ({ method: 'cash' }) }));
jest.mock('@/src/components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
const product = { id: '1', name: 'Coffee', barcode: '12345678', price: 25, stock: 20 };
const open: AuthorityCheckout = { id: 'server-uuid', storeId: 'shop', state: 'open', revision: 1, amountCentavos: 2500, currency: 'PHP', items: [{ productId: 1, name: 'Coffee', quantity: 1, unitPriceCentavos: 2500 }], attempts: [], sale: null, exceptions: [], history: [] };
const pending: AuthorityCheckout = { ...open, state: 'payment_unresolved', attempts: [{ id: 7, method: 'qrph', amountCentavos: 2500, currency: 'PHP', status: 'pending', financialStatus: 'pending', firstVerifiedOutcome: null, qrPayload: 'QR', qrExpiresAt: null, reservation: null }] };
function Shop() {
  const { addProductChecked } = usePos(); const [visible, setVisible] = useState(false);
  return <View><Button testID="seed" title="Seed" onPress={() => addProductChecked(product)} /><Button testID="open" title="Open" onPress={() => setVisible(true)} /><Button testID="leave" title="Leave" onPress={() => setVisible(false)} />{visible ? <CheckoutScreen /> : null}</View>;
}
function fixture() {
  let handle: CheckoutHandle | null = null; let checkout = open;
  const storage: CheckoutStorage = { load: async () => handle, save: async value => { handle = value; } };
  const client = { isConfigured: true, createCheckout: jest.fn().mockResolvedValue(open), getCheckout: jest.fn(async () => checkout), recoverCheckout: jest.fn(async () => checkout),
    createCheckoutAttempt: jest.fn(async () => { checkout = pending; return pending; }), refreshCheckoutAttempt: jest.fn(async () => checkout),
    checkoutCash: jest.fn(), listProducts: jest.fn().mockResolvedValue([]), listInventory: jest.fn().mockResolvedValue([]), listSales: jest.fn().mockResolvedValue([]), getProduct: jest.fn().mockResolvedValue(product) };
  const tree = <PosProvider client={client as unknown as ApiClient} checkoutStore={storage}><Shop /></PosProvider>;
  return { tree, client };
}
async function start(view: ReturnType<typeof render>) {
  fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open')); fireEvent.press(view.getByTestId('checkout-payment-qrph'));
  await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
  expect(view.getByText('Payment pending…')).toBeTruthy();
}

describe('checkout remount with durable machine state', () => {
  beforeEach(() => jest.spyOn(Alert, 'alert').mockImplementation(() => undefined));
  afterEach(() => jest.restoreAllMocks());
  it('restores the retained QR inspection action and blocks cash after leaving and reopening', async () => {
    const { tree, client } = fixture(); const view = render(tree); await start(view);
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });
    expect(client.checkoutCash).not.toHaveBeenCalled(); expect(view.getByTestId('checkout-cash-error')).toBeTruthy();
    fireEvent.press(view.getByTestId('checkout-payment-qrph')); expect(view.getByTestId('refresh-qr-payment')).toBeTruthy();
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
  it('keeps reversible unknown inspectable after refresh transport failure and remount', async () => {
    const { tree, client } = fixture(); const view = render(tree); await start(view);
    client.refreshCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('offline'));
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open')); fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    expect(view.getByText(/Payment outcome is unknown/)).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId('retry-qr-verification')); });
    await waitFor(() => expect(view.getByText('Payment pending…')).toBeTruthy());
  });
  it('reattaches ambiguous QR creation to the server attempt rather than starting another', async () => {
    const { tree, client } = fixture();
    client.createCheckoutAttempt.mockImplementationOnce(async () => { throw new ApiClientError('lost response'); });
    client.recoverCheckout.mockResolvedValue(pending); client.getCheckout.mockResolvedValue(pending);
    const view = render(tree); await start(view);
    expect(client.recoverCheckout).toHaveBeenCalledWith('server-uuid');
    expect(view.getByTestId('refresh-qr-payment')).toBeTruthy(); expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
});
