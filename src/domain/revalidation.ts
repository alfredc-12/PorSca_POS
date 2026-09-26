import { CartLine, Product } from '@/src/types';

/**
 * Pre-checkout revalidation (the captain's Q2 answer, option A+).
 *
 * Cart lines keep the price and stock they had when they were scanned, because
 * the cart is deliberately provisional and the server stays the pricing
 * authority. Before the cart is handed to checkout we re-read the catalog and
 * show the cashier exactly what changed, instead of letting the amount on the
 * screen drift from the amount Laravel will charge (defect G3) or letting a
 * stale stock snapshot through (defect G2).
 */

export type CartLineChangeKind = 'price' | 'stock' | 'removed';

export type CartLineChange = {
  productId: string;
  name: string;
  kind: CartLineChangeKind;
  /** Quantity in the cart when the change was detected. */
  quantity: number;
  previousPrice?: number;
  price?: number;
  previousStock?: number;
  stock?: number;
  /** True when the line cannot be sold as it stands. */
  blocking: boolean;
};

export type CartRevalidationStatus = 'ready' | 'review' | 'blocked' | 'offline' | 'unavailable';

export type CartRevalidation = {
  status: CartRevalidationStatus;
  message: string;
  changes: CartLineChange[];
  /** Reconciled cart: authoritative price and stock, quantities unchanged. */
  lines: CartLine[];
  /** The cart after applying the review: quantities clamped to stock, dead lines dropped. */
  appliedLines: CartLine[];
  /**
   * Identity of the cart lines this read was performed against. A result may
   * only be applied or navigated with while the live cart still matches it, so
   * edits made during or after the read can never be overwritten or bypass
   * validation (defect F2).
   */
  cartSignature: string;
};

/** Money comparisons use integer centavos so a float artefact is not a price change. */
function cents(value: number) {
  return Math.round(value * 100);
}

/**
 * Stable identity of a cart: product, quantity and authoritative price per line
 * in cart order. Price is part of the identity so a repriced cart is treated as
 * a different cart rather than silently reusing an earlier validation.
 */
export function cartSignature(cart: CartLine[]): string {
  return cart
    .map((line) => `${line.product.id}:${line.quantity}:${cents(line.product.price)}`)
    .join('|');
}

export function reconcileCart(cart: CartLine[], authoritative: Product[]): CartRevalidation {
  const byId = new Map(authoritative.map((product) => [product.id, product]));
  const changes: CartLineChange[] = [];
  const lines: CartLine[] = [];
  const appliedLines: CartLine[] = [];
  let blocked = false;

  for (const line of cart) {
    const product = byId.get(line.product.id);
    if (!product) {
      changes.push({
        productId: line.product.id,
        name: line.product.name,
        kind: 'removed',
        quantity: line.quantity,
        blocking: true,
      });
      blocked = true;
      continue;
    }

    if (cents(product.price) !== cents(line.product.price)) {
      changes.push({
        productId: product.id,
        name: product.name,
        kind: 'price',
        quantity: line.quantity,
        previousPrice: line.product.price,
        price: product.price,
        blocking: false,
      });
    }

    const shortStock = product.stock < line.quantity;
    if (product.stock !== line.product.stock || shortStock) {
      changes.push({
        productId: product.id,
        name: product.name,
        kind: 'stock',
        quantity: line.quantity,
        previousStock: line.product.stock,
        stock: product.stock,
        blocking: shortStock,
      });
    }

    lines.push({ product: { ...product }, quantity: line.quantity });

    if (shortStock) {
      blocked = true;
      const sellable = Math.max(product.stock, 0);
      if (sellable > 0) appliedLines.push({ product: { ...product }, quantity: sellable });
    } else {
      appliedLines.push({ product: { ...product }, quantity: line.quantity });
    }
  }

  const status: CartRevalidationStatus = blocked ? 'blocked' : changes.length ? 'review' : 'ready';
  return { status, message: statusMessage(status, changes), changes, lines, appliedLines, cartSignature: cartSignature(cart) };
}

function statusMessage(status: CartRevalidationStatus, changes: CartLineChange[]) {
  if (status === 'ready') return 'Prices and stock are current.';
  if (status === 'blocked') {
    const removed = changes.filter((change) => change.kind === 'removed').length;
    const short = changes.filter((change) => change.kind === 'stock' && change.blocking).length;
    const parts = [
      removed ? `${removed} ${removed === 1 ? 'product is' : 'products are'} no longer in the catalog` : undefined,
      short ? `${short} ${short === 1 ? 'item has' : 'items have'} less stock than the cart asks for` : undefined,
    ].filter(Boolean);
    return `${parts.join(', and ')}. Update the cart before payment; nothing has been charged.`;
  }
  const prices = changes.filter((change) => change.kind === 'price').length;
  const stock = changes.filter((change) => change.kind === 'stock').length;
  const parts = [
    prices ? `${prices} ${prices === 1 ? 'price' : 'prices'} changed` : undefined,
    stock ? `${stock} stock ${stock === 1 ? 'level' : 'levels'} changed` : undefined,
  ].filter(Boolean);
  return `${parts.join(' and ')} since ${changes.length === 1 ? 'this item was' : 'these items were'} added. Review before payment.`;
}
