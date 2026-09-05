import React, { createContext, useContext, useMemo, useState } from 'react';
import { seedProducts } from '@/src/data/mockProducts';
import { CartLine, PaymentMethod, Product, Sale } from '@/src/types';

type PosContextValue = {
  products: Product[];
  cart: CartLine[];
  sales: Sale[];
  total: number;
  addByBarcode: (barcode: string) => { ok: boolean; message: string };
  addProduct: (product: Product) => void;
  decrementProduct: (productId: string) => void;
  clearCart: () => void;
  updateProduct: (product: Product) => void;
  createProduct: (product: Omit<Product, 'id'>) => void;
  completeSale: (method: PaymentMethod) => Sale | null;
};

const PosContext = createContext<PosContextValue | null>(null);

export function PosProvider({ children }: { children: React.ReactNode }) {
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  const total = useMemo(
    () => cart.reduce((sum, line) => sum + line.product.price * line.quantity, 0),
    [cart],
  );

  const addProduct = (product: Product) => {
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      const currentQty = existing?.quantity ?? 0;
      if (currentQty >= product.stock) return current;
      if (existing) {
        return current.map((line) =>
          line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      return [...current, { product, quantity: 1 }];
    });
  };

  const addByBarcode = (barcode: string) => {
    const product = products.find((item) => item.barcode === barcode);
    if (!product) return { ok: false, message: 'Product not found in inventory.' };
    if (product.stock <= 0) return { ok: false, message: `${product.name} is out of stock.` };
    const currentQty = cart.find((line) => line.product.id === product.id)?.quantity ?? 0;
    if (currentQty >= product.stock) return { ok: false, message: 'No more stock is available for this item.' };
    addProduct(product);
    return { ok: true, message: `${product.name} added to cart.` };
  };

  const decrementProduct = (productId: string) => {
    setCart((current) =>
      current.flatMap((line) => {
        if (line.product.id !== productId) return [line];
        if (line.quantity <= 1) return [];
        return [{ ...line, quantity: line.quantity - 1 }];
      }),
    );
  };

  const clearCart = () => setCart([]);

  const updateProduct = (updated: Product) => {
    setProducts((current) => current.map((product) => (product.id === updated.id ? updated : product)));
  };

  const createProduct = (input: Omit<Product, 'id'>) => {
    setProducts((current) => [
      ...current,
      { ...input, id: `prd-${Date.now()}` },
    ]);
  };

  const completeSale = (paymentMethod: PaymentMethod) => {
    if (cart.length === 0) return null;
    const valid = cart.every((line) => {
      const live = products.find((product) => product.id === line.product.id);
      return live && live.stock >= line.quantity;
    });
    if (!valid) return null;

    const sale: Sale = {
      id: `TX-${Date.now().toString().slice(-8)}`,
      createdAt: new Date().toISOString(),
      total,
      paymentMethod,
      status: 'paid',
      items: cart.map((line) => ({ ...line })),
    };

    setProducts((current) =>
      current.map((product) => {
        const line = cart.find((item) => item.product.id === product.id);
        return line ? { ...product, stock: product.stock - line.quantity } : product;
      }),
    );
    setSales((current) => [sale, ...current]);
    setCart([]);
    return sale;
  };

  return (
    <PosContext.Provider
      value={{
        products,
        cart,
        sales,
        total,
        addByBarcode,
        addProduct,
        decrementProduct,
        clearCart,
        updateProduct,
        createProduct,
        completeSale,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

export function usePos() {
  const context = useContext(PosContext);
  if (!context) throw new Error('usePos must be used within PosProvider');
  return context;
}
