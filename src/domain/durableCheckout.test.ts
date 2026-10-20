import { ApiClient, ApiClientError } from '@/src/api/client';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { CheckoutHandle, CheckoutStorage, CheckoutStorageCorruptionError, DurableCheckout, checkoutPayment, checkoutSale } from './durableCheckout';
import { canAcceptCheckoutTender } from './checkoutMachine';

const lines = [{ product: { id: '1', name: 'Coffee', barcode: '12345678', price: 10.1, stock: 20 }, quantity: 1 }];
const open: AuthorityCheckout = { id: 'server-uuid', storeId: 'shop', state: 'open', revision: 1, amountCentavos: 1010, currency: 'PHP', items: [{ productId: 1, name: 'Coffee', quantity: 1, unitPriceCentavos: 1010 }], attempts: [], sale: null, exceptions: [], history: [] };
const pending: AuthorityCheckout = { ...open, state: 'payment_unresolved', attempts: [{ id: 7, method: 'qrph', status: 'pending', financialStatus: 'pending', amountCentavos: 1010, currency: 'PHP', firstVerifiedOutcome: null, qrPayload: 'QR', qrExpiresAt: null, reservation: { state: 'held', expiresAt: null, durationSeconds: 1800 } }] };
const readyQr: AuthorityCheckout = { ...pending, state: 'ready_for_attempt', attempts: [{ ...pending.attempts[0], status: 'non_payable', financialStatus: 'expired', firstVerifiedOutcome: 'non_payable' }] };
const paidUnfulfilled: AuthorityCheckout = { ...pending, state: 'paid_unfulfilled', attempts: [{ ...pending.attempts[0], status: 'paid', financialStatus: 'paid_unfulfilled', firstVerifiedOutcome: 'paid' }] };
const cashAfterQr: AuthorityCheckout = { ...readyQr, state: 'completed', attempts: [...readyQr.attempts, { ...pending.attempts[0], id: 8, method: 'cash', status: 'paid', financialStatus: 'paid', firstVerifiedOutcome: 'paid', qrPayload: null, reservation: null }], sale: { id: 9, method: 'cash', amountCentavos: 1010, cashReceivedCentavos: 2000, changeAmountCentavos: 990, completedAt: 'now' } };
const terminalQrStates: Record<string, AuthorityCheckout> = {
  pending,
  unknown: { ...pending, attempts: [{ ...pending.attempts[0], status: 'unknown' }] },
  paid: { ...pending, state: 'completed', attempts: [{ ...pending.attempts[0], status: 'paid', financialStatus: 'paid', firstVerifiedOutcome: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 1010, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'now' } },
  abandoned: { ...pending, state: 'abandoned' },
  contradiction: { ...pending, state: 'provider_contradiction', attempts: [{ ...pending.attempts[0], status: 'contradiction', financialStatus: 'paid', firstVerifiedOutcome: 'paid' }] },
};
function fixture() {
  let saved: CheckoutHandle | null = null;
  const storage: CheckoutStorage = { load: jest.fn(async () => saved), save: jest.fn(async value => { saved = value ? JSON.parse(JSON.stringify(value)) : null; }) };
  const client = {
    createCheckout: jest.fn().mockResolvedValue(open), getCheckout: jest.fn().mockResolvedValue(open),
    recoverCheckout: jest.fn().mockResolvedValue(pending), listCheckouts: jest.fn().mockResolvedValue({ items: [pending], pagination: { current_page: 1, last_page: 1, total: 1 } }), createCheckoutAttempt: jest.fn().mockResolvedValue(pending),
    checkoutCash: jest.fn(), refreshCheckoutAttempt: jest.fn().mockResolvedValue(pending),
    revalidateCheckout: jest.fn().mockResolvedValue({ ...open, revision: 2 }), abandonCheckout: jest.fn().mockResolvedValue({ ...open, state: 'abandoned' }),
  };
  const authority = new DurableCheckout(client as unknown as ApiClient, storage);
  return { client, storage, authority, saved: () => saved };
}

describe('durable authority workflow and machine integration', () => {
  it('stops a disposed checkout from persisting a late creation response over a replacement identity', async () => {
    const { authority, client, storage, saved } = fixture();
    let finishCreation!: (value: AuthorityCheckout) => void;
    const started = new Promise<void>(resolve => {
      client.createCheckout.mockImplementationOnce(() => new Promise<AuthorityCheckout>(finish => { finishCreation = finish; resolve(); }));
    });
    const creation = authority.prepare(lines);
    await started;
    authority.setActive(false);
    const replacement: CheckoutHandle = { key: 'replacement-key', signature: '[[1,1]]', id: 'replacement-uuid', tender: { key: 'replacement-tender', signature: '[]' } };
    await storage.save(replacement);
    finishCreation(open);
    await expect(creation).rejects.toThrow(/session is no longer active/);
    await expect(authority.retire()).rejects.toThrow(/session is no longer active/);
    expect(saved()).toEqual(replacement);
  });
  it('does not guess missing cash receipt fields as zero', () => {
    const completed: AuthorityCheckout = { ...open, state: 'completed', sale: { id: 9, method: 'cash', amountCentavos: 1010, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'now' } };
    expect(() => checkoutSale(completed)).toThrow(/receipt is incomplete/);
  });
  it.each(['cash', 'qrph'] as const)('builds %s receipt items from the committed snapshot', method => {
    const completed: AuthorityCheckout = {
      ...open, state: 'completed', amountCentavos: 3031,
      items: [
        { productId: 12, name: 'Committed Coffee', quantity: 2, unitPriceCentavos: 1010 },
        { productId: 34, name: 'Committed Tea', quantity: 1, unitPriceCentavos: 1011 },
      ],
      sale: { id: 9, method, amountCentavos: 3031, cashReceivedCentavos: method === 'cash' ? 5000 : null, changeAmountCentavos: method === 'cash' ? 1969 : null, completedAt: 'now' },
    };
    expect(checkoutSale(completed)).toEqual({
      id: '9', total: 30.31, paymentMethod: method, status: 'paid', createdAt: 'now',
      cashReceived: method === 'cash' ? 50 : undefined, change: method === 'cash' ? 19.69 : undefined,
      items: [
        { product: { id: '12', name: 'Committed Coffee', barcode: '', price: 10.1, stock: 0 }, quantity: 2 },
        { product: { id: '34', name: 'Committed Tea', barcode: '', price: 10.11, stock: 0 }, quantity: 1 },
      ],
    });
  });
  it('rehydrates exact cash uncertainty from stored tender without exposing its key', async () => {
    const { client, storage } = fixture();
    storage.load = jest.fn().mockResolvedValue({ key: 'creation-key', id: open.id, signature: '[[1,1]]', tender: { key: 'private-key', signature: JSON.stringify(['cash', { revision: 1, acceptedAmountCentavos: 1010, cashReceivedCentavos: 2000 }]) } });
    client.recoverCheckout.mockResolvedValue(open);
    const authority = new DurableCheckout(client as unknown as ApiClient, storage);
    await authority.exclusive(() => authority.recover());
    expect(authority.progress).toMatchObject({ uncertainTender: 'cash', cashInput: '20.00' });
    expect(JSON.stringify(authority.progress)).not.toMatch(/private-key|creation-key/);
    await expect(authority.exclusive(() => authority.revalidate())).rejects.toThrow(/previous payment/); expect(client.revalidateCheckout).not.toHaveBeenCalled();
    await expect(authority.exclusive(() => authority.abandon('wrongly unlock'))).rejects.toThrow(/previous payment/); expect(client.abandonCheckout).not.toHaveBeenCalled();
  });
  it('uses server checkout identity and integer quote/tender amounts, persisting keys before I/O', async () => {
    const { authority, client, saved } = fixture();
    client.checkoutCash.mockImplementation(async () => { expect(saved()?.tender?.key).toBeTruthy(); return { ...open, state: 'completed', sale: { id: 9, method: 'cash', amountCentavos: 1010, cashReceivedCentavos: 2000, changeAmountCentavos: 990, completedAt: 'now' } }; });
    await authority.tender(lines, 'cash', '20.00');
    expect(client.createCheckout).toHaveBeenCalledWith([{ productId: 1, quantity: 1 }], expect.any(String));
    expect(client.checkoutCash).toHaveBeenCalledWith('server-uuid', { revision: 1, acceptedAmountCentavos: 1010, cashReceivedCentavos: 2000 }, expect.any(String));
    expect(authority.machine?.state).toBe('completed');
  });
  it('rejects non-server product identities and invalid quantities before persisting a checkout', async () => {
    const { authority, client, storage, saved } = fixture();
    const invalidLines = [
      [{ ...lines[0], product: { ...lines[0].product, id: 'prd-001' } }],
      [{ ...lines[0], quantity: 1.5 }],
      [{ ...lines[0], quantity: 0 }],
    ];
    for (const invalid of invalidLines) await expect(authority.prepare(invalid)).rejects.toThrow(/server identities/);
    expect(storage.save).not.toHaveBeenCalled();
    expect(saved()).toBeNull();
    expect(client.createCheckout).not.toHaveBeenCalled();
  });
  it.each([400, 404, 422])('clears an id-less creation handle after definitive HTTP %i refusal', async status => {
    const random = jest.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);
    try {
      const { authority, client, saved } = fixture();
      client.createCheckout.mockRejectedValueOnce(new ApiClientError('creation rejected', status));
      await expect(authority.prepare(lines)).rejects.toThrow('creation rejected');
      expect(saved()).toBeNull();
      await authority.prepare([{ ...lines[0], quantity: 2 }]);
      expect(client.createCheckout).toHaveBeenCalledTimes(2);
      expect(client.createCheckout.mock.calls[1][1]).not.toBe(client.createCheckout.mock.calls[0][1]);
    } finally { random.mockRestore(); }
  });
  it('clears a definitively rejected id-less recovery replay', async () => {
    const { authority, client, saved } = fixture();
    client.createCheckout.mockRejectedValueOnce(new ApiClientError('lost response'));
    await expect(authority.prepare(lines)).rejects.toThrow('lost response');
    const creationKey = saved()?.key;
    client.createCheckout.mockRejectedValueOnce(new ApiClientError('rejected', 422));
    await expect(authority.recover()).rejects.toThrow('rejected');
    expect(saved()).toBeNull();
    expect(client.createCheckout.mock.calls[1][1]).toBe(creationKey);
  });
  it.each([408, 409, 425, 429, 503])('retains the original id-less creation key after uncertain recovery HTTP %i', async status => {
    const { authority, client, saved } = fixture();
    client.createCheckout.mockRejectedValueOnce(new ApiClientError('lost response'));
    await expect(authority.prepare(lines)).rejects.toThrow('lost response');
    const retainedKey = saved()?.key;
    client.createCheckout.mockRejectedValueOnce(new ApiClientError('server unavailable', status));
    await expect(authority.recover()).rejects.toThrow('server unavailable');
    expect(saved()?.key).toBe(retainedKey);
    expect(client.createCheckout.mock.calls[1][1]).toBe(retainedKey);
  });
  it('rotates an idempotency key only for an explicitly forced ready QR retry', async () => {
    const random = jest.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.2).mockReturnValueOnce(0.3);
    try {
      const { authority, client, saved } = fixture();
      await authority.tender(lines, 'qrph');
      const firstKey = saved()?.tender?.key;
      client.getCheckout.mockResolvedValue(readyQr);
      const replacement: AuthorityCheckout = { ...readyQr, state: 'payment_unresolved', attempts: [...readyQr.attempts, { ...pending.attempts[0], id: 8 }] };
      client.createCheckoutAttempt.mockResolvedValueOnce(replacement);
      await authority.tender(lines, 'qrph', undefined, true);
      expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(2);
      expect(client.createCheckoutAttempt.mock.calls[1][2]).not.toBe(firstKey);
      expect(saved()?.tender?.key).toBe(client.createCheckoutAttempt.mock.calls[1][2]);
    } finally { random.mockRestore(); }
  });
  it.each(Object.entries(terminalQrStates))('does not rotate the QR key in %s state', async (state, checkout) => {
    const { authority, client, saved } = fixture();
    await authority.tender(lines, 'qrph');
    const originalKey = saved()?.tender?.key;
    client.getCheckout.mockResolvedValue(checkout);
    await authority.tender(lines, 'qrph', undefined, true);
    expect(saved()?.tender?.key).toBe(originalKey);
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
  it('discards the legacy null-product identity only after empty discovery and an attributed reason', async () => {
    const storage: CheckoutStorage = {
      load: jest.fn().mockRejectedValue(new CheckoutStorageCorruptionError('legacy basket [[null,1]]')),
      save: jest.fn(),
    };
    const { client } = fixture();
    const authority = new DurableCheckout(client as unknown as ApiClient, storage);
    await expect(authority.recover()).rejects.toThrow(/identity is unreadable/);
    await expect(authority.discardCorruptIdentity('short')).rejects.toThrow(/8 and 500/);
    client.listCheckouts.mockResolvedValueOnce({ items: [], pagination: { current_page: 1, last_page: 2, total: 1 } }).mockResolvedValueOnce({ items: [pending], pagination: { current_page: 2, last_page: 2, total: 1 } });
    await expect(authority.discardCorruptIdentity('Operator approved discard')).rejects.toThrow(/checkout records were found/);
    expect(client.listCheckouts.mock.calls.slice(-2)).toEqual([[1], [2]]);
    expect(storage.save).not.toHaveBeenCalled();
    client.listCheckouts.mockResolvedValue({ items: [], pagination: { current_page: 1, last_page: 2, total: 0 } });
    await expect(authority.discardCorruptIdentity('Operator approved discard')).resolves.toBe('Operator approved discard');
    expect(storage.save).toHaveBeenCalledWith(null);
    expect(client.abandonCheckout).not.toHaveBeenCalled();
    expect(authority.current).toBeUndefined();
    await expect(authority.prepare(lines)).resolves.toEqual(open);
    expect(authority.current?.sale).toBeNull();
  });
  it('keeps a corrupt stored identity unresolved until a discovered checkout is explicitly reattached', async () => {
    let saved: CheckoutHandle | null = null;
    const storage: CheckoutStorage = {
      load: jest.fn().mockRejectedValue(new CheckoutStorageCorruptionError('invalid')),
      save: jest.fn(async value => { saved = value; }),
    };
    const { client } = fixture();
    client.listCheckouts.mockResolvedValue({ items: [], pagination: { current_page: 1, last_page: 1, total: 0 } });
    const authority = new DurableCheckout(client as unknown as ApiClient, storage);
    await expect(authority.recover()).rejects.toThrow(/identity is unreadable/);
    await expect(authority.retire()).rejects.toThrow(/must be resolved through server recovery/);
    await expect(authority.recover('missing-id')).rejects.toThrow(/not found in server discovery/);
    await expect(authority.prepare(lines)).rejects.toThrow(/identity is unreadable/);
    expect(storage.save).not.toHaveBeenCalled();
    client.listCheckouts.mockResolvedValue({ items: [pending], pagination: { current_page: 1, last_page: 1, total: 1 } });
    await authority.recover('server-uuid');
    expect(client.recoverCheckout).toHaveBeenCalledWith('server-uuid');
    expect(saved).toMatchObject({ id: 'server-uuid', signature: '[[1,1]]' });
  });
  it('does not let a completed checkout satisfy a different payment method', async () => {
    const { authority, client, storage } = fixture();
    const completedQr: AuthorityCheckout = { ...pending, state: 'completed', sale: { id: 9, method: 'qrph', amountCentavos: 1010, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'now' } };
    await storage.save({ key: 'retained-qr', signature: '[[1,1]]', id: 'server-uuid' });
    client.getCheckout.mockResolvedValue(completedQr);
    await expect(authority.tender(lines, 'cash', '20')).rejects.toThrow(/locked/);
    expect(client.checkoutCash).not.toHaveBeenCalled();
    const cashFixture = fixture();
    const completedCash: AuthorityCheckout = { ...open, state: 'completed', sale: { id: 10, method: 'cash', amountCentavos: 1010, cashReceivedCentavos: 2000, changeAmountCentavos: 990, completedAt: 'now' } };
    await cashFixture.storage.save({ key: 'retained-cash', signature: '[[1,1]]', id: 'server-uuid' });
    cashFixture.client.getCheckout.mockResolvedValue(completedCash);
    await expect(cashFixture.authority.tender(lines, 'qrph')).rejects.toThrow(/locked/);
    expect(cashFixture.client.createCheckoutAttempt).not.toHaveBeenCalled();
  });
  it.each([408, 409, 425, 429])('recovers QR attempt creation status %i and retains its idempotency key', async status => {
    const { authority, client, saved } = fixture();
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('uncertain', status));
    await expect(authority.tender(lines, 'qrph')).rejects.toThrow('uncertain');
    expect(client.recoverCheckout).toHaveBeenCalledWith('server-uuid');
    const originalKey = saved()!.tender!.key;
    expect(authority.progress.uncertainTender).toBe('qrph');
    await authority.tender(lines, 'qrph');
    expect(client.createCheckoutAttempt.mock.calls[1]).toEqual(client.createCheckoutAttempt.mock.calls[0]);
    expect(saved()?.tender).toMatchObject({ key: originalKey, attemptId: 7 });
  });
  it('releases the QR tender key only for a definitive refusal', async () => {
    const { authority, client, saved } = fixture();
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('invalid', 422));
    await expect(authority.tender(lines, 'qrph')).rejects.toThrow('invalid');
    expect(client.recoverCheckout).not.toHaveBeenCalled();
    expect(saved()?.tender).toBeUndefined();
  });
  it.each(['', '1e3', '+20', ' 20', '20 ', '20.001', '2,000', '-20'])('rejects cash grammar %j without cash I/O', async input => {
    const { authority, client } = fixture();
    await expect(authority.tender(lines, 'cash', input)).rejects.toThrow();
    expect(client.checkoutCash).not.toHaveBeenCalled();
  });
  it('recovers an ambiguous QR create by stored checkout id, without a duplicate attempt', async () => {
    const { authority, client, saved } = fixture();
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('lost response'));
    await expect(authority.tender(lines, 'qrph')).rejects.toThrow('lost response');
    expect(client.recoverCheckout).toHaveBeenCalledWith('server-uuid');
    expect(authority.retainedPayment()).toBeUndefined();
    client.getCheckout.mockResolvedValue(pending);
    await authority.tender(lines, 'qrph');
    expect(authority.retainedPayment()?.status).toBe('pending');
    expect(client.createCheckoutAttempt.mock.calls[1]).toEqual(client.createCheckoutAttempt.mock.calls[0]);
    await authority.tender(lines, 'qrph');
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(2);
    expect(saved()?.id).toBe('server-uuid');
  });
  it.each(['prepare', 'stored recovery', 'explicit recovery'] as const)('keeps Q2 uncertain through %s when only Q1 is recovered', async path => {
    const { authority, client, storage, saved } = fixture();
    await authority.tender(lines, 'qrph');
    client.getCheckout.mockResolvedValue(readyQr);
    client.recoverCheckout.mockResolvedValue(readyQr);
    await authority.recover();
    client.createCheckoutAttempt.mockImplementationOnce(async () => {
      expect(saved()!.tender).toMatchObject({ previousAttemptIds: [7] });
      expect(saved()!.tender!.attemptId).toBeUndefined();
      throw new ApiClientError('Q2 response lost');
    });
    await expect(authority.tender(lines, 'qrph', undefined, true)).rejects.toThrow('Q2 response lost');
    const q2 = JSON.parse(JSON.stringify(saved()!.tender!));
    expect(q2).toMatchObject({ previousAttemptIds: [7] });
    expect(q2.attemptId).toBeUndefined();
    expect(q2.key).not.toBe(client.createCheckoutAttempt.mock.calls[0][2]);
    const restarted = new DurableCheckout(client as unknown as ApiClient, storage);
    if (path === 'prepare') await restarted.prepare(lines);
    else await restarted.recover(path === 'explicit recovery' ? open.id : undefined);
    expect(restarted.progress.uncertainTender).toBe('qrph');
    expect(restarted.retainedPayment()).toBeUndefined();
    await expect(restarted.tender(lines, 'cash', '20')).rejects.toThrow(/previous tender/);
    await expect(restarted.refresh('7')).rejects.toThrow(/saved submission/);
    await expect(restarted.revalidate()).rejects.toThrow(/previous payment/);
    await expect(restarted.abandon('Customer left the shop')).rejects.toThrow(/previous payment/);
    await expect(restarted.retire()).rejects.toThrow(/submitted payment/);
    expect(saved()!.tender).toEqual(q2);
    expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(client.refreshCheckoutAttempt).not.toHaveBeenCalled();
    expect(client.revalidateCheckout).not.toHaveBeenCalled();
    expect(client.abandonCheckout).not.toHaveBeenCalled();
    const second: AuthorityCheckout = { ...readyQr, state: 'payment_unresolved', attempts: [...readyQr.attempts, { ...pending.attempts[0], id: 8, qrPayload: 'Q2' }] };
    client.createCheckoutAttempt.mockResolvedValueOnce(second);
    await restarted.tender(lines, 'qrph', undefined, true);
    expect(client.createCheckoutAttempt.mock.calls[2]).toEqual(client.createCheckoutAttempt.mock.calls[1]);
    expect(saved()!.tender).toMatchObject({ key: q2.key, previousAttemptIds: [7], attemptId: 8 });
    expect(restarted.progress.uncertainTender).toBeUndefined();
    expect(restarted.retainedPayment()).toMatchObject({ id: '8', status: 'pending', qrPayload: 'Q2' });
    const again = new DurableCheckout(client as unknown as ApiClient, storage);
    client.recoverCheckout.mockResolvedValue(second);
    await again.recover();
    expect(again.retainedPayment()).toMatchObject({ id: '8', status: 'pending' });
    expect(again.progress.uncertainTender).toBeUndefined();
  });
  it.each([400, 404, 422])('keeps an uncertain Q2 key after a replay is refused with HTTP %i', async status => {
    const { authority, client, storage, saved } = fixture();
    await authority.tender(lines, 'qrph');
    client.getCheckout.mockResolvedValue(readyQr); client.recoverCheckout.mockResolvedValue(readyQr);
    await authority.recover();
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('Q2 response lost'));
    await expect(authority.tender(lines, 'qrph', undefined, true)).rejects.toThrow('Q2 response lost');
    const before = JSON.parse(JSON.stringify(saved()!.tender!));
    const restarted = new DurableCheckout(client as unknown as ApiClient, storage);
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('retry refused', status));
    await expect(restarted.tender(lines, 'qrph', undefined, true)).rejects.toThrow('retry refused');
    expect(saved()!.tender).toEqual(before);
    expect(restarted.progress.uncertainTender).toBe('qrph');
    expect(restarted.retainedPayment()).toBeUndefined();
    expect(client.createCheckoutAttempt.mock.calls[2]).toEqual(client.createCheckoutAttempt.mock.calls[1]);
  });
  it('replays the saved Q2 payload after the current quote changes without binding a historical response', async () => {
    const { authority, client, storage, saved } = fixture();
    await authority.tender(lines, 'qrph');
    client.getCheckout.mockResolvedValue(readyQr);
    client.recoverCheckout.mockResolvedValue(readyQr);
    await authority.recover();
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('Q2 response lost'));
    await expect(authority.tender(lines, 'qrph', undefined, true)).rejects.toThrow('Q2 response lost');
    const q2 = JSON.parse(JSON.stringify(saved()!.tender!));
    const updated: AuthorityCheckout = { ...readyQr, revision: 2, amountCentavos: 1200, items: [{ ...open.items[0], unitPriceCentavos: 1200 }] };
    client.getCheckout.mockResolvedValue(updated);
    client.recoverCheckout.mockResolvedValue(updated);
    client.createCheckoutAttempt.mockResolvedValueOnce(readyQr);
    const restarted = new DurableCheckout(client as unknown as ApiClient, storage);
    await expect(restarted.tender(lines, 'qrph', undefined, true)).rejects.toThrow(/not been identified/);
    expect(saved()!.tender).toEqual(q2);
    expect(restarted.progress.uncertainTender).toBe('qrph');
    const second: AuthorityCheckout = { ...readyQr, state: 'payment_unresolved', attempts: [...readyQr.attempts, { ...pending.attempts[0], id: 8 }] };
    client.createCheckoutAttempt.mockResolvedValueOnce(second);
    await restarted.tender(lines, 'qrph');
    expect(client.createCheckoutAttempt.mock.calls[2]).toEqual(client.createCheckoutAttempt.mock.calls[1]);
    expect(client.createCheckoutAttempt.mock.calls[3]).toEqual(client.createCheckoutAttempt.mock.calls[1]);
    expect(saved()!.tender).toMatchObject({ key: q2.key, attemptId: 8 });
  });
  it('uses current Q2 evidence when an exact replay returns its older pending snapshot', async () => {
    const { authority, client, storage } = fixture();
    await authority.tender(lines, 'qrph');
    client.getCheckout.mockResolvedValue(readyQr); client.recoverCheckout.mockResolvedValue(readyQr);
    await authority.recover();
    client.createCheckoutAttempt.mockRejectedValueOnce(new ApiClientError('Q2 response lost'));
    await expect(authority.tender(lines, 'qrph', undefined, true)).rejects.toThrow('Q2 response lost');
    const second: AuthorityCheckout = { ...readyQr, state: 'payment_unresolved', attempts: [...readyQr.attempts, { ...pending.attempts[0], id: 8 }] };
    const completed: AuthorityCheckout = { ...second, state: 'completed', attempts: [second.attempts[0], { ...second.attempts[1], status: 'paid', financialStatus: 'paid', firstVerifiedOutcome: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 1010, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' } };
    const restarted = new DurableCheckout(client as unknown as ApiClient, storage);
    client.getCheckout.mockResolvedValue(completed);
    client.createCheckoutAttempt.mockResolvedValueOnce(second);
    await restarted.tender(lines, 'qrph');
    expect(restarted.current?.state).toBe('completed');
    expect(restarted.progress).not.toMatchObject({ recoveryFailure: 'inconsistent' });
    expect(restarted.retainedPayment()).toMatchObject({ id: '8', status: 'paid' });
  });
  it('keeps a legacy submission unresolved until its exact key response supplies its attempt', async () => {
    const { client, storage, saved } = fixture();
    const legacy: CheckoutHandle = { id: open.id, key: 'legacy-creation', signature: '[[1,1]]', tender: { key: 'legacy-tender', signature: JSON.stringify(['qrph', { revision: 1, acceptedAmountCentavos: 1010 }]) } };
    await storage.save(legacy);
    client.getCheckout.mockResolvedValue(pending); client.recoverCheckout.mockResolvedValue(pending);
    const restarted = new DurableCheckout(client as unknown as ApiClient, storage);
    await restarted.recover();
    expect(restarted.progress.uncertainTender).toBe('qrph');
    expect(restarted.retainedPayment()).toBeUndefined();
    await restarted.tender(lines, 'qrph');
    expect(client.createCheckoutAttempt).toHaveBeenCalledWith(open.id, { revision: 1, acceptedAmountCentavos: 1010 }, 'legacy-tender');
    expect(saved()!.tender).toMatchObject({ key: 'legacy-tender', attemptId: 7 });
    expect(restarted.retainedPayment()).toMatchObject({ id: '7', status: 'pending' });
  });
  it('projects only the selected QR attempt instead of assigning a newer sale to a historical QR', () => {
    const completed: AuthorityCheckout = { ...readyQr, state: 'completed', attempts: [...readyQr.attempts, { ...pending.attempts[0], id: 8, status: 'paid', financialStatus: 'paid', firstVerifiedOutcome: 'paid' }], sale: { id: 9, method: 'qrph', amountCentavos: 1010, cashReceivedCentavos: null, changeAmountCentavos: null, completedAt: 'today' } };
    expect(checkoutPayment(completed, 7)).toMatchObject({ id: '7', status: 'failed' });
    expect(checkoutPayment(completed, 8)).toMatchObject({ id: '8', status: 'paid' });
    expect(checkoutPayment({ ...completed, attempts: [{ ...pending.attempts[0] }, completed.attempts[1]] }, 7)).toMatchObject({ id: '7', status: 'pending' });
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
  it('refuses a basket changed after checkout opened with its own code instead of payment uncertainty', async () => {
    const { authority, client } = fixture();
    await authority.prepare(lines);
    expect(client.checkoutCash).not.toHaveBeenCalled();
    // The cashier edits the cart after the durable checkout was opened, before
    // any tender exists. The refusal must not read as "money may be recorded".
    await expect(authority.exclusive(() => authority.tender([{ ...lines[0], quantity: 2 }], 'cash', '100.00')))
      .rejects.toMatchObject({ status: 409, code: 'checkout_basket_diverged' });
    expect(authority.basketDivergedFrom([{ ...lines[0], quantity: 2 }])).toBe(true);
    expect(authority.basketDivergedFrom(lines)).toBe(false);
    expect(authority.progress.recoveryFailure).toBeUndefined();
    expect(authority.progress.uncertainTender).toBeUndefined();
    expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(client.createCheckout).toHaveBeenCalledTimes(1);
    // The retained basket is still the one the purchase was opened for, and it
    // stays recoverable: going back to the original basket clears the refusal.
    await authority.prepare(lines);
    expect(authority.basketDivergedFrom(lines)).toBe(false);
    expect(client.createCheckout).toHaveBeenCalledTimes(1);
  });
  it('does not throw from the render-facing divergence check for a cart that cannot be validated', async () => {
    const { authority } = fixture();
    await authority.prepare(lines);
    const malformed = [{ ...lines[0], product: { ...lines[0].product, id: 'prd-001' } }];
    expect(authority.basketDivergedFrom(malformed)).toBe(false);
  });
  it('does not clear a QR key when a verification result is abandoned', async () => {
    const { authority, client, saved } = fixture();
    await authority.tender(lines, 'qrph');
    const tenderKey = saved()?.tender?.key;
    const abandoned: AuthorityCheckout = { ...pending, state: 'abandoned', attempts: [{ ...pending.attempts[0], status: 'non_payable', financialStatus: 'expired', firstVerifiedOutcome: 'non_payable' }] };
    client.refreshCheckoutAttempt.mockResolvedValue(abandoned);
    await authority.refresh('7');
    expect(authority.machine?.state).toBe('abandoned');
    expect(saved()?.tender?.key).toBe(tenderKey);
  });
  it('requires submission recovery before revalidating an uncorrelated QR key', async () => {
    const handle: CheckoutHandle = { id: 'server-uuid', key: 'creation-key', signature: '[[1,1]]', tender: { key: 'retained-qr-key', signature: JSON.stringify(['qrph', { revision: 1, acceptedAmountCentavos: 1010 }]), previousAttemptIds: [] } };
    let saved: CheckoutHandle | null = handle;
    const storage: CheckoutStorage = { load: async () => saved, save: async value => { saved = value; } };
    const { client } = fixture();
    client.recoverCheckout.mockResolvedValue(open);
    client.revalidateCheckout.mockResolvedValue(pending);
    const authority = new DurableCheckout(client as unknown as ApiClient, storage);
    await expect(authority.revalidate()).rejects.toThrow(/previous payment/);
    expect(authority.progress.uncertainTender).toBe('qrph');
    expect(client.revalidateCheckout).not.toHaveBeenCalled();
    expect(saved?.tender?.key).toBe('retained-qr-key');
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
  it('refuses quote review, abandonment, and identity retirement while reconciliation is locked', async () => {
    const { authority, client, saved } = fixture();
    await authority.tender(lines, 'qrph');
    client.recoverCheckout.mockResolvedValue(paidUnfulfilled);
    client.refreshCheckoutAttempt.mockResolvedValue(paidUnfulfilled);
    await authority.refresh('7');
    expect(authority.machine?.state).toBe('paid-but-unfulfilled');
    expect(authority.machine?.reconciliationRequired).toBe(true);

    await expect(authority.revalidate()).rejects.toThrow(/administrator reconciliation/);
    expect(client.revalidateCheckout).not.toHaveBeenCalled();
    await expect(authority.abandon('administrator reviewed externally')).rejects.toThrow(/administrator reconciliation/);
    expect(client.abandonCheckout).not.toHaveBeenCalled();
    await expect(authority.retire()).rejects.toThrow(/administrator reconciliation/);
    expect(saved()).not.toBeNull();
  });
  it('fails closed instead of accepting a stale observation that clears reconciliation', async () => {
    const { authority, client } = fixture();
    await authority.tender(lines, 'qrph');
    client.recoverCheckout.mockResolvedValue(paidUnfulfilled);
    client.refreshCheckoutAttempt.mockResolvedValue(paidUnfulfilled);
    await authority.refresh('7');

    client.recoverCheckout.mockResolvedValue(pending);
    await expect(authority.recover()).rejects.toThrow(/reconciliation lock/);
    expect(authority.machine?.reconciliationRequired).toBe(true);
    expect(canAcceptCheckoutTender(authority.machine)).toBe(false);
    expect(authority.progress.recoveryFailure).toBe('inconsistent');
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
  it.each(['prepare', 'stored recovery', 'explicit recovery'] as const)('accepts cash after %s observes the retained QR as non-payable', async path => {
    const { authority, client, storage, saved } = fixture();
    await authority.tender(lines, 'qrph');
    const qrKey = saved()!.tender!.key;
    client.getCheckout.mockResolvedValue(readyQr);
    client.recoverCheckout.mockResolvedValue(readyQr);
    const restarted = new DurableCheckout(client as unknown as ApiClient, storage);
    if (path === 'prepare') await restarted.prepare(lines);
    else await restarted.recover(path === 'explicit recovery' ? open.id : undefined);
    expect(canAcceptCheckoutTender(restarted.machine)).toBe(true);
    expect(saved()!.tender!.key).toBe(qrKey);
    client.checkoutCash.mockResolvedValue(cashAfterQr);
    await restarted.tender(lines, 'cash', '20');
    expect(client.checkoutCash).toHaveBeenCalledTimes(1);
    expect(client.checkoutCash).toHaveBeenCalledWith(open.id, { revision: open.revision, acceptedAmountCentavos: 1010, cashReceivedCentavos: 2000 }, expect.any(String));
    expect(saved()!.tender!.key).not.toBe(qrKey);
    expect(restarted.machine?.state).toBe('completed');
    expect(restarted.machine?.attempts[0].finalEvidence?.outcome).toBe('non-payable');
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
  it.each(['refresh', 'revalidate'] as const)('releases a resolved QR key through %s before a cash confirmation', async action => {
    const { authority, client, saved } = fixture();
    await authority.tender(lines, 'qrph');
    client.getCheckout.mockResolvedValue(readyQr);
    client.recoverCheckout.mockResolvedValue(readyQr);
    client.refreshCheckoutAttempt.mockResolvedValue(readyQr);
    client.revalidateCheckout.mockResolvedValue(readyQr);
    if (action === 'refresh') await authority.refresh('7');
    else await authority.revalidate();
    expect(saved()!.tender).toBeUndefined();
    client.checkoutCash.mockResolvedValue(cashAfterQr);
    await authority.tender(lines, 'cash', '20');
    expect(authority.machine?.state).toBe('completed');
    expect(client.checkoutCash).toHaveBeenCalledTimes(1);
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
  it('preserves an uncertain cash retry key after a resolved QR, including across restart and forced QR selection', async () => {
    const { authority, client, storage, saved } = fixture();
    await authority.tender(lines, 'qrph');
    client.getCheckout.mockResolvedValue(readyQr);
    client.recoverCheckout.mockResolvedValue(readyQr);
    client.checkoutCash.mockRejectedValueOnce(new ApiClientError('cash response lost'));
    await expect(authority.tender(lines, 'cash', '20')).rejects.toThrow('cash response lost');
    const cashKey = saved()!.tender!.key;
    const restarted = new DurableCheckout(client as unknown as ApiClient, storage);
    await restarted.recover();
    expect(restarted.progress).toMatchObject({ uncertainTender: 'cash', cashInput: '20.00' });
    client.refreshCheckoutAttempt.mockResolvedValue(readyQr);
    await restarted.refresh('7');
    expect(saved()!.tender!.key).toBe(cashKey);
    await expect(restarted.revalidate()).rejects.toThrow(/previous payment/);
    await expect(restarted.abandon('Customer left the shop')).rejects.toThrow(/previous payment/);
    expect(client.revalidateCheckout).not.toHaveBeenCalled();
    expect(client.abandonCheckout).not.toHaveBeenCalled();
    await expect(restarted.tender(lines, 'qrph', undefined, true)).rejects.toThrow(/previous tender/);
    await expect(restarted.tender(lines, 'cash', '30')).rejects.toThrow(/previous tender/);
    expect(saved()!.tender!.key).toBe(cashKey);
    client.checkoutCash.mockResolvedValue(cashAfterQr);
    await restarted.tender(lines, 'cash', '20');
    expect(client.checkoutCash).toHaveBeenCalledTimes(2);
    expect(client.checkoutCash.mock.calls[1]).toEqual(client.checkoutCash.mock.calls[0]);
    expect(saved()!.tender!.key).toBe(cashKey);
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
  it.each(Object.entries(terminalQrStates))('keeps the retained QR key and refuses cash when the authority is %s', async (_state, checkout) => {
    const { authority, client, saved } = fixture();
    await authority.tender(lines, 'qrph');
    const qrKey = saved()!.tender!.key;
    client.getCheckout.mockResolvedValue(checkout);
    await expect(authority.tender(lines, 'cash', '20')).rejects.toThrow(/unresolved or checkout is locked/);
    expect(saved()!.tender!.key).toBe(qrKey);
    expect(client.checkoutCash).not.toHaveBeenCalled();
    expect(client.createCheckoutAttempt).toHaveBeenCalledTimes(1);
  });
  it('reuses the resolved QR key unless a new QR payment is explicitly requested', async () => {
    const { authority, client, saved } = fixture();
    await authority.tender(lines, 'qrph');
    const qrKey = saved()!.tender!.key;
    client.getCheckout.mockResolvedValue(readyQr);
    client.createCheckoutAttempt.mockResolvedValue(readyQr);
    await authority.tender(lines, 'qrph');
    expect(saved()!.tender!.key).toBe(qrKey);
    expect(client.createCheckoutAttempt.mock.calls[1]).toEqual(client.createCheckoutAttempt.mock.calls[0]);
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
