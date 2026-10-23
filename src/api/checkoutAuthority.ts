/** V3 wire types. Money stays integer centavos until the existing UI seam. */
export type AuthorityAttempt = {
  id: number; method: 'cash' | 'qrph'; amountCentavos: number; currency: 'PHP';
  status: 'pending' | 'unknown' | 'paid' | 'non_payable' | 'contradiction';
  financialStatus: 'pending' | 'paid' | 'paid_unfulfilled' | 'failed' | 'expired';
  firstVerifiedOutcome: null | 'paid' | 'non_payable';
  qrPayload: string | null; qrExpiresAt: string | null;
  reservation: null | { state: 'held' | 'expired' | 'released'; expiresAt: string | null; durationSeconds: number };
};
export type AuthorityCheckout = {
  id: string; storeId: string; state: 'open' | 'payment_unresolved' | 'ready_for_attempt' | 'completed' | 'paid_unfulfilled' | 'provider_contradiction' | 'abandoned';
  revision: number; amountCentavos: number; currency: 'PHP';
  items: { productId: number; name: string; quantity: number; unitPriceCentavos: number }[];
  attempts: AuthorityAttempt[];
  sale: null | { id: number; method: 'cash' | 'qrph'; amountCentavos: number; cashReceivedCentavos: number | null; changeAmountCentavos: number | null; completedAt: string };
  exceptions: { caseId: number; reason: string; state: string }[];
  history: unknown[];
};
export type CheckoutSession = { user: { id: number; role: 'admin' | 'cashier'; isActive: boolean }; storeId: string; environment: string; contractVersion: string; simulationAllowed: boolean };
export type AuthorityPage<T> = { items: T[]; pagination: { current_page: number; last_page: number; total: number } };
export type CheckoutTender = { revision: number; acceptedAmountCentavos: number; cashReceivedCentavos?: number };
export type ReconciliationCase = { id: number; checkoutId: string; attemptId: number; reason: string; state: string; version: number; resolution: unknown; history: unknown[]; providerHistory: unknown[] };
