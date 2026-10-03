/**
 * Cashier-facing copy for a rejected checkout. The words live in
 * `src/domain/userFacingError.ts`; this module only classifies the failure
 * (deleted product, stock conflict, cash-conflict, idempotency replay), hands
 * it to the shared describer, and records the raw payload on the device — it
 * never prints the API's message or details.
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

/** True when Laravel rejected the sale because a cart line's product is gone. */
export function hasMissingProductDetail(details: unknown): boolean {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false;
  return Object.keys(details).some((key) => {
    const normalized = key.toLowerCase();
    return normalized.includes('product_id') || normalized.includes('productid');
  });
}
