import { ApiClient, ApiClientError, Payment } from '@/src/api/client';
import { AuthorityCheckout, CheckoutTender } from '@/src/api/checkoutAuthority';
import { CartLine, Sale } from '@/src/types';
import { canAcceptCheckoutTender, CheckoutMachine, checkoutCashTender, transitionCheckout } from './checkoutMachine';
import { authorityObservation } from './checkoutAuthorityAdapter';

export type CheckoutHandle = { key: string; signature: string; id?: string; tender?: { key: string; signature: string } };
export type CheckoutStorage = { load(): Promise<CheckoutHandle | null>; save(handle: CheckoutHandle | null): Promise<void> };
const key = () => `mobile-v3-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const signature = (lines: CartLine[]) => JSON.stringify(lines.map(l => [Number(l.product.id), l.quantity]).sort((a, b) => a[0] - b[0]));

/** A single device purchase handle; all financial state is read from Laravel. */
export class DurableCheckout {
  private observed?: AuthorityCheckout;
  machine?: CheckoutMachine;
  get current() { return this.observed; }
  private set current(checkout: AuthorityCheckout | undefined) {
    if (!checkout) { this.observed = undefined; this.machine = undefined; return; }
    const observation = authorityObservation(checkout);
    if (!this.machine || this.machine.id !== checkout.id) this.machine = observation;
    else {
      const transition = transitionCheckout(this.machine, { type: 'authority-observed', checkout: observation });
      if (!transition.ok) throw new ApiClientError(transition.reason);
      this.machine = transition.checkout;
    }
    this.observed = checkout;
  }
  private handle?: CheckoutHandle;
  private loaded = false;
  private busy = false;
  constructor(private client: ApiClient, private storage: CheckoutStorage) {}

  retainedPayment() {
    if (!this.observed?.attempts.some(a => a.method === 'qrph')) return undefined;
    return checkoutPayment(this.observed);
  }

  async exclusive<T>(operation: () => Promise<T>): Promise<T> {
    if (this.busy) throw new ApiClientError('Checkout operation is already in progress.');
    this.busy = true;
    try { return await operation(); } finally { this.busy = false; }
  }
  private async load() {
    if (!this.loaded) { this.handle = await this.storage.load() ?? undefined; this.loaded = true; }
  }
  private async persist() { await this.storage.save(this.handle ?? null); }
  async recover(id?: string) {
    await this.load();
    if (id) {
      if (this.handle && this.handle.id !== id) throw new ApiClientError('Resolve the device purchase before recovering another checkout.');
      const checkout = await this.client.recoverCheckout(id);
      this.handle ??= { id, key: key(), signature: JSON.stringify(checkout.items.map(i => [i.productId, i.quantity]).sort((a,b) => a[0]-b[0])) };
      await this.persist();
      this.current = checkout;
    } else if (this.handle) {
      if (!this.handle.id) {
        const items = (JSON.parse(this.handle.signature) as number[][]).map(([productId, quantity]) => ({ productId, quantity }));
        this.current = await this.client.createCheckout(items, this.handle.key);
        this.handle.id = this.current.id; await this.persist();
      }
      this.current = await this.client.recoverCheckout(this.handle.id!);
    }
    return this.current;
  }
  async prepare(lines: CartLine[]) {
    await this.load();
    const sig = signature(lines);
    if (this.handle && this.handle.signature !== sig) throw new ApiClientError('Recover or abandon the original device purchase before changing its basket.', 409, 'checkout_recovery_required');
    if (!this.handle) {
      this.handle = { key: key(), signature: sig };
      await this.persist(); // save before I/O, including a lost creation response
    }
    if (!this.handle.id) {
      await this.persist();
      const items = lines.map(l => ({ productId: Number(l.product.id), quantity: l.quantity }));
      if (items.some(i => !Number.isSafeInteger(i.productId) || i.productId <= 0)) throw new ApiClientError('Products require server identities.');
      this.current = await this.client.createCheckout(items, this.handle.key);
      this.handle.id = this.current.id;
      await this.persist();
    } else this.current = await this.client.getCheckout(this.handle.id);
    return this.current!;
  }
  async tender(lines: CartLine[], method: 'cash' | 'qrph', cashInput?: string) {
    const checkout = await this.prepare(lines);
    if (this.machine?.state === 'completed' && !this.machine.reconciliationRequired && checkout.sale) return checkout;
    if (!canAcceptCheckoutTender(this.machine)) {
      if (method === 'qrph' && this.machine?.attempts.some(a => a.method === 'qr')) return checkout;
      throw new ApiClientError('QR Ph payment is unresolved or checkout is locked. Recover it before recording cash.', 409, 'qr_payment_unresolved');
    }
    const localAmount = lines.reduce((sum, l) => sum + Math.round(l.product.price * 100) * l.quantity, 0);
    const changedSnapshot = checkout.items.some(item => !lines.some(line => Number(line.product.id) === item.productId && line.quantity === item.quantity && Math.round(line.product.price * 100) === item.unitPriceCentavos));
    if (checkout.amountCentavos !== localAmount || changedSnapshot) throw new ApiClientError('Review the authoritative quote before confirming payment.', 409, 'revalidation_required');
    const tender: CheckoutTender = { revision: checkout.revision, acceptedAmountCentavos: checkout.amountCentavos };
    if (method === 'cash') {
      const cash = checkoutCashTender(cashInput ?? '', checkout.amountCentavos);
      if (cash.kind !== 'sufficient' || cash.amountCentavos > 4294967295) throw new ApiClientError('Enter valid, sufficient cash.');
      tender.cashReceivedCentavos = cash.amountCentavos;
    }
    const sig = JSON.stringify([method, tender]);
    if (this.handle!.tender && this.handle!.tender.signature !== sig) throw new ApiClientError('Recover the previous tender before changing payment.', 409, 'checkout_recovery_required');
    if (!this.handle!.tender) this.handle!.tender = { key: key(), signature: sig };
    await this.persist();
    try {
      this.current = method === 'cash'
        ? await this.client.checkoutCash(checkout.id, tender, this.handle!.tender!.key)
        : await this.client.createCheckoutAttempt(checkout.id, tender, this.handle!.tender!.key);
      return this.current;
    } catch (error) {
      if (method === 'qrph' && (!(error instanceof ApiClientError) || error.status === undefined || error.status >= 500 || error.status === 408)) {
        try {
          const recovered = await this.client.recoverCheckout(checkout.id);
          this.current = recovered;
          if (recovered.attempts.some(a => a.method === 'qrph')) return recovered;
        } catch { /* Keep the durable id and exact key for explicit retry/recovery. */ }
      }
      // Definitive validation refusal has no effect. Unknown responses retain the exact key.
      if (error instanceof ApiClientError && (error.status === 422 || error.status === 409)) {
        this.handle!.tender = undefined; await this.persist();
      }
      throw error;
    }
  }
  async refresh(attemptId: string) {
    await this.load();
    if (!this.handle?.id) throw new ApiClientError('Recover the checkout before checking payment.');
    try { this.current = await this.client.refreshCheckoutAttempt(this.handle.id, Number(attemptId)); }
    catch (error) {
      // A failed verification is reversible uncertainty, never non-payability.
      if (this.machine) {
        this.machine = transitionCheckout(this.machine, { type: 'verification-failed', attemptId, reason: 'transport' }).checkout;
      }
      if (this.observed && this.machine?.attempts.find(a => a.id === attemptId)?.payment === 'unknown') {
        this.observed = { ...this.observed, attempts: this.observed.attempts.map(a => String(a.id) === attemptId ? { ...a, status: 'unknown' } : a) };
      }
      throw error;
    }
    if (this.current.attempts.every(a => a.status === 'non_payable')) {
      this.handle.tender = undefined; await this.persist();
    }
    return this.current;
  }
  async revalidate() {
    await this.recover();
    if (!this.current) throw new ApiClientError('No checkout to revalidate.');
    this.current = await this.client.revalidateCheckout(this.current.id);
    this.handle!.tender = undefined; await this.persist();
    return this.current;
  }
  async abandon(reason: string) {
    await this.recover();
    if (!this.current) throw new ApiClientError('No checkout to abandon.');
    this.current = await this.client.abandonCheckout(this.current.id, reason);
    if (this.current.state === 'abandoned') await this.retire();
  }
  async retire() { await this.storage.save(null); this.handle = undefined; this.current = undefined; }
}

/** Compatibility seam only: never infer sale success from an attempt's paid status. */
export function checkoutPayment(checkout: AuthorityCheckout): Payment {
  const attempt = [...checkout.attempts].reverse().find(a => a.method === 'qrph');
  if (!attempt) throw new ApiClientError('No QR attempt found.');
  const machine = authorityObservation(checkout);
  const payment = machine.attempts.find(a => a.id === String(attempt.id))!.payment;
  const status = machine.state === 'paid-but-unfulfilled' ? 'paid_unfulfilled' : machine.reconciliationRequired ? 'unknown'
    : machine.state === 'completed' && machine.saleId ? 'paid'
      : payment === 'non-payable' ? 'failed' : payment === 'unknown' ? 'unknown' : 'pending';
  return { id: String(attempt.id), status, amount: attempt.amountCentavos / 100, qrPayload: attempt.qrPayload ?? undefined, saleId: checkout.sale ? String(checkout.sale.id) : undefined, reservationExpiresAt: attempt.reservation?.expiresAt ?? undefined };
}
export function checkoutSale(checkout: AuthorityCheckout, lines: CartLine[]): Sale {
  const sale = checkout.sale;
  if (!sale) throw new ApiClientError('The server has not recorded a sale.');
  return { id: String(sale.id), items: lines, total: sale.amountCentavos / 100, paymentMethod: sale.method, status: 'paid', createdAt: sale.completedAt, cashReceived: sale.cashReceivedCentavos === null ? undefined : sale.cashReceivedCentavos / 100, change: sale.changeAmountCentavos === null ? undefined : sale.changeAmountCentavos / 100 };
}
