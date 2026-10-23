import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { authorityObservation } from './checkoutAuthorityAdapter';
import { canAcceptCheckoutTender } from './checkoutMachine';

export type CheckoutBadge = 'Ready for tender' | 'Payment waiting' | 'Payment interrupted' | 'Admin review' | 'Cancelled' | 'Completed';

export function checkoutBadge(checkout: AuthorityCheckout): CheckoutBadge {
  const completedSale = checkout.state === 'completed' && Boolean(checkout.sale);
  const paymentStillUnresolved = checkout.attempts.some(attempt => attempt.status === 'pending' || attempt.status === 'unknown');
  if (checkout.exceptions.length > 0 || checkout.state === 'paid_unfulfilled' || checkout.state === 'provider_contradiction'
    || (checkout.state === 'completed' && paymentStillUnresolved)
    || checkout.attempts.some(attempt => attempt.status === 'contradiction' || (attempt.status === 'paid' && !completedSale))) return 'Admin review';
  if (checkout.state === 'abandoned') return 'Cancelled';
  if (checkout.state === 'completed') return checkout.sale ? 'Completed' : 'Admin review';
  if (checkout.state === 'payment_unresolved') {
    const latest = checkout.attempts[checkout.attempts.length - 1];
    return latest?.status === 'pending' ? 'Payment waiting' : 'Payment interrupted';
  }
  return 'Ready for tender';
}

export function isOpenCheckout(checkout: AuthorityCheckout) {
  return checkout.state !== 'completed' && checkout.state !== 'abandoned';
}

export function isPaymentLocked(checkout: AuthorityCheckout) {
  const completedSale = checkout.state === 'completed' && Boolean(checkout.sale);
  return checkout.state === 'payment_unresolved'
    || checkout.state === 'paid_unfulfilled'
    || checkout.state === 'provider_contradiction'
    || checkout.attempts.some(attempt => attempt.status === 'pending' || attempt.status === 'unknown' || attempt.status === 'contradiction' || (attempt.status === 'paid' && !completedSale));
}

export function canCancelCheckout(checkout: AuthorityCheckout) {
  const observation = authorityObservation(checkout);
  return (checkout.state === 'open' || checkout.state === 'ready_for_attempt')
    && checkout.exceptions.length === 0
    && !observation.reconciliationRequired
    && canAcceptCheckoutTender(observation)
    && !isPaymentLocked(checkout);
}

export function shortCheckoutId(id: string) {
  return id.replace(/-/g, '').slice(0, 8).toUpperCase();
}

export function elapsedCheckoutTime(checkout: AuthorityCheckout, now = Date.now()) {
  const timestamp = checkoutTimestamp(checkout);
  if (timestamp === undefined) return 'Elapsed time unavailable';
  const elapsedMinutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (elapsedMinutes < 1) return 'Less than 1m';
  if (elapsedMinutes < 60) return `${elapsedMinutes}m`;
  const hours = Math.floor(elapsedMinutes / 60);
  const minutes = elapsedMinutes % 60;
  if (hours < 24) return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours ? `${days}d ${remainingHours}h` : `${days}d`;
}

function checkoutTimestamp(checkout: AuthorityCheckout) {
  const raw = checkout as AuthorityCheckout & { createdAt?: unknown; created_at?: unknown; history?: unknown[] };
  const direct = parseTimestamp(raw.createdAt) ?? parseTimestamp(raw.created_at);
  if (direct !== undefined) return direct;
  const history = raw.history ?? [];
  const timestamps = history.flatMap(event => {
    if (!event || typeof event !== 'object') return [];
    const record = event as { createdAt?: unknown; created_at?: unknown; occurredAt?: unknown; occurred_at?: unknown };
    const value = parseTimestamp(record.createdAt) ?? parseTimestamp(record.created_at) ?? parseTimestamp(record.occurredAt) ?? parseTimestamp(record.occurred_at);
    return value === undefined ? [] : [value];
  });
  return timestamps.length ? Math.min(...timestamps) : undefined;
}

function parseTimestamp(value: unknown) {
  if (typeof value !== 'string' || !value) return undefined;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}
