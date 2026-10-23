import { ApiClient, ApiClientError, Payment } from '@/src/api/client';
import { AuthorityCheckout, CheckoutTender } from '@/src/api/checkoutAuthority';
import { CartLine, Sale } from '@/src/types';
import { canAcceptCheckoutTender, CheckoutMachine, checkoutCashTender, transitionCheckout } from './checkoutMachine';
import { authorityObservation } from './checkoutAuthorityAdapter';
import { isDefinitiveQrRejection } from './checkout';
import { CheckoutProgress } from './checkoutGuidance';

export class CheckoutIdentityError extends ApiClientError {}
export class CheckoutObservationError extends ApiClientError {}

export type CheckoutHandle = { key?: string; signature?: string; id?: string; tender?: { key: string; signature: string; previousAttemptIds?: number[]; attemptId?: number }; parkedId?: string };
export type CheckoutStorage = { load(): Promise<CheckoutHandle | null>; save(handle: CheckoutHandle | null, expectedKey?: string): Promise<void> };
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
function hasPaymentInFlight(checkout: AuthorityCheckout) {
  return checkout.attempts.some(attempt => attempt.status === 'pending' || attempt.status === 'unknown' || attempt.status === 'paid' || attempt.status === 'contradiction');
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
  get retainedCheckoutId() { return this.handle?.id; }
  get parkedCheckoutId() { return this.handle?.parkedId; }
  private set current(checkout: AuthorityCheckout | undefined) {
    if (!checkout) { this.observed = undefined; this.machine = undefined; return; }
    const observation = authorityObservation(checkout);
    if (!this.machine || this.machine.id !== checkout.id) this.machine = observation;
    else {
      const transition = transitionCheckout(this.machine, { type: 'authority-observed', checkout: observation });
      if (!transition.ok) {
        this.recoveryFailure = 'inconsistent';
        throw new CheckoutObservationError(transition.reason);
      }
      this.machine = transition.checkout;
    }
    this.observed = checkout;
  }
  private handle?: CheckoutHandle;
  private loaded = false;
  private corruptStorage = false;
  private corruptWithoutChoice = false;
  private busy = false;
  private active = true;
  private recoveryFailure?: CheckoutProgress['recoveryFailure'];
  private unresolvedCashRefusal = false;
  get progress(): CheckoutProgress {
    if (this.corruptStorage && this.corruptWithoutChoice) return { recoveryFailure: 'identity' };
    const result: CheckoutProgress = { recoveryFailure: this.recoveryFailure };
    if (this.unresolvedCashRefusal && !this.current?.sale && !this.current?.attempts.some(a => a.method === 'cash')) return { ...result, uncertainTender: 'cash' };
    if (!this.handle?.tender) return result;
    try {
      const [method, tender] = JSON.parse(this.handle.tender.signature);
      if ((method !== 'cash' && method !== 'qrph') || !Number.isSafeInteger(tender.revision) || !Number.isSafeInteger(tender.acceptedAmountCentavos) || (method === 'cash' && !Number.isSafeInteger(tender.cashReceivedCentavos))) throw new Error();
      if (method === 'qrph' ? this.submittedQrAttempt() : this.current?.sale || this.current?.attempts.some(attempt => attempt.method === 'cash')) return result;
      return { ...result, uncertainTender: method, ...(method === 'cash' ? { cashInput: (tender.cashReceivedCentavos / 100).toFixed(2) } : {}) };
    } catch { return { recoveryFailure: 'identity' }; }
  }
  constructor(private client: ApiClient, private storage: CheckoutStorage) {}

  setActive(active: boolean) { this.active = active; }
  private assertActive() {
    if (!this.active) throw new CheckoutIdentityError('This checkout session is no longer active.', 409, 'checkout_recovery_required');
  }
  /**
   * Reconciliation is an administrator procedure outside this app, and its
   * lock is one-way: case review or closure does not restore service. Once
   * reconciliation is required, no local caller may review the quote, abandon,
   * or retire the purchase; only stored reads and provider verification remain
   * available. Laravel still enforces the same boundary.
   */
  private assertReconciliationUnlocked(action: string) {
    if (this.machine?.reconciliationRequired || this.machine?.state === 'paid-but-unfulfilled') {
      throw new ApiClientError(`This purchase requires administrator reconciliation; ${action} is locked.`, 409, 'checkout_reconciliation_required');
    }
  }

  private submittedQrAttempt() {
    return this.current?.attempts.find(attempt => attempt.method === 'qrph' && attempt.id === this.handle?.tender?.attemptId);
  }
  private async correlateQrResponse(checkout: AuthorityCheckout) {
    const tender = this.handle!.tender!;
    if (tender.attemptId === undefined) {
      const qrAttempts = checkout.attempts.filter(attempt => attempt.method === 'qrph');
      const candidates = tender.previousAttemptIds === undefined ? qrAttempts.slice(-1) : qrAttempts.filter(attempt => !tender.previousAttemptIds!.includes(attempt.id));
      if (candidates.length !== 1) throw new ApiClientError('The submitted QR payment has not been identified. Retry the saved submission.', 409, 'checkout_recovery_required');
      tender.attemptId = candidates[0].id;
      await this.persist();
    }
    if (!checkout.attempts.some(attempt => attempt.method === 'qrph' && attempt.id === tender.attemptId)) {
      throw new ApiClientError('The submitted QR payment is missing from its response.', 409, 'checkout_recovery_required');
    }
  }
  retainedPayment() {
    if (this.progress.uncertainTender || !this.observed?.attempts.some(a => a.method === 'qrph')) return undefined;
    return checkoutPayment(this.observed, this.submittedQrAttempt()?.id);
  }

  async exclusive<T>(operation: () => Promise<T>, options: { financial?: boolean } = {}): Promise<T> {
    this.assertActive();
    if (this.busy) throw new ApiClientError('Checkout operation is already in progress.');
    this.busy = true;
    try {
      const result = await operation();
      if (this.recoveryFailure !== 'inconsistent') this.recoveryFailure = undefined;
      return result;
    } catch (error) {
      if (error instanceof ApiClientError && error.code === 'cash_attempt_unresolved') this.unresolvedCashRefusal = true;
      if (this.recoveryFailure !== 'inconsistent') {
        const next: CheckoutProgress['recoveryFailure'] = error instanceof CheckoutIdentityError ? 'identity' : error instanceof ApiClientError && error.status === 403 ? 'permission' : error instanceof ApiClientError && (error.code === 'revalidation_required' || error.code === 'checkout_basket_diverged' || error.code === 'checkout_purchase_cancelled' || isDefinitiveQrRejection(error)) ? undefined : 'interrupted';
        if (options.financial !== false || next !== 'interrupted') this.recoveryFailure = next;
      }
      throw error;
    } finally { this.busy = false; }
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
  private async persist() { this.assertActive(); await this.storage.save(this.handle ?? null); }
  private async replaceHandle(candidate: CheckoutHandle | undefined, expectedKey?: string) {
    this.assertActive();
    await this.storage.save(candidate ?? null, expectedKey);
    this.handle = candidate;
  }
  private releaseResolvedQrTender() {
    const submittedAttempt = this.machine?.attempts.find(attempt => attempt.id === String(this.handle?.tender?.attemptId));
    if (!this.handle?.tender || !canAcceptCheckoutTender(this.machine) || submittedAttempt?.method !== 'qr' || submittedAttempt.payment !== 'non-payable'
      || JSON.parse(this.handle.tender.signature)[0] !== 'qrph') return false;
    this.handle.tender = undefined;
    return true;
  }

  private async createCheckout(items: { productId: number; quantity: number }[], creationKey: string) {
    try { return await this.client.createCheckout(items, creationKey); }
    catch (error) {
      if (error instanceof ApiClientError && isDefinitiveQrRejection({ status: error.status }) && !this.handle?.id && this.handle?.key === creationKey) {
        await this.retire();
      }
      throw error;
    }
  }
  async hasCorruptStorage() { await this.load(); return this.corruptStorage; }
  async hasParkedCheckout() { await this.load(); return Boolean(this.handle?.parkedId); }
  async hasActiveCheckoutIdentity() { await this.load(); return Boolean(this.handle?.key && this.handle.signature); }
  async isRetainedCheckout(id: string) { await this.load(); return this.handle?.id === id; }
  async park() {
    await this.load();
    if (!this.handle?.id || !this.current) throw new ApiClientError('Create or recover the checkout before parking it.');
    if (this.progress.uncertainTender || this.machine?.reconciliationRequired || (this.machine?.state !== 'open' && this.machine?.state !== 'ready-for-new-attempt') || !canAcceptCheckoutTender(this.machine)) {
      throw new ApiClientError('This purchase is locked or unresolved and cannot be parked. Check its status before continuing.', 409, 'checkout_recovery_required');
    }
    await this.replaceHandle({ parkedId: this.handle.id }, this.handle.key);
    this.current = undefined;
    this.unresolvedCashRefusal = false;
  }
  basketDivergedFrom(lines: CartLine[]) {
    if (!this.handle?.id || !this.handle.signature) return false;
    try {
      return this.handle.signature !== signatureForItems(checkoutItems(lines));
    } catch {
      return true;
    }
  }
  confirmEmptyRecoveryDiscovery() { if (this.corruptStorage) this.corruptWithoutChoice = true; }
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
    if ((await this.discoverCheckouts()).some(checkout => checkout.state !== 'completed' && checkout.state !== 'abandoned')) throw new ApiClientError('Server open checkout records were found. Recover one before discarding the unreadable identity.', 409, 'checkout_recovery_required');
    this.assertActive();
    await this.storage.save(null);
    this.handle = undefined;
    this.corruptStorage = false;
    this.current = undefined;
    return attributedReason;
  }
  async recover(id?: string) {
    await this.load();
    if (this.corruptStorage) {
      if (!id) {
        if (this.corruptWithoutChoice) throw new CheckoutIdentityError('No safe checkout identity was found.', 409, 'checkout_recovery_required');
        throw new ApiClientError('The stored checkout identity is unreadable. Select a checkout from server discovery to reattach it; payment remains unresolved.', 409, 'checkout_recovery_required');
      }
      await this.verifyDiscoveredCheckout(id);
      const checkout = await this.client.recoverCheckout(id);
      const handle: CheckoutHandle = { id, key: key(), signature: signatureForItems(checkout.items) };
      this.assertActive();
      await this.storage.save(handle);
      this.handle = handle;
      this.corruptStorage = false;
      this.corruptWithoutChoice = false;
      this.current = checkout;
      return this.current;
    }
    if (id) {
      if (this.handle?.id && this.handle.id !== id) throw new ApiClientError('Resolve the device purchase before recovering another checkout.');
      const checkout = await this.client.recoverCheckout(id);
      const next: CheckoutHandle = this.handle?.key && this.handle.signature && this.handle.id === id
        ? this.handle
        : { id, key: key(), signature: signatureForItems(checkout.items) };
      await this.replaceHandle(next);
      this.current = checkout;
    } else if (this.handle?.key && this.handle.signature) {
      if (!this.handle.id) {
        const items = validateItems(itemsFromSignature(this.handle.signature));
        const created = await this.createCheckout(items, this.handle.key);
        await this.replaceHandle({ ...this.handle, id: created.id });
        this.current = created;
      }
      try { this.current = await this.client.recoverCheckout(this.handle.id!); }
      catch (error) {
        if (error instanceof ApiClientError && error.status === 404) throw new CheckoutIdentityError('Retained checkout was not found.', 404);
        throw error;
      }
    }
    return this.current;
  }
  async prepare(lines: CartLine[]) {
    const items = checkoutItems(lines);
    const sig = signatureForItems(items);
    await this.load();
    if (this.corruptStorage) throw new ApiClientError('The stored checkout identity is unreadable. Discover and explicitly recover a server checkout before starting another purchase.', 409, 'checkout_recovery_required');
    if (this.handle?.signature && this.handle.signature !== sig) {
      if (this.handle.id) throw new ApiClientError('Recover or abandon the original device purchase before changing its basket.', 409, 'checkout_basket_diverged');
      const originalItems = validateItems(itemsFromSignature(this.handle.signature));
      const created = await this.createCheckout(originalItems, this.handle.key!);
      await this.replaceHandle({ ...this.handle, id: created.id });
      this.current = created;
      throw new ApiClientError('Recover or abandon the original device purchase before changing its basket.', 409, 'checkout_basket_diverged');
    }
    let handle = this.handle;
    if (!handle?.signature) {
      handle = { key: key(), signature: sig, ...(handle?.parkedId ? { parkedId: handle.parkedId } : {}) };
      await this.replaceHandle(handle);
    }
    if (!handle.id) {
      const created = await this.createCheckout(items, handle.key!);
      handle = { ...handle, id: created.id };
      await this.replaceHandle(handle);
      this.current = created;
    } else {
      try { this.current = await this.client.getCheckout(handle.id); }
      catch (error) {
        if (error instanceof ApiClientError && error.status === 404) throw new CheckoutIdentityError('Retained checkout was not found.', 404);
        throw error;
      }
    }
    return this.current!;
  }
  async tender(lines: CartLine[], method: 'cash' | 'qrph', cashInput?: string, forceNew = false) {
    const checkout = await this.prepare(lines);
    if (this.unresolvedCashRefusal && !checkout.sale && !checkout.attempts.some(a => a.method === 'cash')) throw new ApiClientError('Recover the earlier cash sale before taking payment.', 409, 'cash_attempt_unresolved');
    const uncertainTender = this.progress.uncertainTender;
    if (uncertainTender && uncertainTender !== method) throw new ApiClientError('Recover the previous tender before changing payment.', 409, 'checkout_recovery_required');
    if (this.machine?.state === 'completed' && !this.machine.reconciliationRequired && checkout.sale?.method === method && !uncertainTender) return checkout;
    const replaying = uncertainTender === method;
    if (!canAcceptCheckoutTender(this.machine) && (!replaying || this.machine?.reconciliationRequired || this.machine?.state === 'abandoned')) {
      if (method === 'qrph' && this.retainedPayment()) return checkout;
      if (this.machine?.state === 'abandoned' && !this.progress.uncertainTender
        && !this.machine.attempts.some(attempt => attempt.payment === 'pending' || attempt.payment === 'unknown')) {
        throw new ApiClientError('This purchase was cancelled. Clear it before recording another payment.', 409, 'checkout_purchase_cancelled');
      }
      throw new ApiClientError('QR Ph payment is unresolved or checkout is locked. Recover it before recording cash.', 409, 'qr_payment_unresolved');
    }
    const localAmount = lines.reduce((sum, l) => sum + Math.round(l.product.price * 100) * l.quantity, 0);
    const changedSnapshot = checkout.items.some(item => !lines.some(line => Number(line.product.id) === item.productId && line.quantity === item.quantity && Math.round(line.product.price * 100) === item.unitPriceCentavos));
    if (!replaying && (checkout.amountCentavos !== localAmount || changedSnapshot)) throw new ApiClientError('Review the authoritative quote before confirming payment.', 409, 'revalidation_required');
    if (method === 'cash' || forceNew) this.releaseResolvedQrTender();
    const tender: CheckoutTender = replaying ? { ...JSON.parse(this.handle!.tender!.signature)[1] } : { revision: checkout.revision, acceptedAmountCentavos: checkout.amountCentavos };
    if (method === 'cash') {
      const cash = checkoutCashTender(cashInput ?? '', tender.acceptedAmountCentavos);
      if (cash.kind !== 'sufficient' || cash.amountCentavos > 4294967295) throw new ApiClientError('Enter valid, sufficient cash.');
      tender.cashReceivedCentavos = cash.amountCentavos;
    }
    const sig = JSON.stringify([method, tender]);
    if (this.handle!.tender && this.handle!.tender.signature !== sig) throw new ApiClientError('Recover the previous tender before changing payment.', 409, 'checkout_recovery_required');
    if (!this.handle!.tender) this.handle!.tender = { key: key(), signature: sig, previousAttemptIds: checkout.attempts.map(attempt => attempt.id) };
    await this.persist();
    try {
      if (method === 'cash') this.current = await this.client.checkoutCash(checkout.id, tender, this.handle!.tender!.key);
      else {
        const response = await this.client.createCheckoutAttempt(checkout.id, tender, this.handle!.tender!.key);
        await this.correlateQrResponse(response);
        if (!this.submittedQrAttempt()) this.current = response;
      }
      return this.current!;
    } catch (error) {
      const definitiveQrRefusal = error instanceof ApiClientError && isDefinitiveQrRejection({ status: error.status });
      if (method === 'qrph' && !definitiveQrRefusal) {
        try {
          const recovered = await this.client.recoverCheckout(checkout.id);
          this.current = recovered;
          if (this.submittedQrAttempt()) return recovered;
        } catch { /* Keep the durable id and exact key for explicit retry/recovery. */ }
      }
      // A definitive refusal has no effect; uncertain responses retain the exact key.
      if (!replaying && ((method === 'qrph' && definitiveQrRefusal) || (method === 'cash' && error instanceof ApiClientError && error.status === 422))) {
        this.handle!.tender = undefined; await this.persist();
      }
      throw error;
    }
  }
  async refresh(attemptId: string) {
    await this.load();
    if (!this.handle?.id) throw new ApiClientError('Recover the checkout before checking payment.');
    if (this.progress.uncertainTender === 'qrph') throw new ApiClientError('Retry the saved submission before checking an earlier payment.', 409, 'checkout_recovery_required');
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
    if (this.releaseResolvedQrTender()) await this.persist();
    return this.current;
  }
  async revalidate() {
    await this.recover();
    this.assertReconciliationUnlocked('quote review');
    if (this.progress.uncertainTender) throw new ApiClientError('Recover the previous payment before reviewing the quote.', 409, 'checkout_recovery_required');
    if (!this.current) throw new ApiClientError('No checkout to revalidate.');
    this.current = await this.client.revalidateCheckout(this.current.id);
    if (this.releaseResolvedQrTender()) await this.persist();
    return this.current;
  }
  async abandon(reason: string) {
    const attributedReason = reason.trim();
    if (attributedReason.length < 8 || attributedReason.length > 500) throw new ApiClientError('Enter a reason between 8 and 500 characters.');
    await this.recover();
    this.assertReconciliationUnlocked('abandonment');
    if (this.progress.uncertainTender) throw new ApiClientError('Recover the previous payment before abandoning the purchase.', 409, 'checkout_recovery_required');
    if (!this.current) throw new ApiClientError('No checkout to abandon.');
    if ((this.current.state !== 'open' && this.current.state !== 'ready_for_attempt') || !canAcceptCheckoutTender(this.machine) || hasPaymentInFlight(this.current)) throw new ApiClientError('Only an open or ready checkout without an in-flight payment can be cancelled.', 409, 'checkout_recovery_required');
    this.current = await this.client.abandonCheckout(this.current.id, attributedReason);
    const abandoned = this.current;
    if (abandoned.state === 'abandoned') await this.retire();
    return abandoned;
  }
  async abandonDiscovered(id: string, reason: string) {
    const attributedReason = reason.trim();
    if (attributedReason.length < 8 || attributedReason.length > 500) throw new ApiClientError('Enter a reason between 8 and 500 characters.');
    await this.load();
    if (this.handle?.id === id) return this.abandon(attributedReason);
    if (this.handle?.key && !this.handle.id) throw new ApiClientError('Recover the retained device purchase before cancelling a discovered checkout.', 409, 'checkout_recovery_required');
    const checkout = await this.client.getCheckout(id);
    const observation = authorityObservation(checkout);
    if ((checkout.state !== 'open' && checkout.state !== 'ready_for_attempt') || checkout.exceptions.length > 0
      || observation.reconciliationRequired || !canAcceptCheckoutTender(observation) || hasPaymentInFlight(checkout)) {
      throw new ApiClientError('This purchase is locked or unresolved and cannot be cancelled. Check its status before continuing.', 409, 'checkout_recovery_required');
    }
    const result = await this.client.abandonCheckout(id, attributedReason);
    if (this.handle?.parkedId === id) {
      const wasCurrent = this.current?.id === id;
      const candidate = this.handle.key && this.handle.signature ? { ...this.handle } : undefined;
      if (candidate) delete candidate.parkedId;
      await this.replaceHandle(candidate, this.handle.key);
      if (wasCurrent) { this.current = undefined; this.unresolvedCashRefusal = false; }
    }
    return result;
  }
  async clearCancelledCheckout(id: string) {
    await this.load();
    const checkout = await this.client.getCheckout(id);
    if (checkout.state !== 'abandoned') throw new ApiClientError('This purchase is not marked cancelled by the shop server.', 409, 'checkout_recovery_required');
    if (this.handle?.id === id) {
      this.current = checkout;
      await this.retire();
    } else if (this.handle?.parkedId === id) {
      const wasCurrent = this.current?.id === id;
      const candidate = this.handle.key && this.handle.signature ? { ...this.handle } : undefined;
      if (candidate) delete candidate.parkedId;
      await this.replaceHandle(candidate, this.handle.key);
      if (wasCurrent) { this.current = undefined; this.unresolvedCashRefusal = false; }
    }
    return checkout;
  }
  async retire() {
    await this.load();
    if (this.corruptStorage) throw new ApiClientError('The unreadable checkout identity must be resolved through server recovery before it can be cleared.', 409, 'checkout_recovery_required');
    this.assertActive();
    this.assertReconciliationUnlocked('device identity retirement');
    if (this.progress.uncertainTender) throw new ApiClientError('Recover the submitted payment before retiring this purchase.', 409, 'checkout_recovery_required');
    if (!this.handle?.key || !this.handle.signature) return;
    const next: CheckoutHandle | undefined = this.handle.parkedId ? { parkedId: this.handle.parkedId } : undefined;
    await this.storage.save(next ?? null, this.handle.key);
    this.handle = next; this.current = undefined; this.unresolvedCashRefusal = false;
  }
}

/** Compatibility seam only: never infer sale success from an attempt's paid status. */
export function checkoutPayment(checkout: AuthorityCheckout, attemptId?: number): Payment {
  const attempt = [...checkout.attempts].reverse().find(a => a.method === 'qrph' && (attemptId === undefined || a.id === attemptId));
  if (!attempt) throw new ApiClientError('No QR attempt found.');
  const machine = authorityObservation(checkout);
  const payment = machine.attempts.find(a => a.id === String(attempt.id))!.payment;
  const status = machine.state === 'paid-but-unfulfilled' ? 'paid_unfulfilled' : machine.reconciliationRequired ? 'unknown'
    : payment === 'non-payable' ? 'failed'
      : machine.state === 'completed' && machine.saleId && checkout.sale?.method === 'qrph' && checkout.attempts[checkout.attempts.length - 1]?.id === attempt.id ? 'paid' : payment === 'unknown' ? 'unknown' : 'pending';
  return { id: String(attempt.id), status, amount: attempt.amountCentavos / 100, qrPayload: attempt.qrPayload ?? undefined, saleId: checkout.sale ? String(checkout.sale.id) : undefined, reservationExpiresAt: attempt.reservation?.expiresAt ?? undefined };
}
export function checkoutSale(checkout: AuthorityCheckout): Sale {
  const sale = checkout.sale;
  if (!sale || checkout.state !== 'completed' || !Number.isSafeInteger(sale.id) || !Number.isSafeInteger(sale.amountCentavos)
    || !sale.completedAt || (sale.method === 'cash' && (!Number.isSafeInteger(sale.cashReceivedCentavos) || !Number.isSafeInteger(sale.changeAmountCentavos)))) throw new ApiClientError('The completed receipt is incomplete. Recover the purchase.');
  const items = checkout.items.map(item => ({
    product: { id: String(item.productId), name: item.name, barcode: '', price: item.unitPriceCentavos / 100, stock: 0 },
    quantity: item.quantity,
  }));
  return { id: String(sale.id), items, total: sale.amountCentavos / 100, paymentMethod: sale.method, status: 'paid', createdAt: sale.completedAt, cashReceived: sale.cashReceivedCentavos === null ? undefined : sale.cashReceivedCentavos / 100, change: sale.changeAmountCentavos === null ? undefined : sale.changeAmountCentavos / 100 };
}
