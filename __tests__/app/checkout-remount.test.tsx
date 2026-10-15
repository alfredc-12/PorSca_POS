import React, { useState } from 'react';
import { AppState, AppStateStatus, Alert, Button, Text, View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CheckoutScreen from '@/app/checkout';
import { router } from 'expo-router';
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
  const { addProductChecked, cart } = usePos(); const [visible, setVisible] = useState(false);
  return <View><Text testID="editable-cart-count">{cart.reduce((sum, line) => sum + line.quantity, 0)}</Text><Button testID="seed" title="Seed" onPress={() => addProductChecked(product)} /><Button testID="open" title="Open" onPress={() => setVisible(true)} /><Button testID="leave" title="Leave" onPress={() => setVisible(false)} />{visible ? <CheckoutScreen /> : null}</View>;
}
function fixture() {
  let handle: CheckoutHandle | null = null; let checkout = open;
  const storage: CheckoutStorage = { load: async () => handle, save: async value => { handle = value; } };
  const client = { isConfigured: true, createCheckout: jest.fn().mockResolvedValue(open), getCheckout: jest.fn(async () => checkout), recoverCheckout: jest.fn(async () => checkout),
    createCheckoutAttempt: jest.fn(async () => { checkout = pending; return pending; }), refreshCheckoutAttempt: jest.fn(async () => checkout),
    checkoutCash: jest.fn(), listProducts: jest.fn().mockResolvedValue([]), listInventory: jest.fn().mockResolvedValue([]), listSales: jest.fn().mockResolvedValue([]), getProduct: jest.fn().mockResolvedValue(product) };
  const tree = <PosProvider client={client as unknown as ApiClient} checkoutStore={storage}><Shop /></PosProvider>;
  return { tree, client, storage, handle: () => handle, setCheckout: (value: AuthorityCheckout) => { checkout = value; } };
}
async function start(view: ReturnType<typeof render>) {
  fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open')); fireEvent.press(view.getByTestId('checkout-payment-qrph'));
  await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
  expect(view.getByText('Payment pending…')).toBeTruthy();
}

describe('checkout remount with durable machine state', () => {
  beforeEach(() => { jest.clearAllMocks(); Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }); jest.spyOn(Alert, 'alert').mockImplementation(() => undefined); });
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
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
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
    const retainedOrderRenders = orderRender.mock.calls.length;
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    expect(qrRender).toHaveBeenCalledTimes(qrBefore); expect(orderRender).toHaveBeenCalledTimes(retainedOrderRenders);
    setCheckout({ ...pending, attempts: [{ ...pending.attempts[0], qrPayload: 'REPLACEMENT' }] });
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    expect(qrRender).toHaveBeenCalledTimes(qrBefore + 1);
    fireEvent.press(view.getByTestId('seed'));
    expect(orderRender).toHaveBeenCalledTimes(retainedOrderRenders);
    expect(view.getByTestId('checkout-order-summary')).toHaveTextContent('Qty 1 • ₱25.00 each');
    expect(view.getByTestId('editable-cart-count')).toHaveTextContent('2');
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('retains a committed QR through failed reads and remount, then retries only receipt reads', async () => {
    const { tree, client, handle, setCheckout } = fixture(); const view = render(tree); await start(view);
    const completed: AuthorityCheckout = { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' } };
    setCheckout(completed);
    client.listSales.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    expect(view.getByTestId('retry-qr-verification')).toHaveTextContent(/Retry receipt refresh/);
    expect(handle()?.id).toBe('server-uuid'); expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    fireEvent.press(view.getByTestId('leave'));
    await act(async () => { fireEvent.press(view.getByTestId('open')); });
    expect(view.getByTestId('retry-qr-verification')).toHaveTextContent('Refresh receipt');
    expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1);
    await act(async () => { fireEvent.press(view.getByTestId('retry-qr-verification')); });
    expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1); expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1); expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(client.recoverCheckout).toHaveBeenCalledTimes(2); expect(handle()).toBeNull();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('checkout-completed-receipt')).toHaveTextContent(/Payment confirmed\. Stock and history updated\./);
    expect(view.getByText('Receipt 9')).toBeTruthy(); expect(view.getByText('Paid ₱25.00')).toBeTruthy();
    expect(view.queryByText('The cart is empty')).toBeNull(); expect(view.queryByTestId('qr-payment-code')).toBeNull();
    expect(view.queryByTestId('start-qrph-payment')).toBeNull();
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open'));
    expect(view.getByTestId('checkout-completed-receipt')).toBeTruthy(); expect(Alert.alert).toHaveBeenCalledTimes(1);
    const done = (Alert.alert as jest.Mock).mock.calls[0][2][0].onPress;
    act(() => { done(); done(); }); expect(router.replace).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open'));
    expect(view.queryByTestId('checkout-completed-receipt')).toBeNull(); expect(view.queryByText('Receipt 9')).toBeNull();
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
  });
  it('reconciles a late paid check after remount and offers receipt refresh after the old screen fails', async () => {
    const { tree, client, setCheckout, handle } = fixture();
    const view = render(tree); await start(view);
    const completed: AuthorityCheckout = { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' } };
    let finishCheck!: (value: AuthorityCheckout) => void;
    client.refreshCheckoutAttempt.mockImplementationOnce(() => new Promise(resolve => { finishCheck = resolve; }));
    fireEvent.press(view.getByTestId('refresh-qr-payment'));
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open'));
    expect(view.getByText('Payment pending…')).toBeTruthy();
    setCheckout(completed);
    client.listSales.mockRejectedValueOnce(new Error('offline'));
    await act(async () => { finishCheck(completed); });
    expect(Alert.alert).not.toHaveBeenCalled();
    expect(handle()?.id).toBe(open.id);
    expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    expect(view.getByTestId('retry-qr-verification')).toHaveTextContent('Refresh receipt');
    expect(view.queryByText('Refreshing receipt…')).toBeNull();
    await act(async () => { fireEvent.press(view.getByTestId('retry-qr-verification')); });
    expect(view.getByTestId('checkout-completed-receipt')).toHaveTextContent('Receipt 9');
    expect(handle()).toBeNull();
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it.each(['unknown', 'non_payable'] as const)('reconciles late %s payment evidence in the reopened screen', async status => {
    const { tree, client } = fixture();
    const view = render(tree); await start(view);
    let finishCheck!: (value: AuthorityCheckout) => void;
    client.refreshCheckoutAttempt.mockImplementationOnce(() => new Promise(resolve => { finishCheck = resolve; }));
    fireEvent.press(view.getByTestId('refresh-qr-payment'));
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open'));
    await act(async () => { finishCheck({ ...pending, state: status === 'non_payable' ? 'ready_for_attempt' : 'payment_unresolved', attempts: [{ ...pending.attempts[0], status, financialStatus: status === 'non_payable' ? 'expired' : 'pending', firstVerifiedOutcome: status === 'non_payable' ? 'non_payable' : null }] }); });
    if (status === 'unknown') {
      expect(view.getByTestId('retry-qr-verification')).toBeEnabled();
      expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    } else {
      expect(view.getByTestId('retry-qr-payment')).toBeEnabled();
      expect(view.getByTestId('checkout-payment-cash')).toBeEnabled();
    }
    expect(view.queryByText('Payment pending…')).toBeNull();
    expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('restores uncertain cash read-only on remount and exactly replays its saved key and amount', async () => {
    const { tree, client, setCheckout } = fixture();
    client.checkoutCash.mockRejectedValueOnce(new ApiClientError('lost response'));
    const view = render(tree); fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open'));
    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/The cash sale may already be recorded/);
    expect(view.getByTestId('cash-received-input')).toHaveProp('value', '100.00'); expect(view.getByTestId('cash-received-input')).toHaveProp('editable', false);
    expect(view.getByTestId('checkout-payment-qrph')).toBeDisabled(); expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    client.checkoutCash.mockImplementationOnce(async () => { const receipt: AuthorityCheckout = { ...open, state: 'completed', sale: { id: 20, method: 'cash', amountCentavos: 2500, cashReceivedCentavos: 10000, changeAmountCentavos: 7500, completedAt: 'today' } }; setCheckout(receipt); return receipt; });
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Retry saving cash payment' })); });
    expect(client.checkoutCash).toHaveBeenCalledTimes(2); expect(client.checkoutCash.mock.calls[1]).toEqual(client.checkoutCash.mock.calls[0]);
    expect(view.getByText('Change to give ₱75.00')).toBeTruthy(); expect(client.createCheckoutAttempt).not.toHaveBeenCalled();
  });
  it('keeps paid-unfulfilled administrator guidance without technical ids when both reads fail', async () => {
    const { tree, client, setCheckout } = fixture();
    const unfulfilled: AuthorityCheckout = { ...pending, state: 'paid_unfulfilled', attempts: [{ ...pending.attempts[0], status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid_unfulfilled' }], exceptions: [{ caseId: 22, reason: 'stock', state: 'open' }] };
    client.createCheckoutAttempt.mockImplementationOnce(async () => { setCheckout(unfulfilled); return unfulfilled; });
    client.listInventory.mockRejectedValue(new Error('offline')); client.listSales.mockRejectedValue(new Error('offline'));
    const view = render(tree); fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open')); fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    expect(view.getByText('Payment was received, but the sale could not be completed.')).toBeTruthy(); expect(view.getByText('Call the shop administrator now.')).toBeTruthy();
    expect(view.queryByText('Checkout server-uuid')).toBeNull(); expect(view.queryByText('Attempt 7')).toBeNull(); expect(view.queryByText('Case 22')).toBeNull();
    expect(view.getByTestId('checkout-payment-cash')).toBeDisabled(); expect(view.queryByTestId('refresh-qr-payment')).toBeNull(); expect(view.queryByTestId('retry-qr-payment')).toBeNull();
    expect(view.queryByTestId('qr-payment-code')).toBeNull(); expect(view.queryByTestId('checkout-completed-receipt')).toBeNull();
  });
  it('does not confuse uncertain QR creation without an attempt id with a cash sale', async () => {
    const { tree, client } = fixture(); client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('lost response')); client.recoverCheckout.mockRejectedValueOnce(new ApiClientError('offline'));
    const view = render(tree); fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open')); fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/We could not confirm the payment status/);
    expect(view.getByTestId('start-qrph-payment')).toHaveTextContent(/Retry QR Ph Payment/); expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    expect(client.createCheckoutAttempt.mock.calls[1]).toEqual(client.createCheckoutAttempt.mock.calls[0]); expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('keeps an authoritative cash receipt behind its alert while history is still loading', async () => {
    const { tree, client, setCheckout } = fixture();
    let finishHistory!: (value: never[]) => void;
    client.listSales.mockImplementation(() => new Promise(resolve => { finishHistory = resolve; }));
    client.checkoutCash.mockImplementation(async () => {
      const cashReceipt: AuthorityCheckout = { ...open, state: 'completed', sale: { id: 20, method: 'cash', amountCentavos: 2500, cashReceivedCentavos: 10000, changeAmountCentavos: 7500, completedAt: 'today' } };
      setCheckout(cashReceipt); return cashReceipt;
    });
    const view = render(tree); fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });
    expect(Alert.alert).toHaveBeenCalledTimes(1); expect(Alert.alert).toHaveBeenCalledWith('Payment completed', expect.stringContaining('Change to give ₱75.00'), expect.any(Array));
    expect(view.getByTestId('checkout-completed-receipt')).toHaveTextContent(/Cash payment and sale are recorded/);
    expect(view.queryByTestId('cash-received-input')).toBeNull(); expect(view.queryByText('The cart is empty')).toBeNull();
    await act(async () => { finishHistory([]); }); expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
  it('shows an administrator case from receipt recovery even when history is unavailable', async () => {
    const { tree, client, setCheckout } = fixture(); const view = render(tree); await start(view);
    const completed: AuthorityCheckout = { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' } };
    setCheckout(completed); client.listSales.mockRejectedValue(new Error('offline'));
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    setCheckout({ ...completed, state: 'provider_contradiction', attempts: [{ ...completed.attempts[0], status: 'contradiction' }], exceptions: [{ caseId: 17, reason: 'provider_contradiction', state: 'open' }] });
    await act(async () => { fireEvent.press(view.getByTestId('retry-qr-verification')); });
    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/Conflicting payment records found/);
    expect(view.queryByText('Case 17')).toBeNull(); expect(view.queryByTestId('retry-qr-verification')).toBeNull();
    expect(view.getByText('Administrator required')).toBeTruthy(); expect(view.getByText('Call the shop administrator now.')).toBeTruthy();
    expect(view.getByText('Do not take another payment, hand over goods, refund, or abandon this purchase while you wait.')).toBeTruthy();
    expect(view.queryByTestId('sale-help-toggle')).toBeNull(); expect(view.queryByRole('button', { name: 'Check the current price' })).toBeNull(); expect(view.queryByRole('button', { name: 'Cancel this sale' })).toBeNull();
    expect(view.getByTestId('checkout-payment-cash')).toBeDisabled(); expect(view.getByTestId('checkout-payment-qrph')).toBeDisabled();
    expect(view.queryByTestId('qr-payment-code-symbol')).toBeNull(); expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
  it.each([false, true])('retains a paid status returned in the background when receipt reads fail: %s', async failReads => {
    let changeState!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      changeState = listener;
      return { remove: jest.fn() };
    });
    const { tree, client, setCheckout, handle } = fixture();
    const view = render(tree); await start(view);
    const completed: AuthorityCheckout = { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' } };
    let finishCheck!: (value: AuthorityCheckout) => void;
    client.refreshCheckoutAttempt.mockImplementationOnce(() => new Promise(resolve => { finishCheck = resolve; }));
    if (failReads) client.listSales.mockRejectedValueOnce(new Error('offline'));
    fireEvent.press(view.getByTestId('refresh-qr-payment'));
    act(() => changeState('background'));
    setCheckout(completed);
    await act(async () => { finishCheck(completed); });
    expect(Alert.alert).not.toHaveBeenCalled();
    act(() => changeState('active'));
    if (failReads) {
      expect(handle()?.id).toBe(open.id);
      expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
      expect(view.getByTestId('retry-qr-verification')).toHaveTextContent('Retry receipt refresh');
      await act(async () => { fireEvent.press(view.getByTestId('retry-qr-verification')); });
    }
    expect(view.getByTestId('checkout-completed-receipt')).toHaveTextContent('Receipt 9');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    expect(handle()).toBeNull();
    expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('keeps receipt failures that arrive after backgrounding available for retry', async () => {
    let changeState!: (state: AppStateStatus) => void;
    jest.spyOn(AppState, 'addEventListener').mockImplementation((_event, listener) => {
      changeState = listener;
      return { remove: jest.fn() };
    });
    const { tree, client, setCheckout } = fixture();
    const view = render(tree); await start(view);
    const completed: AuthorityCheckout = { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 2500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' } };
    setCheckout(completed);
    let failHistory!: (error: Error) => void;
    client.listSales.mockImplementationOnce(() => new Promise((_resolve, reject) => { failHistory = reject; }));
    fireEvent.press(view.getByTestId('refresh-qr-payment'));
    await waitFor(() => expect(failHistory).toBeDefined());
    act(() => changeState('background'));
    await act(async () => { failHistory(new Error('offline')); });
    act(() => changeState('active'));
    expect(view.getByTestId('retry-qr-verification')).toHaveTextContent('Retry receipt refresh');
    await act(async () => { fireEvent.press(view.getByTestId('retry-qr-verification')); });
    expect(view.getByTestId('checkout-completed-receipt')).toBeTruthy();
    expect(client.refreshCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(Alert.alert).toHaveBeenCalledTimes(1);
  });
  it('finishes a retained cash sale after handle retirement recovers without taking payment again', async () => {
    const { tree, client, storage, setCheckout, handle } = fixture();
    const save = jest.spyOn(storage, 'save');
    const persist = save.getMockImplementation()!;
    save.mockImplementation(async value => {
      if (value === null) throw new Error('storage unavailable');
      await persist(value);
    });
    client.checkoutCash.mockImplementationOnce(async () => {
      const completed: AuthorityCheckout = { ...open, state: 'completed', sale: { id: 20, method: 'cash', amountCentavos: 2500, cashReceivedCentavos: 10000, changeAmountCentavos: 7500, completedAt: 'today' } };
      setCheckout(completed); return completed;
    });
    const view = render(tree);
    fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });
    expect(view.getByTestId('checkout-completed-receipt')).toBeTruthy();
    expect(handle()?.id).toBe(open.id);
    fireEvent.press(view.getByRole('button', { name: 'Done' }));
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open'));
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    save.mockImplementation(persist);
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Finish this sale' })); });
    expect(handle()).toBeNull();
    expect(view.getByTestId('editable-cart-count')).toHaveTextContent('0');
    expect(view.getByTestId('checkout-completed-receipt')).toHaveTextContent('Receipt 20');
    expect(Alert.alert).toHaveBeenCalledTimes(1);
    fireEvent.press(view.getByRole('button', { name: 'Done' }));
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    expect(view.getByTestId('confirm-cash-payment')).toBeEnabled();
    expect(client.checkoutCash).toHaveBeenCalledTimes(1);
    expect(client.createCheckoutAttempt).not.toHaveBeenCalled();
  });
  it.each(['cash', 'qrph'] as const)('offers price review after a pre-payment %s quote refusal', async method => {
    const { tree, client, setCheckout } = fixture();
    const revised: AuthorityCheckout = { ...open, amountCentavos: 3000, items: [{ ...open.items[0], unitPriceCentavos: 3000 }] };
    client.createCheckout.mockImplementationOnce(async () => { setCheckout(revised); return revised; });
    const revalidateCheckout = jest.fn().mockResolvedValue(revised);
    Object.assign(client, { revalidateCheckout });
    const view = render(tree);
    fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open'));
    if (method === 'cash') fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    else fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId(method === 'cash' ? 'confirm-cash-payment' : 'start-qrph-payment')); });
    expect(view.getByText('Review the price before payment')).toBeTruthy();
    expect(view.getByText(/No payment was submitted/)).toBeTruthy();
    expect(view.queryByTestId('checkout-guidance')).toBeNull();
    const reviewPrice = view.getByRole('button', { name: 'Check the current price' });
    expect(reviewPrice).toBeEnabled();
    expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(client.createCheckoutAttempt).not.toHaveBeenCalled();
    await act(async () => { fireEvent.press(reviewPrice); });
    expect(revalidateCheckout).toHaveBeenCalledWith(open.id);
    expect(view.queryByText('Review the price before payment')).toBeNull();
    if (method === 'cash') {
      client.checkoutCash.mockResolvedValueOnce({ ...revised, state: 'completed', sale: { id: 21, method: 'cash', amountCentavos: 3000, cashReceivedCentavos: 10000, changeAmountCentavos: 7000, completedAt: 'today' } });
      await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });
      expect(client.checkoutCash).toHaveBeenCalledWith(open.id, expect.objectContaining({ acceptedAmountCentavos: 3000 }), expect.any(String));
      expect(view.getByTestId('checkout-completed-receipt')).toHaveTextContent('Paid ₱30.00');
    } else {
      client.createCheckoutAttempt.mockImplementationOnce(async () => {
        const revisedPending: AuthorityCheckout = { ...pending, amountCentavos: 3000, items: revised.items, attempts: [{ ...pending.attempts[0], amountCentavos: 3000 }] };
        setCheckout(revisedPending); return revisedPending;
      });
      await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
      expect(client.createCheckoutAttempt).toHaveBeenCalledWith(open.id, expect.objectContaining({ acceptedAmountCentavos: 3000 }), expect.any(String));
    }
  });
  it('keeps an unidentified Q2 locked after Q1 fails, remounts, and replays only Q2', async () => {
    const { tree, client, setCheckout, handle } = fixture();
    const view = render(tree); await start(view);
    const firstFailed: AuthorityCheckout = { ...pending, state: 'ready_for_attempt', attempts: [{ ...pending.attempts[0], status: 'non_payable', financialStatus: 'expired', firstVerifiedOutcome: 'non_payable' }] };
    setCheckout(firstFailed);
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('Q2 response lost'));
    await act(async () => { fireEvent.press(view.getByTestId('retry-qr-payment')); });
    const q2 = JSON.parse(JSON.stringify(handle()!.tender!));
    expect(q2.previousAttemptIds).toEqual([7]);
    expect(q2.attemptId).toBeUndefined();
    expect(view.getByTestId('checkout-guidance')).toHaveTextContent('The customer may still be charged.');
    expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    expect(view.queryByTestId('qr-payment-code')).toBeNull();
    expect(view.queryByTestId('retry-qr-payment')).toBeNull();
    expect(view.queryByTestId('refresh-qr-payment')).toBeNull();
    fireEvent.press(view.getByTestId('leave')); fireEvent.press(view.getByTestId('open'));
    expect(view.getByTestId('start-qrph-payment')).toHaveTextContent('Retry QR Ph Payment');
    expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    const second: AuthorityCheckout = { ...firstFailed, state: 'payment_unresolved', attempts: [...firstFailed.attempts, { ...pending.attempts[0], id: 8, qrPayload: 'Q2' }] };
    client.createCheckoutAttempt.mockImplementationOnce(async () => { setCheckout(second); return second; });
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    expect(client.createCheckoutAttempt.mock.calls[2]).toEqual(client.createCheckoutAttempt.mock.calls[1]);
    expect(handle()!.tender).toMatchObject({ key: q2.key, attemptId: 8 });
    expect(view.getByText('Payment pending…')).toBeTruthy();
    expect(view.getByTestId('qr-payment-code')).toBeTruthy();
    expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('reattaches ambiguous QR creation to the server attempt rather than starting another', async () => {
    const { tree, client } = fixture();
    client.createCheckoutAttempt.mockImplementationOnce(async () => { throw new ApiClientError('lost response'); });
    client.recoverCheckout.mockResolvedValue(pending); client.getCheckout.mockResolvedValue(pending);
    const view = render(tree);
    fireEvent.press(view.getByTestId('seed')); fireEvent.press(view.getByTestId('open')); fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    expect(client.recoverCheckout).toHaveBeenCalledWith('server-uuid');
    expect(view.getByTestId('start-qrph-payment')).toHaveTextContent('Retry QR Ph Payment');
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    expect(view.getByTestId('refresh-qr-payment')).toBeTruthy();
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(2);
    expect(client.createCheckoutAttempt.mock.calls[1]).toEqual(client.createCheckoutAttempt.mock.calls[0]);
  });
});
