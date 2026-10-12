import React, { useState } from 'react';
import { AppState, Alert, Button, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CheckoutScreen from '@/app/checkout';
import { PosProvider, usePos } from '@/src/context/PosContext';
import { ApiClient, ApiClientError } from '@/src/api/client';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { CheckoutHandle, CheckoutStorage } from '@/src/domain/durableCheckout';
import { QrPaymentCode } from '@/src/components/QrPaymentCode';
import { CheckoutOrderSummary } from '@/src/components/CheckoutOrderSummary';

jest.mock('expo-router', () => ({ router: { replace: jest.fn(), back: jest.fn() }, useFocusEffect: (callback: () => void) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]), useLocalSearchParams: () => ({ method: 'cash' }) }));
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
  return { tree, client, handle: () => handle, setCheckout: (value: AuthorityCheckout) => { checkout = value; } };
}
async function start(view: ReturnType<typeof render>) {
  fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open')); fireEvent.press(view.getByTestId('checkout-payment-qrph'));
  await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
  expect(view.getByText('Payment pending…')).toBeTruthy();
}

describe('checkout remount with durable machine state', () => {
  beforeEach(() => { Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }); jest.spyOn(Alert, 'alert').mockImplementation(() => undefined); });
  afterEach(() => jest.restoreAllMocks());
  it('restores the retained QR inspection action and blocks cash after leaving and reopening', async () => {
    const { tree, client } = fixture(); const view = render(tree); await start(view);
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open'));
    expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    expect(view.getByTestId('checkout-payment-qrph')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    fireEvent.press(view.getByTestId('checkout-payment-cash'));
    expect(view.queryByTestId('confirm-cash-payment')).toBeNull();
    expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(view.getByTestId('refresh-qr-payment')).toBeTruthy();
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
  it('keeps the recovered QR selected and unlocks cash after authoritative non-payability', async () => {
    const { tree, client } = fixture(); const view = render(tree); await start(view);
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open'));
    client.refreshCheckoutAttempt.mockResolvedValueOnce({
      ...pending,
      state: 'ready_for_attempt',
      attempts: [{ ...pending.attempts[0], status: 'non_payable', financialStatus: 'expired', firstVerifiedOutcome: 'non_payable' }],
    });
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    expect(view.getByTestId('checkout-payment-qrph')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    expect(view.getByTestId('checkout-payment-cash')).toBeEnabled();
    expect(view.getByTestId('retry-qr-payment')).toBeEnabled();
    expect(view.queryByTestId('checkout-tender-lock-reason')).toBeNull();
    fireEvent.press(view.getByTestId('checkout-payment-cash'));
    expect(view.getByTestId('confirm-cash-payment')).toBeEnabled();
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('keeps reversible unknown inspectable after refresh transport failure and remount', async () => {
    const { tree, client } = fixture(); const view = render(tree); await start(view);
    client.refreshCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('offline'));
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open')); fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    expect(view.getByText(/We could not confirm the payment status/)).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId('retry-qr-verification')); });
    await waitFor(() => expect(view.getByText('Payment pending…')).toBeTruthy());
  });
  it('does not rerender unchanged order or QR for typing, same pending or unrelated reads', async () => {
    const qrRender = jest.spyOn(QrPaymentCode as unknown as { type: React.FC<{ payload?: string }> }, 'type');
    const orderRender = jest.spyOn(CheckoutOrderSummary as unknown as { type: React.FC<{ cart: unknown[] }> }, 'type');
    const { tree, client, setCheckout } = fixture(); const view = render(tree);
    fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open'));
    const orderBefore = orderRender.mock.calls.length;
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    expect(orderRender).toHaveBeenCalledTimes(orderBefore);
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    const qrBefore = qrRender.mock.calls.length;
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    expect(qrRender).toHaveBeenCalledTimes(qrBefore); expect(orderRender).toHaveBeenCalledTimes(orderBefore);
    setCheckout({ ...pending, attempts: [{ ...pending.attempts[0], qrPayload: 'REPLACEMENT' }] });
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    expect(qrRender).toHaveBeenCalledTimes(qrBefore + 1);
    fireEvent.press(view.getByTestId('seed')); expect(orderRender).toHaveBeenCalledTimes(orderBefore + 1);
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('retains a committed QR through failed reads and remount, then retries only receipt reads', async () => {
    const { tree, client, handle, setCheckout } = fixture(); const view = render(tree); await start(view);
    const completed: AuthorityCheckout = { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' } };
    setCheckout(completed);
    client.listSales.mockRejectedValueOnce(new Error('offline')).mockRejectedValueOnce(new Error('offline'));
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    expect(view.getByTestId('retry-qr-verification')).toHaveTextContent(/Retry receipt refresh/);
    expect(handle()?.id).toBe('server-uuid'); expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    fireEvent.press(view.getByTestId('leave'));
    await act(async () => { fireEvent.press(view.getByTestId('open')); });
    expect(view.getByTestId('retry-qr-verification')).toHaveTextContent(/Retry receipt refresh/);
    expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.press(view.getByTestId('retry-qr-verification')); });
    expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1); expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1); expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(client.recoverCheckout).toHaveBeenCalledTimes(3); expect(handle()).toBeNull();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
  it('shows an administrator case from receipt recovery even when history is unavailable', async () => {
    const { tree, client, setCheckout } = fixture(); const view = render(tree); await start(view);
    const completed: AuthorityCheckout = { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' } };
    setCheckout(completed); client.listSales.mockRejectedValue(new Error('offline'));
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    setCheckout({ ...completed, state: 'provider_contradiction', attempts: [{ ...completed.attempts[0], status: 'contradiction' }], exceptions: [{ caseId: 17, reason: 'provider_contradiction', state: 'open' }] });
    await act(async () => { fireEvent.press(view.getByTestId('retry-qr-verification')); });
    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/Conflicting payment records found/);
    expect(view.getByText('Case 17')).toBeTruthy(); expect(view.queryByTestId('retry-qr-verification')).toBeNull();
    expect(view.queryByTestId('qr-payment-symbol')).toBeNull(); expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1);
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
