import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClient } from '@/src/api/client';
import ProductFormScreen from '@/app/product-form';
import { PosProvider } from '@/src/context/PosContext';

const mockRouter = { back: jest.fn() };
let mockRouteParams: { id?: string; barcode?: string } = {};

jest.mock('expo-router', () => ({
  __esModule: true,
  router: {
    back: (...args: unknown[]) => mockRouter.back(...args),
  },
  useLocalSearchParams: () => mockRouteParams,
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

function renderForm(client: ApiClient) {
  return render(
    <PosProvider client={client}>
      <ProductFormScreen />
    </PosProvider>,
  );
}

const authoritativeProduct = {
  id: '99',
  sku: 'COFFEE-099',
  barcode: '4800000000099',
  name: 'House Blend Coffee',
  category: 'Beverages',
  price: 18500,
  stock: { quantity: 12, reorder_level: 3, status: 'in_stock' },
};

function refreshResponses() {
  return {
    data: {
      items: [{
        product_id: authoritativeProduct.id,
        sku: authoritativeProduct.sku,
        barcode: authoritativeProduct.barcode,
        product_name: authoritativeProduct.name,
        quantity: authoritativeProduct.stock.quantity,
        reorder_level: authoritativeProduct.stock.reorder_level,
        status: authoritativeProduct.stock.status,
      }],
    },
  };
}

describe('ProductFormScreen', () => {
  beforeEach(() => {
    mockRouteParams = {};
    mockRouter.back.mockReset();
  });

  it('creates a product through Laravel and leaves only after the authoritative refresh succeeds', async () => {
    const fetchImpl = jest.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/products') && options?.method === 'POST') return response({ data: authoritativeProduct }, true, 201);
      if (url.endsWith('/inventory')) return response(refreshResponses());
      if (url.includes('/products?per_page=100')) return response({ data: { items: [authoritativeProduct] } });
      throw new Error(`Unexpected request: ${url}`);
    });
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const screen = renderForm(client);

    fireEvent.changeText(screen.getByTestId('product-name-input'), 'House Blend Coffee');
    fireEvent.changeText(screen.getByTestId('product-barcode-input'), authoritativeProduct.barcode);
    fireEvent.changeText(screen.getByTestId('product-price-input'), '185');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '12');
    fireEvent.press(screen.getByTestId('save-product-button'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    const createCall = fetchImpl.mock.calls.find(([url, options]) => url.endsWith('/products') && options?.method === 'POST');
    expect(createCall?.[1]?.body).toBe(JSON.stringify({ barcode: authoritativeProduct.barcode, name: 'House Blend Coffee', category: 'General', price: 18500, stock: 12 }));
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/inventory'), expect.anything());
    expect(fetchImpl).toHaveBeenCalledWith(expect.stringContaining('/products?per_page=100'), expect.anything());
  });

  it('edits supported fields through Laravel and refreshes the updated inventory state', async () => {
    mockRouteParams = { id: 'prd-001' };
    const updated = {
      ...authoritativeProduct,
      id: 'prd-001',
      barcode: '4800010000012',
      name: 'Coca-Cola Family Pack',
      price: 2750,
      stock: { quantity: 60, reorder_level: 10, status: 'in_stock' },
    };
    const fetchImpl = jest.fn(async (url: string, options?: RequestInit) => {
      if (url.endsWith('/products/prd-001') && options?.method === 'PATCH') return response({ data: updated });
      if (url.endsWith('/inventory')) return response({ data: { items: [{ product_id: updated.id, barcode: updated.barcode, product_name: updated.name, quantity: 60, reorder_level: 10, status: 'in_stock' }] } });
      if (url.includes('/products?per_page=100')) return response({ data: { items: [updated] } });
      throw new Error(`Unexpected request: ${url}`);
    });
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const screen = renderForm(client);

    fireEvent.changeText(screen.getByTestId('product-name-input'), updated.name);
    fireEvent.changeText(screen.getByTestId('product-barcode-input'), updated.barcode);
    fireEvent.changeText(screen.getByTestId('product-price-input'), '27.50');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '60');
    fireEvent.press(screen.getByTestId('save-product-button'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    const updateCall = fetchImpl.mock.calls.find(([url, options]) => url.endsWith('/products/prd-001') && options?.method === 'PATCH');
    expect(updateCall?.[1]?.body).toBe(JSON.stringify({ barcode: updated.barcode, name: updated.name, category: 'Beverages', price: 2750, stock: 60 }));
  });

  it('keeps invalid price and stock editable and explains how to recover', () => {
    const fetchImpl = jest.fn();
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const screen = renderForm(client);

    fireEvent.changeText(screen.getByTestId('product-name-input'), 'Invalid Product');
    fireEvent.changeText(screen.getByTestId('product-barcode-input'), '4800000000088');
    fireEvent.changeText(screen.getByTestId('product-price-input'), '12.345');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '2.5');
    fireEvent.press(screen.getByTestId('save-product-button'));

    expect(screen.getByText('Enter a non-negative price with up to 2 decimal places.')).toBeTruthy();
    expect(screen.getByText('Enter a whole-number stock quantity of 0 or more.')).toBeTruthy();
    expect(screen.getByText('Check the highlighted fields and try again.')).toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('shows a duplicate-barcode API error without losing the draft or leaving the form', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      error: {
        code: 'validation_error',
        message: 'The request could not be validated.',
        details: { barcode: ['The barcode has already been taken.'] },
      },
    }, false, 422));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const screen = renderForm(client);

    fireEvent.changeText(screen.getByTestId('product-name-input'), 'Duplicate Product');
    fireEvent.changeText(screen.getByTestId('product-barcode-input'), '4800000000088');
    fireEvent.changeText(screen.getByTestId('product-price-input'), '10');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '2');
    fireEvent.press(screen.getByTestId('save-product-button'));

    await waitFor(() => expect(screen.getByTestId('product-form-error')).toBeTruthy());
    expect(screen.getByText('Barcode already exists. Use a different barcode, then try again.')).toBeTruthy();
    expect(screen.getByTestId('product-barcode-input').props.value).toBe('4800000000088');
    expect(mockRouter.back).not.toHaveBeenCalled();
    expect(screen.getByTestId('retry-product-save')).toBeTruthy();
  });

  it('keeps the form recoverable when the API cannot be reached', async () => {
    const fetchImpl = jest.fn().mockRejectedValue(new Error('offline'));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const screen = renderForm(client);

    fireEvent.changeText(screen.getByTestId('product-name-input'), 'Offline Product');
    fireEvent.changeText(screen.getByTestId('product-barcode-input'), '4800000000077');
    fireEvent.changeText(screen.getByTestId('product-price-input'), '10');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '2');
    fireEvent.press(screen.getByTestId('save-product-button'));

    await waitFor(() => expect(screen.getByTestId('product-form-error')).toBeTruthy());
    expect(screen.getByText('Could not reach the Laravel API. Check the connection and try again; your changes are still on this form.')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('shows a scanned unknown barcode prefilled in the creation form', () => {
    mockRouteParams = { barcode: '4800000000066' };
    const client = new ApiClient({ baseUrl: undefined });
    const screen = renderForm(client);

    expect(screen.getByTestId('product-barcode-input').props.value).toBe('4800000000066');
    expect(screen.getByTestId('scanned-barcode-notice')).toBeTruthy();
    expect(screen.getByText('Scanned barcode prefilled. Confirm the rest of the product details.')).toBeTruthy();
  });
});
