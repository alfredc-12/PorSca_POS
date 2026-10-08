import { assertCentavos, validateCashTender } from './checkoutMoney';

/** Domain vocabulary, deliberately NOT an API resource/status DTO. */
export type CheckoutState =
  | 'open'
  | 'payment-in-progress'
  | 'payment-unresolved'
  | 'ready-for-new-attempt'
  | 'completed'
  | 'abandoned'
  | 'paid-but-unfulfilled';
export type PaymentOutcome = 'paid' | 'non-payable';
export type PaymentState = 'pending' | 'unknown' | PaymentOutcome;
export type ReservationState = 'none' | 'held' | 'released';

export type OutcomeEvidence = Readonly<{ outcome: PaymentOutcome; reference: string }>;
export type CheckoutAttempt = Readonly<{
  id: string;
  method: 'cash' | 'qr';
  amountCentavos: number;
  cashReceivedCentavos?: number;
  payment: PaymentState;
  /** First verified outcome stands; conflicting evidence never replaces it. */
  finalEvidence?: OutcomeEvidence;
  contradictions: readonly OutcomeEvidence[];
}>;

export type CheckoutMachine = Readonly<{
  id: string;
  state: CheckoutState;
  amountCentavos: number;
  attempts: readonly CheckoutAttempt[];
  reservation: ReservationState;
  saleId?: string;
  /** Reconciliation is separate; this flag locks tender even after non-payability. */
  reconciliationRequired: boolean;
}>;

export type CheckoutEvent =
  | {
    type: 'begin-attempt';
    attemptId: string;
    method: 'cash' | 'qr';
    amountCentavos: number;
    /** Caller has revalidated authoritative amount, stock, and eligibility. */
    revalidated: boolean;
    /** Required explicitly if revalidation changes the agreed amount. */
    revisedAmountAccepted: boolean;
    cashInput?: string;
  }
  | { type: 'verification-failed'; attemptId: string; reason: 'transport' | 'timeout' | '5xx' | 'malformed' }
  | { type: 'authoritative-pending'; attemptId: string }
  | { type: 'verified-outcome'; attemptId: string; evidence: OutcomeEvidence }
  | { type: 'timer-expired' }
  | { type: 'reservation-released' }
  | { type: 'reservation-secured' }
  | { type: 'sale-recorded'; attemptId: string; saleId: string }
  | { type: 'fulfillment-failed'; attemptId: string }
  | { type: 'abandon'; authorized: boolean }
  | { type: 'reconciliation-closed' };

export type TransitionResult =
  | { ok: true; checkout: CheckoutMachine }
  | { ok: false; checkout: CheckoutMachine; reason: string };

export function openCheckout(id: string, amountCentavos: number): CheckoutMachine {
  if (!id.trim()) throw new Error('Checkout identity is required.');
  assertCentavos(amountCentavos);
  return {
    id, amountCentavos, state: 'open', attempts: [], reservation: 'none', reconciliationRequired: false,
  };
}

/**
 * Pure projection of trusted authority observations, NOT payment authorization.
 * No network, clock, inventory writes, or sale creation. Adapters in a later wave
 * must correlate attempt-specific evidence and supply durable sale/hold results;
 * UI timer/callback claims must never be translated into verified outcomes.
 * Cash selection before confirmation stays Open; begin-attempt starts the cash
 * confirmation (and locks tender), not merely a selection of a payment tab.
 * Persist/rehydrate the complete value, including old attempts, in that wave.
 */
export function transitionCheckout(checkout: CheckoutMachine, event: CheckoutEvent): TransitionResult {
  const accept = (next: CheckoutMachine = checkout): TransitionResult => ({ ok: true, checkout: next });
  const reject = (reason: string): TransitionResult => ({ ok: false, checkout, reason });
  const active = checkout.attempts[checkout.attempts.length - 1];
  const locked = checkout.reconciliationRequired;
  const working = checkout.state === 'payment-in-progress' || checkout.state === 'payment-unresolved';
  const updateAttempt = (attempt: CheckoutAttempt): readonly CheckoutAttempt[] =>
    checkout.attempts.map((old) => old.id === attempt.id ? attempt : old);

  switch (event.type) {
    case 'begin-attempt': {
      if (locked || (checkout.state !== 'open' && checkout.state !== 'ready-for-new-attempt')) {
        return reject('Checkout cannot accept another tender.');
      }
      if (!event.attemptId.trim() || checkout.attempts.some((attempt) => attempt.id === event.attemptId)) {
        return reject('A new attempt needs a distinct identity.');
      }
      if (!event.revalidated) return reject('Revalidate amount, stock and eligibility first.');
      if (!Number.isSafeInteger(event.amountCentavos) || event.amountCentavos < 0) return reject('Invalid amount.');
      if (event.amountCentavos !== checkout.amountCentavos && !event.revisedAmountAccepted) {
        return reject('Accept the revised amount first.');
      }
      const tender = event.method === 'cash'
        ? validateCashTender(event.cashInput ?? '', event.amountCentavos) : undefined;
      if (tender && tender.kind !== 'sufficient') return reject('Cash must be valid and sufficient.');
      const attempt: CheckoutAttempt = {
        id: event.attemptId, method: event.method, amountCentavos: event.amountCentavos,
        payment: 'pending', contradictions: [],
        ...(tender?.kind === 'sufficient' ? { cashReceivedCentavos: tender.amountCentavos } : {}),
      };
      return accept({
        ...checkout, amountCentavos: event.amountCentavos, state: 'payment-in-progress',
        attempts: [...checkout.attempts, attempt], reservation: 'none',
      });
    }
    case 'verification-failed':
    case 'authoritative-pending': {
      if (!working || locked || active?.id !== event.attemptId || active.finalEvidence) {
        return reject('Only the unresolved active attempt can change verification availability.');
      }
      return accept({
        ...checkout, state: 'payment-unresolved',
        attempts: updateAttempt({ ...active, payment: event.type === 'verification-failed' ? 'unknown' : 'pending' }),
      });
    }
    case 'verified-outcome': {
      const attempt = checkout.attempts.find((old) => old.id === event.attemptId);
      if (!attempt || !event.evidence.reference.trim()) return reject('Attempt-specific evidence is required.');
      if (attempt.finalEvidence) {
        if (attempt.finalEvidence.outcome === event.evidence.outcome) return accept();
        // Also preserve conflicts on an older, superseded attempt without
        // overwriting the new attempt, the sale, or the first financial result.
        const duplicate = attempt.contradictions.some((evidence) =>
          evidence.outcome === event.evidence.outcome && evidence.reference === event.evidence.reference);
        return accept({
          ...checkout, reconciliationRequired: true,
          attempts: updateAttempt({
            ...attempt, contradictions: duplicate ? attempt.contradictions : [...attempt.contradictions, { ...event.evidence }],
          }),
        });
      }
      if (!working || locked || active?.id !== attempt.id) return reject('No unresolved active attempt.');
      if (attempt.method === 'cash' && event.evidence.outcome === 'non-payable') {
        return reject('QR non-payability cannot resolve a cash receipt.');
      }
      return accept({
        ...checkout,
        state: event.evidence.outcome === 'non-payable' ? 'ready-for-new-attempt' : 'payment-unresolved',
        attempts: updateAttempt({ ...attempt, payment: event.evidence.outcome, finalEvidence: { ...event.evidence } }),
      });
    }
    case 'timer-expired':
      // Time never establishes financial finality or unlocks another tender.
      return accept();
    case 'reservation-released':
      return accept({ ...checkout, reservation: checkout.reservation === 'held' ? 'released' : checkout.reservation });
    case 'reservation-secured':
      if (!working || locked) return reject('No active checkout eligible for a sale hold.');
      // Covers the original hold and an authoritative safe reacquisition after
      // release. The domain never assumes that late payment guarantees stock.
      return accept({ ...checkout, reservation: 'held' });
    case 'sale-recorded':
      if (checkout.state === 'completed' && checkout.saleId === event.saleId && active?.id === event.attemptId) {
        return accept();
      }
      if (!working || locked || active?.id !== event.attemptId || active.payment !== 'paid'
        || checkout.reservation !== 'held' || !event.saleId.trim() || checkout.saleId) {
        return reject('Completion requires verified payment, a safe sale hold and a durable sale.');
      }
      return accept({ ...checkout, state: 'completed', saleId: event.saleId });
    case 'fulfillment-failed':
      if (!working || locked || active?.id !== event.attemptId || active.payment !== 'paid') {
        return reject('Only verified received money can be paid but unfulfilled.');
      }
      return accept({ ...checkout, state: 'paid-but-unfulfilled', reconciliationRequired: true });
    case 'abandon':
      if (!event.authorized || locked || (checkout.state !== 'open' && checkout.state !== 'ready-for-new-attempt')) {
        return reject('Only an authorized safe checkout can be abandoned.');
      }
      return accept({ ...checkout, state: 'abandoned' });
    case 'reconciliation-closed':
      // Administrative remedies never create a sale, refund, or new tender.
      return reject('Reconciliation is independent of the checkout machine.');
  }
}
