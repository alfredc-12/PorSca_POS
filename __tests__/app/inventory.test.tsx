import React from 'react';
import { View } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import InventoryScreen from '@/app/(tabs)/inventory';
import { ApiClient } from '@/src/api/client';
import { PosProvider } from '@/src/context/PosContext';

let mockIsAdmin = true;
let mockGranted = true;
const mockRequestPermission = jest.fn();
jest.mock('@/src/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: mockIsAdmin }) }));
jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));
jest.mock('expo-router', () => ({ router: { back: jest.fn(), replace: jest.fn() } }));
jest.mock('expo-camera', () => ({
  useCameraPermissions: () => [{ granted: mockGranted }, mockRequestPermission],
  CameraView: (props: React.ComponentProps<typeof View>) => {
    const NativeView = require('react-native').View;
    return <NativeView {...props} testID="camera-preview" />;
  },
}));

const original = {
  id: '1', sku: 'ONE', barcode: '0012345678905', name: 'Inventory Coffee',
  category: 'Beverages', price: 1250,
  stock: { quantity: 7, reorder_level: 2, status: 'in_stock' },
};
const fresh = { ...original, name: 'Fresh Coffee', stock: { ...original.stock, quantity: 9 } };

function response(data: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => data } as Response;
}

function setup(options: { missing?: boolean; unavailable?: boolean; refreshFails?: boolean; lookup?: Promise<Response>; save?: Promise<Response> } = {}) {
  let catalog = [original];
  let saved = false;
  const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/products/barcode/')) {
      if (options.lookup) return options.lookup;
      if (options.unavailable) throw new Error('offline');
      if (options.missing) return response({ error: { code: 'not_found' } }, 404);
      return response({ data: fresh });
    }
    if (init?.method === 'POST') {
      if (options.save) return options.save;
      const input = JSON.parse(init.body as string);
      const product = { ...original, ...input, id: '2', stock: { ...original.stock, quantity: input.stock } };
      catalog = [...catalog, product];
      saved = true;
      return response({ data: product }, 201);
    }
    if (init?.method === 'PATCH') {
      const input = JSON.parse(init.body as string);
      const product = { ...fresh, ...input, stock: { ...fresh.stock, quantity: input.stock ?? fresh.stock.quantity } };
      catalog = [product];
      saved = true;
      return response({ data: product });
    }
    if (saved && options.refreshFails) throw new Error('refresh offline');
    if (url.endsWith('/inventory')) return response({ data: { items: catalog.map((p) => ({
      product_id: p.id, barcode: p.barcode, product_name: p.name,
      quantity: p.stock.quantity, reorder_level: 2, status: 'in_stock',
    })) } });
    if (url.includes('/products?')) return response({ data: { items: catalog } });
    throw new Error('Unexpected request ' + url);
  });
  const client = new ApiClient({ baseUrl: 'http://localhost:8000/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
  const screen = render(<PosProvider client={client}><InventoryScreen /></PosProvider>);
  const scan = async () => {
    await waitFor(() => expect(screen.getByText(original.name)).toBeTruthy());
    fireEvent.press(screen.getByRole('button', { name: 'Scan product barcode' }));
    if (mockGranted) fireEvent(screen.getByTestId('camera-preview'), 'cameraReady');
  };
  return { screen, fetchImpl, scan };
}

beforeEach(() => { mockIsAdmin = true; mockGranted = true; mockRequestPermission.mockReset(); });

it('opens one editor with the fresh product after repeated camera events', async () => {
  const { screen, fetchImpl, scan } = setup();
  await scan();
  const camera = screen.getByTestId('camera-preview');
  act(() => {
    fireEvent(camera, 'barcodeScanned', { data: original.barcode });
    fireEvent(camera, 'barcodeScanned', { data: original.barcode });
  });
  await waitFor(() => expect(screen.getByTestId('product-name-input').props.value).toBe(fresh.name));
  expect(screen.getByTestId('product-stock-input').props.value).toBe('9');
  expect(screen.getByTestId('product-barcode-input').props.value).toBe(original.barcode);
  expect(screen.getByTestId('product-barcode-input').props.editable).toBe(false);
  expect(screen.queryByTestId('camera-preview')).toBeNull();
  expect(fetchImpl.mock.calls.filter(([url]) => url.includes('/products/barcode/'))).toHaveLength(1);
  fireEvent.press(screen.getByTestId('edit-barcode-button'));
  expect(screen.getByTestId('product-barcode-input').props.editable).toBe(true);
  fireEvent.press(screen.getByTestId('edit-barcode-button'));
  expect(screen.getByTestId('product-barcode-input').props.editable).toBe(false);
  fireEvent.press(screen.getByTestId('edit-barcode-button'));
  fireEvent.press(screen.getByRole('button', { name: 'Close product editor' }));
  fireEvent.press(screen.getByRole('button', { name: 'Edit ' + original.name }));
  expect(screen.getByTestId('product-barcode-input').props.editable).toBe(false);
});

it('prefills an unknown barcode and creates a persistent product with a custom category', async () => {
  const { screen, fetchImpl, scan } = setup({ missing: true });
  await scan();
  fireEvent(screen.getByTestId('camera-preview'), 'barcodeScanned', { data: '0012345678912' });
  await waitFor(() => expect(screen.getByTestId('scanned-barcode-notice')).toBeTruthy());
  expect(screen.getByTestId('product-barcode-input').props.value).toBe('0012345678912');
  expect(screen.getByTestId('product-name-input').props.value).toBe('');
  expect(screen.getByTestId('product-price-input').props.value).toBe('');
  expect(screen.getByTestId('product-stock-input').props.value).toBe('');
  fireEvent.changeText(screen.getByTestId('product-name-input'), 'Frozen Dumplings');
  fireEvent.changeText(screen.getByTestId('product-price-input'), '12');
  fireEvent.changeText(screen.getByTestId('product-price-decimal-input'), '99');
  fireEvent.changeText(screen.getByTestId('product-stock-input'), '3');
  fireEvent.changeText(screen.getByTestId('product-category-input'), 'Frozen Food');
  act(() => {
    fireEvent.press(screen.getByTestId('save-product-button'));
    fireEvent.press(screen.getByTestId('save-product-button'));
  });
  await waitFor(() => expect(Boolean(screen.queryByTestId('save-product-button'))).toBe(false));
  expect(screen.getByText('Frozen Dumplings')).toBeTruthy();
  const writes = fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST');
  expect(writes).toHaveLength(1);
  expect(JSON.parse(writes[0][1]?.body as string)).toMatchObject({ barcode: '0012345678912', category: 'Frozen Food', price: 1299, stock: 3 });
});

it('sends only edited fields and preserves the current stock on a price change', async () => {
  const { screen, fetchImpl, scan } = setup();
  await scan();
  fireEvent(screen.getByTestId('camera-preview'), 'barcodeScanned', { data: original.barcode });
  await waitFor(() => expect(screen.getByTestId('product-price-input')).toBeTruthy());
  fireEvent.changeText(screen.getByTestId('product-price-input'), '13');
  fireEvent.changeText(screen.getByTestId('product-price-decimal-input'), '25');
  fireEvent.press(screen.getByTestId('save-product-button'));
  await waitFor(() => expect(Boolean(screen.queryByTestId('save-product-button'))).toBe(false));
  const write = fetchImpl.mock.calls.find(([, init]) => init?.method === 'PATCH');
  expect(JSON.parse(write?.[1]?.body as string)).toEqual({ price: 1325 });
  expect(screen.getByText('In stock (9)')).toBeTruthy();
});

it('lets Laravel decide uniqueness when a confirmed missing barcode remains in stale inventory', async () => {
  const { screen, fetchImpl, scan } = setup({ missing: true });
  await scan();
  fireEvent(screen.getByTestId('camera-preview'), 'barcodeScanned', { data: original.barcode });
  await waitFor(() => expect(screen.getByTestId('scanned-barcode-notice')).toBeTruthy());
  fireEvent.changeText(screen.getByTestId('product-name-input'), 'Replacement product');
  fireEvent.changeText(screen.getByTestId('product-price-input'), '1');
  fireEvent.changeText(screen.getByTestId('product-stock-input'), '1');
  fireEvent.press(screen.getByTestId('save-product-button'));
  await waitFor(() => expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1));
  await waitFor(() => expect(Boolean(screen.queryByTestId('save-product-button'))).toBe(false));
});

it('keeps an unavailable lookup separate from product creation', async () => {
  const { screen, scan } = setup({ unavailable: true });
  await scan();
  fireEvent(screen.getByTestId('camera-preview'), 'barcodeScanned', { data: original.barcode });
  await waitFor(() => expect(screen.getByText('API unavailable')).toBeTruthy());
  expect(screen.queryByTestId('product-name-input')).toBeNull();
});

it('ignores a late barcode lookup after closing the scanner', async () => {
  let finish!: (value: Response) => void;
  const lookup = new Promise<Response>((resolve) => { finish = resolve; });
  const { screen, scan } = setup({ lookup });
  await scan();
  fireEvent(screen.getByTestId('camera-preview'), 'barcodeScanned', { data: original.barcode });
  fireEvent.press(screen.getByRole('button', { name: 'Close scanner' }));
  await act(async () => { finish(response({ data: fresh })); });
  expect(screen.queryByTestId('product-name-input')).toBeNull();
  expect(screen.queryByTestId('camera-preview')).toBeNull();
});

it('allows permission recovery and closing without camera access', async () => {
  mockGranted = false;
  const { screen, scan } = setup();
  await scan();
  expect(screen.queryByTestId('camera-preview')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Allow Camera' }));
  expect(mockRequestPermission).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Close scanner' }));
  expect(screen.queryByText('Allow camera access to scan products')).toBeNull();
});

it('shows a recoverable camera startup error', async () => {
  const { screen, scan } = setup();
  await scan();
  fireEvent(screen.getByTestId('camera-preview'), 'mountError', { message: 'camera in use' });
  expect(screen.getByText('Camera unavailable')).toBeTruthy();
  expect(screen.queryByTestId('camera-preview')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Retry camera' }));
  expect(screen.getByTestId('camera-preview')).toBeTruthy();
});

it('offers only a refresh after an acknowledged save and failed inventory refresh', async () => {
  const { screen, fetchImpl } = setup({ refreshFails: true });
  await waitFor(() => expect(screen.getByText(original.name)).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Add product' }));
  fireEvent.press(screen.getByTestId('edit-barcode-button'));
  fireEvent.changeText(screen.getByTestId('product-barcode-input'), '0012345678912');
  fireEvent.changeText(screen.getByTestId('product-name-input'), 'New product');
  fireEvent.changeText(screen.getByTestId('product-price-input'), '0');
  fireEvent.changeText(screen.getByTestId('product-stock-input'), '0');
  fireEvent.press(screen.getByTestId('save-product-button'));
  await waitFor(() => expect(screen.getByTestId('retry-inventory-refresh')).toBeTruthy());
  expect(screen.getByTestId('product-name-input').props.editable).toBe(false);
  expect(screen.getByTestId('save-product-button').props.accessibilityState.disabled).toBe(true);
  fireEvent.press(screen.getByTestId('retry-inventory-refresh'));
  await waitFor(() => expect(screen.getByText(/Current inventory is still unavailable/)).toBeTruthy());
  expect(fetchImpl.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(1);
});

it('keeps cashier scans read-only', async () => {
  mockIsAdmin = false;
  const { screen, scan } = setup();
  await scan();
  fireEvent(screen.getByTestId('camera-preview'), 'barcodeScanned', { data: original.barcode });
  await waitFor(() => expect(screen.getByTestId('scanner-outcome-title')).toBeTruthy());
  expect(screen.queryByTestId('product-name-input')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Add product' })).toBeNull();
});

it('cannot discard a product while its save is pending', async () => {
  let finish!: (value: Response) => void;
  const save = new Promise<Response>((resolve) => { finish = resolve; });
  const { screen } = setup({ save });
  await waitFor(() => expect(screen.getByText(original.name)).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Add product' }));
  fireEvent.press(screen.getByTestId('edit-barcode-button'));
  fireEvent.changeText(screen.getByTestId('product-barcode-input'), '0012345678912');
  fireEvent.changeText(screen.getByTestId('product-name-input'), 'Pending product');
  fireEvent.changeText(screen.getByTestId('product-price-input'), '1');
  fireEvent.changeText(screen.getByTestId('product-stock-input'), '1');
  fireEvent.press(screen.getByTestId('discard-product-button'));
  expect(screen.getByTestId('discard-confirmation')).toBeTruthy();
  fireEvent.press(screen.getByTestId('save-product-button'));
  expect(screen.queryByTestId('discard-confirmation')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: 'Close product editor' }));
  expect(screen.getByTestId('product-name-input').props.value).toBe('Pending product');
  await act(async () => { finish(response({ data: { ...original, id: '2' } }, 201)); });
  await waitFor(() => expect(Boolean(screen.queryByTestId('product-name-input'))).toBe(false));
});
