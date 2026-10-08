import React from 'react';

import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { ApiClient } from '@/src/api/client';
import ProductFormScreen from '@/app/product-form';
import { PosProvider } from '@/src/context/PosContext';
import { colors } from '@/src/theme/tokens';

const mockRouter = { back: jest.fn() };
let mockIsAdmin = true;

jest.mock('@/src/context/AuthContext', () => ({ useAuth: () => ({ isAdmin: mockIsAdmin }) }));
let mockRouteParams: { id?: string; barcode?: string } = {};

jest.mock('expo-router', () => ({
  __esModule: true,
  Redirect: ({ href }: { href: string }) => {
    const { Text } = require('react-native');
    return <Text>{href}</Text>;
  },
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
    <PosProvider client={client} demoCatalogEnabled>
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
    mockIsAdmin = true;
    mockRouter.back.mockReset();
  });

  it('redirects a cashier deep link without exposing any write controls', async () => {
    mockIsAdmin = false;
    const screen = renderForm({ isConfigured: false } as ApiClient);
    expect(screen.getByText('/(tabs)/inventory')).toBeTruthy();
    expect(screen.queryByTestId('save-product-button')).toBeNull();
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
    fireEvent.press(screen.getByTestId('edit-barcode-button'));
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
    fireEvent.press(screen.getByTestId('edit-barcode-button'));
    fireEvent.changeText(screen.getByTestId('product-barcode-input'), updated.barcode);
    fireEvent.changeText(screen.getByTestId('product-price-input'), '27');
    fireEvent.changeText(screen.getByTestId('product-price-decimal-input'), '50');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '60');
    fireEvent.press(screen.getByTestId('save-product-button'));

    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    const updateCall = fetchImpl.mock.calls.find(([url, options]) => url.endsWith('/products/prd-001') && options?.method === 'PATCH');
    expect(updateCall?.[1]?.body).toBe(JSON.stringify({ barcode: updated.barcode, name: updated.name, price: 2750, stock: 60 }));
  });

  it('keeps invalid price and stock editable and explains how to recover', () => {
    const fetchImpl = jest.fn();
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const screen = renderForm(client);

    fireEvent.changeText(screen.getByTestId('product-name-input'), 'Invalid Product');
    fireEvent.press(screen.getByTestId('edit-barcode-button'));
    fireEvent.changeText(screen.getByTestId('product-barcode-input'), '4800000000088');
    fireEvent.changeText(screen.getByTestId('product-price-input'), '12.345');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '2.5');
    expect(screen.getByText('Enter a non-negative price with up to 2 decimal places.')).toBeTruthy();
    expect(screen.getByText('Enter a whole-number stock quantity of 0 or more.')).toBeTruthy();
    expect(screen.getByTestId('product-price-input')).toHaveStyle({ borderColor: colors.danger });
    expect(screen.getByTestId('product-price-decimal-input')).toHaveStyle({ borderColor: colors.danger });
    expect(screen.getByTestId('product-stock-input').props['aria-invalid']).toBe(true);
    fireEvent.press(screen.getByTestId('save-product-button'));
    expect(screen.getByText('Check the highlighted fields and try again.')).toBeTruthy();
    expect(fetchImpl).not.toHaveBeenCalled();
    fireEvent.changeText(screen.getByTestId('product-price-input'), '12');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '2');
    expect(screen.getByTestId('product-price-input')).not.toHaveStyle({ borderColor: colors.danger });
    expect(screen.getByTestId('product-stock-input').props['aria-invalid']).toBe(false);
  });

  it('shows required and category validation on blur with red field borders', () => {
    const screen = renderForm(new ApiClient({ baseUrl: undefined }));
    fireEvent(screen.getByTestId('product-name-input'), 'blur');
    expect(screen.getByText('Enter a product name.')).toBeTruthy();
    expect(screen.getByTestId('product-name-input')).toHaveStyle({ borderColor: colors.danger });
    fireEvent.changeText(screen.getByTestId('product-category-input'), 'x'.repeat(101));
    expect(screen.getByText('Enter a category with 1–100 characters.')).toBeTruthy();
    expect(screen.getByTestId('product-category-input').props['aria-invalid']).toBe(true);
  });

  it('edits centavos independently and submits the correct price without resending stock', async () => {
    mockRouteParams = { id: 'prd-001' };
    const fetchImpl = jest.fn(async (url: string, options?: RequestInit) => {
      if (options?.method === 'PATCH') return response({ data: authoritativeProduct });
      if (url.endsWith('/inventory')) return response(refreshResponses());
      return response({ data: { items: [authoritativeProduct] } });
    });
    const screen = renderForm(new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch }));
    fireEvent.changeText(screen.getByTestId('product-price-input'), '27');
    fireEvent.changeText(screen.getByTestId('product-price-decimal-input'), '5');
    fireEvent(screen.getByTestId('product-price-decimal-input'), 'blur');
    expect(screen.getByTestId('product-price-decimal-input').props.value).toBe('05');
    fireEvent.press(screen.getByTestId('save-product-button'));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalledTimes(1));
    const write = fetchImpl.mock.calls.find(([, options]) => options?.method === 'PATCH');
    expect(JSON.parse(write?.[1]?.body as string)).toEqual({ price: 2705 });
  });

  it('uses whole-number stock steps and never decrements below zero', () => {
    const screen = renderForm(new ApiClient({ baseUrl: undefined }));
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '0');
    expect(screen.getByRole('button', { name: 'Decrease stock quantity' })).toBeDisabled();
    fireEvent.press(screen.getByRole('button', { name: 'Increase stock quantity' }));
    expect(screen.getByTestId('product-stock-input').props.value).toBe('1');
    fireEvent.press(screen.getByRole('button', { name: 'Decrease stock quantity' }));
    expect(screen.getByTestId('product-stock-input').props.value).toBe('0');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '4294967295');
    expect(screen.getByRole('button', { name: 'Increase stock quantity' })).toBeDisabled();
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '2.5');
    fireEvent.press(screen.getByRole('button', { name: 'Increase stock quantity' }));
    expect(screen.getByTestId('product-stock-input').props.value).toBe('2.5');
    expect(screen.getByText('Enter a whole-number stock quantity of 0 or more.')).toBeTruthy();
  });

  it('offers categories in a closed-by-default combo box and keeps custom names', () => {
    const screen = renderForm(new ApiClient({ baseUrl: undefined }));
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Show categories' }));
    expect(screen.getByRole('list', { name: 'Categories' })).toBeTruthy();
    fireEvent.press(screen.getByRole('option', { name: 'Noodles' }));
    expect(screen.getByTestId('product-category-input').props.value).toBe('Noodles');
    expect(screen.queryByRole('list')).toBeNull();
    fireEvent.changeText(screen.getByTestId('product-category-input'), 'Frozen Food');
    expect(screen.getByText('Use “Frozen Food” as a custom category.')).toBeTruthy();
    fireEvent(screen.getByTestId('product-category-input'), 'blur');
    expect(screen.getByTestId('product-category-input').props.value).toBe('Frozen Food');
    expect(screen.queryByRole('list')).toBeNull();
  });

  it('supports choosing and dismissing category suggestions with the keyboard', () => {
    const screen = renderForm(new ApiClient({ baseUrl: undefined }));
    const key = (key: string) => ({ nativeEvent: { key }, preventDefault: jest.fn(), stopPropagation: jest.fn() });
    fireEvent(screen.getByTestId('product-category-input'), 'keyPress', key('ArrowDown'));
    fireEvent(screen.getByTestId('product-category-input'), 'keyPress', key('Enter'));
    expect(screen.getByTestId('product-category-input').props.value).toBe('Beverages');
    fireEvent(screen.getByTestId('product-category-input'), 'keyPress', key('ArrowDown'));
    const escape = key('Escape');
    fireEvent(screen.getByTestId('product-category-input'), 'keyPress', escape);
    expect(escape.stopPropagation).toHaveBeenCalled();
    expect(screen.queryByRole('list')).toBeNull();
    expect(screen.queryByTestId('discard-confirmation')).toBeNull();
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
    fireEvent.press(screen.getByTestId('edit-barcode-button'));
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
    fireEvent.press(screen.getByTestId('edit-barcode-button'));
    fireEvent.changeText(screen.getByTestId('product-barcode-input'), '4800000000077');
    fireEvent.changeText(screen.getByTestId('product-price-input'), '10');
    fireEvent.changeText(screen.getByTestId('product-stock-input'), '2');
    fireEvent.press(screen.getByTestId('save-product-button'));

    await waitFor(() => expect(screen.getByTestId('product-form-error')).toBeTruthy());
    expect(screen.getByText('Check the connection, then save again.')).toBeTruthy();
    expect(screen.queryByText(/Unable to reach PorSca API/)).toBeNull();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });

  it('asks before discarding unsaved edits and keeps the draft when cancelled', () => {
    const screen = renderForm(new ApiClient({ baseUrl: undefined }));
    fireEvent.changeText(screen.getByTestId('product-name-input'), 'Half-entered product');
    fireEvent.press(screen.getByTestId('discard-product-button'));
    expect(screen.getByTestId('discard-confirmation')).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
    fireEvent.press(screen.getByRole('button', { name: 'Keep editing' }));
    expect(screen.queryByTestId('discard-confirmation')).toBeNull();
    expect(screen.getByTestId('product-name-input').props.value).toBe('Half-entered product');
    fireEvent.press(screen.getByRole('button', { name: 'Close product editor' }));
    fireEvent.press(screen.getByRole('button', { name: 'Discard' }));
    expect(mockRouter.back).toHaveBeenCalledTimes(1);
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
