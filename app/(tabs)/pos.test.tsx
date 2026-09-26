import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PosScreen, { SEARCH_DEBOUNCE_MS } from '@/app/(tabs)/pos';
import { ApiClient } from '@/src/api/client';
import { CLEAR_UNDO_WINDOW_MS } from '@/src/domain/cart';
import { PosProvider, usePos } from '@/src/context/PosContext';
import { Product } from '@/src/types';

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const single: Product = { id: 'single', barcode: '4800000000019', name: 'Sardines 155g', price: 22, stock: 1, category: 'Snacks' };
const plenty: Product = { id: 'plenty', barcode: '4800000000026', name: 'Instant Coffee 30g', price: 9, stock: 40, category: 'Beverages' };

/** Adds fixtures straight through the guarded context path, not through search. */
function SeedButton({ product, label }: { product: Product; label: string }) {
  const { addProductChecked } = usePos();
  return (
    <Pressable accessibilityLabel={label} onPress={() => addProductChecked(product)}>
      <Text>{label}</Text>
    </Pressable>
  );
}

const client = { isConfigured: true } as unknown as ApiClient;

function renderPos() {
  return render(
    <PosProvider client={client}>
      <PosScreen />
      <SeedButton product={single} label="seed-single" />
      <SeedButton product={plenty} label="seed-plenty" />
    </PosProvider>,
  );
}

describe('POS cart consistency', () => {
  beforeEach(() => {
    jest.useRealTimers();
  });

  it('surfaces the stock limit on the cart "+" instead of a silent no-op', async () => {
    const view = renderPos();

    fireEvent.press(view.getByLabelText('seed-single'));
    await waitFor(() => expect(view.getByText('Sardines 155g')).toBeTruthy());

    fireEvent.press(view.getByLabelText('Increase Sardines 155g'));

    await waitFor(() => expect(view.getByTestId('cart-limit-notice')).toBeTruthy());
    expect(view.getByTestId('cart-limit-notice')).toHaveTextContent(/already has 1/);
    // The quantity did not move.
    expect(view.getByText('(1 item)')).toBeTruthy();
  });

  it('clears the limit notice when an add succeeds again', async () => {
    const view = renderPos();

    fireEvent.press(view.getByLabelText('seed-single'));
    fireEvent.press(view.getByLabelText('seed-plenty'));
    await waitFor(() => expect(view.getByText('Instant Coffee 30g')).toBeTruthy());

    fireEvent.press(view.getByLabelText('Increase Sardines 155g'));
    await waitFor(() => expect(view.getByTestId('cart-limit-notice')).toBeTruthy());

    fireEvent.press(view.getByLabelText('Increase Instant Coffee 30g'));
    await waitFor(() => expect(view.queryByTestId('cart-limit-notice')).toBeNull());
  });

  it('drops the line when the last unit is decremented', async () => {
    const view = renderPos();

    fireEvent.press(view.getByLabelText('seed-single'));
    await waitFor(() => expect(view.getByText('Sardines 155g')).toBeTruthy());

    fireEvent.press(view.getByLabelText('Decrease Sardines 155g'));

    await waitFor(() => expect(view.queryByText('Sardines 155g')).toBeNull());
    expect(view.getByText('Your cart is ready for a new sale')).toBeTruthy();
  });

  it('clears the whole cart immediately and offers a five-second undo', async () => {
    jest.useFakeTimers();
    try {
      const view = renderPos();

      fireEvent.press(view.getByLabelText('seed-single'));
      fireEvent.press(view.getByLabelText('seed-plenty'));
      await act(async () => { await Promise.resolve(); });
      expect(view.getByText('(2 items)')).toBeTruthy();

      fireEvent.press(view.getByText('Clear All'));

      await waitFor(() => expect(view.getByTestId('cart-undo-banner')).toBeTruthy());
      expect(view.getByTestId('cart-undo-banner')).toHaveTextContent(/Cart cleared \(2 items\)/);
      expect(view.queryByText('Sardines 155g')).toBeNull();

      fireEvent.press(view.getByTestId('cart-undo-button'));

      await waitFor(() => expect(view.getByText('Sardines 155g')).toBeTruthy());
      expect(view.getByText('Instant Coffee 30g')).toBeTruthy();
      expect(view.queryByTestId('cart-undo-banner')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });

  it('drops the undo offer when its window closes', async () => {
    jest.useFakeTimers();
    try {
      const view = renderPos();

      fireEvent.press(view.getByLabelText('seed-plenty'));
      fireEvent.press(view.getByText('Clear All'));
      await waitFor(() => expect(view.getByTestId('cart-undo-banner')).toBeTruthy());

      act(() => jest.advanceTimersByTime(CLEAR_UNDO_WINDOW_MS));

      await waitFor(() => expect(view.queryByTestId('cart-undo-banner')).toBeNull());
      expect(view.getByText('Your cart is ready for a new sale')).toBeTruthy();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('POS search', () => {
  it('turns eight keystrokes into at most two catalog reads', async () => {
    jest.useFakeTimers();
    try {
      const listProducts = jest.fn().mockResolvedValue([]);
      const searchClient = { isConfigured: true, listProducts } as unknown as ApiClient;
      const view = render(
        <PosProvider client={searchClient}>
          <PosScreen />
        </PosProvider>,
      );
      const input = view.getByTestId('pos-search-input');

      for (const value of ['s', 'sa', 'sar', 'sard', 'sardi', 'sardin', 'sardine', 'sardines']) {
        fireEvent.changeText(input, value);
        await act(async () => {
          jest.advanceTimersByTime(40);
          await Promise.resolve();
        });
      }
      await act(async () => {
        jest.advanceTimersByTime(SEARCH_DEBOUNCE_MS);
        await Promise.resolve();
      });

      expect(listProducts.mock.calls.length).toBeLessThanOrEqual(2);
      expect(listProducts).toHaveBeenLastCalledWith({ search: 'sardines' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('asks for an exact barcode read when the query looks like a barcode', async () => {
    const listProducts = jest.fn().mockResolvedValue([]);
    const searchClient = { isConfigured: true, listProducts } as unknown as ApiClient;
    const view = render(
      <PosProvider client={searchClient}>
        <PosScreen />
      </PosProvider>,
    );

    fireEvent.changeText(view.getByTestId('pos-search-input'), '4800010000011');

    await waitFor(() => expect(listProducts).toHaveBeenCalledWith({ barcode: '4800010000011' }));
  });
});
