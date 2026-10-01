import React from 'react';
import { Text } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClient } from '@/src/api/client';
import ScannerScreen, { ADDED_CONFIRMATION_MS } from '@/app/scanner';
import { PosProvider, usePos } from '@/src/context/PosContext';
import {
  EAN13_IN_STOCK,
  EAN13_OUT_OF_STOCK,
  NON_PRODUCT_CODE,
  UPC_A_AS_EAN13,
  UPC_A_VALID,
} from '@/src/data/barcodeFixtures';

const mockRouter = { back: jest.fn(), replace: jest.fn() };
const mockRouteParams: { mode?: string } = {};

jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    back: (...args: unknown[]) => mockRouter.back(...args),
    replace: (...args: unknown[]) => mockRouter.replace(...args),
  },
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock('expo-camera', () => {
  const mockReact = jest.requireActual('react');
  const mockReactNative = jest.requireActual('react-native');
  return {
    CameraView: (props: { onBarcodeScanned?: (event: { data: string }) => void; onCameraReady?: () => void }) =>
      mockReact.createElement(mockReactNative.View, {
        testID: 'camera-view',
        onBarcodeScanned: props.onBarcodeScanned,
        onCameraReady: props.onCameraReady,
      }),
    useCameraPermissions: () => [{ granted: true }, jest.fn()],
  };
});

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

const catalog = {
  [EAN13_IN_STOCK]: { id: 'prd-cola', barcode: EAN13_IN_STOCK, name: 'Coca-Cola 500mL', price: 25, stock: 48 },
  [EAN13_OUT_OF_STOCK]: { id: 'prd-zero', barcode: EAN13_OUT_OF_STOCK, name: 'Sold Out Chips', price: 20, stock: 0 },
  [UPC_A_VALID]: { id: 'prd-upc', barcode: UPC_A_VALID, name: 'UPC-A Crackers', price: 12, stock: 30 },
};

/**
 * A Laravel-shaped barcode endpoint. iOS reports UPC-A as EAN-13 with a leading
 * zero, so this catalog stores the 12-digit form and the app has to retry with
 * it.
 */
function apiFetch() {
  return jest.fn(async (url: string) => {
    const barcode = decodeURIComponent(String(url).split('/products/barcode/')[1] ?? '');
    const product = (catalog as Record<string, (typeof catalog)[keyof typeof catalog]>)[barcode];
    if (!product) {
      return {
        ok: false,
        status: 404,
        json: async () => ({ error: { code: 'not_found', message: 'Product not found for this barcode.' } }),
      } as Response;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        data: {
          id: product.id,
          barcode: product.barcode,
          name: product.name,
          price: product.price * 100,
          stock: { quantity: product.stock, reorder_level: 5, status: product.stock === 0 ? 'out_of_stock' : 'in_stock' },
        },
      }),
    } as Response;
  });
}

function CartProbe() {
  const { cart, total } = usePos();
  const quantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  return <Text testID="cart-probe">{`lines:${cart.length} qty:${quantity} total:${total}`}</Text>;
}

function renderScanner({ mode, fetchImpl }: { mode?: string; fetchImpl: jest.Mock }) {
  mockRouteParams.mode = mode;
  const client = new ApiClient({
    baseUrl: 'https://staging-api.example.test/api/v1',
    fetchImpl: fetchImpl as unknown as typeof fetch,
  });
  const view = render(
    <PosProvider client={client}>
      <ScannerScreen />
      <CartProbe />
    </PosProvider>,
  );

  const camera = () => view.getByTestId('camera-view');
  return {
    ...view,
    cart: () => view.getByTestId('cart-probe').props.children as unknown as string,
    startCamera: () => act(() => fireEvent(camera(), 'cameraReady')),
    isArmed: () => Boolean(camera().props.onBarcodeScanned),
    scan: (data: string) => act(() => fireEvent(camera(), 'barcodeScanned', { data })),
  };
}

describe('ScannerScreen', () => {
  beforeEach(() => {
    mockRouter.back.mockReset();
    mockRouter.replace.mockReset();
  });

  it('does not scan before the camera reports it is ready', async () => {
    const fetchImpl = apiFetch();
    const scanner = renderScanner({ fetchImpl });

    expect(scanner.isArmed()).toBe(false);
    scanner.scan(EAN13_IN_STOCK);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('adds a scannable fixture once and confirms it in place', async () => {
    const fetchImpl = apiFetch();
    const scanner = renderScanner({ fetchImpl });
    scanner.startCamera();

    scanner.scan(EAN13_IN_STOCK);

    await waitFor(() => expect(scanner.getByTestId('scanner-outcome-title')).toHaveTextContent('Product found'));
    expect(scanner.cart()).toBe('lines:1 qty:1 total:25');
    expect(scanner.getByTestId('scanner-outcome-message')).toHaveTextContent('Coca-Cola 500mL added to cart.');
    expect(scanner.getByText(/1 in this sale/)).toBeTruthy();
    // The resolved state disarms the camera callback: a failing scan cannot refire itself.
    expect(scanner.isArmed()).toBe(false);
  });

  it('produces exactly one cart line from a five-second exposure to one symbol', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = apiFetch();
      const scanner = renderScanner({ fetchImpl });
      scanner.startCamera();

      for (let elapsed = 0; elapsed < 5000; elapsed += 200) {
        if (scanner.isArmed()) scanner.scan(EAN13_IN_STOCK);
        await act(async () => {
          jest.advanceTimersByTime(200);
          await Promise.resolve();
        });
      }

      expect(scanner.cart()).toBe('lines:1 qty:1 total:25');
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('returns to the cart on its own after the added confirmation', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = apiFetch();
      const scanner = renderScanner({ fetchImpl });
      scanner.startCamera();

      scanner.scan(EAN13_IN_STOCK);
      await act(async () => { await Promise.resolve(); });
      expect(mockRouter.back).not.toHaveBeenCalled();

      act(() => jest.advanceTimersByTime(ADDED_CONFIRMATION_MS));
      expect(mockRouter.back).toHaveBeenCalledTimes(1);
    } finally {
      jest.useRealTimers();
    }
  });

  it('resolves a UPC-A symbol that iOS reports in its EAN-13 form', async () => {
    const fetchImpl = apiFetch();
    const scanner = renderScanner({ fetchImpl });
    scanner.startCamera();

    scanner.scan(UPC_A_AS_EAN13);

    await waitFor(() => expect(scanner.getByTestId('scanner-outcome-title')).toHaveTextContent('Product found'));
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      `https://staging-api.example.test/api/v1/products/barcode/${UPC_A_AS_EAN13}`,
      `https://staging-api.example.test/api/v1/products/barcode/${UPC_A_VALID}`,
    ]);
    expect(scanner.getByText(/matched/)).toBeTruthy();
    expect(scanner.cart()).toBe('lines:1 qty:1 total:12');
  });

  it('shows the out-of-stock state with its own headline and a retry', async () => {
    const fetchImpl = apiFetch();
    const scanner = renderScanner({ fetchImpl });
    scanner.startCamera();

    scanner.scan(EAN13_OUT_OF_STOCK);

    await waitFor(() => expect(scanner.getByTestId('scanner-outcome-title')).toHaveTextContent('Out of stock'));
    expect(scanner.getByTestId('scanner-outcome-message')).toHaveTextContent(/has no stock left/);
    expect(scanner.cart()).toBe('lines:0 qty:0 total:0');
    expect(scanner.getByTestId('scanner-scan-again')).toBeTruthy();
    expect(scanner.getByTestId('scanner-back-to-cart')).toBeTruthy();
  });

  it('rejects a non-product code locally and offers a name search instead', async () => {
    const fetchImpl = apiFetch();
    const scanner = renderScanner({ fetchImpl });
    scanner.startCamera();

    scanner.scan(NON_PRODUCT_CODE);

    await waitFor(() => expect(scanner.getByTestId('scanner-outcome-title')).toHaveTextContent('Not a product barcode'));
    expect(scanner.getByTestId('scanner-outcome-message')).toHaveTextContent(/use Search to find this product by name/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('re-arms only when the cashier asks to scan again', async () => {
    const fetchImpl = apiFetch();
    const scanner = renderScanner({ fetchImpl });
    scanner.startCamera();

    scanner.scan(NON_PRODUCT_CODE);
    await waitFor(() => expect(scanner.getByTestId('scanner-outcome-title')).toBeTruthy());
    expect(scanner.isArmed()).toBe(false);

    scanner.scan(NON_PRODUCT_CODE);
    expect(fetchImpl).not.toHaveBeenCalled();

    act(() => fireEvent.press(scanner.getByTestId('scanner-scan-again')));
    expect(scanner.queryByTestId('scanner-outcome-title')).toBeNull();
    expect(scanner.isArmed()).toBe(true);
  });

  it('carries an unknown inventory barcode into product creation', async () => {
    const fetchImpl = apiFetch();
    const scanner = renderScanner({ mode: 'inventory', fetchImpl });
    scanner.startCamera();

    scanner.scan(EAN13_OUT_OF_STOCK);

    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/product-form', params: { id: 'prd-zero' } }));
    // An inventory scan opens the product instead of confirming a cart add.
    expect(scanner.queryByTestId('scanner-outcome-title')).toBeNull();
  });

  it('offers product creation for an inventory barcode that is not in the catalog', async () => {
    const fetchImpl = apiFetch();
    const scanner = renderScanner({ mode: 'inventory', fetchImpl });
    scanner.startCamera();

    scanner.scan(NON_PRODUCT_CODE);

    await waitFor(() => expect(scanner.getByTestId('scanner-add-product')).toBeTruthy());
    act(() => fireEvent.press(scanner.getByTestId('scanner-add-product')));
    expect(mockRouter.replace).toHaveBeenCalledWith({ pathname: '/product-form', params: { barcode: NON_PRODUCT_CODE } });
  });
});
