/**
 * Cashier-facing copy for a rejected checkout. The API's validation detail for
 * a product that disappeared between cart and checkout is a field path
 * (`items.0.product_id`), which surfaced as generic validation copy before
 * (defect G8).
 */

export type CheckoutFailure = { title: string; message: string };

export type ApiFailure = {
  status?: number;
  code?: string;
  message?: string;
  details?: unknown;
};

export function saleFailureCopy(error: ApiFailure): CheckoutFailure {
  const detail = error.message?.trim();

  if (error.code === 'insufficient_stock') {
    return {
      title: 'Insufficient stock',
      message: `${detail ?? 'Some items are no longer available.'} Refresh inventory and remove the unavailable item, then try again.`,
    };
  }

  // An uncertain cash attempt that the client refused to replay is not a stock
  // problem: the cashier has to confirm the earlier receipt first (defect F3).
  if (error.code === 'cash_attempt_unresolved' || error.code === 'cash_attempt_already_recorded') {
    return {
      title: 'Earlier cash attempt needs checking',
      message: `${detail ?? 'An earlier cash attempt could not be confirmed.'} Check Transactions before taking payment again. Your cart is still here.`,
    };
  }

  if (error.code === 'insufficient_cash') {
    return {
      title: 'Insufficient cash',
      message: `${detail ?? 'Cash received is below the amount due.'} Enter more cash and confirm again. Your cart is still here.`,
    };
  }

  // Laravel answers 409 for both insufficient stock and an idempotency key
  // reused for a different request. The stock case is handled by its code
  // above, so a remaining 409 is a replay conflict, not a stock problem.
  if (error.status === 409 || isIdempotencyCode(error.code)) {
    return {
      title: 'Sale already in progress',
      message: `${detail ?? 'Laravel recognised this as a repeated request.'} Retry with the same cart and cash, or check Transactions before taking payment again. Your cart is still here.`,
    };
  }

  if (hasMissingProductDetail(error.details)) {
    return {
      title: 'Product no longer available',
      message: 'A product in this cart is no longer in the catalog, so Laravel rejected the sale. Remove that item from the cart and try again. Your cart is still here.',
    };
  }

  const fieldDetail = firstDetailMessage(error.details);
  return {
    title: 'Unable to complete sale',
    message: `The sale was not confirmed. ${fieldDetail ?? detail ?? 'Check your connection and try again.'} Your cart is still here so you can retry safely.`,
  };
}

/** True when Laravel names an idempotency replay conflict in the error code. */
export function isIdempotencyCode(code: string | undefined): boolean {
  return typeof code === 'string' && code.toLowerCase().includes('idempot');
}

/** True when Laravel rejected the sale because a cart line's product is gone. */
export function hasMissingProductDetail(details: unknown): boolean {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return false;
  return Object.keys(details).some((key) => {
    const normalized = key.toLowerCase();
    return normalized.includes('product_id') || normalized.includes('productid');
  });
}

function firstDetailMessage(details: unknown): string | undefined {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return undefined;
  for (const value of Object.values(details as Record<string, unknown>)) {
    if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
    if (typeof value === 'string') return value;
  }
  return undefined;
}
