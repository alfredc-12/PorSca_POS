import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { apiClient, ApiClient, ApiClientError } from '@/src/api/client';
import { addProductToCart, calculateCartTotal, CartChange, deductStock, decrementCartLine, searchProducts as searchLocalProducts } from '@/src/domain/pos';
import { seedProducts } from '@/src/data/mockProducts';
import { CartLine, PaymentMethod, Product, Sale } from '@/src/types';

export type ReadState = 'idle' | 'loading' | 'ready' | 'unavailable';

export type BarcodeLookupResult = {
  ok: boolean;
  product?: Product;
  status: 'found' | 'not-found' | 'unavailable' | 'out-of-stock';
  message: string;
  usingFallback?: boolean;
};

type PosContextValue = {
  products: Product[];
  inventoryProducts: Product[];
  searchResults: Product[];
  catalogState: ReadState;
  catalogError?: string;
  catalogUsingFallback: boolean;
  inventoryState: ReadState;
  inventoryError?: string;
  inventoryUsingFallback: boolean;
  cart: CartLine[];
  sales: Sale[];
  total: number;
  addByBarcode: (barcode: string) => Promise<BarcodeLookupResult>;
  lookupProductByBarcode: (barcode: string) => Promise<BarcodeLookupResult>;
  addProduct: (product: Product) => void;
  addProductChecked: (product: Product) => CartChange;
  decrementProduct: (productId: string) => void;
  clearCart: () => void;
  updateProduct: (product: Product) => void;
  createProduct: (product: Omit<Product, 'id'>) => void;
  completeSale: (method: PaymentMethod) => Sale | null;
  apiConfigured: boolean;
  searchProducts: (query: string) => Promise<void>;
  refreshProducts: () => Promise<boolean>;
  refreshInventory: () => Promise<boolean>;
};

const PosContext = createContext<PosContextValue | null>(null);

export function PosProvider({ children, client = apiClient }: { children: React.ReactNode; client?: ApiClient }) {
  const [products, setProducts] = useState<Product[]>(seedProducts);
  const [inventoryProducts, setInventoryProducts] = useState<Product[]>(seedProducts);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [catalogState, setCatalogState] = useState<ReadState>('idle');
  const [catalogError, setCatalogError] = useState<string>();
  const [catalogUsingFallback, setCatalogUsingFallback] = useState(false);
  const [inventoryState, setInventoryState] = useState<ReadState>('idle');
  const [inventoryError, setInventoryError] = useState<string>();
  const [inventoryUsingFallback, setInventoryUsingFallback] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const requestId = useRef(0);
  const productsRef = useRef(products);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const total = useMemo(() => calculateCartTotal(cart), [cart]);

  const rememberProducts = useCallback((remoteProducts: Product[]) => {
    setProducts((current) => mergeProducts(current, remoteProducts));
  }, []);

  const addProduct = (product: Product) => {
    setCart((current) => addProductToCart(current, product).cart);
  };

  const addProductChecked = useCallback((product: Product) => {
    const result = addProductToCart(cart, product);
    setCart(result.cart);
    return result;
  }, [cart]);

  const lookupProductByBarcode = useCallback(async (barcode: string): Promise<BarcodeLookupResult> => {
    const normalizedBarcode = barcode.trim();
    if (!normalizedBarcode) {
      return { ok: false, status: 'not-found', message: 'Enter or scan a product barcode.' };
    }

    if (!client.isConfigured) {
      const fallbackProduct = productsRef.current.find((item) => item.barcode === normalizedBarcode);
      return fallbackProduct
        ? { ok: true, product: fallbackProduct, status: 'found', message: `${fallbackProduct.name} found in the offline demo catalog.`, usingFallback: true }
        : { ok: false, status: 'unavailable', message: 'The Laravel API is unavailable. Retry when connected before looking up this barcode.', usingFallback: true };
    }

    try {
      const product = await client.getProductByBarcode(normalizedBarcode);
      rememberProducts([product]);
      return { ok: true, product, status: 'found', message: `${product.name} found.` };
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) {
        return { ok: false, status: 'not-found', message: 'No product was found for this barcode.' };
      }

      const fallbackProduct = productsRef.current.find((item) => item.barcode === normalizedBarcode);
      return fallbackProduct
        ? { ok: true, product: fallbackProduct, status: 'found', message: `${fallbackProduct.name} found in the offline demo catalog.`, usingFallback: true }
        : { ok: false, status: 'unavailable', message: 'The Laravel API is unavailable. Retry when connected before looking up this barcode.', usingFallback: true };
    }
  }, [client, rememberProducts]);

  const addByBarcode = useCallback(async (barcode: string) => {
    const lookup = await lookupProductByBarcode(barcode);
    if (!lookup.ok || !lookup.product) return lookup;

    const result = addProductChecked(lookup.product);
    if (!result.ok) {
      return {
        ...lookup,
        ok: false,
        status: 'out-of-stock' as const,
        message: result.message ?? `${lookup.product.name} is out of stock.`,
      };
    }

    return { ...lookup, message: `${lookup.product.name} added to cart.` };
  }, [addProductChecked, lookupProductByBarcode]);

  const decrementProduct = (productId: string) => {
    setCart((current) => decrementCartLine(current, productId));
  };

  const clearCart = () => setCart([]);

  const updateProduct = (updated: Product) => {
    setProducts((current) => replaceProduct(current, updated));
    setInventoryProducts((current) => replaceProduct(current, updated));
    setSearchResults((current) => replaceProduct(current, updated));
  };

  const createProduct = (input: Omit<Product, 'id'>) => {
    const product = { ...input, id: `prd-${Date.now()}` };
    setProducts((current) => [...current, product]);
    setInventoryProducts((current) => [...current, product]);
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
    setInventoryProducts((current) => deductStock(current, cart) ?? current);
    setSearchResults((current) => deductStock(current, cart) ?? current);
    setSales((current) => [sale, ...current]);
    setCart([]);
    return sale;
  };

  const searchProducts = useCallback(async (query: string) => {
    const normalizedQuery = query.trim();
    const currentRequest = ++requestId.current;
    if (!normalizedQuery) {
      setSearchResults([]);
      setCatalogState('idle');
      setCatalogError(undefined);
      setCatalogUsingFallback(false);
      return;
    }

    setCatalogState('loading');
    setCatalogError(undefined);
    setCatalogUsingFallback(false);

    if (!client.isConfigured) {
      setSearchResults(searchLocalProducts(productsRef.current, normalizedQuery));
      setCatalogState('unavailable');
      setCatalogError('Laravel API is unavailable. Showing the offline demo catalog.');
      setCatalogUsingFallback(true);
      return;
    }

    try {
      const remoteProducts = /^\d+$/.test(normalizedQuery)
        ? await client.listProducts({ barcode: normalizedQuery })
        : await client.listProducts({ search: normalizedQuery });
      if (currentRequest !== requestId.current) return;
      setSearchResults(remoteProducts);
      rememberProducts(remoteProducts);
      setCatalogState('ready');
    } catch {
      if (currentRequest !== requestId.current) return;
      setSearchResults(searchLocalProducts(productsRef.current, normalizedQuery));
      setCatalogState('unavailable');
      setCatalogError('Laravel API is unavailable. Showing the offline demo catalog.');
      setCatalogUsingFallback(true);
    }
  }, [client, rememberProducts]);

  const refreshProducts = useCallback(async () => {
    if (!client.isConfigured) return false;
    try {
      const remoteProducts = await client.listProducts();
      rememberProducts(remoteProducts);
      setCatalogState('ready');
      setCatalogError(undefined);
      setCatalogUsingFallback(false);
      return true;
    } catch {
      setCatalogState('unavailable');
      setCatalogError('Laravel API is unavailable. Showing the offline demo catalog.');
      setCatalogUsingFallback(true);
      return false;
    }
  }, [client, rememberProducts]);

  const refreshInventory = useCallback(async () => {
    setInventoryState('loading');
    setInventoryError(undefined);
    setInventoryUsingFallback(false);

    if (!client.isConfigured) {
      setInventoryProducts(seedProducts);
      setInventoryState('unavailable');
      setInventoryError('Laravel API is unavailable. Showing the offline demo inventory.');
      setInventoryUsingFallback(true);
      return false;
    }

    try {
      const [remoteInventory, remoteCatalog] = await Promise.all([client.listInventory(), client.listProducts()]);
      const nextInventory = remoteInventory.map((item) => {
        const knownProduct = remoteCatalog.find((product) => product.id === item.productId || product.barcode === item.barcode);
        return {
          ...(knownProduct ?? {
            id: item.productId,
            barcode: item.barcode,
            name: item.productName,
            price: 0,
            sku: item.sku,
          }),
          id: item.productId,
          barcode: item.barcode || knownProduct?.barcode || '',
          name: item.productName || knownProduct?.name || 'Unnamed product',
          stock: item.quantity,
          stockStatus: item.status,
          reorderLevel: item.reorderLevel,
          ...(item.sku ? { sku: item.sku } : {}),
        };
      });
      setInventoryProducts(nextInventory);
      setProducts((current) => mergeProducts(current, [...remoteCatalog, ...nextInventory]));
      setInventoryState('ready');
      return true;
    } catch {
      setInventoryProducts(seedProducts);
      setInventoryState('unavailable');
      setInventoryError('Laravel API is unavailable. Showing the offline demo inventory.');
      setInventoryUsingFallback(true);
      return false;
    }
  }, [client]);

  return (
    <PosContext.Provider
      value={{
        products,
        inventoryProducts,
        searchResults,
        catalogState,
        catalogError,
        catalogUsingFallback,
        inventoryState,
        inventoryError,
        inventoryUsingFallback,
        cart,
        sales,
        total,
        addByBarcode,
        lookupProductByBarcode,
        addProduct,
        addProductChecked,
        decrementProduct,
        clearCart,
        updateProduct,
        createProduct,
        completeSale,
        apiConfigured: client.isConfigured,
        searchProducts,
        refreshProducts,
        refreshInventory,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

function mergeProducts(current: Product[], incoming: Product[]) {
  const merged = new Map(current.map((product) => [product.id, product]));
  incoming.forEach((product) => merged.set(product.id, { ...merged.get(product.id), ...product }));
  return [...merged.values()];
}

function replaceProduct(products: Product[], updated: Product) {
  return products.map((product) => product.id === updated.id ? updated : product);
}

export function usePos() {
  const context = useContext(PosContext);
  if (!context) throw new Error('usePos must be used within PosProvider');
  return context;
}
