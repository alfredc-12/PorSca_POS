import { CartLine, PaymentStatus, Product } from '@/src/types';

export type CartChange = {
  ok: boolean;
  cart: CartLine[];
  message?: string;
};

export type CashResult = {
  sufficient: boolean;
  change: number;
  shortfall: number;
};

/** Use integer centavos for money comparisons so checkout does not drift. */
function cents(value: number) {
  return Math.round(value * 100);
}

function pesos(value: number) {
  return Math.round(value) / 100;
}

export function calculateCartTotal(cart: CartLine[]) {
  return pesos(cart.reduce((sum, line) => sum + cents(line.product.price) * line.quantity, 0));
}

export function searchProducts(products: Product[], query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return products;
  return products.filter((product) =>
    product.name.toLowerCase().includes(normalized) ||
    product.barcode.includes(normalized) ||
    (product.category ?? '').toLowerCase().includes(normalized),
  );
}

export function addProductToCart(cart: CartLine[], product: Product): CartChange {
  if (product.stock <= 0) {
    return { ok: false, cart, message: `${product.name} is out of stock.` };
  }

  const existing = cart.find((line) => line.product.id === product.id);
  const currentQuantity = existing?.quantity ?? 0;
  if (currentQuantity >= product.stock) {
    return { ok: false, cart, message: 'No more stock is available for this item.' };
  }

  if (existing) {
    return {
      ok: true,
      cart: cart.map((line) => line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line),
    };
  }

  return { ok: true, cart: [...cart, { product, quantity: 1 }] };
}

export function decrementCartLine(cart: CartLine[], productId: string) {
  return cart.flatMap((line) => {
    if (line.product.id !== productId) return [line];
    if (line.quantity <= 1) return [];
    return [{ ...line, quantity: line.quantity - 1 }];
  });
}

export function cashChange(total: number, received: number): CashResult {
  const due = cents(total);
  const paid = cents(Number.isFinite(received) ? received : 0);
  return {
    sufficient: paid >= due,
    change: pesos(Math.max(paid - due, 0)),
    shortfall: pesos(Math.max(due - paid, 0)),
  };
}

export function hasSufficientStock(cart: CartLine[], products: Product[]) {
  return cart.every((line) => {
    const liveProduct = products.find((product) => product.id === line.product.id);
    return Boolean(liveProduct && liveProduct.stock >= line.quantity);
  });
}

/**
 * Apply a paid cart once. Validation happens before mapping so a stale cart can
 * never partially deduct inventory.
 */
export function deductStock(products: Product[], cart: CartLine[]) {
  if (!hasSufficientStock(cart, products)) return null;
  return products.map((product) => {
    const line = cart.find((item) => item.product.id === product.id);
    return line ? { ...product, stock: product.stock - line.quantity } : product;
  });
}

export function paymentError(status: PaymentStatus) {
  switch (status) {
    case 'pending':
      return 'Payment is still pending. Keep the QR screen open or try again later.';
    case 'failed':
      return 'Payment failed. No sale was recorded and stock was not changed.';
    case 'cancelled':
      return 'Payment was cancelled. No sale was recorded and stock was not changed.';
    case 'expired':
      return 'Payment expired. Start a new QR Ph payment; stock was not changed.';
    case 'paid':
      return null;
  }
}

export function canRecordPaidSale(status: PaymentStatus) {
  return status === 'paid';
}
