import { ApiClient, ApiClientError } from '@/src/api/client';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { CheckoutHandle, CheckoutStorage, DurableCheckout, checkoutPayment } from './durableCheckout';
import { canAcceptCheckoutTender } from './checkoutMachine';

const lines = [{ product: { id: '1', name: 'Coffee', barcode: '12345678', price: 10.1, stock: 20 }, quantity: 1 }];
const open: AuthorityCheckout = { id: 'server-uuid', storeId: 'shop', state: 'open', revision: 1, amountCentavos: 1010, currency: 'PHP', items: [{ productId: 1, name: 'Coffee', quantity: 1, unitPriceCentavos: 1010 }], attempts: [], sale: null, exceptions: [], history: [] };
const pending: AuthorityCheckout = { ...open, state: 'payment_unresolved', attempts: [{ id: 7, method: 'qrph', status: 'pending', financialStatus: 'pending', amountCentavos: 1010, currency: 'PHP', firstVerifiedOutcome: null, qrPayload: 'QR', qrExpiresAt: null, reservation: { state: 'held', expiresAt: null, durationSeconds: 1800 } }] };
function fixture() {
  let saved: CheckoutHandle | null = null;
  const storage: CheckoutStorage = { load: jest.fn(async () => saved), save: jest.fn(async value => { saved = value ? JSON.parse(JSON.stringify(value)) : null; }) };
  const client = {
    createCheckout: jest.fn().mockResolvedValue(open), getCheckout: jest.fn().mockResolvedValue(open),
    recoverCheckout: jest.fn().mockResolvedValue(pending), createCheckoutAttempt: jest.fn().mockResolvedValue(pending),
    checkoutCash: jest.fn(), refreshCheckoutAttempt: jest.fn().mockResolvedValue(pending),
    revalidateCheckout: jest.fn().mockResolvedValue({ ...open, revision: 2 }), abandonCheckout: jest.fn().mockResolvedValue({ ...open, state: 'abandoned' }),
  };
  const authority = new DurableCheckout(client as unknown as ApiClient, storage);
  return { client, storage, authority, saved: () => saved };
}

describe('durable authority workflow and machine integration', () => {
  it('uses server checkout identity and integer quote/tender amounts, persisting keys before I/O', async () => {
    const { authority, client, saved } = fixture();
    client.checkoutCash.mockImplementation(async () => { expect(saved()?.tender?.key).toBeTruthy(); return { ...open, state: 'completed', sale: { id: 9, method: 'cash', amountCentavos: 1010, cashReceivedCentavos: 2000, changeAmountCentavos: 990, completedAt: 'now' } }; });
    await authority.tender(lines, 'cash', '20.00');
    expect(client.createCheckout).toHaveBeenCalledWith([{ productId: 1, quantity: 1 }], expect.any(String));
    expect(client.checkoutCash).toHaveBeenCalledWith('server-uuid', { revision: 1, acceptedAmountCentavos: 1010, cashReceivedCentavos: 2000 }, expect.any(String));
    expect(authority.machine?.state).toBe('completed');
  });
  it.each(['', '1e3', '+20', ' 20', '20 ', '20.001', '2,000', '-20'])('rejects cash grammar %j without cash I/O', async input => {
    const { authority, client } = fixture();
    await expect(authority.tender(lines, 'cash', input)).rejects.toThrow();
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('recovers an ambiguous QR create by stored checkout id, without a duplicate attempt', async () => {
    const { authority, client, saved } = fixture();
    client.createCheckoutAttempt.mockRejectedValue(new ApiClientError('lost response'));
    expect(checkoutPayment(await authority.tender(lines, 'qrph')).status).toBe('pending');
    expect(client.recoverCheckout).toHaveBeenCalledWith('server-uuid');
    client.getCheckout.mockResolvedValue(pending);
    await authority.tender(lines, 'qrph');
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
    expect(saved()?.id).toBe('server-uuid');
  });
  it('retains the exact tender key across restart when recovery also fails', async () => {
    const { authority, client, storage, saved } = fixture();
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('lost'));
    client.recoverCheckout.mockRejectedValue(new ApiClientError('offline'));
    await expect(authority.tender(lines, 'qrph')).rejects.toThrow('lost');
    const originalKey = saved()?.tender?.key;
    const restarted = new DurableCheckout(client as unknown as ApiClient, storage);
    await restarted.tender(lines, 'qrph');
    expect(client.createCheckoutAttempt.mock.calls[1][2]).toBe(originalKey);
  });
  it('recovers a lost checkout creation using its original creation key', async () => {
    const { authority, client, storage, saved } = fixture();
    client.createCheckout.mockRejectedValueOnce(new ApiClientError('lost'));
    await expect(authority.prepare(lines)).rejects.toThrow('lost');
    const creationKey = saved()?.key;
    await new DurableCheckout(client as unknown as ApiClient, storage).recover();
    expect(client.createCheckout.mock.calls[1][1]).toBe(creationKey);
  });
  it('blocks cash and edited baskets while QR is pending, even after hold expiry', async () => {
    const { authority, client } = fixture();
    await authority.tender(lines, 'qrph');
    client.getCheckout.mockResolvedValue({ ...pending, attempts: [{ ...pending.attempts[0], reservation: { state: 'expired', expiresAt: 'past', durationSeconds: 1800 } }] });
    await expect(authority.tender(lines, 'cash', '20')).rejects.toThrow(/unresolved/);
    await expect(authority.tender([{ ...lines[0], quantity: 2 }], 'qrph')).rejects.toThrow(/original device purchase/);
    expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(canAcceptCheckoutTender(authority.machine)).toBe(false);
  });
  it('transitions pending to unknown on failed verification through the machine and reverses on pending', async () => {
    const { authority, client } = fixture();
    await authority.tender(lines, 'qrph');
    client.refreshCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('timeout'));
    await expect(authority.refresh('7')).rejects.toThrow('timeout');
    expect(authority.machine?.attempts[0].payment).toBe('unknown');
    expect(checkoutPayment(authority.current!).status).toBe('unknown');
    expect(canAcceptCheckoutTender(authority.machine)).toBe(false);
    await authority.refresh('7');
    expect(authority.machine?.attempts[0].payment).toBe('pending');
  });
  it('preserves the first verified outcome and contradiction lock; does not display sale success', async () => {
    const { authority, client } = fixture();
    await authority.tender(lines, 'qrph');
    const contradiction = { ...pending, state: 'provider_contradiction', attempts: [{ ...pending.attempts[0], status: 'contradiction', firstVerifiedOutcome: 'paid', financialStatus: 'paid' }] };
    client.refreshCheckoutAttempt.mockResolvedValue(contradiction);
    await authority.refresh('7');
    expect(authority.machine?.attempts[0].finalEvidence?.outcome).toBe('paid');
    expect(authority.machine?.attempts[0].contradictions).toHaveLength(1);
    expect(canAcceptCheckoutTender(authority.machine)).toBe(false);
    expect(checkoutPayment(authority.current!).status).toBe('unknown');
  });
  it('permits a new tender only after verified non-payability', async () => {
    const { authority, client } = fixture();
    await authority.tender(lines, 'qrph');
    const released = { ...pending, state: 'ready_for_attempt', attempts: [{ ...pending.attempts[0], status: 'non_payable', firstVerifiedOutcome: 'non_payable', financialStatus: 'expired' }] };
    client.refreshCheckoutAttempt.mockResolvedValue(released); client.getCheckout.mockResolvedValue(released);
    await authority.refresh('7');
    expect(canAcceptCheckoutTender(authority.machine)).toBe(true);
    client.checkoutCash.mockResolvedValue({ ...released, state: 'completed', sale: { id: 9, method: 'cash', amountCentavos: 1010, cashReceivedCentavos: 2000, changeAmountCentavos: 990, completedAt: 'now' }, attempts: [...released.attempts, { ...pending.attempts[0], id: 8, method: 'cash', status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid', qrPayload: null, reservation: null }] });
    await authority.tender(lines, 'cash', '20');
    expect(client.checkoutCash).toHaveBeenCalledTimes(1);
  });
  it('requires explicit revised quote review and does not silently charge', async () => {
    const { authority, client } = fixture();
    client.createCheckout.mockResolvedValue({ ...open, amountCentavos: 1100 });
    await expect(authority.tender(lines, 'cash', '20')).rejects.toThrow(/Review/);
    expect(client.checkoutCash).not.toHaveBeenCalled();
    await authority.revalidate();
    expect(client.revalidateCheckout).toHaveBeenCalledWith('server-uuid');
  });
  it('attributes terminal abandonment and gives an identical next purchase a fresh creation key', async () => {
    const { authority, client, saved } = fixture();
    await authority.prepare(lines);
    const oldKey = saved()?.key;
    await authority.abandon('Customer declined purchase');
    expect(client.abandonCheckout).toHaveBeenCalledWith('server-uuid', 'Customer declined purchase');
    expect(saved()).toBeNull();
    await authority.prepare(lines);
    expect(saved()?.key).not.toBe(oldKey);
  });
  it('preserves tender keys when explicitly recovering the already attached purchase', async () => {
    const { authority, saved } = fixture();
    await authority.tender(lines, 'qrph');
    const before = JSON.parse(JSON.stringify(saved()));
    await authority.recover('server-uuid');
    expect(saved()).toEqual(before);
  });
  it('fails closed rather than replacing the first outcome with an inconsistent stored observation', async () => {
    const { authority, client } = fixture();
    await authority.tender(lines, 'qrph');
    client.refreshCheckoutAttempt.mockResolvedValueOnce({ ...pending, state: 'ready_for_attempt', attempts: [{ ...pending.attempts[0], status: 'non_payable', firstVerifiedOutcome: 'non_payable', financialStatus: 'expired' }] });
    await authority.refresh('7');
    client.refreshCheckoutAttempt.mockResolvedValueOnce({ ...pending, attempts: [{ ...pending.attempts[0], status: 'paid', firstVerifiedOutcome: 'paid', financialStatus: 'paid' }] });
    await expect(authority.refresh('7')).rejects.toThrow(/first verified/);
    expect(authority.machine?.attempts[0].finalEvidence?.outcome).toBe('non-payable');
    expect(checkoutPayment(authority.current!).status).toBe('failed');
  });
  it('does not turn a missing authority record or idempotency key into paid', async () => {
    const { authority, client } = fixture();
    await authority.tender(lines, 'qrph');
    client.recoverCheckout.mockRejectedValue(new ApiClientError('not found', 404));
    await expect(authority.recover()).rejects.toThrow('not found');
    expect(checkoutPayment(authority.current!).status).toBe('pending');
  });
});
