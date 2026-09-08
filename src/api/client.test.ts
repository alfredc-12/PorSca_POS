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
});
