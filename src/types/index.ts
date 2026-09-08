export type PaymentMethod = 'cash' | 'qrph';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'cancelled' | 'expired';
export type ProductCategory = 'Beverages' | 'Noodles' | 'Milk' | 'Snacks' | 'Personal Care' | 'Household' | 'General';
export type StockStatus = 'in_stock' | 'low_stock' | 'out_of_stock';

export type Product = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  stock: number;
  /** Laravel's authoritative stock state, when this product came from the API. */
  stockStatus?: StockStatus;
  reorderLevel?: number;
  sku?: string;
  category?: ProductCategory;
};

export type CartLine = {
  product: Product;
  quantity: number;
};

export type Sale = {
  id: string;
  createdAt: string;
  total: number;
  paymentMethod: PaymentMethod;
  status: PaymentStatus;
  /** Present for cash sales returned by Laravel. */
  cashReceived?: number;
  change?: number;
  idempotencyKey?: string;
  items: CartLine[];
};
