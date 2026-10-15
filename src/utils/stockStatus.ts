import { Product, StockStatus } from '@/src/types';

/** Prefer Laravel's classification; local/demo rows use their own reorder level. */
export function stockStatus(product: Product): StockStatus {
  return product.stockStatus ?? (product.stock <= 0
    ? 'out_of_stock'
    : product.stock <= (product.reorderLevel ?? 0) ? 'low_stock' : 'in_stock');
}
