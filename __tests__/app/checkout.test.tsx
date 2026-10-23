import React from 'react';
import { AppState, Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import CheckoutScreen from '@/app/checkout';
import { AppButton } from '@/src/components/AppButton';
import { router } from 'expo-router';
import { usePos } from '@/src/context/PosContext';
import { ApiClientError, Payment } from '@/src/api/client';
import { CartLine, Sale } from '@/src/types';
import { CheckoutMachine, openCheckout, transitionCheckout } from '@/src/domain/checkoutMachine';
import { isDefinitiveQrRejection } from '@/src/domain/checkout';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { authorityObservation } from '@/src/domain/checkoutAuthorityAdapter';
import { CheckoutProgress } from '@/src/domain/checkoutGuidance';
import { cancellationFailedCopy, cancelledPurchaseCopy, changedBasketCopy, unobservedBasketCopy } from '@/src/domain/checkoutDivergenceCopy';

jest.mock('expo-router', () => ({
  router: { replace: jest.fn(), back: jest.fn() },
  useFocusEffect: (callback: () => void) => jest.requireActual<typeof import('react')>('react').useEffect(callback, [callback]),
  useLocalSearchParams: () => ({ method: 'cash' }),
}));
jest.mock('@/src/context/PosContext', () => { const usePos = jest.fn(); return { usePos, useCheckout: usePos }; });
jest.mock('@/src/components/Screen', () => ({ Screen: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const product = { id: '1', barcode: '4800000000041', name: 'Mineral Water 1L', price: 35, stock: 10, category: 'Beverages' as const };
const cart: CartLine[] = [{ product, quantity: 1 }];
const sale: Sale = {
  id: '42',
  createdAt: '2026-09-08T12:00:00Z',
  total: 35,
  paymentMethod: 'cash',
  status: 'paid',
  cashReceived: 100,
  change: 65,
  items: cart,
};

beforeEach(() => { Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'active' }); });
const mockReplace = router.replace as jest.Mock;
const mockUsePos = usePos as jest.Mock;

const pendingQrPayment: Payment = {
  id: '1',
  status: 'pending',
  amount: 3500,
  qrPayload: 'data:image/png;base64,qr-fixture',
  qrCode: 'data:image/png;base64,qr-fixture',
};

function safeOpenCheckout(overrides: Partial<AuthorityCheckout> = {}): AuthorityCheckout {
  return {
    id: 'test-checkout', storeId: '1', state: 'open', revision: 1, amountCentavos: 3500, currency: 'PHP',
    items: [], attempts: [], sale: null, exceptions: [], history: [], ...overrides,
  };
}

function setContext(overrides: Record<string, unknown> = {}) {
  const context = {
    total: 35,
    cart,
    apiConfigured: true,
    completeCashSale: jest.fn().mockResolvedValue(sale),
    resetCart: jest.fn(),
    confirmQrPhPayment: jest.fn().mockResolvedValue({ ...sale, paymentMethod: 'qrph', cashReceived: undefined, change: undefined }),
    unresolvedQrPayment: jest.fn(() => undefined),
    checkoutMachine: openCheckout('test-checkout', 3500),
    authorityCheckout: undefined as AuthorityCheckout | undefined,
    checkoutProgress: undefined as CheckoutProgress | undefined,
    prepareCancellation: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  };
  const observe = (state: CheckoutMachine['state']) => {
    context.checkoutMachine = transitionCheckout(context.checkoutMachine, {
      type: 'authority-observed',
      checkout: { ...context.checkoutMachine, state },
    }).checkout;
  };
  const observePayment = (payment: Payment) => {
    const unpaid = ['failed', 'expired', 'cancelled'].includes(payment.status);
    const paid = payment.status === 'paid' || payment.status === 'paid_unfulfilled';
    context.authorityCheckout = {
      id: 'test-checkout', storeId: '1', revision: 1, currency: 'PHP', amountCentavos: 3500, items: [], history: [], exceptions: [],
      state: unpaid ? 'ready_for_attempt' : payment.status === 'paid' ? 'completed' : payment.status === 'paid_unfulfilled' ? 'paid_unfulfilled' : 'payment_unresolved',
      attempts: [{ id: 1, method: 'qrph', amountCentavos: 3500, currency: 'PHP', status: unpaid ? 'non_payable' : paid ? 'paid' : payment.status === 'unknown' ? 'unknown' : 'pending', financialStatus: paid ? payment.status as 'paid' | 'paid_unfulfilled' : unpaid ? 'failed' : 'pending', firstVerifiedOutcome: paid ? 'paid' : unpaid ? 'non_payable' : null, qrPayload: payment.qrPayload ?? null, qrExpiresAt: (overrides.authorityQrExpiresAt as string | null | undefined) ?? null, reservation: null }],
      sale: payment.status === 'paid' ? { id: 42, method: 'qrph', amountCentavos: 3500, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: sale.createdAt } : null,
    };
    context.checkoutMachine = authorityObservation(context.authorityCheckout);
    return payment;
  };
  const start = (overrides.startQrPhPayment ?? jest.fn().mockResolvedValue(pendingQrPayment)) as jest.Mock;
  const refresh = (overrides.refreshQrPhPayment ?? jest.fn().mockResolvedValue(pendingQrPayment)) as jest.Mock;
  // Assign after overrides so an injected network mock cannot bypass the machine adapter.
  const startQrPhPayment = async (...args: unknown[]) => {
    try { return observePayment(await start(...args)); }
    catch (error) {
      if (error instanceof ApiClientError && error.code === 'cash_attempt_unresolved') context.checkoutProgress = { uncertainTender: 'cash' };
      if (!(error instanceof ApiClientError) || error.code !== 'cash_attempt_unresolved' && !isDefinitiveQrRejection(error)) observe('payment-unresolved');
      throw error;
    }
  };
  const refreshQrPhPayment = async (...args: unknown[]) => observePayment(await refresh(...args));
  mockUsePos.mockImplementation(() => ({ ...context, startQrPhPayment, refreshQrPhPayment }));
  return context;
}

describe('CheckoutScreen cash states', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setContext();
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  it('rejects underpaid cash with a visible shortfall and keeps the checkout available', () => {
    const completeCashSale = jest.fn();
    setContext({ completeCashSale });
    const { getByTestId, getByText } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '20');
    fireEvent.press(getByTestId('confirm-cash-payment'));

    expect(getByText('Short by ₱15.00. Add cash before confirming.')).toBeTruthy();
    expect(getByTestId('confirm-cash-payment')).toBeDisabled();
    expect(completeCashSale).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it.each(['', 'abc', '-1', '1e2', '35.001'])('blocks invalid cash %j inline without dialogs and clears feedback after correction', (input) => {
    const completeCashSale = jest.fn();
    setContext({ completeCashSale });
    const view = render(<CheckoutScreen />);
    fireEvent.changeText(view.getByTestId('cash-received-input'), input);
    fireEvent.press(view.getByTestId('confirm-cash-payment'));
    expect(view.getByTestId('cash-tender-feedback')).toBeTruthy();
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    expect(completeCashSale).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
    fireEvent.press(view.getByLabelText('Cash Exact'));
    expect(view.getByTestId('cash-received-input')).toHaveProp('value', '35.00');
    expect(view.queryByTestId('cash-tender-feedback')).toBeNull();
    expect(view.getByTestId('confirm-cash-payment')).not.toBeDisabled();
    expect(view.queryByLabelText('Cash 20')).toBeNull();
  });

  it('uses the authoritative amount for cash validation and exact presets', () => {
    setContext({ authorityCheckout: { amountCentavos: 5000, items: [], attempts: [] } });
    const view = render(<CheckoutScreen />);
    fireEvent.changeText(view.getByTestId('cash-received-input'), '35');
    expect(view.getByTestId('cash-tender-feedback')).toHaveTextContent('Short by ₱15.00. Add cash before confirming.');
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    expect(view.queryByLabelText('Cash 50')).toBeNull();
    fireEvent.press(view.getByLabelText('Cash Exact'));
    expect(view.getByTestId('cash-received-input')).toHaveProp('value', '50.00');
    expect(view.getByTestId('confirm-cash-payment')).not.toBeDisabled();
  });

  it('surfaces Laravel stock conflicts with a recovery action and preserves the cart', async () => {
    const completeCashSale = jest.fn().mockRejectedValue(new ApiClientError('Insufficient stock for Mineral Water 1L.', 409, 'insufficient_stock'));
    setContext({ completeCashSale });
    const { getByTestId, getByText } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '100');
    await act(async () => {
      fireEvent.press(getByTestId('confirm-cash-payment'));
    });

    expect(getByText(/Some items are no longer available/)).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith('Stock changed', expect.stringContaining('try again.'));
  });

  it('keeps unobserved changed-basket cash failures free of cancellation promises', async () => {
    const completeCashSale = jest.fn().mockRejectedValue(new ApiClientError('Recover or abandon the original device purchase before changing its basket.', 409, 'checkout_basket_diverged'));
    setContext({ completeCashSale, checkoutMachine: undefined });
    const { getByTestId } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(getByTestId('confirm-cash-payment')); });

    expect(alertSpy).toHaveBeenCalledWith(unobservedBasketCopy.failureTitle, expect.stringContaining('no confirmed open purchase to cancel'));
    expect(alertSpy.mock.calls[0][1] as string).not.toMatch(/cancel this purchase|keep this cart/);
    expect(getByTestId('checkout-cash-error')).toHaveTextContent(/no confirmed open purchase to cancel/);
    expect(getByTestId('checkout-cash-error')).not.toHaveTextContent(/cancel this purchase|keep this cart/);
  });

  it('keeps observed changed-basket cash failures on the cancellation-capable copy', async () => {
    const completeCashSale = jest.fn().mockRejectedValue(new ApiClientError('Recover or abandon the original device purchase before changing its basket.', 409, 'checkout_basket_diverged'));
    setContext({ completeCashSale, authorityCheckout: safeOpenCheckout() });
    const { getByTestId } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(getByTestId('confirm-cash-payment')); });

    expect(alertSpy).toHaveBeenCalledWith(changedBasketCopy.failureTitle, expect.stringContaining('or cancel this purchase to keep this cart'));
    expect(getByTestId('checkout-cash-error')).toHaveTextContent(/or cancel this purchase to keep this cart/);
  });

  it('keeps unobserved changed-basket QR start failures free of cancellation promises', async () => {
    const startQrPhPayment = jest.fn().mockRejectedValue(new ApiClientError('Recover or abandon the original device purchase before changing its basket.', 422, 'checkout_basket_diverged'));
    setContext({ startQrPhPayment, checkoutMachine: undefined });
    const view = render(<CheckoutScreen />);

    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });

    expect(view.getByTestId('qr-payment-error')).toHaveTextContent(/no confirmed open purchase to cancel/);
    expect(view.getByTestId('qr-payment-error')).not.toHaveTextContent(/cancel this purchase|keep this cart/);
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('records a successful cash response and offers the authoritative history route', async () => {
    const completeCashSale = jest.fn().mockResolvedValue(sale);
    setContext({ completeCashSale });
    const { getByTestId } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '100');
    await act(async () => {
      fireEvent.press(getByTestId('confirm-cash-payment'));
    });

    expect(completeCashSale).toHaveBeenCalledWith('100');
    expect(alertSpy).toHaveBeenCalledWith('Payment completed', 'Cash payment and sale are recorded.\nReceipt 42\nPaid ₱35.00\nCash received ₱100.00\nChange to give ₱65.00', expect.any(Array));
    const actions = alertSpy.mock.calls[0][2] as { onPress?: () => void }[];
    actions[0].onPress?.();
    expect(mockReplace).toHaveBeenCalledWith('/(tabs)/transactions');
  });

  it('ignores a second confirm tap while a cash sale is in flight', async () => {
    let resolve!: (sale: Sale) => void;
    const completeCashSale = jest.fn().mockReturnValue(new Promise<Sale>((done) => { resolve = done; }));
    setContext({ completeCashSale });
    const { getByTestId } = render(<CheckoutScreen />);

    fireEvent.changeText(getByTestId('cash-received-input'), '100');
    fireEvent.press(getByTestId('confirm-cash-payment'));
    fireEvent.press(getByTestId('confirm-cash-payment'));
    expect(completeCashSale).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(sale); });
    expect(completeCashSale).toHaveBeenCalledTimes(1);
  });

  it('blocks checkout entirely when Laravel is not configured, even in demo mode', () => {
    const completeCashSale = jest.fn();
    setContext({ apiConfigured: false, completeCashSale });
    const view = render(<CheckoutScreen />);

    // A deep link or stale navigation to this route cannot record a local sale
    // (defect F1).
    expect(view.getByTestId('checkout-offline-notice')).toHaveTextContent(/Do not take payment or hand over goods until the administrator fixes this phone/);
    expect(view.queryByTestId('cash-received-input')).toBeNull();
    expect(view.queryByTestId('confirm-cash-payment')).toBeNull();
    expect(view.queryByTestId('checkout-payment-qrph')).toBeNull();
    expect(completeCashSale).not.toHaveBeenCalled();
  });
});

describe('CheckoutScreen Laravel QR Ph states', () => {
  let alertSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    setContext();
  });

  afterEach(() => {
    alertSpy.mockRestore();
  });

  async function openQrCheckout() {
    const view = render(<CheckoutScreen />);
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });
    await waitFor(() => expect(view.getByTestId('qr-payment-status')).toBeTruthy());
    return view;
  }

  it('creates a Laravel payment, displays the returned QR payload, and remains pending', async () => {
    const startQrPhPayment = jest.fn().mockResolvedValue(pendingQrPayment);
    setContext({ startQrPhPayment });
    const view = await openQrCheckout();

    expect(startQrPhPayment).toHaveBeenCalledWith(false);
    expect(view.getByTestId('qr-payment-image')).toBeTruthy();
    expect(view.getByText('Payment pending…')).toBeTruthy();
    expect(view.getByTestId('refresh-qr-payment')).toBeTruthy();
    expect(view.getByTestId('leave-qr-payment')).toBeTruthy();
    expect(view.getByTestId('qr-expiry-countdown')).toHaveTextContent('Expiry time unavailable');
    expect(view.getByTestId('qr-practice-notice')).toHaveTextContent(/not payable/i);
    expect(view.queryByTestId('cancel-sale-entry')).toBeNull();
    expect(view.queryByTestId('retry-qr-payment')).toBeNull();
  });

  it('keeps payment pending and locked when the read-only countdown reaches zero', async () => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-10-23T12:00:00.000Z'));
    const expiry = '2026-10-23T12:00:01.500Z';
    const refreshQrPhPayment = jest.fn().mockResolvedValue(pendingQrPayment);
    const abandonCheckout = jest.fn();
    const resetCart = jest.fn();
    const context = setContext({ authorityQrExpiresAt: expiry, refreshQrPhPayment, abandonCheckout, resetCart });
    let view: ReturnType<typeof render> | undefined;
    try {
      view = render(<CheckoutScreen />);
      fireEvent.press(view.getByTestId('checkout-payment-qrph'));
      await act(async () => { fireEvent.press(view!.getByTestId('start-qrph-payment')); });
      expect(view.getByTestId('qr-expiry-countdown')).toHaveTextContent('Time remaining: 00:02');
      expect(context.checkoutMachine.state).toBe('payment-unresolved');
      expect(context.checkoutMachine.attempts[0].payment).toBe('pending');

      act(() => { jest.advanceTimersByTime(2000); });

      expect(view.getByTestId('qr-expiry-countdown')).toHaveTextContent('Time remaining: 00:00');
      expect(view.getByTestId('qr-payment-status')).toHaveTextContent('Payment pending…');
      expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
      expect(context.checkoutMachine.state).toBe('payment-unresolved');
      expect(context.checkoutMachine.attempts[0].payment).toBe('pending');
      expect(refreshQrPhPayment).not.toHaveBeenCalled();
      expect(abandonCheckout).not.toHaveBeenCalled();
      expect(resetCart).not.toHaveBeenCalled();
    } finally {
      view?.unmount();
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('keeps cancellation unavailable for an unknown QR attempt and points to status/recovery actions', () => {
    const unknownPayment = { ...pendingQrPayment, status: 'unknown' as const };
    const checkout = safeOpenCheckout({
      state: 'payment_unresolved',
      attempts: [{ id: 1, method: 'qrph', amountCentavos: 3500, currency: 'PHP', status: 'unknown', financialStatus: 'pending', firstVerifiedOutcome: null, qrPayload: 'practice-payload', qrExpiresAt: null, reservation: null }],
    });
    setContext({ authorityCheckout: checkout, checkoutMachine: authorityObservation(checkout), unresolvedQrPayment: jest.fn(() => unknownPayment) });
    const view = render(<CheckoutScreen />);

    expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    expect(view.queryByTestId('cancel-sale-entry')).toBeNull();
    expect(view.queryByTestId('cancel-sale-reason-input')).toBeNull();
    expect(view.getByTestId('retry-qr-verification')).toBeTruthy();
    expect(view.getByTestId('leave-qr-payment')).toBeTruthy();
    fireEvent.press(view.getByTestId('sale-help-toggle'));
    expect(view.getByTestId('cancel-sale-unavailable')).toHaveTextContent(/payment-status or recovery action above/i);
    expect(view.queryByTestId('confirm-cancel-sale')).toBeNull();
  });

  it('shows only the authoritative basket when the editable cart changes while payment is away', () => {
    const retainedCheckout: AuthorityCheckout = {
      id: 'test-checkout', storeId: '1', state: 'payment_unresolved', revision: 1, amountCentavos: 3500, currency: 'PHP',
      items: [{ productId: 1, name: product.name, quantity: 1, unitPriceCentavos: 3500 }],
      attempts: [{ id: 1, method: 'qrph', amountCentavos: 3500, currency: 'PHP', status: 'pending', financialStatus: 'pending', firstVerifiedOutcome: null, qrPayload: pendingQrPayment.qrPayload!, qrExpiresAt: null, reservation: null }],
      sale: null, exceptions: [], history: [],
    };
    const barako = { ...product, id: '2', name: 'Barako Coffee', price: 185 };
    setContext({
      total: 220,
      cart: [...cart, { product: barako, quantity: 1 }],
      authorityCheckout: retainedCheckout,
      checkoutMachine: authorityObservation(retainedCheckout),
      unresolvedQrPayment: jest.fn(() => pendingQrPayment),
    });

    const view = render(<CheckoutScreen />);

    expect(view.getByText('Payment pending…')).toBeTruthy();
    expect(view.queryByText('Barako Coffee')).toBeNull();
    expect(view.getByText(product.name)).toBeTruthy();
    expect(view.getByText('Qty 1 • ₱35.00 each')).toBeTruthy();
    expect(view.getByText('1 item in this sale')).toBeTruthy();
    expect(mockUsePos().cart).toEqual([...cart, { product: barako, quantity: 1 }]);
    expect(view.queryByText('₱220.00')).toBeNull();
    expect(view.getAllByText('₱35.00').length).toBeGreaterThan(0);
  });

  it('draws a scannable QR symbol for a raw payload instead of printing the payload text', async () => {
    const rawPayload = '00020101021226680014ph.paymongo0015QRPH-TXN-100015204999953035605802PH5910PORSCA POS6009PASIG CITY6304ABCD';
    const startQrPhPayment = jest.fn().mockResolvedValue({ ...pendingQrPayment, qrPayload: rawPayload, qrCode: rawPayload });
    setContext({ startQrPhPayment });
    const view = await openQrCheckout();

    expect(view.getByTestId('qr-payment-code')).toBeTruthy();
    expect(view.queryByText(rawPayload)).toBeNull();
    expect(view.queryByTestId('qr-payment-image')).toBeNull();
    expect(view.getByText('Payment pending…')).toBeTruthy();
  });

  // Supplemental INV-03 / AC-08/32/34/36 coverage overlaps the protected
  // baseline oracle, but uses today's Laravel-backed checkout interface.
  it('offers no local paid simulation and cannot complete a pending QR through cashier actions', async () => {
    const completeCashSale = jest.fn();
    const confirmQrPhPayment = jest.fn();
    const resetCart = jest.fn();
    setContext({ completeCashSale, confirmQrPhPayment, resetCart });
    const view = await openQrCheckout();
    expect(view.queryByText(/simulate\s+(paid|success)/i)).toBeNull();
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    fireEvent.press(view.getByTestId('leave-qr-payment'));
    act(() => {
      for (const call of alertSpy.mock.calls) {
        for (const button of (call[2] ?? []) as { text?: string; onPress?: () => void }[]) {
          expect(button.text ?? '').not.toMatch(/simulate\s+(paid|success)/i);
          button.onPress?.();
        }
      }
    });
    expect(completeCashSale).not.toHaveBeenCalled();
    expect(confirmQrPhPayment).not.toHaveBeenCalled();
    expect(resetCart).not.toHaveBeenCalled();
  });

  // Supplemental INV-04 / AC-16 coverage overlaps the protected cash oracle.
  it.each(['pending', 'verification', 'creating', 'unknown'] as const)(
    'refuses cash while QR is %s, preserving the cart', async (state) => {
      let resolve!: (payment: Payment) => void;
      const completeCashSale = jest.fn().mockResolvedValue(sale);
      const resetCart = jest.fn();
      const startQrPhPayment = state === 'creating'
        ? jest.fn().mockReturnValue(new Promise<Payment>((done) => { resolve = done; }))
        : state === 'unknown'
          ? jest.fn().mockRejectedValue(new Error('Request outcome unknown'))
          : jest.fn().mockResolvedValue(pendingQrPayment);
      setContext({ completeCashSale, resetCart, startQrPhPayment,
        refreshQrPhPayment: jest.fn().mockRejectedValue(new Error('Status unavailable')) });
      const view = await openQrCheckout();
      if (state === 'verification') {
        await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
      }
      if (state !== 'creating') expect(mockUsePos().checkoutMachine.state).toBe('payment-unresolved');
      expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
      expect(view.getByTestId('checkout-payment-cash')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true, selected: false }));
      expect(view.getByTestId('checkout-payment-qrph')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
      expect(view.getByTestId('checkout-tender-lock-reason')).toHaveTextContent(/payment/i);
      fireEvent.press(view.getByTestId('checkout-payment-cash'));
      expect(view.queryByTestId('cash-received-input')).toBeNull();
      expect(view.queryByTestId('confirm-cash-payment')).toBeNull();
      expect(completeCashSale).not.toHaveBeenCalled();
      expect(resetCart).not.toHaveBeenCalled();
      if (state === 'creating') await act(async () => { resolve(pendingQrPayment); });
    },
  );

  it.each(['failed', 'cancelled', 'expired'] as const)('allows cash after server-confirmed QR %s', async (status) => {
    const completeCashSale = jest.fn().mockResolvedValue(sale);
    setContext({ completeCashSale, startQrPhPayment: jest.fn().mockResolvedValue({ ...pendingQrPayment, status }) });
    const view = await openQrCheckout();
    expect(view.getByTestId('checkout-payment-cash')).toBeEnabled();
    expect(view.getByTestId('checkout-payment-cash')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: false }));
    expect(view.queryByTestId('checkout-tender-lock-reason')).toBeNull();
    fireEvent.press(view.getByTestId('checkout-payment-cash'));
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    expect(view.getByTestId('confirm-cash-payment')).toBeEnabled();
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });
    expect(completeCashSale).toHaveBeenCalledWith('100');
  });

  it.each(['failed', 'cancelled', 'expired'] as const)('unlocks the selector only after a pending QR is server-verified %s', async (status) => {
    setContext({ refreshQrPhPayment: jest.fn().mockResolvedValue({ ...pendingQrPayment, status }) });
    const view = await openQrCheckout();
    expect(view.getByTestId('checkout-payment-cash')).toBeDisabled();
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });
    expect(view.getByTestId('checkout-payment-qrph')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    expect(view.getByTestId('checkout-payment-cash')).toBeEnabled();
    expect(view.queryByTestId('checkout-tender-lock-reason')).toBeNull();
    fireEvent.press(view.getByTestId('checkout-payment-cash'));
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    expect(view.getByTestId('confirm-cash-payment')).toBeEnabled();
  });

  it('leaves a pending payment without cancelling it and keeps the cart', async () => {
    const mockBack = router.back as jest.Mock;
    const startQrPhPayment = jest.fn().mockResolvedValue(pendingQrPayment);
    setContext({ startQrPhPayment });
    const view = await openQrCheckout();

    fireEvent.press(view.getByTestId('leave-qr-payment'));

    // There is no cashier cancel endpoint: leaving never settles or voids the
    // attempt, so no further payment request is made and the cart is kept.
    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(startQrPhPayment).toHaveBeenCalledTimes(1);
  });

  it.each<[Payment['status'], string]>([
    ['failed', 'Payment failed. No sale was recorded and stock was not changed.'],
    ['cancelled', 'Payment was cancelled. No sale was recorded and stock was not changed.'],
    ['expired', 'Payment expired. Start a new QR Ph payment; stock was not changed.'],
  ])('shows the %s state without completing a sale', async (status, message) => {
    const resetCart = jest.fn();
    setContext({ startQrPhPayment: jest.fn().mockResolvedValue({ ...pendingQrPayment, status }), resetCart });
    const view = await openQrCheckout();

    expect(view.getByText(message)).toBeTruthy();
    expect(view.getByTestId('retry-qr-payment')).toBeTruthy();
    expect(resetCart).not.toHaveBeenCalled();
  });

  it('shows paid_unfulfilled for reconciliation without starting a new payment', async () => {
    const unfulfilled = { ...pendingQrPayment, status: 'paid_unfulfilled' as const, failureReason: 'stock_reconciliation_required' };
    const confirmQrPhPayment = jest.fn().mockResolvedValue(undefined);
    const resetCart = jest.fn();
    setContext({ startQrPhPayment: jest.fn().mockResolvedValue(unfulfilled), confirmQrPhPayment, resetCart });
    const view = await openQrCheckout();

    expect(confirmQrPhPayment).toHaveBeenCalledWith(unfulfilled);
    expect(resetCart).not.toHaveBeenCalled();
    expect(view.getByText('Payment was received, but the sale could not be completed.')).toBeTruthy();
    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/Administrator required/);
    expect(view.getByText(/Support code: PRS-/)).toBeTruthy();
    // A new payment could double-charge money already received.
    expect(view.queryByTestId('retry-qr-payment')).toBeNull();
    expect(view.queryByTestId('refresh-qr-payment')).toBeNull();
    // Reconciliation has no cashier override: no quote review, abandonment, or stock action.
    expect(view.queryByText('Need help with this sale?')).toBeNull();
    expect(view.queryByText('Cancel this sale')).toBeNull();
    expect(view.getByTestId('leave-qr-payment')).toBeTruthy();
    expect(alertSpy).toHaveBeenCalledWith('Administrator required', expect.stringContaining('Call the shop administrator now.'));
  });

  it('keeps the paid_unfulfilled modal off a backgrounded app', async () => {
    const unfulfilled = { ...pendingQrPayment, status: 'paid_unfulfilled' as const };
    const confirmQrPhPayment = jest.fn().mockResolvedValue(undefined);
    setContext({ refreshQrPhPayment: jest.fn().mockResolvedValue(unfulfilled), confirmQrPhPayment });
    const view = await openQrCheckout();
    expect(alertSpy).not.toHaveBeenCalled();

    Object.defineProperty(AppState, 'currentState', { configurable: true, value: 'background' });
    await act(async () => { fireEvent.press(view.getByTestId('refresh-qr-payment')); });

    expect(confirmQrPhPayment).toHaveBeenCalledWith(unfulfilled);
    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/Administrator required/);
    expect(alertSpy).not.toHaveBeenCalled();
  });
  it('refreshes inventory and history only after Laravel returns paid', async () => {
    const paidPayment = { ...pendingQrPayment, status: 'paid' as const, saleId: 'sale-1' };
    const confirmQrPhPayment = jest.fn().mockResolvedValue({ ...sale, paymentMethod: 'qrph' });
    setContext({ startQrPhPayment: jest.fn().mockResolvedValue(paidPayment), confirmQrPhPayment });
    await openQrCheckout();

    expect(confirmQrPhPayment).toHaveBeenCalledWith(paidPayment);
    expect(alertSpy).toHaveBeenCalledWith('Payment completed', expect.stringContaining('Payment confirmed. Stock and history updated.'), expect.any(Array));
  });

  it('shows a recoverable verification state after a Laravel status error', async () => {
    const refreshQrPhPayment = jest.fn().mockRejectedValue(new ApiClientError('Unable to reach PorSca API: timeout'));
    setContext({ refreshQrPhPayment });
    const view = await openQrCheckout();

    await act(async () => {
      fireEvent.press(view.getByTestId('refresh-qr-payment'));
    });

    expect(view.getByTestId('qr-payment-status')).toHaveTextContent(/Payment interrupted/);
    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/Do not take another payment or hand over the goods/);
    expect(view.getByText(/Support code: PRS-/)).toBeTruthy();
    expect(view.getByTestId('retry-qr-verification')).toBeTruthy();
    expect(view.getByTestId('leave-qr-payment')).toBeTruthy();
  });

  it('records cash after Laravel definitively rejected the QR attempt', async () => {
    const completeCashSale = jest.fn().mockResolvedValue(sale);
    setContext({
      completeCashSale,
      startQrPhPayment: jest.fn().mockRejectedValue(new ApiClientError('The cart has no valid items.', 422, 'validation_error')),
    });
    const view = render(<CheckoutScreen />);
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });

    expect(view.getByTestId('qr-payment-error')).toHaveTextContent(/No sale was recorded/);

    fireEvent.press(view.getByTestId('checkout-payment-cash'));
    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    expect(completeCashSale).toHaveBeenCalledWith('100');
  });

  it('offers recovery only after a QR start is refused because cash is unresolved', async () => {
    const completeCashSale = jest.fn().mockResolvedValue(sale);
    const recoverCheckout = jest.fn().mockResolvedValue(undefined);
    setContext({
      completeCashSale, recoverCheckout,
      startQrPhPayment: jest.fn().mockRejectedValue(new ApiClientError('A cash payment for this cart is still unresolved.', undefined, 'cash_attempt_unresolved')),
    });
    const view = render(<CheckoutScreen />);
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));
    await act(async () => { fireEvent.press(view.getByTestId('start-qrph-payment')); });

    // This refusal is not a QR outcome and cannot authorize another cash post.
    expect(view.queryByTestId('start-qrph-payment')).toBeNull();
    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/Payment interrupted/);
    expect(view.getByTestId('checkout-payment-qrph')).toBeDisabled();
    expect(view.getByTestId('cash-received-input')).toHaveProp('editable', false);
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Recover device purchase' })); });
    expect(recoverCheckout).toHaveBeenCalledTimes(1); expect(completeCashSale).not.toHaveBeenCalled();
  });

  it('prepares the checkout only when the cashier opens cancellation, not on arrival', async () => {
    const prepareCancellation = jest.fn();
    const context = setContext({ prepareCancellation, checkoutMachine: undefined }) as unknown as {
      prepareCancellation: jest.Mock;
      authorityCheckout?: AuthorityCheckout;
      checkoutMachine?: CheckoutMachine;
    };
    context.prepareCancellation.mockImplementation(async () => {
      const checkout = safeOpenCheckout();
      context.authorityCheckout = checkout;
      context.checkoutMachine = authorityObservation(checkout);
      return checkout;
    });
    const view = render(<CheckoutScreen />);

    expect(prepareCancellation).not.toHaveBeenCalled();
    expect(view.getByTestId('cancel-sale-entry')).toBeTruthy();
    await act(async () => { fireEvent.press(view.getByTestId('cancel-sale-entry')); });

    expect(prepareCancellation).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('cancel-sale-reason-input')).toBeTruthy();
  });

  it('makes a safe open-checkout cancellation discoverable and validates an attributed 8–500 character reason', async () => {
    const abandonCheckout = jest.fn().mockResolvedValue({ ...safeOpenCheckout(), state: 'abandoned' });
    const completeCashSale = jest.fn();
    const context = setContext({ authorityCheckout: safeOpenCheckout(), abandonCheckout, completeCashSale });
    const view = render(<CheckoutScreen />);

    expect(view.getByTestId('cancel-sale-entry')).toBeTruthy();
    fireEvent.press(view.getByTestId('cancel-sale-entry'));
    const reason = view.getByTestId('cancel-sale-reason-input');
    const confirm = view.getByTestId('confirm-cancel-sale');
    expect(reason).toHaveProp('maxLength', 500);
    expect(confirm).toBeDisabled();
    fireEvent.changeText(reason, '  short  ');
    expect(confirm).toBeDisabled();
    fireEvent.changeText(reason, 'x'.repeat(501));
    expect(confirm).toBeDisabled();
    fireEvent.changeText(reason, '  Cashier changed their mind  ');
    expect(confirm).toBeEnabled();

    await act(async () => { fireEvent.press(confirm); });
    expect(abandonCheckout).toHaveBeenCalledWith('Cashier changed their mind');
    expect(view.getByTestId('checkout-cancelled-notice')).toHaveTextContent(/cart is unchanged/i);
    expect(context.cart).toEqual(cart);
    expect(completeCashSale).not.toHaveBeenCalled();
  });

  it('shows the cancelled state only when the authority reports the purchase abandoned', async () => {
    const abandonCheckout = jest.fn().mockResolvedValue({ ...safeOpenCheckout(), state: 'payment_unresolved' });
    setContext({ abandonCheckout, authorityCheckout: safeOpenCheckout() });
    const view = render(<CheckoutScreen />);

    fireEvent.press(view.getByTestId('sale-help-toggle'));
    fireEvent.changeText(view.getByLabelText('What happened with this sale'), 'Cashier changed their mind');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cancel-sale')); });

    expect(abandonCheckout).toHaveBeenCalledWith('Cashier changed their mind');
    expect(view.queryByTestId('checkout-cancelled-notice')).toBeNull();
  });

  it('clears the cancelled state when a new tender starts', async () => {
    const completeCashSale = jest.fn().mockResolvedValue(sale);
    const context = setContext({ completeCashSale, authorityCheckout: safeOpenCheckout() }) as unknown as {
      abandonCheckout: jest.Mock;
      authorityCheckout?: AuthorityCheckout;
      checkoutMachine?: CheckoutMachine;
    };
    context.abandonCheckout = jest.fn(async () => {
      context.authorityCheckout = undefined;
      context.checkoutMachine = undefined;
      return { ...safeOpenCheckout(), state: 'abandoned' };
    });
    const view = render(<CheckoutScreen />);

    fireEvent.press(view.getByTestId('sale-help-toggle'));
    fireEvent.changeText(view.getByLabelText('What happened with this sale'), 'Customer changed their mind');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cancel-sale')); });
    expect(view.getByTestId('checkout-cancelled-notice')).toBeTruthy();

    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cash-payment')); });

    expect(completeCashSale).toHaveBeenCalledWith('100');
    expect(view.queryByTestId('checkout-cancelled-notice')).toBeNull();
  });

  it('does not promise cancellation for a changed basket with no observed checkout', () => {
    setContext({ checkoutMachine: undefined, checkoutProgress: { basketDiverged: true } });
    const view = render(<CheckoutScreen />);

    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/The cart changed after checkout preparation began/);
    expect(view.getByTestId('checkout-guidance')).not.toHaveTextContent(/cancel this purchase|keep this cart/);
    expect(view.queryByTestId('cancel-sale-entry')).toBeNull();
    fireEvent.press(view.getByTestId('sale-help-toggle'));
    expect(view.getByTestId('cancel-sale-unavailable')).toHaveTextContent(/no confirmed open purchase to cancel/i);
    expect(view.queryByTestId('confirm-cancel-sale')).toBeNull();
  });

  it('tells the cashier a changed cart needs recovery or cancellation instead of a payment-in-progress warning', async () => {
    const completeCashSale = jest.fn();
    const recoverCheckout = jest.fn().mockResolvedValue(undefined);
    const abandonCheckout = jest.fn().mockResolvedValue({ ...safeOpenCheckout(), state: 'abandoned' });
    setContext({ completeCashSale, recoverCheckout, abandonCheckout, authorityCheckout: safeOpenCheckout(), checkoutProgress: { basketDiverged: true, recoveryFailure: 'interrupted' } });
    const view = render(<CheckoutScreen />);

    const guidance = view.getByTestId('checkout-guidance');
    expect(view.getByText(changedBasketCopy.headline)).toBeTruthy();
    expect(view.getByText(changedBasketCopy.body)).toBeTruthy();
    expect(view.getByText(changedBasketCopy.safety)).toBeTruthy();
    expect(guidance).not.toHaveTextContent(/ring up|still here|clears this cart/);
    expect(guidance).not.toHaveTextContent(/could not confirm|may already be recorded/);
    expect(view.getByTestId('checkout-tender-lock-reason')).toHaveTextContent(changedBasketCopy.tenderLock);
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    expect(view.getByText(changedBasketCopy.helpHint)).toBeTruthy();

    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Recover the earlier basket' })); });
    expect(recoverCheckout).toHaveBeenCalledTimes(1);
    expect(completeCashSale).not.toHaveBeenCalled();

    // "or abandon": cancellation stays usable while the basket is divergent.
    fireEvent.press(view.getByTestId('sale-help-toggle'));
    expect(view.getByText(/Tell us briefly what happened so the shop can review it later/)).toBeTruthy();
    expect(view.queryByText(/clears this cart|keeps this cart|ring up/)).toBeNull();
    const reason = view.getByLabelText('What happened with this sale');
    expect(reason).toHaveProp('editable', true);
    fireEvent.changeText(reason, 'Cashier added an item');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cancel-sale')); });
    expect(abandonCheckout).toHaveBeenCalledWith('Cashier added an item');
  });

  it('reports an unconfirmed cancellation and allows trying to cancel again', async () => {
    const abandonCheckout = jest.fn().mockResolvedValue({ ...safeOpenCheckout(), state: 'abandoned' });
    setContext({
      abandonCheckout,
      authorityCheckout: safeOpenCheckout(),
      checkoutProgress: { recoveryFailure: 'interrupted', cancellationFailed: true },
    });
    const view = render(<CheckoutScreen />);

    const guidance = view.getByTestId('checkout-guidance');
    expect(guidance).toHaveTextContent(/Cancellation not confirmed/);
    expect(guidance).toHaveTextContent(/may still be open/);
    expect(guidance).toHaveTextContent(/try cancelling again to keep this cart/i);
    expect(guidance).toHaveTextContent(/recover the earlier basket to replace this cart/i);
    expect(guidance).not.toHaveTextContent(/Payment interrupted|could not confirm the payment status|customer may still be charged/);
    expect(view.getByText(/recover the earlier basket and replace this cart/i)).toBeTruthy();
    expect(view.getByTestId('checkout-tender-lock-reason')).toHaveTextContent(/cancellation is unconfirmed/i);
    expect(view.getByTestId('checkout-tender-lock-reason')).not.toHaveTextContent(/payment is waiting/i);
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();

    fireEvent.press(view.getByTestId('sale-help-toggle'));
    const reason = view.getByLabelText('What happened with this sale');
    expect(reason).toHaveProp('editable', true);
    fireEvent.changeText(reason, 'Customer changed their mind');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cancel-sale')); });
    expect(abandonCheckout).toHaveBeenCalledWith('Customer changed their mind');
  });

  it('describes a failed cancellation as unconfirmed instead of a failed recovery', async () => {
    const abandonCheckout = jest.fn().mockRejectedValue(new ApiClientError('network down', 500));
    setContext({ abandonCheckout, authorityCheckout: safeOpenCheckout() });
    const view = render(<CheckoutScreen />);

    fireEvent.press(view.getByTestId('sale-help-toggle'));
    fireEvent.changeText(view.getByLabelText('What happened with this sale'), 'Customer changed their mind');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cancel-sale')); });

    expect(view.getByText(cancellationFailedCopy.notice)).toBeTruthy();
    expect(view.getByText(/try cancelling again to keep this cart/i)).toBeTruthy();
    expect(view.queryByText(/We could not recover this purchase/)).toBeNull();
  });

  it('hides a failed-cancellation notice when the cancellation requires an administrator', async () => {
    const context = setContext({
      abandonCheckout: jest.fn(),
      authorityCheckout: safeOpenCheckout(),
      checkoutProgress: { recoveryFailure: 'interrupted', cancellationFailed: true },
    }) as unknown as { checkoutProgress?: CheckoutProgress; abandonCheckout: jest.Mock };
    context.abandonCheckout.mockImplementation(async () => {
      context.checkoutProgress = { recoveryFailure: 'permission', cancellationFailed: true };
      throw new ApiClientError('permission denied', 403);
    });
    const view = render(<CheckoutScreen />);

    fireEvent.press(view.getByTestId('sale-help-toggle'));
    fireEvent.changeText(view.getByLabelText('What happened with this sale'), 'Customer changed their mind');
    await act(async () => { fireEvent.press(view.getByTestId('confirm-cancel-sale')); });

    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/Administrator required/);
    expect(view.queryByText(cancellationFailedCopy.notice)).toBeNull();
  });

  it('does not offer cancel retry while live payment uncertainty outranks cancellation failure', () => {
    setContext({
      authorityCheckout: safeOpenCheckout(),
      checkoutProgress: { basketDiverged: true, cancellationFailed: true, uncertainTender: 'cash', cashInput: '100.00' },
    });
    const view = render(<CheckoutScreen />);

    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/Payment interrupted/);
    expect(view.queryByText(cancellationFailedCopy.helpHint)).toBeNull();
    fireEvent.press(view.getByTestId('sale-help-toggle'));
    expect(view.queryByTestId('cancel-sale-entry')).toBeNull();
    expect(view.queryByTestId('cancel-sale-reason-input')).toBeNull();
  });

  it('describes a failed clear of the cancelled purchase without recovery copy', async () => {
    const recoverCheckout = jest.fn().mockRejectedValue(new ApiClientError('offline', 500));
    setContext({
      recoverCheckout,
      checkoutMachine: { ...openCheckout('test-checkout', 3500), state: 'abandoned' },
    });
    const view = render(<CheckoutScreen />);

    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/This purchase was cancelled/);
    await act(async () => { fireEvent.press(view.getByRole('button', { name: cancelledPurchaseCopy.clear })); });

    expect(view.getByText(cancelledPurchaseCopy.clearNotice)).toBeTruthy();
    expect(view.queryByText(/We could not recover this purchase/)).toBeNull();
  });

  it('shows the retained cart and total while the cancelled-purchase notice is up', () => {
    setContext({
      checkoutMachine: { ...openCheckout('test-checkout', 9999), state: 'abandoned' },
      authorityCheckout: {
        id: 'test-checkout', storeId: '1', state: 'abandoned', revision: 1, amountCentavos: 9999, currency: 'PHP',
        items: [{ productId: 9, name: 'Cancelled item', quantity: 3, unitPriceCentavos: 3333 }],
        attempts: [], sale: null, exceptions: [], history: [],
      },
      checkoutProgress: { basketDiverged: true, recoveryFailure: 'interrupted' },
    });
    const view = render(<CheckoutScreen />);

    expect(view.getByTestId('checkout-guidance')).toHaveTextContent(/This purchase was cancelled/);
    expect(view.getAllByText('₱35.00').length).toBeGreaterThan(0);
    expect(view.queryByText('₱99.99')).toBeNull();
    expect(view.getByText('1 item in this sale')).toBeTruthy();
    expect(view.getByTestId('checkout-order-summary')).toHaveTextContent(/Mineral Water 1L/);
    expect(view.getByTestId('checkout-order-summary')).not.toHaveTextContent(/Cancelled item/);
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
  });

  it('offers only to clear a cancelled purchase, never the changed-basket recovery or cancel controls', async () => {
    const recoverCheckout = jest.fn().mockResolvedValue(undefined);
    setContext({
      recoverCheckout,
      checkoutProgress: { basketDiverged: true, recoveryFailure: 'interrupted' },
      checkoutMachine: { ...openCheckout('test-checkout', 3500), state: 'abandoned' },
    });
    const view = render(<CheckoutScreen />);

    const guidance = view.getByTestId('checkout-guidance');
    expect(guidance).toHaveTextContent(/This purchase was cancelled/);
    expect(guidance).toHaveTextContent(/Your cart is still here/);
    expect(guidance).not.toHaveTextContent(/Recover the earlier basket/);
    expect(view.queryByTestId('sale-help-toggle')).toBeNull();
    expect(view.queryByRole('button', { name: 'Cancel this sale' })).toBeNull();

    await act(async () => { fireEvent.press(view.getByRole('button', { name: 'Clear the cancelled purchase' })); });
    expect(recoverCheckout).toHaveBeenCalledTimes(1);
  });

  it.each(['payment-in-progress', 'payment-unresolved', 'completed', 'abandoned', 'paid-but-unfulfilled'] as const)(
    'disables a stale cash panel confirmation and opposite selector when the machine is %s', (state) => {
      const completeCashSale = jest.fn();
      setContext({ completeCashSale, checkoutMachine: { ...openCheckout('test-checkout', 3500), state } });
      const view = render(<CheckoutScreen />);
      expect(view.getByTestId('checkout-payment-qrph')).toBeDisabled();
      expect(view.getByTestId('checkout-payment-qrph')).toHaveProp('accessibilityState', expect.objectContaining({ disabled: true }));
      expect(view.getByTestId('checkout-tender-lock-reason')).toBeTruthy();
      fireEvent.press(view.getByTestId('checkout-payment-qrph'));
      expect(view.getByTestId('checkout-payment-cash')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
      const confirm = view.getByTestId('confirm-cash-payment');
      expect(confirm).toBeDisabled();
      fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
      fireEvent.press(confirm);
      expect(completeCashSale).not.toHaveBeenCalled();
      // Presentation does not replace confirmation-time machine guards.
      const confirmHandler = view.UNSAFE_getAllByType(AppButton).find(button => button.props.testID === 'confirm-cash-payment')!.props.onPress;
      act(() => { void confirmHandler(); });
      expect(completeCashSale).not.toHaveBeenCalled();
      expect(view.getByTestId(state === 'paid-but-unfulfilled' || state === 'completed' || state === 'abandoned' ? 'checkout-guidance' : 'checkout-cash-error')).toBeTruthy();
    },
  );

  it('keeps a verified non-payable QR locked when reconciliation is required', () => {
    setContext({
      checkoutMachine: { ...openCheckout('test-checkout', 3500), state: 'ready-for-new-attempt', reconciliationRequired: true },
    });
    const view = render(<CheckoutScreen />);
    expect(mockUsePos().checkoutMachine.state).toBe('ready-for-new-attempt');
    expect(view.getByTestId('checkout-payment-qrph')).toBeDisabled();
    expect(view.getByTestId('confirm-cash-payment')).toBeDisabled();
    expect(view.getByTestId('checkout-tender-lock-reason')).toHaveTextContent(/locked/i);
  });

  it('offers no QR Ph start while a cash sale is being recorded', async () => {
    let resolveSale!: (value: Sale) => void;
    const completeCashSale = jest.fn().mockReturnValue(new Promise<Sale>((done) => { resolveSale = done; }));
    const startQrPhPayment = jest.fn().mockResolvedValue(pendingQrPayment);
    setContext({ completeCashSale, startQrPhPayment });
    const view = render(<CheckoutScreen />);

    fireEvent.changeText(view.getByTestId('cash-received-input'), '100');
    fireEvent.press(view.getByTestId('confirm-cash-payment'));
    fireEvent.press(view.getByTestId('checkout-payment-qrph'));

    expect(view.getByTestId('checkout-payment-qrph')).toBeDisabled();
    expect(view.getByTestId('checkout-payment-cash')).toHaveProp('accessibilityState', expect.objectContaining({ selected: true }));
    expect(view.queryByTestId('start-qrph-payment')).toBeNull();
    expect(startQrPhPayment).not.toHaveBeenCalled();

    await act(async () => { resolveSale(sale); });
  });
});
