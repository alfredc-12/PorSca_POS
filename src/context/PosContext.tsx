import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { apiClient, ApiClient } from '@/src/api/client';
import { addProductToCart, calculateCartTotal, CartChange, deductStock, decrementCartLine } from '@/src/domain/pos';
import { seedProducts } from '@/src/data/mockProducts';
import { CartLine, PaymentMethod, Product, Sale } from '@/src/types';

type PosContextValue = {
  products: Product[];
  cart: CartLine[];
  sales: Sale[];
  total: number;
  addByBarcode: (barcode: string) => { ok: boolean; message: string };
  addProduct: (product: Product) => void;
  addProductChecked: (product: Product) => CartChange;
  decrementProduct: (productId: string) => void;
  clearCart: () => void;
  updateProduct: (product: Product) => void;
  createProduct: (product: Omit<Product, 'id'>) => void;
  completeSale: (method: PaymentMethod) => Sale | null;
  apiConfigured: boolean;
  refreshProducts: () => Promise<boolean>;
};

const PosContext = createContext<PosContextValue | null>(null);

export function PosProvider({ children, client = apiClient }: { children: React.ReactNode; client?: ApiClient }) {
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);

  const total = useMemo(() => calculateCartTotal(cart), [cart]);

  const addProduct = (product: Product) => {
    setCart((current) => addProductToCart(current, product).cart);
  };

  const addProductChecked = (product: Product) => {
    const result = addProductToCart(cart, product);
    setCart(result.cart);
    return result;
  };

  const addByBarcode = (barcode: string) => {
    const product = products.find((item) => item.barcode === barcode);
    if (!product) return { ok: false, message: 'Product not found in inventory.' };
    if (product.stock <= 0) return { ok: false, message: `${product.name} is out of stock.` };
    const currentQty = cart.find((line) => line.product.id === product.id)?.quantity ?? 0;
    if (currentQty >= product.stock) return { ok: false, message: 'No more stock is available for this item.' };
    addProductChecked(product);
    return { ok: true, message: `${product.name} added to cart.` };
  };

  const decrementProduct = (productId: string) => {
    setCart((current) => decrementCartLine(current, productId));
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
    const productsAfterSale = deductStock(products, cart);
    if (!productsAfterSale) return null;

    const sale: Sale = {
      id: `TX-${Date.now().toString().slice(-8)}`,
      createdAt: new Date().toISOString(),
      total,
      paymentMethod,
      status: 'paid',
      items: cart.map((line) => ({ ...line })),
    };

    setProducts(productsAfterSale);
    setSales((current) => [sale, ...current]);
    setCart([]);
    return sale;
  };

  const refreshProducts = useCallback(async () => {
    if (!client.isConfigured) return false;
    try {
      setProducts(await client.listProducts());
      return true;
    } catch {
      // Keep the seeded demo data available when the configured API is offline.
      return false;
    }
  }, [client]);

  useEffect(() => {
    if (!client.isConfigured) return;
    let mounted = true;
    void client.listProducts()
      .then((remoteProducts) => {
        if (mounted) setProducts(remoteProducts);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [client]);

  return (
    <PosContext.Provider
      value={{
        products,
        cart,
        sales,
        total,
        addByBarcode,
        addProduct,
        addProductChecked,
        decrementProduct,
        clearCart,
        updateProduct,
        createProduct,
        completeSale,
        apiConfigured: client.isConfigured,
        refreshProducts,
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
