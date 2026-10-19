import { createDiagnostics, FailureRecord, FailureStore, MAX_RECORDS, PERSISTED_RECORDS } from '@/src/observability/diagnostics';

function memoryStore(initial: FailureRecord[] = []): FailureStore & { saved: FailureRecord[] } {
  let current = initial;
  const store = {
    saved: [] as FailureRecord[],
    async load() { return current; },
    async save(records: FailureRecord[]) { current = records; store.saved = records; },
  };
  return store;
}

function record(index: number): FailureRecord {
  return { reference: `PRS-${String(index).padStart(6, '0')}`, at: new Date(index * 1000).toISOString(), screen: 'cash-sale', message: `failure ${index}` };
}

describe('failure diagnostics', () => {
  it('keeps the newest 25 in memory and the newest 5 across restarts', async () => {
    const store = memoryStore();
    const diagnostics = createDiagnostics({ store, warn: () => undefined });

    for (let index = 0; index < 30; index += 1) diagnostics.record(record(index));
    await diagnostics.flush();

    expect(diagnostics.list()).toHaveLength(MAX_RECORDS);
    expect(diagnostics.list()[0].reference).toBe(record(29).reference);
    expect(store.saved).toHaveLength(PERSISTED_RECORDS);
    expect(store.saved[0].reference).toBe(record(29).reference);
    expect(store.saved[PERSISTED_RECORDS - 1].reference).toBe(record(25).reference);
  });

  it('restores only the persisted records, without duplicates', async () => {
    const store = memoryStore([record(2), record(1)]);
    const diagnostics = createDiagnostics({ store, warn: () => undefined });

    await diagnostics.hydrate();
    diagnostics.record(record(3));
    await diagnostics.hydrate();

    expect(diagnostics.list().map((entry) => entry.reference)).toEqual([record(3).reference, record(2).reference, record(1).reference]);
    expect(diagnostics.find(record(2).reference)?.message).toBe('failure 2');
  });

  it('redacts sensitive keys, truncates long strings, and keeps the server message', async () => {
    const store = memoryStore();
    const diagnostics = createDiagnostics({ store, warn: () => undefined });
    const long = 'x'.repeat(900);

    diagnostics.record({
      reference: 'PRS-4K7Q2M',
      at: '2026-10-04T00:00:00.000Z',
      screen: 'cash-sale',
      status: 500,
      code: 'server_error',
      message: 'SQLSTATE[23000]: Integrity constraint violation',
      details: { password: 'hunter2', api_token: 'tok_live_123', Authorization: 'Bearer abc', nested: { secret: 's', keep: 'visible' }, long, list: [{ token: 'x' }] },
    });

    const stored = diagnostics.list()[0];
    expect(stored.message).toContain('SQLSTATE[23000]');
    expect(stored.details).toEqual({
      password: '[redacted]',
      api_token: '[redacted]',
      Authorization: '[redacted]',
      nested: { secret: '[redacted]', keep: 'visible' },
      long: `${'x'.repeat(500)}…`,
      list: [{ token: '[redacted]' }],
    });
  });

  it('writes one console line per failure and survives a failing store', async () => {
    const warn = jest.fn();
    const store: FailureStore = { load: jest.fn().mockRejectedValue(new Error('no store')), save: jest.fn().mockRejectedValue(new Error('no store')) };
    const diagnostics = createDiagnostics({ store, warn });

    await expect(diagnostics.hydrate()).resolves.toBeUndefined();
    diagnostics.record(record(1));
    await expect(diagnostics.flush()).resolves.toBeUndefined();

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toContain('PRS-000001');
  });

  it('describes and records a wire failure through one call', async () => {
    const store = memoryStore();
    const diagnostics = createDiagnostics({ store, warn: () => undefined, now: () => new Date('2026-10-04T10:00:00.000Z') });

    const failure = diagnostics.describeAndRecord(
      { status: 500, message: 'Illuminate\\Database\\QueryException', details: { exception: 'Illuminate\\Database\\QueryException' } },
      { screen: 'cash-sale' },
    );
    await diagnostics.flush();

    expect(failure.body).not.toContain('Illuminate');
    expect(failure.reference).toMatch(/^PRS-/);
    expect(diagnostics.list()[0]).toMatchObject({ reference: failure.reference, at: '2026-10-04T10:00:00.000Z', screen: 'cash-sale', status: 500 });
  });
});
