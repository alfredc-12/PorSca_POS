/** Provider-local overlapping reads only; never a persisted financial cache. */
export class CheckoutReads {
  constructor(readonly owner?: object) {}
  generation = 0;
  private saleId?: string;
  private handoff?: { saleId: string; generation: number };
  private flights = new Map<string, Promise<unknown>>();
  dispose() { this.generation += 1; this.handoff = undefined; }
  observeSale(id: string) {
    if (this.saleId === id) return;
    this.saleId = id;
    this.generation += 1;
    this.handoff = undefined;
  }
  run<T>(name: string, generation: number, read: () => Promise<T>): Promise<T> {
    const key = `${generation}:${name}`;
    const pending = this.flights.get(key);
    if (pending) return pending as Promise<T>;
    const promise = read().finally(() => { if (this.flights.get(key) === promise) this.flights.delete(key); });
    this.flights.set(key, promise);
    return promise;
  }
  markHistoryReady(generation: number, saleId: string) {
    if (this.generation === generation && this.saleId === saleId) this.handoff = { generation, saleId };
  }
  consumeHistoryHandoff() {
    const valid = this.handoff?.generation === this.generation && this.handoff?.saleId === this.saleId;
    this.handoff = undefined;
    return Boolean(valid);
  }
}
