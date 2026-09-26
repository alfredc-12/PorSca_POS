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

  if (error.code === 'insufficient_stock' || error.status === 409) {
    return {
      title: 'Insufficient stock',
      message: `${detail ?? 'Some items are no longer available.'} Refresh inventory and remove the unavailable item, then try again.`,
    };
  }

  if (error.code === 'insufficient_cash') {
    return {
      title: 'Insufficient cash',
      message: `${detail ?? 'Cash received is below the amount due.'} Enter more cash and confirm again. Your cart is still here.`,
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
