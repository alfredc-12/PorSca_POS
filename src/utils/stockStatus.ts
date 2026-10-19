import { Product, StockStatus } from '@/src/types';

/** Local and demo rows have no Laravel classification, so they fall back to the cashier-facing threshold. */
export const DEFAULT_LOW_STOCK_THRESHOLD = 10;

/** Prefer Laravel's classification; local/demo rows use their own reorder level or the default threshold. */
export function stockStatus(product: Product): StockStatus {
  if (product.stockStatus) return product.stockStatus;
  if (product.stock <= 0) return 'out_of_stock';
  return product.stock <= (product.reorderLevel ?? DEFAULT_LOW_STOCK_THRESHOLD) ? 'low_stock' : 'in_stock';
}
