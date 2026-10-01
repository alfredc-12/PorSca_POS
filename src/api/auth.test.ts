import { ApiClient } from '@/src/api/client';

function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}

const user = { id: 1, name: 'Cashier', email: 'cashier@example.test', role: 'cashier', is_active: true };

describe('API authentication boundary', () => {
  it('logs in without a bearer token, reads me, and revokes the runtime token on logout', async () => {
    const fetchImpl = jest.fn()
      .mockResolvedValueOnce(response({ data: { token: 'new-token', token_type: 'Bearer', user } }))
      .mockResolvedValueOnce(response({ data: { user } }))
      .mockResolvedValueOnce(response(undefined, 204));
    const client = new ApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });
    client.setToken('old-token');
    await expect(client.login('cashier@example.test', 'password')).resolves.toMatchObject({ token: 'new-token', user });
    expect(fetchImpl.mock.calls[0]).toEqual([
      'https://api.example.test/api/v1/auth/login',
      expect.objectContaining({ method: 'POST', body: JSON.stringify({ email: 'cashier@example.test', password: 'password', device_name: 'PorSca POS' }) }),
    ]);
    expect(fetchImpl.mock.calls[0][1].headers).not.toHaveProperty('Authorization');
    client.setToken('new-token');
    await expect(client.me()).resolves.toEqual({ user });
    await expect(client.logout()).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
    expect(fetchImpl.mock.calls[2][0]).toBe('https://api.example.test/api/v1/auth/logout');
    expect(fetchImpl.mock.calls[2][1].method).toBe('POST');
  });

  it.each(['health', 'listProducts', 'me', 'logout'] as const)('invalidates any 401 from %s, including a non-JSON response', async (method) => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: false, status: 401, json: async () => { throw new Error('not JSON'); } });
    const client = new ApiClient({ baseUrl: 'https://api.example.test', fetchImpl });
    const invalidated = jest.fn();
    client.setToken('expired');
    client.setUnauthorizedHandler(invalidated);
    await expect(client[method]()).rejects.toMatchObject({ status: 401 });
    expect(invalidated).toHaveBeenCalledTimes(1);
    await expect(client.health()).rejects.toMatchObject({ status: 401 });
    expect(fetchImpl.mock.calls[1][1].headers).not.toHaveProperty('Authorization');
  });

  it('does not invalidate a valid session on forbidden admin operations', async () => {
    const fetchImpl = jest.fn().mockResolvedValue(response({ message: 'Forbidden' }, 403));
    const client = new ApiClient({ baseUrl: 'https://api.example.test', fetchImpl });
    const invalidated = jest.fn();
    client.setToken('cashier-token');
    client.setUnauthorizedHandler(invalidated);
    await expect(client.updateInventory('1', { stock: 2 })).rejects.toMatchObject({ status: 403 });
    await expect(client.me()).rejects.toMatchObject({ status: 403 });
    expect(invalidated).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer cashier-token');
  });

  it('ignores a late 401 from an old session after a new runtime token is set', async () => {
    let resolve!: (value: Response) => void;
    const fetchImpl = jest.fn().mockReturnValueOnce(new Promise<Response>((done) => { resolve = done; })).mockResolvedValue(response({ data: { user } }));
    const client = new ApiClient({ baseUrl: 'https://api.example.test', fetchImpl });
    const invalidated = jest.fn();
    client.setUnauthorizedHandler(invalidated);
    client.setToken('old-token');
    const oldRead = client.me();
    client.setToken('new-token');
    resolve(response(undefined, 401));
    await expect(oldRead).rejects.toMatchObject({ status: 401 });
    await client.me();
    expect(invalidated).not.toHaveBeenCalled();
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer new-token');
  });
});
