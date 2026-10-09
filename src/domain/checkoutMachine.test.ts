import {
  CheckoutEvent, CheckoutMachine, CheckoutState, openCheckout, transitionCheckout,
} from './checkoutMachine';

const begin: CheckoutEvent = {
  type: 'begin-attempt', attemptId: 'a1', method: 'qr', amountCentavos: 100,
  revalidated: true, revisedAmountAccepted: false,
};
const paid: CheckoutEvent = { type: 'verified-outcome', attemptId: 'a1', evidence: { outcome: 'paid', reference: 'provider-paid' } };
const nonPayable: CheckoutEvent = {
  type: 'verified-outcome', attemptId: 'a1', evidence: { outcome: 'non-payable', reference: 'provider-final-non-payable' },
};
const pending: CheckoutEvent = { type: 'authoritative-pending', attemptId: 'a1' };
const sale: CheckoutEvent = { type: 'sale-recorded', attemptId: 'a1', saleId: 'sale-1' };
const secure: CheckoutEvent = { type: 'reservation-secured' };
const release: CheckoutEvent = { type: 'reservation-released' };
const failed: CheckoutEvent = { type: 'fulfillment-failed', attemptId: 'a1' };

function step(checkout: CheckoutMachine, event: CheckoutEvent): CheckoutMachine {
  const result = transitionCheckout(checkout, event);
  expect(result.ok).toBe(true);
  return result.checkout;
}
function rejected(checkout: CheckoutMachine, event: CheckoutEvent) {
  const before = JSON.stringify(checkout);
  const result = transitionCheckout(checkout, event);
  expect(result.ok).toBe(false);
  expect(result.checkout).toBe(checkout);
  expect(JSON.stringify(checkout)).toBe(before);
}
function fixtures(): Record<CheckoutState, CheckoutMachine> {
  const open = openCheckout('checkout-1', 100);
  const progress = step(open, begin);
  const unresolved = step(progress, pending);
  const received = step(unresolved, paid);
  return {
    open,
    'payment-in-progress': progress,
    'payment-unresolved': unresolved,
    'ready-for-new-attempt': step(unresolved, nonPayable),
    completed: step(step(received, secure), sale),
    abandoned: step(open, { type: 'abandon', authorized: true }),
    'paid-but-unfulfilled': step(received, failed),
  };
}

/** Independent section 7 / D3 oracle: all seven states x every event class. */
const matrix: Record<CheckoutState, readonly string[]> = {
  open: ['begin', 'timer', 'release', 'abandon'],
  'payment-in-progress': ['pending', 'unavailable', 'paid', 'nonPayable', 'timer', 'release', 'secure'],
  'payment-unresolved': ['pending', 'unavailable', 'paid', 'nonPayable', 'timer', 'release', 'secure'],
  'ready-for-new-attempt': ['begin', 'paid', 'nonPayable', 'timer', 'release', 'abandon'],
  completed: ['paid', 'nonPayable', 'timer', 'release', 'sale'],
  abandoned: ['timer', 'release'],
  'paid-but-unfulfilled': ['paid', 'nonPayable', 'timer', 'release'],
};
const events: Record<string, CheckoutEvent> = {
  begin: { ...begin, attemptId: 'a2' }, pending,
  unavailable: { type: 'verification-failed', attemptId: 'a1', reason: 'transport' },
  paid, nonPayable, timer: { type: 'timer-expired' }, release, secure, sale, failed,
  abandon: { type: 'abandon', authorized: true }, close: { type: 'reconciliation-closed' },
};

describe('checkout section 7 transition machine', () => {
  for (const state of Object.keys(matrix) as CheckoutState[]) {
    describe(state, () => {
      for (const [name, event] of Object.entries(events)) {
        it(`${matrix[state].includes(name) ? 'accepts' : 'rejects'} ${name}`, () => {
          const checkout = fixtures()[state];
          const before = JSON.stringify(checkout);
          const result = transitionCheckout(checkout, event);
          expect(result.ok).toBe(matrix[state].includes(name));
          expect(JSON.stringify(checkout)).toBe(before);
          if (!result.ok) expect(result.checkout).toBe(checkout);
        });
      }
    });
  }

  it('opens with separate payment, reservation, and checkout state', () => {
    expect(openCheckout('checkout-1', 0)).toEqual({
      id: 'checkout-1', state: 'open', amountCentavos: 0, attempts: [], reservation: 'none', reconciliationRequired: false,
    });
    expect(() => openCheckout(' ', 100)).toThrow();
    expect(() => openCheckout('id', 0.5)).toThrow();
  });

  it.each(['cash', 'qr'] as const)('starts eligible %s without creating a sale', (method) => {
    const checkout = step(openCheckout('c', 100), { ...begin, method, cashInput: '2.00' });
    expect(checkout.state).toBe('payment-in-progress');
    expect(checkout.attempts[0]).toMatchObject({ id: 'a1', method, payment: 'pending', amountCentavos: 100 });
    expect(checkout.saleId).toBeUndefined();
    expect(checkout.reservation).toBe('none');
    if (method === 'cash') expect(checkout.attempts[0].cashReceivedCentavos).toBe(200);
  });

  it.each(['transport', 'timeout', '5xx', 'malformed'] as const)('first %s failure means unknown, never terminal', (reason) => {
    const progress = fixtures()['payment-in-progress'];
    const unknown = step(progress, { type: 'verification-failed', attemptId: 'a1', reason });
    expect(unknown.state).toBe('payment-unresolved');
    expect(unknown.attempts[0].payment).toBe('unknown');
    rejected(unknown, { ...begin, method: 'cash', attemptId: 'a2', cashInput: '1.00' });
    rejected(unknown, { type: 'abandon', authorized: true });
    const repeated = step(unknown, { type: 'verification-failed', attemptId: 'a1', reason });
    expect(repeated.attempts[0].payment).toBe('unknown');
    const recovered = step(repeated, pending);
    expect(recovered.state).toBe('payment-unresolved');
    expect(recovered.attempts[0].payment).toBe('pending');
    expect(recovered.attempts).toHaveLength(1);
  });

  it('cash confirmation uncertainty locks a second cash or QR tender', () => {
    const cash = step(openCheckout('c', 100), { ...begin, method: 'cash', cashInput: '1.00' });
    const unknown = step(cash, { type: 'verification-failed', attemptId: 'a1', reason: 'timeout' });
    for (const method of ['cash', 'qr'] as const) {
      rejected(unknown, { ...begin, method, attemptId: 'a2', cashInput: '1.00' });
    }
    rejected(unknown, nonPayable);
    const received = step(unknown, { ...paid, evidence: { outcome: 'paid', reference: 'authorized-cash-receipt' } });
    expect(step(step(received, secure), sale).state).toBe('completed');
  });

  it.each(['payment-in-progress', 'payment-unresolved'] as const)('verified non-payable from %s permits revalidated replacement', (state) => {
    const ready = step(fixtures()[state], nonPayable);
    expect(ready.state).toBe('ready-for-new-attempt');
    const replacement = { ...begin, attemptId: 'a2', method: 'cash' as const, cashInput: '1.00' };
    rejected(ready, { ...replacement, revalidated: false });
    rejected(ready, begin); // attempt ids cannot be reused
    rejected(ready, { ...replacement, amountCentavos: 150, cashInput: '2.00' });
    const newAttempt = step(ready, { ...replacement, amountCentavos: 150, cashInput: '2.00', revisedAmountAccepted: true });
    expect(newAttempt.state).toBe('payment-in-progress');
    expect(newAttempt.amountCentavos).toBe(150);
    expect(newAttempt.attempts.map((attempt) => attempt.id)).toEqual(['a1', 'a2']);
    expect(newAttempt.attempts[0].finalEvidence).toEqual({ outcome: 'non-payable', reference: 'provider-final-non-payable' });
    const received = step(newAttempt, { ...paid, attemptId: 'a2' });
    expect(step(step(received, secure), { ...sale, attemptId: 'a2' }).state).toBe('completed');
  });

  it.each(['payment-in-progress', 'payment-unresolved'] as const)('paid from %s requires both hold and durable sale', (state) => {
    const unpaid = fixtures()[state];
    rejected(step(unpaid, secure), sale);
    rejected(unpaid, failed);
    const received = step(unpaid, paid);
    expect(received.state).toBe('payment-unresolved');
    expect(received.attempts[0].payment).toBe('paid');
    rejected(received, sale);
    rejected(received, pending);
    rejected(received, { type: 'verification-failed', attemptId: 'a1', reason: 'timeout' });
    const held = step(received, secure);
    rejected(held, { ...sale, saleId: '' });
    const completed = step(held, sale);
    expect(completed.state).toBe('completed');
    expect(completed.saleId).toBe('sale-1');
    expect(step(completed, sale)).toBe(completed);
    rejected(completed, { ...sale, saleId: 'sale-2' });
    rejected(completed, { ...begin, attemptId: 'a2' });
    expect(step(received, failed).state).toBe('paid-but-unfulfilled');
  });

  it('timer expiry and reservation release never resolve payment or permit cash', () => {
    const pendingHeld = step(fixtures()['payment-unresolved'], secure);
    const timedOut = step(pendingHeld, { type: 'timer-expired' });
    expect(timedOut).toBe(pendingHeld);
    const released = step(timedOut, release);
    expect(released.reservation).toBe('released');
    expect(released.state).toBe('payment-unresolved');
    expect(released.attempts[0].payment).toBe('pending');
    rejected(released, { ...begin, attemptId: 'a2', method: 'cash', cashInput: '1.00' });
    const latePaid = step(released, paid);
    rejected(latePaid, sale);
    const safe = step(step(latePaid, secure), sale);
    expect(safe.state).toBe('completed');
    const unsafe = step(latePaid, failed);
    expect(unsafe.state).toBe('paid-but-unfulfilled');
    expect(unsafe.attempts[0].payment).toBe('paid');
    expect(unsafe.reconciliationRequired).toBe(true);
    rejected(unsafe, { type: 'reconciliation-closed' });
    rejected(unsafe, sale);
  });

  it.each(['open', 'ready-for-new-attempt'] as const)('authorized safe %s abandonment is terminal and preserves identity/history', (state) => {
    const original = fixtures()[state];
    rejected(original, { type: 'abandon', authorized: false });
    const abandoned = step(original, { type: 'abandon', authorized: true });
    expect(abandoned.state).toBe('abandoned');
    expect(abandoned.id).toBe(original.id);
    expect(abandoned.attempts).toBe(original.attempts);
    rejected(abandoned, { ...begin, attemptId: 'a2' });
  });

  it('preserves first verified paid, contradictory evidence, and completed sale', () => {
    const completed = fixtures().completed;
    const contradiction = step(completed, nonPayable);
    expect(contradiction.state).toBe('completed');
    expect(contradiction.saleId).toBe(completed.saleId);
    expect(contradiction.attempts[0].payment).toBe('paid');
    expect(contradiction.attempts[0].finalEvidence).toEqual(completed.attempts[0].finalEvidence);
    expect(contradiction.attempts[0].contradictions).toEqual([{ outcome: 'non-payable', reference: 'provider-final-non-payable' }]);
    expect(contradiction.reconciliationRequired).toBe(true);
    expect(step(contradiction, nonPayable).attempts[0].contradictions).toHaveLength(1);
    rejected(contradiction, { ...begin, attemptId: 'a2' });
    rejected(contradiction, { type: 'reconciliation-closed' });
  });

  it('contradiction locks ready checkout and also correlates superseded attempts', () => {
    const ready = fixtures()['ready-for-new-attempt'];
    const conflict = step(ready, paid);
    expect(conflict.state).toBe('ready-for-new-attempt');
    expect(conflict.attempts[0].payment).toBe('non-payable');
    expect(conflict.reconciliationRequired).toBe(true);
    rejected(conflict, { ...begin, attemptId: 'a2' });
    rejected(conflict, { type: 'abandon', authorized: true });
    const replacement = step(ready, { ...begin, attemptId: 'a2' });
    const oldConflict = step(replacement, paid);
    expect(oldConflict.attempts[0].contradictions).toHaveLength(1);
    expect(oldConflict.attempts[1].payment).toBe('pending');
    rejected(oldConflict, { ...paid, attemptId: 'a2' });
    rejected(oldConflict, secure);
  });

  it('ignores duplicate final observations without duplicating sale or effects', () => {
    const completed = fixtures().completed;
    expect(step(completed, paid)).toBe(completed);
    expect(step(fixtures()['ready-for-new-attempt'], nonPayable).attempts).toHaveLength(1);
  });

  it('rejects evidence and actions not correlated to the active attempt', () => {
    const current = fixtures()['payment-in-progress'];
    rejected(current, { ...paid, attemptId: 'unrelated' });
    rejected(current, { ...paid, evidence: { outcome: 'paid', reference: '' } });
    rejected(current, { ...pending, attemptId: 'unrelated' });
    rejected(current, { type: 'verification-failed', attemptId: 'unrelated', reason: 'malformed' });
    const received = step(step(current, paid), secure);
    rejected(received, { ...sale, attemptId: 'unrelated' });
    rejected(received, { ...failed, attemptId: 'unrelated' });
  });

  it.each(['', 'invalid', '1e2', '0.99'])('rejects invalid or insufficient cash %j without an attempt', (cashInput) => {
    rejected(openCheckout('c', 100), { ...begin, method: 'cash', cashInput });
  });
  it.each([-1, NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe attempt amount %s', (amountCentavos) => {
    rejected(openCheckout('c', 100), { ...begin, amountCentavos, revisedAmountAccepted: true });
  });
  it('requires revalidation and distinct nonempty identity even for the first attempt', () => {
    const checkout = openCheckout('c', 100);
    rejected(checkout, { ...begin, revalidated: false });
    rejected(checkout, { ...begin, attemptId: ' ' });
  });

  it('copies observed evidence so later caller mutation cannot rewrite financial history', () => {
    const evidence = { outcome: 'paid' as const, reference: 'original-paid-reference' };
    const received = step(fixtures()['payment-in-progress'], { type: 'verified-outcome', attemptId: 'a1', evidence });
    evidence.reference = 'changed-by-caller';
    expect(received.attempts[0].finalEvidence?.reference).toBe('original-paid-reference');
    const conflicting = { outcome: 'non-payable' as const, reference: 'original-conflict-reference' };
    const conflict = step(received, { type: 'verified-outcome', attemptId: 'a1', evidence: conflicting });
    conflicting.reference = 'changed-by-caller';
    expect(conflict.attempts[0].contradictions[0].reference).toBe('original-conflict-reference');
  });

  it('recovers a serialized unknown snapshot without creating an attempt', () => {
    const unknown = step(fixtures()['payment-in-progress'], { type: 'verification-failed', attemptId: 'a1', reason: 'transport' });
    const restored: CheckoutMachine = JSON.parse(JSON.stringify(unknown));
    const recovered = step(restored, pending);
    expect(recovered.id).toBe(unknown.id);
    expect(recovered.amountCentavos).toBe(unknown.amountCentavos);
    expect(recovered.attempts.map((attempt) => attempt.id)).toEqual(['a1']);
    expect(recovered.attempts[0].payment).toBe('pending');
  });

  it('can advance frozen input snapshots without mutation', () => {
    const checkout = fixtures()['payment-in-progress'];
    Object.freeze(checkout.attempts[0].contradictions);
    Object.freeze(checkout.attempts[0]);
    Object.freeze(checkout.attempts);
    Object.freeze(checkout);
    expect(step(checkout, paid).attempts[0].payment).toBe('paid');
    expect(checkout.attempts[0].payment).toBe('pending');
  });
});
