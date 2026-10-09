import { ApiClient, ApiClientError, Payment } from '@/src/api/client';
import { AuthorityCheckout, CheckoutTender } from '@/src/api/checkoutAuthority';
import { CartLine, Sale } from '@/src/types';
import { canAcceptCheckoutTender, CheckoutMachine, checkoutCashTender, transitionCheckout } from './checkoutMachine';
import { authorityObservation } from './checkoutAuthorityAdapter';
import { isDefinitiveQrRejection } from './checkout';

export type CheckoutHandle = { key: string; signature: string; id?: string; tender?: { key: string; signature: string } };
export type CheckoutStorage = { load(): Promise<CheckoutHandle | null>; save(handle: CheckoutHandle | null): Promise<void> };
export class CheckoutStorageCorruptionError extends Error {}
const key = () => `mobile-v3-${Date.now()}-${Math.random().toString(36).slice(2)}`;
function validateItems(items: { productId: number; quantity: number }[]) {
  if (items.some(item => !Number.isSafeInteger(item.productId) || item.productId <= 0 || !Number.isSafeInteger(item.quantity) || item.quantity <= 0)) {
    throw new ApiClientError('Products require server identities and positive quantities.');
  }
  return items;
}
function signatureForItems(items: { productId: number; quantity: number }[]) {
  return JSON.stringify(validateItems(items).map(item => [item.productId, item.quantity]).sort((a, b) => a[0] - b[0]));
}
function itemsFromSignature(value: string) {
  let parsed: unknown;
  try { parsed = JSON.parse(value); } catch { throw new CheckoutStorageCorruptionError('Stored checkout basket is unreadable.'); }
  if (!Array.isArray(parsed) || parsed.some(item => !Array.isArray(item) || item.length !== 2 || !Number.isSafeInteger(item[0]) || item[0] <= 0 || !Number.isSafeInteger(item[1]) || item[1] <= 0)) {
    throw new CheckoutStorageCorruptionError('Stored checkout basket is invalid.');
  }
  return (parsed as number[][]).map(([productId, quantity]) => ({ productId, quantity }));
}
function checkoutItems(lines: CartLine[]) {
  return validateItems(lines.map(line => ({ productId: Number(line.product.id), quantity: line.quantity })));
}

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
  private corruptStorage = false;
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
    if (!this.loaded) {
      try { this.handle = await this.storage.load() ?? undefined; }
      catch (error) {
        if (!(error instanceof CheckoutStorageCorruptionError)) throw error;
        this.corruptStorage = true;
      }
      this.loaded = true;
    }
  }
  private async persist() { await this.storage.save(this.handle ?? null); }
  private async createCheckout(items: { productId: number; quantity: number }[], creationKey: string) {
    try { return await this.client.createCheckout(items, creationKey); }
    catch (error) {
      if (error instanceof ApiClientError && isDefinitiveQrRejection({ status: error.status }) && !this.handle?.id && this.handle?.key === creationKey) {
        await this.storage.save(null);
        this.handle = undefined;
        this.current = undefined;
      }
      throw error;
    }
  }
  async hasCorruptStorage() { await this.load(); return this.corruptStorage; }
  private async discoverCheckouts() {
    const checkouts: AuthorityCheckout[] = [];
    for (let page = 1; ; page++) {
      const result = await this.client.listCheckouts(page);
      checkouts.push(...result.items);
      if (page >= result.pagination.last_page) return checkouts;
    }
  }
  private async verifyDiscoveredCheckout(id: string) {
    if (!(await this.discoverCheckouts()).some(checkout => checkout.id === id)) {
      throw new ApiClientError('The selected checkout was not found in server discovery. The unreadable device identity remains unresolved.', 409, 'checkout_recovery_required');
    }
  }
  async discardCorruptIdentity(reason: string) {
    await this.load();
    if (!this.corruptStorage) throw new ApiClientError('There is no unreadable checkout identity to discard.', 409, 'checkout_recovery_required');
    const attributedReason = reason.trim();
    if (attributedReason.length < 8 || attributedReason.length > 500) throw new ApiClientError('Enter a reason between 8 and 500 characters.');
    if ((await this.discoverCheckouts()).length > 0) throw new ApiClientError('Server checkout records were found. Recover one before discarding the unreadable identity.', 409, 'checkout_recovery_required');
    await this.storage.save(null);
    this.handle = undefined;
    this.corruptStorage = false;
    this.current = undefined;
    return attributedReason;
  }
  async recover(id?: string) {
    await this.load();
    if (this.corruptStorage) {
      if (!id) throw new ApiClientError('The stored checkout identity is unreadable. Select a checkout from server discovery to reattach it; payment remains unresolved.', 409, 'checkout_recovery_required');
      await this.verifyDiscoveredCheckout(id);
      const checkout = await this.client.recoverCheckout(id);
      const handle: CheckoutHandle = { id, key: key(), signature: signatureForItems(checkout.items) };
      await this.storage.save(handle);
      this.handle = handle;
      this.corruptStorage = false;
      this.current = checkout;
      return this.current;
    }
    if (id) {
      if (this.handle && this.handle.id !== id) throw new ApiClientError('Resolve the device purchase before recovering another checkout.');
      const checkout = await this.client.recoverCheckout(id);
      this.handle ??= { id, key: key(), signature: signatureForItems(checkout.items) };
      await this.persist();
      this.current = checkout;
    } else if (this.handle) {
      if (!this.handle.id) {
        const items = validateItems(itemsFromSignature(this.handle.signature));
        this.current = await this.createCheckout(items, this.handle.key);
        this.handle.id = this.current.id; await this.persist();
      }
      this.current = await this.client.recoverCheckout(this.handle.id!);
    }
    return this.current;
  }
  async prepare(lines: CartLine[]) {
    const items = checkoutItems(lines);
    const sig = signatureForItems(items);
    await this.load();
    if (this.corruptStorage) throw new ApiClientError('The stored checkout identity is unreadable. Discover and explicitly recover a server checkout before starting another purchase.', 409, 'checkout_recovery_required');
    if (this.handle && this.handle.signature !== sig) throw new ApiClientError('Recover or abandon the original device purchase before changing its basket.', 409, 'checkout_recovery_required');
    if (!this.handle) {
      this.handle = { key: key(), signature: sig };
      await this.persist(); // save before I/O, including a lost creation response
    }
    if (!this.handle.id) {
      this.current = await this.createCheckout(items, this.handle.key);
      this.handle.id = this.current.id;
      await this.persist();
    } else this.current = await this.client.getCheckout(this.handle.id);
    return this.current!;
  }
  async tender(lines: CartLine[], method: 'cash' | 'qrph', cashInput?: string, forceNew = false) {
    const checkout = await this.prepare(lines);
    if (this.machine?.state === 'completed' && !this.machine.reconciliationRequired && checkout.sale?.method === method) return checkout;
    if (!canAcceptCheckoutTender(this.machine)) {
      if (method === 'qrph' && this.machine?.attempts.some(a => a.method === 'qr')) return checkout;
      throw new ApiClientError('QR Ph payment is unresolved or checkout is locked. Recover it before recording cash.', 409, 'qr_payment_unresolved');
    }
    const localAmount = lines.reduce((sum, l) => sum + Math.round(l.product.price * 100) * l.quantity, 0);
    const changedSnapshot = checkout.items.some(item => !lines.some(line => Number(line.product.id) === item.productId && line.quantity === item.quantity && Math.round(line.product.price * 100) === item.unitPriceCentavos));
    if (checkout.amountCentavos !== localAmount || changedSnapshot) throw new ApiClientError('Review the authoritative quote before confirming payment.', 409, 'revalidation_required');
    const latestAttempt = this.machine?.attempts[this.machine.attempts.length - 1];
    if (method === 'qrph' && forceNew && this.machine?.state === 'ready-for-new-attempt' && latestAttempt?.method === 'qr' && latestAttempt.payment === 'non-payable') {
      this.handle!.tender = undefined;
    }
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
      const definitiveQrRefusal = error instanceof ApiClientError && isDefinitiveQrRejection({ status: error.status });
      if (method === 'qrph' && !definitiveQrRefusal) {
        try {
          const recovered = await this.client.recoverCheckout(checkout.id);
          this.current = recovered;
          if (recovered.attempts.some(a => a.method === 'qrph')) return recovered;
        } catch { /* Keep the durable id and exact key for explicit retry/recovery. */ }
      }
      // A definitive refusal has no effect; uncertain responses retain the exact key.
      if ((method === 'qrph' && definitiveQrRefusal) || (method === 'cash' && error instanceof ApiClientError && error.status === 422)) {
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
    if (this.machine?.state === 'ready-for-new-attempt' && canAcceptCheckoutTender(this.machine) && this.current.attempts.length > 0 && this.current.attempts.every(a => a.status === 'non_payable')) {
      this.handle.tender = undefined; await this.persist();
    }
    return this.current;
  }
  async revalidate() {
    await this.recover();
    if (!this.current) throw new ApiClientError('No checkout to revalidate.');
    this.current = await this.client.revalidateCheckout(this.current.id);
    if (canAcceptCheckoutTender(this.machine)) {
      this.handle!.tender = undefined; await this.persist();
    }
    return this.current;
  }
  async abandon(reason: string) {
    await this.recover();
    if (!this.current) throw new ApiClientError('No checkout to abandon.');
    this.current = await this.client.abandonCheckout(this.current.id, reason);
    if (this.current.state === 'abandoned') await this.retire();
  }
  async retire() {
    await this.load();
    if (this.corruptStorage) throw new ApiClientError('The unreadable checkout identity must be resolved through server recovery before it can be cleared.', 409, 'checkout_recovery_required');
    await this.storage.save(null); this.handle = undefined; this.current = undefined;
  }
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
