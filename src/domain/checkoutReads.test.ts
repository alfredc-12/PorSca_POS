import { CheckoutReads } from './checkoutReads';
describe('provider-local read flights and handoff', () => {
  it('shares only overlapping same-generation work and releases rejected promises', async () => {
    const reads = new CheckoutReads(); let reject!: (error: Error) => void;
    const read = jest.fn(() => new Promise<number>((_resolve, fail) => { reject = fail; }));
    const first = reads.run('sales', 0, read); const second = reads.run('sales', 0, read);
    expect(first).toBe(second); expect(read).toHaveBeenCalledTimes(1);
    reject(new Error('offline')); await expect(first).rejects.toThrow('offline');
    expect(await reads.run('sales', 0, async () => 3)).toBe(3);
  });
  it('separates pre-commit reads and consumes history only once for the current sale', async () => {
    const reads = new CheckoutReads(); let finish!: (value: number) => void;
    const old = reads.run('sales', reads.generation, () => new Promise<number>(resolve => { finish = resolve; }));
    reads.observeSale('9'); const generation = reads.generation;
    expect(await reads.run('sales', generation, async () => 2)).toBe(2);
    reads.markHistoryReady(0, '9'); expect(reads.consumeHistoryHandoff()).toBe(false);
    reads.markHistoryReady(generation, '9'); expect(reads.consumeHistoryHandoff()).toBe(true); expect(reads.consumeHistoryHandoff()).toBe(false);
    reads.markHistoryReady(generation, '9'); reads.observeSale('10'); expect(reads.consumeHistoryHandoff()).toBe(false);
    finish(1); expect(await old).toBe(1);
    expect(new CheckoutReads().consumeHistoryHandoff()).toBe(false);
  });
});
