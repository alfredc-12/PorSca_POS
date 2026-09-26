import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import PosScreen, { SEARCH_DEBOUNCE_MS } from '@/app/(tabs)/pos';
import { ApiClient, ApiClientError } from '@/src/api/client';
import { CLEAR_UNDO_WINDOW_MS } from '@/src/domain/cart';
import { PosProvider, usePos } from '@/src/context/PosContext';
import { Product } from '@/src/types';

jest.mock('expo-router', () => ({
  __esModule: true,
  router: { push: jest.fn(), back: jest.fn() },
  useLocalSearchParams: () => ({}),
}));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

const { router } = jest.requireMock('expo-router') as { router: { push: jest.Mock } };

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

/** A catalog client whose per-product reads drive the pre-checkout revalidation. */
function catalogClient({ products }: { products: Product[] }) {
  const byId = new Map(products.map((product) => [product.id, product]));
  return {
    isConfigured: true,
    getProduct: jest.fn(async (productId: string) => {
      const product = byId.get(productId);
      if (!product) {
        // Laravel answers an unknown product on `GET /products/:id` with a structured 404.
        throw new ApiClientError(`No product matches ${productId}.`, 404, 'not_found');
      }
      return product;
    }),
  } as unknown as ApiClient;
}

function renderPos(posClient: ApiClient = client) {
  return render(
    <PosProvider client={posClient}>
      <PosScreen />
      <SeedButton product={single} label="seed-single" />
      <SeedButton product={plenty} label="seed-plenty" />
    </PosProvider>,
  );
}

/** A catalog client whose per-line reads resolve only when the test says so. */
function deferredCatalogClient() {
  const pending = new Map<string, (product: Product) => void>();
  const getProduct = jest.fn((productId: string) => new Promise<Product>((resolve) => {
    pending.set(productId, resolve);
  }));
  return {
    client: { isConfigured: true, getProduct } as unknown as ApiClient,
    getProduct,
    resolve(productId: string, product: Product) {
      pending.get(productId)?.(product);
      pending.delete(productId);
    },
  };
}

describe('POS cart consistency', () => {
  beforeEach(() => {
    jest.useRealTimers();
    router.push.mockReset();
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
  beforeEach(() => {
    router.push.mockReset();
  });
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

describe('POS pre-checkout revalidation', () => {
  beforeEach(() => {
    jest.useRealTimers();
    router.push.mockReset();
  });

  it('goes straight to checkout when the catalog agrees with the cart', async () => {
    const view = renderPos(catalogClient({ products: [single, plenty] }));

    fireEvent.press(view.getByLabelText('seed-single'));
    await waitFor(() => expect(view.getByText('Sardines 155g')).toBeTruthy());
    fireEvent.press(view.getByTestId('proceed-to-payment'));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/checkout', params: { method: 'cash' } }));
    expect(view.queryByTestId('cart-review-sheet')).toBeNull();
  });

  it('shows a price change and applies the authoritative price before checkout', async () => {
    const view = renderPos(catalogClient({ products: [{ ...plenty, price: 27 }] }));

    fireEvent.press(view.getByLabelText('seed-plenty'));
    fireEvent.press(view.getByLabelText('seed-plenty'));
    await waitFor(() => expect(view.getByText('(2 items)')).toBeTruthy());

    fireEvent.press(view.getByTestId('proceed-to-payment'));

    await waitFor(() => expect(view.getByTestId('cart-review-sheet')).toBeTruthy());
    expect(view.getByTestId('cart-review-change-price')).toHaveTextContent(/Price changed from ₱9.00 to ₱27.00/);
    expect(router.push).not.toHaveBeenCalled();

    fireEvent.press(view.getByTestId('cart-review-apply'));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/checkout', params: { method: 'cash' } }));
    await waitFor(() => expect(view.getAllByText('₱54.00').length).toBeGreaterThan(0));
  });

  it('blocks a short-stock cart and clamps the quantity when the cashier accepts', async () => {
    const view = renderPos(catalogClient({ products: [{ ...plenty, stock: 1, stockStatus: 'low_stock' }] }));

    fireEvent.press(view.getByLabelText('seed-plenty'));
    fireEvent.press(view.getByLabelText('seed-plenty'));
    await waitFor(() => expect(view.getByText('(2 items)')).toBeTruthy());

    fireEvent.press(view.getByTestId('proceed-to-payment'));

    await waitFor(() => expect(view.getByTestId('cart-review-sheet')).toBeTruthy());
    expect(view.getByTestId('cart-review-message')).toHaveTextContent(/less stock than the cart asks for/);
    expect(view.getByTestId('cart-review-change-stock')).toHaveTextContent(/Only 1 left in stock, but this cart has 2/);

    fireEvent.press(view.getByTestId('cart-review-apply'));

    await waitFor(() => expect(router.push).toHaveBeenCalled());
    await waitFor(() => expect(view.getAllByText('₱9.00').length).toBeGreaterThan(0));
    expect(view.getByText('(1 item)')).toBeTruthy();
  });

  it('removes a line whose product left the catalog', async () => {
    const view = renderPos(catalogClient({ products: [plenty] }));

    fireEvent.press(view.getByLabelText('seed-single'));
    fireEvent.press(view.getByLabelText('seed-plenty'));
    await waitFor(() => expect(view.getByText('Sardines 155g')).toBeTruthy());

    fireEvent.press(view.getByTestId('proceed-to-payment'));

    await waitFor(() => expect(view.getByTestId('cart-review-change-removed')).toBeTruthy());
    expect(view.getByTestId('cart-review-message')).toHaveTextContent(/no longer in the catalog/);

    fireEvent.press(view.getByTestId('cart-review-apply'));

    await waitFor(() => expect(view.queryByText('Sardines 155g')).toBeNull());
    expect(view.getByText('Instant Coffee 30g')).toBeTruthy();
  });

  it('keeps the cart and explains itself when prices cannot be confirmed', async () => {
    const unreachable = {
      isConfigured: true,
      getProduct: jest.fn().mockRejectedValue(new ApiClientError('Unable to reach PorSca API: timeout')),
    } as unknown as ApiClient;
    const view = renderPos(unreachable);

    fireEvent.press(view.getByLabelText('seed-single'));
    await waitFor(() => expect(view.getByText('Sardines 155g')).toBeTruthy());

    fireEvent.press(view.getByTestId('proceed-to-payment'));

    await waitFor(() => expect(view.getByTestId('cart-limit-notice')).toHaveTextContent(/could not be confirmed/));
    expect(view.getByText('Sardines 155g')).toBeTruthy();
    expect(router.push).not.toHaveBeenCalled();
  });

  it('returns to the cart without applying anything when the review is dismissed', async () => {
    const view = renderPos(catalogClient({ products: [{ ...single, price: 30 }] }));

    fireEvent.press(view.getByLabelText('seed-single'));
    fireEvent.press(view.getByTestId('proceed-to-payment'));
    await waitFor(() => expect(view.getByTestId('cart-review-sheet')).toBeTruthy());

    fireEvent.press(view.getByTestId('cart-review-dismiss'));

    await waitFor(() => expect(view.queryByTestId('cart-review-sheet')).toBeNull());
    expect(router.push).not.toHaveBeenCalled();
    expect(view.getAllByText('₱22.00').length).toBeGreaterThan(0);
  });

  it('disables checkout and keeps the cart editable while Laravel is not configured', async () => {
    const offline = { isConfigured: false } as unknown as ApiClient;
    const view = renderPos(offline);

    fireEvent.press(view.getByLabelText('seed-single'));
    await waitFor(() => expect(view.getByText('Sardines 155g')).toBeTruthy());
    expect(view.getByTestId('offline-checkout-notice')).toHaveTextContent(/nothing is recorded locally/);

    fireEvent.press(view.getByTestId('proceed-to-payment'));
    // The checkout action is unavailable while no sale can be recorded by Laravel.
    expect(router.push).not.toHaveBeenCalled();
    expect(view.queryByTestId('cart-review-sheet')).toBeNull();

    // The cart is still editable while offline.
    fireEvent.press(view.getByLabelText('Increase Sardines 155g'));
    await waitFor(() => expect(view.getByTestId('cart-limit-notice')).toHaveTextContent(/already has 1/));
  });

  it('re-reads the cart when an edit lands while prices are being checked', async () => {
    const catalog = deferredCatalogClient();
    const view = renderPos(catalog.client);

    fireEvent.press(view.getByLabelText('seed-plenty'));
    await waitFor(() => expect(view.getByText('(1 item)')).toBeTruthy());

    fireEvent.press(view.getByTestId('proceed-to-payment'));
    await waitFor(() => expect(catalog.getProduct).toHaveBeenCalledTimes(1));

    // The cashier edits the cart while the line read is in flight.
    fireEvent.press(view.getByLabelText('Increase Instant Coffee 30g'));
    await waitFor(() => expect(view.getByText('(2 items)')).toBeTruthy());

    // The first read only describes the pre-edit cart, so it must be discarded
    // rather than used to reach checkout (defect F2).
    await act(async () => {
      catalog.resolve('plenty', { ...plenty, stock: 40 });
    });
    expect(router.push).not.toHaveBeenCalled();

    // The edited cart is re-read before anything is handed to checkout.
    await waitFor(() => expect(catalog.getProduct).toHaveBeenCalledTimes(2));
    await act(async () => {
      catalog.resolve('plenty', { ...plenty, stock: 40 });
    });

    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/checkout', params: { method: 'cash' } }));
  });

  it('re-validates a cart edited while the review sheet is open instead of applying the stale review', async () => {
    const view = renderPos(catalogClient({ products: [{ ...plenty, price: 27 }] }));

    fireEvent.press(view.getByLabelText('seed-plenty'));
    await waitFor(() => expect(view.getByText('(1 item)')).toBeTruthy());

    fireEvent.press(view.getByTestId('proceed-to-payment'));
    await waitFor(() => expect(view.getByTestId('cart-review-sheet')).toBeTruthy());
    expect(router.push).not.toHaveBeenCalled();

    // The cashier increases the quantity while the review is on screen.
    fireEvent.press(view.getByLabelText('seed-plenty'));
    await waitFor(() => expect(view.getByText('(2 items)')).toBeTruthy());

    // Accepting re-reads the edited cart; the stale appliedLines must not
    // overwrite the new quantity or continue with an unvalidated cart (F2).
    fireEvent.press(view.getByTestId('cart-review-apply'));
    await waitFor(() => expect(view.queryByTestId('cart-review-sheet')).toBeNull());
    expect(router.push).not.toHaveBeenCalled();
    expect(view.getByText('(2 items)')).toBeTruthy();

    // The fresh review covers the edited cart; accepting it continues.
    await waitFor(() => expect(view.getByTestId('cart-review-sheet')).toBeTruthy());
    fireEvent.press(view.getByTestId('cart-review-apply'));
    await waitFor(() => expect(router.push).toHaveBeenCalledWith({ pathname: '/checkout', params: { method: 'cash' } }));
    await waitFor(() => expect(view.getAllByText('₱54.00').length).toBeGreaterThan(0));
    expect(view.getByText('(2 items)')).toBeTruthy();
  });
});
