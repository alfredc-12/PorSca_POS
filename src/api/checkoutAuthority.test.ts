import { ApiClient, API_CONTRACT_VERSION } from './client';

function fixture(role: 'admin' | 'cashier' = 'cashier', simulationAllowed = false) {
  const fetchImpl = jest.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ data: url.endsWith('/checkout-session') ? { user: { id: 1, role, isActive: true }, storeId: 'shop', contractVersion: API_CONTRACT_VERSION, environment: 'staging', simulationAllowed } : { id: 'authority-resource' } }) } as Response));
  const client = new ApiClient({ baseUrl: 'https://shop.test/api/v1', fetchImpl: fetchImpl as unknown as typeof fetch });
  client.setToken('session-token');
  return { client, fetchImpl };
}
describe('v3 authority client surface', () => {
  it('sends every authority route through the single authenticated v3 boundary', async () => {
    const { client, fetchImpl } = fixture();
    await client.checkoutSession(); await client.listCheckouts(2); await client.createCheckout([{ productId: 1, quantity: 2 }], 'create-key');
    await client.getCheckout('uuid'); await client.recoverCheckout('uuid'); await client.revalidateCheckout('uuid'); await client.abandonCheckout('uuid', 'Customer declined');
    const tender = { revision: 1, acceptedAmountCentavos: 1010 };
    await client.checkoutCash('uuid', { ...tender, cashReceivedCentavos: 2000 }, 'cash-key'); await client.createCheckoutAttempt('uuid', tender, 'qr-key');
    await client.listCheckoutAttempts('uuid'); await client.getCheckoutAttempt('uuid', 7); await client.checkoutReservation('uuid', 7); await client.refreshCheckoutAttempt('uuid', 7);
    expect(fetchImpl.mock.calls.map(call => call[0])).toEqual([
      'https://shop.test/api/v1/checkout-session', 'https://shop.test/api/v1/checkouts?per_page=100&page=2', 'https://shop.test/api/v1/checkouts',
      'https://shop.test/api/v1/checkouts/uuid', 'https://shop.test/api/v1/checkouts/uuid/recover', 'https://shop.test/api/v1/checkouts/uuid/revalidate', 'https://shop.test/api/v1/checkouts/uuid/abandon',
      'https://shop.test/api/v1/checkouts/uuid/cash', 'https://shop.test/api/v1/checkouts/uuid/attempts', 'https://shop.test/api/v1/checkouts/uuid/attempts', 'https://shop.test/api/v1/checkouts/uuid/attempts/7', 'https://shop.test/api/v1/checkouts/uuid/attempts/7/reservation', 'https://shop.test/api/v1/checkouts/uuid/attempts/7/refresh',
    ]);
    for (const call of (fetchImpl as jest.Mock).mock.calls) {
      expect(call[1].headers).toMatchObject({ Authorization: 'Bearer session-token', 'X-PorSca-Contract-Version': 'porsca-mobile-api-v3' });
      expect(call[0]).not.toMatch(/\/sales\/checkout|\/payments/);
    }
    expect((fetchImpl as jest.Mock).mock.calls[2][1].headers['Idempotency-Key']).toBe('create-key');
    expect((fetchImpl as jest.Mock).mock.calls[7][1].body).toBe(JSON.stringify({ ...tender, cashReceivedCentavos: 2000 }));
    expect((fetchImpl as jest.Mock).mock.calls[8][1].headers['Idempotency-Key']).toBe('qr-key');
    expect((fetchImpl as jest.Mock).mock.calls[12][1].body).toBeUndefined(); // refresh cannot inject outcome
  });
  it('refuses admin-only reads and capability retrieval for a live cashier role', async () => {
    const { client, fetchImpl } = fixture();
    await expect(client.listReconciliationCases()).rejects.toMatchObject({ status: 403 });
    await expect(client.getReconciliationCase(7)).rejects.toMatchObject({ status: 403 });
    await expect(client.checkoutSimulationCapability('uuid', 7)).rejects.toMatchObject({ status: 403 });
    expect(fetchImpl.mock.calls.every(call => call[0].endsWith('/checkout-session'))).toBe(true);
  });
  it('exposes only authorized read/capability routes, never client settlement', async () => {
    const { client, fetchImpl } = fixture('admin', true);
    await client.listReconciliationCases(2); await client.getReconciliationCase(7); await client.checkoutSimulationCapability('uuid', 7);
    expect(fetchImpl.mock.calls.map(call => call[0])).toContain('https://shop.test/api/v1/reconciliation-cases?per_page=100&page=2');
    expect(fetchImpl.mock.calls.map(call => call[0])).toContain('https://shop.test/api/v1/reconciliation-cases/7');
    expect(fetchImpl.mock.calls.map(call => call[0])).toContain('https://shop.test/api/v1/checkouts/uuid/attempts/7/simulation-capability');
  });
  it('keeps /api/v1 when configured with an origin instead of a prefixed API base', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ data: {} }) });
    await new ApiClient({ baseUrl: 'https://shop.test', fetchImpl }).recoverCheckout('a/b');
    expect(fetchImpl.mock.calls[0][0]).toBe('https://shop.test/api/v1/checkouts/a%2Fb/recover');
  });
});
