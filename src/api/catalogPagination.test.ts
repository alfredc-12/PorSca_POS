import { ApiClient } from './client';

const response = (data: unknown, ok = true) => ({ ok, status: ok ? 200 : 503, json: async () => ({ data }) }) as Response;

describe.each(['listProducts', 'listInventory'] as const)('%s pagination', (method) => {
  it('retrieves all 237 rows and preserves the Laravel values beyond 100', async () => {
    const fetchImpl = jest.fn(async (url: string) => {
      const page = Number(new URL(url).searchParams.get('page') ?? 1);
      const items = Array.from({ length: page === 3 ? 37 : 100 }, (_, index) => {
        const id = (page - 1) * 100 + index + 1;
        const stock = { quantity: id, reorder_level: 150, status: id <= 150 ? 'low_stock' : 'in_stock' };
        return method === 'listProducts'
          ? { id, barcode: String(id), name: `Item ${id}`, price: '12345', stock }
          : { product_id: id, barcode: String(id), product_name: `Item ${id}`, ...stock };
      });
      return response({ items, pagination: { current_page: page, last_page: 3, total: 237 } });
    });
    const client = new ApiClient({ baseUrl: 'https://shop.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
    const items = await client[method]();
    expect(items).toHaveLength(237);
    expect(items[236]).toMatchObject(method === 'listProducts'
      ? { id: '237', price: 123.45, stock: 237, stockStatus: 'in_stock' }
      : { productId: '237', quantity: 237, status: 'in_stock' });
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(fetchImpl.mock.calls[2][0]).toContain('per_page=100&page=3');
  });

  it('rejects the entire snapshot when a later page fails', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ items: [], pagination: { current_page: 1, last_page: 2 } }))
      .mockResolvedValueOnce(response({}, false));
    const client = new ApiClient({ baseUrl: 'https://shop.test', fetchImpl });
    await expect(client[method]()).rejects.toMatchObject({ status: 503 });
  });

  it('rejects a nonadvancing server page instead of looping forever', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ items: [], pagination: { current_page: 1, last_page: 2 } }));
    const client = new ApiClient({ baseUrl: 'https://shop.test', fetchImpl });
    await expect(client[method]()).rejects.toThrow('Invalid catalog pagination');
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

it('normalizes centavos independently of the stock relation shape', async () => {
  const fetchImpl = jest.fn().mockResolvedValue(response({ items: [
    { id: 1, name: 'Missing inventory', barcode: '1', price: 9999, stock: null },
    { id: 2, name: 'Zero price', barcode: '2', price: 0, stock: 2 },
  ] }));
  const client = new ApiClient({ baseUrl: 'https://shop.test', fetchImpl });
  expect((await client.listProducts()).map(product => product.price)).toEqual([99.99, 0]);
});
