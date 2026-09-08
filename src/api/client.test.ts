import { ApiClient, isDeviceSafeApiUrl } from '@/src/api/client';

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('ApiClient', () => {
  it('uses the configured API URL and idempotency key for QR payments', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ data: { id: 'pay-1', status: 'pending', amount: 63 } }));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/', apiToken: 'local-api-token', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.createQrPhPayment({ idempotencyKey: 'TX-1', items: [{ productId: '1', quantity: 1 }] })).resolves.toEqual({
      id: 'pay-1',
      status: 'pending',
      amount: 63,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://staging-api.example.test/api/v1/payments',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'TX-1', Authorization: 'Bearer local-api-token' }),
        body: JSON.stringify({ idempotencyKey: 'TX-1', items: [{ productId: '1', quantity: 1 }] }),
      }),
    );
  });

  it('surfaces server errors without exposing or accepting provider secrets', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ error: 'Payment failed.' }, false, 422));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.health()).rejects.toEqual(expect.objectContaining({ status: 422, message: 'Payment failed.' }));
    expect(JSON.stringify(fetchImpl.mock.calls)).not.toContain('PAYMONGO_SECRET_KEY');
  });

  it('identifies device-safe URLs and rejects loopback URLs for phone builds', () => {
    expect(isDeviceSafeApiUrl('https://staging-api.example.test')).toBe(true);
    expect(isDeviceSafeApiUrl('http://192.168.1.100:4000')).toBe(true);
    expect(isDeviceSafeApiUrl('http://localhost:4000')).toBe(false);
  });

  it('searches the Laravel catalog and normalizes authoritative stock and centavo prices', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      data: {
        items: [{
          id: 7,
          sku: 'COFFEE-001',
          barcode: '4800000000027',
          name: 'Barako Coffee 250g',
          price: 18500,
          stock: { quantity: 3, reorder_level: 5, status: 'low_stock', low_stock: true, out_of_stock: false },
        }],
        pagination: { total: 1 },
      },
    }));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.listProducts({ search: 'coffee' })).resolves.toEqual([{
      id: '7',
      sku: 'COFFEE-001',
      barcode: '4800000000027',
      name: 'Barako Coffee 250g',
      price: 185,
      stock: 3,
      stockStatus: 'low_stock',
      reorderLevel: 5,
    }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://staging-api.example.test/api/v1/products?search=coffee&per_page=100',
      expect.objectContaining({ headers: expect.objectContaining({ 'X-PorSca-Contract-Version': 'porsca-mobile-api-v1' }) }),
    );
  });

  it('preserves the Laravel barcode not-found response as a recoverable 404', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ error: { code: 'not_found', message: 'Product not found for this barcode.' } }, false, 404));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.getProductByBarcode('does-not-exist')).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Product not found for this barcode.',
    });
  });

  it('normalizes inventory rows with the API stock status', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      data: { items: [{ product_id: 9, sku: 'SOAP-001', barcode: '4800000000034', product_name: 'Laundry Soap 500g', quantity: 0, reorder_level: 5, status: 'out_of_stock' }] },
    }));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.listInventory()).resolves.toEqual([{
      productId: '9',
      sku: 'SOAP-001',
      barcode: '4800000000034',
      productName: 'Laundry Soap 500g',
      quantity: 0,
      reorderLevel: 5,
      status: 'out_of_stock',
    }]);
  });

  it('creates products with the Laravel payload and normalizes its authoritative response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      data: {
        id: 12,
        sku: 'COFFEE-012',
        barcode: '4800000000012',
        name: 'House Blend Coffee',
        category: 'Beverage',
        price: 18500,
        stock: { quantity: 8, reorder_level: 2, status: 'in_stock' },
      },
    }, true, 201));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', apiToken: 'local-api-token', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.createProduct({ barcode: '4800000000012', name: 'House Blend Coffee', category: 'Beverages', price: 185, stock: 8, reorderLevel: 2 })).resolves.toMatchObject({
      id: '12',
      price: 185,
      stock: 8,
      stockStatus: 'in_stock',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://staging-api.example.test/api/v1/products',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer local-api-token' }),
        body: JSON.stringify({ barcode: '4800000000012', name: 'House Blend Coffee', category: 'Beverages', price: 18500, stock: 8, reorder_level: 2 }),
      }),
    );
  });

  it('posts a cash checkout to Laravel with centavo cash and preserves the sale response', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      data: {
        id: 42,
        idempotency_key: 'cash-42',
        status: 'completed',
        payment_method: 'cash',
        total_amount: 3700,
        cash_received: 5000,
        change_amount: 1300,
        completed_at: '2026-09-08T12:00:00Z',
        items: [{ product_id: 4, sku: 'WATER-001', name: 'Mineral Water 1L', quantity: 1, unit_price: 3700 }],
      },
    }, true, 201));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', apiToken: 'local-api-token', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.createSale({
      idempotencyKey: 'cash-42',
      items: [{ productId: '4', quantity: 1, unitPrice: 3700 }],
      total: 3700,
      paymentMethod: 'cash',
      cashReceived: 5000,
    })).resolves.toMatchObject({
      id: '42',
      total: 37,
      paymentMethod: 'cash',
      status: 'paid',
      cashReceived: 50,
      change: 13,
      items: [{ product: { id: '4', name: 'Mineral Water 1L', price: 37 }, quantity: 1 }],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://staging-api.example.test/api/v1/sales/checkout',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'cash-42', Authorization: 'Bearer local-api-token' }),
        body: JSON.stringify({
          idempotencyKey: 'cash-42',
          items: [{ productId: '4', quantity: 1, unitPrice: 3700 }],
          total: 3700,
          paymentMethod: 'cash',
          cashReceived: 5000,
        }),
      }),
    );
  });

  it('loads completed sales for the transaction history without duplicating API envelopes', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({
      data: { items: [{ id: 7, status: 'completed', payment_method: 'cash', total_amount: 18500, cash_received: 20000, change_amount: 1500, completed_at: '2026-09-08T12:00:00Z', items: [] }] },
    }));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.listSales()).resolves.toMatchObject([{ id: '7', total: 185, paymentMethod: 'cash', status: 'paid', cashReceived: 200, change: 15 }]);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://staging-api.example.test/api/v1/sales?per_page=100',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('edits supported product fields and updates stock through the documented endpoints', async () => {
    const updated = {
      data: {
        id: 12,
        sku: 'COFFEE-012',
        barcode: '4800000000013',
        name: 'House Blend Coffee XL',
        category: 'Beverages',
        price: 19900,
        stock: { quantity: 11, reorder_level: 2, status: 'in_stock' },
      },
    };
    const stock = {
      data: {
        id: 12,
        sku: 'COFFEE-012',
        barcode: '4800000000013',
        name: 'House Blend Coffee XL',
        category: 'Beverages',
        price: 19900,
        stock: { quantity: 9, reorder_level: 2, status: 'in_stock' },
      },
    };
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response(updated))
      .mockResolvedValueOnce(response(stock));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.updateProduct('12', { name: 'House Blend Coffee XL', barcode: '4800000000013', price: 199, stock: 11 })).resolves.toMatchObject({ name: 'House Blend Coffee XL', price: 199, stock: 11 });
    await expect(client.updateInventory('12', { stock: 9 })).resolves.toMatchObject({ stock: 9 });
    expect(fetchImpl.mock.calls[0]).toEqual([
      'https://staging-api.example.test/api/v1/products/12',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ barcode: '4800000000013', name: 'House Blend Coffee XL', price: 19900, stock: 11 }) }),
    ]);
    expect(fetchImpl.mock.calls[1]).toEqual([
      'https://staging-api.example.test/api/v1/products/12/stock',
      expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ stock: 9 }) }),
    ]);
  });
});
