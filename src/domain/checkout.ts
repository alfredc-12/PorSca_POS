/**
 * Checkout failure classification and cashier-facing copy. The words live in
 * `src/domain/userFacingError.ts`; this module only classifies the failure
 * (deleted product, stock conflict, cash-conflict, idempotency replay,
 * definitive QR refusal), hands it to the shared describer, and records the
 * raw payload on the device — it never prints the API's message or details.
 */

import { DescribedFailure, Failure } from '@/src/domain/userFacingError';
import { describeAndRecordFailure } from '@/src/observability/diagnostics';

export type CheckoutFailure = DescribedFailure;

export type ApiFailure = Failure;

export function saleFailureCopy(error: ApiFailure): CheckoutFailure {
  // A cart line whose product disappeared is a distinct recovery from a plain
  // validation rejection, so it gets its own class before the shared mapping.
  const failure = hasMissingProductDetail(error.details) ? { ...error, code: 'product_missing' } : error;
  return describeAndRecordFailure(failure, { screen: 'cash-sale' });
}

/**
 * Statuses that answer a QR creation without proving whether an attempt was
 * created: a request timeout, a conflict, a too-early retry, and a throttle
 * response all leave a provider attempt possible, so they stay unresolved.
 */
const QR_CREATION_UNCERTAIN_STATUSES = [408, 409, 425, 429];

/**
 * True when Laravel's answer proved that no QR Ph attempt exists to collect
 * money: a 4xx refusal that is not one of the uncertain answers above. A
 * transport failure, a 5xx, or an uncertain status may still have created an
 * attempt, so its idempotency key is kept and cash stays blocked.
 */
export function isDefinitiveQrRejection(failure: ApiFailure): boolean {
  const status = failure.status;
  return status !== undefined && status >= 400 && status < 500 && !QR_CREATION_UNCERTAIN_STATUSES.includes(status);
}

/** True when Laravel rejected the sale because a cart line's product is gone. */
export function hasMissingProductDetail(details: unknown): boolean {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false;
  return Object.keys(details).some((key) => {
    const normalized = key.toLowerCase();
    return normalized.includes('product_id') || normalized.includes('productid');
  });
}
