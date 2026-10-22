import React from 'react';
import { render } from '@testing-library/react-native';
import CheckoutScreen from '@/app/checkout';
import { useCheckout } from '@/src/context/PosContext';

jest.mock('expo-router', () => ({
  router: { back: jest.fn(), replace: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@/src/context/PosContext', () => ({ useCheckout: jest.fn() }));
jest.mock('@/src/hooks/useCheckoutPaymentPolling', () => ({
  useCheckoutPaymentPolling: () => ({ checkNow: jest.fn(), visible: false }),
}));

const useCheckoutMock = useCheckout as jest.Mock;

beforeEach(() => {
  useCheckoutMock.mockReturnValue({
    total: 0,
    cart: [],
    apiConfigured: true,
    completeCashSale: jest.fn(),
    startQrPhPayment: jest.fn(),
    refreshQrPhPayment: jest.fn(),
    confirmQrPhPayment: jest.fn(),
    unresolvedQrPayment: jest.fn(),
    authorityCheckout: undefined,
    checkoutMachine: undefined,
    checkoutProgress: undefined,
    checkoutCompletion: undefined,
    acknowledgeCheckout: jest.fn(),
    claimCheckoutCompletionAlert: jest.fn(),
    recoverCheckout: jest.fn(),
    revalidateCheckout: jest.fn(),
    abandonCheckout: jest.fn(),
  });
});

describe('Checkout keyboard shell', () => {
  it('renders through exactly one shared keyboard-avoiding screen wrapper', () => {
    const { getAllByTestId, getByText } = render(<CheckoutScreen />);

    expect(getByText('The cart is empty')).toBeTruthy();
    expect(getAllByTestId('screen-keyboard-avoiding')).toHaveLength(1);
    expect(getAllByTestId('screen-scroll')).toHaveLength(1);
  });
});
