import { ApiClient, isDeviceSafeApiUrl } from '@/src/api/client';

function response(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as Response;
}

describe('ApiClient', () => {
  it('uses the configured API URL and idempotency key for QR payments', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ data: { id: 'pay-1', status: 'pending', amount: 63 } }));
    const client = new ApiClient({ baseUrl: 'https://staging-api.example.test/', fetchImpl: fetchImpl as unknown as typeof fetch });

    await expect(client.createQrPhPayment({ transactionId: 'TX-1', amount: 63, idempotencyKey: 'TX-1' })).resolves.toEqual({
      id: 'pay-1',
      status: 'pending',
      amount: 63,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://staging-api.example.test/api/payments/qrph',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'Idempotency-Key': 'TX-1' }),
        body: JSON.stringify({ transactionId: 'TX-1', amount: 63, idempotencyKey: 'TX-1' }),
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
});
