export type PaymentMethod = 'cash' | 'qrph';
export type PaymentStatus = 'pending' | 'paid' | 'failed' | 'expired';

export type Product = {
  id: string;
  barcode: string;
  name: string;
  price: number;
  stock: number;
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
  items: CartLine[];
};
