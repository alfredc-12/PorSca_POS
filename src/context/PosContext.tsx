import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { apiClient, ApiClient, ApiClientError, Payment } from '@/src/api/client';
import { BarcodeLookupResult, barcodeCandidates } from '@/src/domain/barcode';
import { isDemoCatalogEnabled, OFFLINE_COPY } from '@/src/config/offline';
import { cartReducer, CartAction, CartReduction, emptyCartState, reduceCart } from '@/src/domain/cart';
import { CartRevalidation, cartSignature, reconcileCart } from '@/src/domain/revalidation';
import { calculateCartTotal, CartChange, isBarcodeQuery, searchProducts as searchLocalProducts } from '@/src/domain/pos';
import { seedProducts } from '@/src/data/mockProducts';
import { CheckoutStorage, DurableCheckout, checkoutPayment, checkoutSale } from '@/src/domain/durableCheckout';
import { checkoutStorage } from '@/src/api/checkoutStorage';
import { AuthorityCheckout } from '@/src/api/checkoutAuthority';
import { CheckoutMachine } from '@/src/domain/checkoutMachine';
import { CartLine, Product, Sale } from '@/src/types';
import { localFailure } from '@/src/domain/userFacingError';import { describeAndRecordFailure } from '@/src/observability/diagnostics';

export type { BarcodeLookupResult };

export type ReadState = 'idle' | 'loading' | 'ready' | 'unavailable';

export type ProductField = 'name' | 'barcode' | 'price' | 'stock' | 'category';
export type ProductUpdate = Pick<Product, 'id'> & Partial<Omit<Product, 'id'>>;

export type ProductMutationResult = {
  ok: boolean;
  product?: Product;
  status: 'created' | 'updated' | 'validation' | 'unavailable' | 'error' | 'refresh-failed';
  message: string;
  /** Support code that maps this failure to the on-device diagnostics record. */
  reference?: string;
  fieldErrors?: Partial<Record<ProductField, string>>;
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
  /** True when the seeded demo catalog is allowed to substitute for Laravel. */
  demoCatalogEnabled: boolean;
  /** Clear All undo, present only while the five-second window is open. */
  cartUndo?: { lineCount: number; expiresAt: number };
  sales: Sale[];
  salesState: ReadState;
  salesError?: string;
  total: number;
  addByBarcode: (barcode: string) => Promise<BarcodeLookupResult>;
  lookupProductByBarcode: (barcode: string) => Promise<BarcodeLookupResult>;
  addProductChecked: (product: Product) => CartChange;
  incrementProduct: (productId: string) => CartChange;
  decrementProduct: (productId: string) => void;
  clearCart: () => void;
  undoClearCart: () => void;
  resetCart: () => void;
  /** Called when the cashier proceeds: drops any open Clear All undo buffer. */
  beginCheckout: () => void;
  /** Re-read every cart line against the catalog before payment is attempted. */
  revalidateCart: () => Promise<CartRevalidation>;
  /** Apply a reconciled cart from the review sheet. */
  replaceCartLines: (lines: CartLine[]) => void;
  updateProduct: (product: ProductUpdate) => Promise<ProductMutationResult>;
  createProduct: (product: Omit<Product, 'id'>) => Promise<ProductMutationResult>;
  completeCashSale: (cashReceived: number | string) => Promise<Sale | null>;
  authorityCheckout?: AuthorityCheckout;
  checkoutMachine?: CheckoutMachine;
  recoverableCheckouts: AuthorityCheckout[];
  checkoutRecoveryError?: string;
  openPosCheckouts: () => Promise<void>;
  recoverCheckout: (id?: string) => Promise<void>;
  discoverCheckouts: () => Promise<AuthorityCheckout[]>;
  revalidateCheckout: () => Promise<void>;
  abandonCheckout: (reason: string) => Promise<void>;
  apiConfigured: boolean;
  searchProducts: (query: string) => Promise<void>;
  refreshProducts: () => Promise<boolean>;
  refreshInventory: () => Promise<boolean>;
  refreshSales: () => Promise<boolean>;
  startQrPhPayment: (forceNew?: boolean) => Promise<Payment>;
  /** Authoritative provider-verified check; never cancels the payment. */
  refreshQrPhPayment: (paymentId: string) => Promise<Payment>;
  confirmQrPhPayment: (payment: Payment) => Promise<void>;
  /** The retained QR Ph payment that may still collect money, if any. */
  unresolvedQrPayment: () => Payment | undefined;
};

const PosContext = createContext<PosContextValue | null>(null);

/** How many times a pre-checkout read retries after the cart changes under it. */
const MAX_REVALIDATION_ATTEMPTS = 3;

export function PosProvider({
  children,
  client = apiClient,
  demoCatalogEnabled = isDemoCatalogEnabled(),
  checkoutStore,
}: {
  children: React.ReactNode;
  client?: ApiClient;
  /** Opt-in demo catalog. Off unless EXPO_PUBLIC_ALLOW_DEMO_CATALOG is exactly "1". */
  demoCatalogEnabled?: boolean;
  checkoutStore?: CheckoutStorage;
}) {
  const [products, setProducts] = useState<Product[]>(demoCatalogEnabled ? seedProducts : []);
  const [inventoryProducts, setInventoryProducts] = useState<Product[]>(demoCatalogEnabled ? seedProducts : []);
  const [searchResults, setSearchResults] = useState<Product[]>([]);
  const [catalogState, setCatalogState] = useState<ReadState>('idle');
  const [catalogError, setCatalogError] = useState<string>();
  const [catalogUsingFallback, setCatalogUsingFallback] = useState(false);
  const [inventoryState, setInventoryState] = useState<ReadState>('idle');
  const [inventoryError, setInventoryError] = useState<string>();
  const [inventoryUsingFallback, setInventoryUsingFallback] = useState(false);
  const [cartState, dispatchCart] = useReducer(cartReducer, emptyCartState);
  const [sales, setSales] = useState<Sale[]>([]);
  const [salesState, setSalesState] = useState<ReadState>('idle');
  const [salesError, setSalesError] = useState<string>();
  const requestId = useRef(0);
  /** The query whose request is currently in flight, so the same query is never read twice. */
  const inFlightQuery = useRef<string | undefined>(undefined);
  const authority = useMemo(() => new DurableCheckout(client, checkoutStore ?? checkoutStorage(client.baseUrl ?? 'unconfigured')), [client, checkoutStore]);
  const [authorityCheckout, setAuthorityCheckout] = useState<AuthorityCheckout>();
  const [recoverableCheckouts, setRecoverableCheckouts] = useState<AuthorityCheckout[]>([]);
  const [checkoutRecoveryError, setCheckoutRecoveryError] = useState<string>();
  const productsRef = useRef(products);
  /**
   * The reducer is the single cart authority. The ref mirrors its state
   * synchronously so a guarded mutation can be answered in the same tick that
   * asks for it, and so two taps in one tick cannot read the same cart twice.
   * Every mutation goes through `commitCart`; nothing else calls `dispatchCart`.
   */
  const cartRef = useRef(cartState);
  const cartRevision = useRef(0);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const commitCart = useCallback((action: CartAction): CartReduction => {
    const reduction = reduceCart(cartRef.current, action);
    if (reduction.state !== cartRef.current) cartRevision.current += 1;
    cartRef.current = reduction.state;
    dispatchCart(action);
    return reduction;
  }, []);

  const cart = cartState.lines;
  const total = useMemo(() => calculateCartTotal(cart), [cart]);

  // Hide the Clear All undo once its window closes.
  const undoExpiresAt = cartState.undo?.expiresAt;
  useEffect(() => {
    if (undoExpiresAt === undefined) return;
    const timer = setTimeout(() => commitCart({ type: 'discard-undo' }), Math.max(undoExpiresAt - Date.now(), 0));
    return () => clearTimeout(timer);
  }, [commitCart, undoExpiresAt]);

  const rememberProducts = useCallback((remoteProducts: Product[]) => {
    setProducts((current) => mergeProducts(current, remoteProducts));
  }, []);

  const rememberProductEverywhere = useCallback((product: Product) => {
    setProducts((current) => mergeProducts(current, [product]));
    setInventoryProducts((current) => mergeProducts(current, [product]));
    setSearchResults((current) => mergeProducts(current, [product]));
  }, []);

  const addProductChecked = useCallback((product: Product) => {
    return commitCart({ type: 'add', product }).change ?? { ok: true, cart: cartRef.current.lines };
  }, [commitCart]);

  const incrementProduct = useCallback((productId: string) => {
    return commitCart({ type: 'increment', productId }).change ?? { ok: true, cart: cartRef.current.lines };
  }, [commitCart]);

  const lookupProductByBarcode = useCallback(async (barcode: string): Promise<BarcodeLookupResult> => {
    const normalizedBarcode = barcode.trim();
    if (!normalizedBarcode) {
      return { ok: false, status: 'not-found', message: 'Enter or scan a product barcode.' };
    }

    if (!client.isConfigured) {
      if (!demoCatalogEnabled) {
        return { ok: false, status: 'unavailable', message: OFFLINE_COPY.barcodeNotConfigured };
      }
      const fallbackProduct = productsRef.current.find((item) => item.barcode === normalizedBarcode);
      return fallbackProduct
        ? { ok: true, product: fallbackProduct, status: 'found', message: `${fallbackProduct.name} found.`, usingFallback: true, matchedBarcode: fallbackProduct.barcode }
        : { ok: false, status: 'unavailable', message: 'We cannot reach the shop server. Retry when connected before looking up this barcode.', usingFallback: true };
    }

    // iOS reports UPC-A as EAN-13 with a leading zero and Android may report the
    // 12-digit form, so a barcode stored in one shape must still resolve when
    // the phone reports the other. One extra attempt, only after a 404.
    const candidates = barcodeCandidates(normalizedBarcode);
    for (const candidate of candidates) {
      try {
        const product = await client.getProductByBarcode(candidate);
        rememberProducts([product]);
        return {
          ok: true,
          product,
          status: 'found',
          message: `${product.name} found.`,
          matchedBarcode: product.barcode || candidate,
        };
      } catch (error) {
        if (error instanceof ApiClientError && error.status === 404) continue;

        if (!demoCatalogEnabled) {
          return { ok: false, status: 'unavailable', message: 'We cannot reach the shop server, so this barcode could not be checked against the catalog. Check the connection and try again.' };
        }
        const fallbackProduct = productsRef.current.find((item) => item.barcode === normalizedBarcode);
        return fallbackProduct
          ? { ok: true, product: fallbackProduct, status: 'found', message: `${fallbackProduct.name} found.`, usingFallback: true, matchedBarcode: fallbackProduct.barcode }
          : { ok: false, status: 'unavailable', message: 'We cannot reach the shop server. Retry when connected before looking up this barcode.', usingFallback: true };
      }
    }

    return { ok: false, status: 'not-found', message: `No product matches ${normalizedBarcode}.` };
  }, [client, demoCatalogEnabled, rememberProducts]);

  const addByBarcode = useCallback(async (barcode: string) => {
    const lookup = await lookupProductByBarcode(barcode);
    if (!lookup.ok || !lookup.product) return lookup;

    const product = lookup.product;
    const result = addProductChecked(product);
    if (!result.ok) {
      // Distinguish a product with no stock from a cart that already holds all
      // of it: the cashier's recovery is different in each case.
      const outOfStock = product.stock <= 0;
      return {
        ...lookup,
        ok: false,
        status: outOfStock ? 'out-of-stock' as const : 'limit-reached' as const,
        message: result.message ?? `${product.name} is out of stock.`,
      };
    }

    const added = result.cart.find((line) => line.product.id === product.id);
    return { ...lookup, message: `${product.name} added to cart.`, quantity: added?.quantity ?? 1 };
  }, [addProductChecked, lookupProductByBarcode]);

  const decrementProduct = useCallback((productId: string) => {
    commitCart({ type: 'decrement', productId });
  }, [commitCart]);

  /** Clear All. Keeps a five-second undo buffer instead of asking for confirmation. */
  const clearCart = useCallback(() => {
    return commitCart({ type: 'clear', at: Date.now() });
  }, [commitCart]);

  const undoClearCart = useCallback(() => {
    return commitCart({ type: 'undo-clear', at: Date.now() });
  }, [commitCart]);

  /**
   * A checkout is about to start: drop the undo buffer so an Undo can never
   * resurrect a cart that has been handed to Laravel.
   */
  const beginCheckout = useCallback(() => {
    commitCart({ type: 'discard-undo' });
  }, [commitCart]);

  /** Clear after a recorded sale. No undo buffer: the sale is already authoritative. */
  const resetCart = useCallback(() => {
    commitCart({ type: 'reset' });
  }, [commitCart]);

  const replaceCartLines = useCallback((lines: CartLine[]) => {
    commitCart({ type: 'replace-lines', lines });
  }, [commitCart]);

  /**
   * The cart is provisional: it stores the price and stock seen when each line
   * was added. Laravel recomputes the real charge, so this pre-checkout read
   * shows the cashier any drift before the sale is attempted. No cart mutation
   * happens here; the review sheet applies the reconciliation only if the
   * cashier accepts it.
   */
  const revalidateCart = useCallback(async (): Promise<CartRevalidation> => {
    const read = async (lines: CartLine[]): Promise<CartRevalidation> => {
      const signature = cartSignature(lines);
      const unchanged = (status: 'offline' | 'unavailable', message: string): CartRevalidation => ({
        status, message, changes: [], lines, appliedLines: lines, cartSignature: signature,
      });

      if (lines.length === 0) {
        return { status: 'ready', message: 'The cart is empty.', changes: [], lines: [], appliedLines: [], cartSignature: signature };
      }

      if (!client.isConfigured) {
        return unchanged('offline', 'Prices and stock cannot be confirmed because the shop server is not configured. Connect to the server and try again; the cart is unchanged.');
      }

      try {
        // One read per cart line: `GET /products/:id` carries the authoritative
        // price and stock block, and a 404 means the product is gone. Reading the
        // whole catalog instead would silently miss lines past the first page.
        const settled = await Promise.allSettled(lines.map((line) => client.getProduct(line.product.id)));
        const authoritative: Product[] = [];
        let unreachable = false;

        settled.forEach((outcome) => {
          if (outcome.status === 'fulfilled') {
            authoritative.push(outcome.value);
            return;
          }
          const reason: unknown = outcome.reason;
          if (!(reason instanceof ApiClientError && reason.status === 404)) unreachable = true;
        });

        if (unreachable) {
          return unchanged('unavailable', 'Prices and stock could not be confirmed because the shop server could not be reached. Check the connection and try again; the cart is unchanged.');
        }

        rememberProducts(authoritative);
        return reconcileCart(lines, authoritative);
      } catch {
        return unchanged('unavailable', 'Prices and stock could not be confirmed because the shop server could not be reached. Check the connection and try again; the cart is unchanged.');
      }
    };

    // A cart edit can land while a line read is in flight. A result is only
    // valid for the cart it read, so re-read the cart now on screen instead of
    // handing a stale amount to checkout or letting an old review overwrite a
    // later edit (defect F2).
    for (let attempt = 0; attempt < MAX_REVALIDATION_ATTEMPTS; attempt += 1) {
      const lines = cartRef.current.lines;
      const signature = cartSignature(lines);
      const result = await read(lines);
      if (cartSignature(cartRef.current.lines) === signature) return result;
    }

    const lines = cartRef.current.lines;
    return {
      status: 'unavailable',
      message: 'The cart changed while prices and stock were being checked. Review the cart and try again.',
      changes: [],
      lines,
      appliedLines: lines,
      cartSignature: cartSignature(lines),
    };
  }, [client, rememberProducts]);

  const searchProducts = useCallback(async (query: string) => {
    const normalizedQuery = query.trim();
    if (!normalizedQuery) {
      // A cleared search invalidates any request that is still in flight.
      requestId.current += 1;
      inFlightQuery.current = undefined;
      setSearchResults([]);
      setCatalogState('idle');
      setCatalogError(undefined);
      setCatalogUsingFallback(false);
      return;
    }

    // One in-flight read per query: a debounced retry or a repeat keystroke
    // never adds a second request for the same text. The generation is bumped
    // only when a request actually starts, so a duplicate invocation can no
    // longer invalidate the one answer that is on its way (defect F4).
    if (inFlightQuery.current === normalizedQuery) return;
    inFlightQuery.current = normalizedQuery;
    const currentRequest = ++requestId.current;

    // The same predicate decides the offline rows and the API parameter, so a
    // numeric query means one thing whether or not Laravel is reachable.
    const barcodeQuery = isBarcodeQuery(normalizedQuery);
    setCatalogState('loading');
    setCatalogError(undefined);
    setCatalogUsingFallback(false);

    if (!client.isConfigured) {
      // Release the marker on every exit so the same query can be retried.
      inFlightQuery.current = undefined;
      if (!demoCatalogEnabled) {
        setSearchResults([]);
        setCatalogState('unavailable');
        setCatalogError(OFFLINE_COPY.catalogNotConfigured);
        setCatalogUsingFallback(false);
        return;
      }
      setSearchResults(searchLocalProducts(productsRef.current, normalizedQuery));
      setCatalogState('unavailable');
      setCatalogError('We cannot reach the shop server. Showing items saved on this device.');
      setCatalogUsingFallback(true);
      return;
    }

    try {
      const remoteProducts = barcodeQuery
        ? await client.listProducts({ barcode: normalizedQuery })
        : await client.listProducts({ search: normalizedQuery });
      if (currentRequest !== requestId.current) return;
      setSearchResults(remoteProducts);
      rememberProducts(remoteProducts);
      setCatalogState('ready');
    } catch {
      if (currentRequest !== requestId.current) return;
      setSearchResults(demoCatalogEnabled ? searchLocalProducts(productsRef.current, normalizedQuery) : []);
      setCatalogState('unavailable');
      setCatalogError(demoCatalogEnabled ? 'We cannot reach the shop server. Showing items saved on this device.' : OFFLINE_COPY.catalogUnavailable);
      setCatalogUsingFallback(demoCatalogEnabled);
    } finally {
      if (inFlightQuery.current === normalizedQuery) inFlightQuery.current = undefined;
    }
  }, [client, demoCatalogEnabled, rememberProducts]);

  const refreshProducts = useCallback(async () => {
    if (!client.isConfigured) {
      setCatalogState('unavailable');
      setCatalogError(OFFLINE_COPY.catalogNotConfigured);
      setCatalogUsingFallback(false);
      return false;
    }
    try {
      const remoteProducts = await client.listProducts();
      rememberProducts(remoteProducts);
      setCatalogState('ready');
      setCatalogError(undefined);
      setCatalogUsingFallback(false);
      return true;
    } catch {
      setCatalogState('unavailable');
      setCatalogError(demoCatalogEnabled ? 'We cannot reach the shop server. Showing items saved on this device.' : OFFLINE_COPY.catalogUnavailable);
      setCatalogUsingFallback(demoCatalogEnabled);
      return false;
    }
  }, [client, demoCatalogEnabled, rememberProducts]);

  const refreshInventory = useCallback(async () => {
    setInventoryState('loading');
    setInventoryError(undefined);
    setInventoryUsingFallback(false);

    if (!client.isConfigured) {
      setInventoryProducts(demoCatalogEnabled ? seedProducts : []);
      setInventoryState('unavailable');
      setInventoryError(demoCatalogEnabled ? 'We cannot reach the shop server. Showing stock saved on this device.' : OFFLINE_COPY.inventoryNotConfigured);
      setInventoryUsingFallback(demoCatalogEnabled);
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
      setInventoryProducts((current) => current.length ? current : demoCatalogEnabled ? seedProducts : []);
      setInventoryState('unavailable');
      setInventoryError(demoCatalogEnabled ? 'We cannot reach the shop server. Showing stock saved on this device.' : OFFLINE_COPY.inventoryUnavailable);
      setInventoryUsingFallback(demoCatalogEnabled);
      return false;
    }
  }, [client, demoCatalogEnabled]);

  const refreshSales = useCallback(async () => {
    setSalesState('loading');
    setSalesError(undefined);

    if (!client.isConfigured) {
      setSalesState('unavailable');
      setSalesError(demoCatalogEnabled ? 'We cannot reach the shop server. Showing sales saved on this device.' : OFFLINE_COPY.salesNotConfigured);
      return false;
    }

    try {
      const remoteSales = await client.listSales();
      setSales(remoteSales);
      setSalesState('ready');
      return true;
    } catch {
      setSalesState('unavailable');
      setSalesError('We cannot reach the shop server. Showing the last known transaction history.');
      return false;
    }
  }, [client, demoCatalogEnabled]);
  const applyCheckout = useCallback(async (checkout: AuthorityCheckout, canReplace?: () => boolean) => {
    // Recover the original basket, not whatever happens to be on the POS screen.
    const lines = await Promise.all(checkout.items.map(async item => ({
      product: { ...await client.getProduct(String(item.productId)).catch(() => ({ id: String(item.productId), name: item.name, barcode: '', price: item.unitPriceCentavos / 100, stock: 0 })), name: item.name, price: item.unitPriceCentavos / 100 },
      quantity: item.quantity,
    })));
    if (canReplace && !canReplace()) throw new ApiClientError('The cart changed while checkout recovery was in progress. Recover the listed checkout explicitly.', 409, 'checkout_recovery_required');
    commitCart({ type: 'replace-lines', lines });
    setAuthorityCheckout(checkout);
  }, [client, commitCart]);

  const recoverCheckoutInternal = useCallback(async (id?: string, automatic?: { revision: number; signature: string }) => authority.exclusive(async () => {
    const cartUnchanged = () => automatic !== undefined && cartRevision.current === automatic.revision && cartSignature(cartRef.current.lines) === automatic.signature;
    if (automatic && !cartUnchanged()) throw new ApiClientError('The cart changed while checkout recovery was in progress. Recover the listed checkout explicitly.', 409, 'checkout_recovery_required');
    const checkout = await authority.recover(id);
    if (!checkout) return;
    if (automatic && !cartUnchanged()) throw new ApiClientError('The cart changed while checkout recovery was in progress. Recover the listed checkout explicitly.', 409, 'checkout_recovery_required');
    await applyCheckout(checkout, automatic ? cartUnchanged : undefined);
    if (checkout.state === 'abandoned') {
      await authority.retire();
      setAuthorityCheckout(undefined);
      commitCart({ type: 'reset' });
      return;
    }
    // A lost cash response may already have committed a receipt. Resolve that
    // identity instead of stranding the device on a completed, untenderable cart.
    if (checkout.state === 'completed' && checkout.sale?.method === 'cash' && !authority.machine?.reconciliationRequired) {
      const restoredRevision = cartRevision.current;
      const saleLines = cartRef.current.lines;
      const [inventory, history] = await Promise.all([refreshInventory(), refreshSales()]);
      if (!inventory || !history) throw new ApiClientError('Retry cash receipt inventory and history verification.');
      setSales(current => mergeSales(current, [checkoutSale(checkout, saleLines)]));
      await authority.retire();
      setAuthorityCheckout(undefined);
      if (!automatic || cartRevision.current === restoredRevision) commitCart({ type: 'reset' });
    }
  }), [authority, applyCheckout, refreshInventory, refreshSales, commitCart]);
  const recoverCheckout = useCallback((id?: string) => recoverCheckoutInternal(id), [recoverCheckoutInternal]);

  const discoverCheckouts = useCallback(async () => {
    const items: AuthorityCheckout[] = [];
    for (let page = 1; ; page++) {
      const result = await client.listCheckouts(page);
      items.push(...result.items);
      if (page >= result.pagination.last_page) return items;
    }
  }, [client]);

  const openPosCheckouts = useCallback(async () => {
    if (!client.isConfigured) return;
    setCheckoutRecoveryError(undefined);
    const initialCart = cartSignature(cartRef.current.lines);
    const initialRevision = cartRevision.current;
    const automatic = { revision: initialRevision, signature: initialCart };
    const cartUnchanged = () => cartRevision.current === initialRevision && cartSignature(cartRef.current.lines) === initialCart;
    try {
      const discovered = await discoverCheckouts();
      const live = await Promise.all(discovered.map(checkout => client.getCheckout(checkout.id)));
      setRecoverableCheckouts(live);
      if (initialCart !== '' || !cartUnchanged()) throw new ApiClientError('The cart changed while checkout recovery was in progress. Recover the listed checkout explicitly.', 409, 'checkout_recovery_required');
      await recoverCheckoutInternal(undefined, automatic);
    } catch {
      setCheckoutRecoveryError('Checkout recovery is unavailable or the retained purchase has no authority record. Nothing is paid locally. Retry recovery before taking payment.');
    }
  }, [client, discoverCheckouts, recoverCheckoutInternal]);

  const revalidateCheckout = useCallback(async () => authority.exclusive(async () => {
    await applyCheckout(await authority.revalidate());
  }), [authority, applyCheckout]);

  const abandonCheckout = useCallback(async (reason: string) => authority.exclusive(async () => {
    await authority.abandon(reason);
    setAuthorityCheckout(undefined);
    commitCart({ type: 'reset' });
  }), [authority, commitCart]);

  const completeCashSale = useCallback(async (cashReceived: number | string) => authority.exclusive(async () => {
    commitCart({ type: 'discard-undo' });
    if (!client.isConfigured) throw new ApiClientError(OFFLINE_COPY.checkoutNotConfigured);
    const lines = cartRef.current.lines;
    if (!lines.length) return null;
    let checkout: AuthorityCheckout;
    try { checkout = await authority.tender(lines, 'cash', typeof cashReceived === 'string' ? cashReceived : cashReceived.toFixed(2)); }
    finally { setAuthorityCheckout(authority.current); }
    const sale = checkoutSale(checkout, lines);
    setSales(current => mergeSales(current, [sale]));
    await authority.retire();
    setAuthorityCheckout(undefined);
    if (cartSignature(lines) === cartSignature(cartRef.current.lines)) commitCart({ type: 'reset' });
    await Promise.allSettled([refreshInventory(), refreshSales()]);
    return sale;
  }), [authority, client, commitCart, refreshInventory, refreshSales]);

  const startQrPhPayment = useCallback(async () => authority.exclusive(async () => {
    commitCart({ type: 'discard-undo' });
    if (!client.isConfigured) throw new ApiClientError(OFFLINE_COPY.checkoutNotConfigured);
    if (!cartRef.current.lines.length) throw new ApiClientError('The cart is empty.');
    try { return checkoutPayment(await authority.tender(cartRef.current.lines, 'qrph')); }
    finally { setAuthorityCheckout(authority.current); }
  }), [authority, client, commitCart]);

  const unresolvedQrPayment = useCallback(() => authority.retainedPayment(), [authority]);

  const refreshQrPhPayment = useCallback(async (id: string) => authority.exclusive(async () => {
    try {
      const checkout = await authority.refresh(id);
      setAuthorityCheckout(checkout);
      return checkoutPayment(checkout);
    } catch (error) { setAuthorityCheckout(authority.current); throw error; }
  }), [authority]);

  const confirmQrPhPayment = useCallback(async (payment: Payment) => authority.exclusive(async () => {
    const checkout = await authority.recover();
    if (!checkout) throw new ApiClientError('Recover the checkout first.');
    setAuthorityCheckout(checkout);
    // Caller/UI status is not authority. Contradictions and unfulfilled money stay locked.
    if (checkout.state === 'paid_unfulfilled') {
      const [inventory, history] = await Promise.all([refreshInventory(), refreshSales()]);
      if (!inventory || !history) throw new ApiClientError('Retry inventory and history verification.');
      return;
    }
    if (checkout.state !== 'completed' || !checkout.sale || checkoutPayment(checkout).id !== payment.id) throw new ApiClientError('The checkout is unresolved or locked; no completed sale can be confirmed.');
    const [inventory, history] = await Promise.all([refreshInventory(), refreshSales()]);
    if (!inventory || !history) throw new ApiClientError('Retry inventory and history verification.');
    const matches = JSON.stringify(checkout.items.map(i => [String(i.productId), i.quantity]).sort()) === JSON.stringify(cartRef.current.lines.map(l => [l.product.id, l.quantity]).sort());
    await authority.retire();
    setAuthorityCheckout(undefined);
    if (matches) commitCart({ type: 'reset' });
  }), [authority, commitCart, refreshInventory, refreshSales]);

  const saveRemoteProduct = useCallback(async (
    operation: () => Promise<Product>,
    status: 'created' | 'updated',
  ): Promise<ProductMutationResult> => {
    if (!client.isConfigured) {
      const failure = localFailure('We could not save this product', 'Check the connection, then save again; your changes are still on this form.', { action: 'retry', actionLabel: 'Try again' });
      return {
        ok: false,
        status: 'unavailable',
        message: failure.body,
      };
    }

    try {
      const saved = await operation();
      rememberProductEverywhere(saved);
      const refreshed = await refreshInventory();
      if (!refreshed) {
        return {
          ok: false,
          status: 'refresh-failed',
          product: saved,
          message: 'Product saved, but current stock could not be refreshed. Retry the inventory refresh before leaving this screen.',
        };
      }
      return {
        ok: true,
        status,
        product: saved,
        message: status === 'created' ? 'Product created and inventory refreshed.' : 'Product updated and inventory refreshed.',
      };
    } catch (error) {
      return productMutationFailure(error);
    }
  }, [client, refreshInventory, rememberProductEverywhere]);

  const updateProduct = useCallback((updated: ProductUpdate) => saveRemoteProduct(
    () => client.updateProduct(updated.id, updated),
    'updated',
  ), [client, saveRemoteProduct]);

  const createProduct = useCallback((input: Omit<Product, 'id'>) => saveRemoteProduct(
    () => client.createProduct(input),
    'created',
  ), [client, saveRemoteProduct]);

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
        demoCatalogEnabled,
        ...(cartState.undo ? { cartUndo: { lineCount: cartState.undo.lines.length, expiresAt: cartState.undo.expiresAt } } : {}),
        sales,
        salesState,
        salesError,
        total,
        addByBarcode,
        lookupProductByBarcode,
        addProductChecked,
        incrementProduct,
        decrementProduct,
        clearCart,
        undoClearCart,
        resetCart,
        beginCheckout,
        revalidateCart,
        replaceCartLines,
        updateProduct,
        createProduct,
        completeCashSale,
        authorityCheckout,
        checkoutMachine: authority.machine,
        recoverableCheckouts,
        checkoutRecoveryError,
        openPosCheckouts,
        recoverCheckout,
        discoverCheckouts,
        revalidateCheckout,
        abandonCheckout,
        apiConfigured: client.isConfigured,
        searchProducts,
        refreshProducts,
        refreshInventory,
        refreshSales,
        startQrPhPayment,
        refreshQrPhPayment,
        confirmQrPhPayment,
        unresolvedQrPayment,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

function productMutationFailure(error: unknown): ProductMutationResult {
  if (!(error instanceof ApiClientError)) {
    const failure = localFailure('We could not save this product', 'Check the connection, then save again; your changes are still on this form.', { action: 'retry', actionLabel: 'Try again' });
    return {
      ok: false,
      status: 'unavailable',
      message: failure.body,
    };
  }

  const fieldErrors = extractFieldErrors(error.details);
  const barcodeError = fieldErrors.barcode?.toLowerCase() ?? '';
  if (error.status === 422 && (barcodeError.includes('taken') || barcodeError.includes('already') || barcodeError.includes('unique'))) {
    return {
      ok: false,
      status: 'validation',
      fieldErrors: { ...fieldErrors, barcode: 'Barcode already exists. Use a different barcode.' },
      message: 'Barcode already exists. Use a different barcode, then try again.',
    };
  }

  // The API's own message and field details are recorded for support, never
  // printed: the shared describer owns every visible sentence.
  const failure = describeAndRecordFailure(
    { status: error.status, code: error.code, message: error.message, details: error.details },
    { screen: 'product-save' },
  );

  if (error.status === 422) {
    return { ok: false, status: 'validation', fieldErrors, message: failure.body, reference: failure.reference };
  }

  if (error.status === undefined || error.status >= 500) {
    return { ok: false, status: 'unavailable', message: failure.body, reference: failure.reference };
  }

  return { ok: false, status: 'error', fieldErrors, message: failure.body, reference: failure.reference };
}

function extractFieldErrors(details: unknown): Partial<Record<ProductField, string>> {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const result: Partial<Record<ProductField, string>> = {};
  for (const field of ['name', 'barcode', 'price', 'stock', 'category'] as ProductField[]) {
    const value = (details as Record<string, unknown>)[field];
    if (Array.isArray(value) && typeof value[0] === 'string') result[field] = value[0];
    else if (typeof value === 'string') result[field] = value;
  }
  return result;
}

function mergeProducts(current: Product[], incoming: Product[]) {
  const merged = new Map(current.map((product) => [product.id, product]));
  incoming.forEach((product) => merged.set(product.id, { ...merged.get(product.id), ...product }));
  return [...merged.values()];
}

function mergeSales(current: Sale[], incoming: Sale[]) {
  const merged = new Map(current.map((sale) => [sale.id, sale]));
  incoming.forEach((sale) => merged.set(sale.id, { ...merged.get(sale.id), ...sale }));
  return [...merged.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export function usePos() {
  const context = useContext(PosContext);
  if (!context) throw new Error('usePos must be used within PosProvider');
  return context;
}
