import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { apiClient, ApiClient, ApiClientError, Payment } from '@/src/api/client';
import { BarcodeLookupResult, barcodeCandidates } from '@/src/domain/barcode';
import { isDemoCatalogEnabled, OFFLINE_COPY } from '@/src/config/offline';
import { cartReducer, CartAction, CartReduction, emptyCartState, reduceCart } from '@/src/domain/cart';
import { CartRevalidation, cartSignature, reconcileCart } from '@/src/domain/revalidation';
import { calculateCartTotal, CartChange, isBarcodeQuery, searchProducts as searchLocalProducts } from '@/src/domain/pos';
import { seedProducts } from '@/src/data/mockProducts';
import { CartLine, Product, Sale } from '@/src/types';

export type { BarcodeLookupResult };

export type ReadState = 'idle' | 'loading' | 'ready' | 'unavailable';

export type ProductField = 'name' | 'barcode' | 'price' | 'stock';

export type ProductMutationResult = {
  ok: boolean;
  product?: Product;
  status: 'created' | 'updated' | 'validation' | 'unavailable' | 'error' | 'refresh-failed';
  message: string;
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
  updateProduct: (product: Product) => Promise<ProductMutationResult>;
  createProduct: (product: Omit<Product, 'id'>) => Promise<ProductMutationResult>;
  completeCashSale: (cashReceived: number) => Promise<Sale | null>;
  apiConfigured: boolean;
  searchProducts: (query: string) => Promise<void>;
  refreshProducts: () => Promise<boolean>;
  refreshInventory: () => Promise<boolean>;
  refreshSales: () => Promise<boolean>;
  startQrPhPayment: (forceNew?: boolean) => Promise<Payment>;
  /** Authoritative provider-verified check; never cancels the payment. */
  refreshQrPhPayment: (paymentId: string) => Promise<Payment>;
  confirmQrPhPayment: (payment: Payment) => Promise<void>;
};

const PosContext = createContext<PosContextValue | null>(null);

/** How many times a pre-checkout read retries after the cart changes under it. */
const MAX_REVALIDATION_ATTEMPTS = 3;

export function PosProvider({
  children,
  client = apiClient,
  demoCatalogEnabled = isDemoCatalogEnabled(),
}: {
  children: React.ReactNode;
  client?: ApiClient;
  /** Opt-in demo catalog. Off unless EXPO_PUBLIC_ALLOW_DEMO_CATALOG is exactly "1". */
  demoCatalogEnabled?: boolean;
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
  const cashKeys = useRef(new Map<string, string>());
  const cashRequests = useRef(new Map<string, Promise<Sale | null>>());
  /**
   * The last cash attempt whose outcome Laravel never acknowledged. It is bound
   * to the exact payload that was sent so a repriced retry cannot replay it.
   */
  const uncertainCashRef = useRef<{ payloadSignature: string; idempotencyKey: string } | undefined>(undefined);
  const qrKeys = useRef(new Map<string, string>());
  const qrPayments = useRef(new Map<string, Payment>());
  const qrRequests = useRef(new Map<string, Promise<Payment>>());
  const qrSettlements = useRef(new Map<string, Promise<void>>());
  const productsRef = useRef(products);
  /**
   * The reducer is the single cart authority. The ref mirrors its state
   * synchronously so a guarded mutation can be answered in the same tick that
   * asks for it, and so two taps in one tick cannot read the same cart twice.
   * Every mutation goes through `commitCart`; nothing else calls `dispatchCart`.
   */
  const cartRef = useRef(cartState);

  useEffect(() => {
    productsRef.current = products;
  }, [products]);

  const commitCart = useCallback((action: CartAction): CartReduction => {
    const reduction = reduceCart(cartRef.current, action);
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
        ? { ok: true, product: fallbackProduct, status: 'found', message: `${fallbackProduct.name} found in the offline demo catalog.`, usingFallback: true, matchedBarcode: fallbackProduct.barcode }
        : { ok: false, status: 'unavailable', message: 'The Laravel API is unavailable. Retry when connected before looking up this barcode.', usingFallback: true };
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
          return { ok: false, status: 'unavailable', message: 'The Laravel API is unavailable, so this barcode could not be checked against the catalog. Check the connection and try again.' };
        }
        const fallbackProduct = productsRef.current.find((item) => item.barcode === normalizedBarcode);
        return fallbackProduct
          ? { ok: true, product: fallbackProduct, status: 'found', message: `${fallbackProduct.name} found in the offline demo catalog.`, usingFallback: true, matchedBarcode: fallbackProduct.barcode }
          : { ok: false, status: 'unavailable', message: 'The Laravel API is unavailable. Retry when connected before looking up this barcode.', usingFallback: true };
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
        return unchanged('offline', 'Prices and stock cannot be confirmed because the Laravel API is not configured. Connect to the API and try again; the cart is unchanged.');
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
          return unchanged('unavailable', 'Prices and stock could not be confirmed because the Laravel API could not be reached. Check the connection and try again; the cart is unchanged.');
        }

        rememberProducts(authoritative);
        return reconcileCart(lines, authoritative);
      } catch {
        return unchanged('unavailable', 'Prices and stock could not be confirmed because the Laravel API could not be reached. Check the connection and try again; the cart is unchanged.');
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
      setCatalogError('Laravel API is unavailable. Showing the offline demo catalog.');
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
      setCatalogError(demoCatalogEnabled ? 'Laravel API is unavailable. Showing the offline demo catalog.' : OFFLINE_COPY.catalogUnavailable);
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
      setCatalogError(demoCatalogEnabled ? 'Laravel API is unavailable. Showing the offline demo catalog.' : OFFLINE_COPY.catalogUnavailable);
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
      setInventoryError(demoCatalogEnabled ? 'Laravel API is unavailable. Showing the offline demo inventory.' : OFFLINE_COPY.inventoryNotConfigured);
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
      setInventoryError(demoCatalogEnabled ? 'Laravel API is unavailable. Showing the offline demo inventory.' : OFFLINE_COPY.inventoryUnavailable);
      setInventoryUsingFallback(demoCatalogEnabled);
      return false;
    }
  }, [client, demoCatalogEnabled]);

  const refreshSales = useCallback(async () => {
    setSalesState('loading');
    setSalesError(undefined);

    if (!client.isConfigured) {
      setSalesState('unavailable');
      setSalesError(demoCatalogEnabled ? 'Laravel API is unavailable. Showing locally recorded demo sales.' : OFFLINE_COPY.salesNotConfigured);
      return false;
    }

    try {
      const remoteSales = await client.listSales();
      setSales(remoteSales);
      setSalesState('ready');
      return true;
    } catch {
      setSalesState('unavailable');
      setSalesError('Laravel API is unavailable. Showing the last known transaction history.');
      return false;
    }
  }, [client, demoCatalogEnabled]);
  /**
   * Resolve whether an earlier uncertain cash attempt actually became a sale.
   * Laravel echoes the idempotency key on each sale, so the receipt can be
   * found without resending the uncertain request.
   */
  const resolveCashAttempt = useCallback(async (idempotencyKey: string): Promise<'found' | 'not-found' | 'unknown'> => {
    try {
      const sales = await client.listSales();
      return sales.some((sale) => sale.idempotencyKey === idempotencyKey) ? 'found' : 'not-found';
    } catch {
      return 'unknown';
    }
  }, [client]);

  const completeCashSale = useCallback(async (cashReceived: number) => {
    // The cart is about to be handed over; an Undo from the POS screen must not
    // be able to resurrect it after this point.
    commitCart({ type: 'discard-undo' });

    const lines = cartRef.current.lines;
    if (lines.length === 0) return null;

    // Strict online: every sale is recorded by Laravel. There is deliberately no
    // local-sale branch, not even for the demo catalog, so a demo catalog can
    // never produce an unrecorded paid sale (defect F1).
    if (!client.isConfigured) {
      throw new ApiClientError(OFFLINE_COPY.checkoutNotConfigured);
    }

    const cashCents = Math.round((Number.isFinite(cashReceived) ? cashReceived : 0) * 100);
    const payloadSignature = cashPayloadSignature(lines, cashCents);

    // A transport failure can leave an attempt committed but unacknowledged.
    // That attempt is bound to its exact payload: a plain retry reuses its key,
    // but a repriced or otherwise changed cart must first establish whether the
    // earlier sale was recorded, so a retry can never return the old sale
    // (defect F3).
    const uncertain = uncertainCashRef.current;
    if (uncertain && uncertain.payloadSignature !== payloadSignature) {
      const resolution = await resolveCashAttempt(uncertain.idempotencyKey);
      if (resolution !== 'not-found') {
        throw new ApiClientError(
          resolution === 'found'
            ? 'An earlier cash attempt for this cart was already recorded by Laravel. Nothing new was sent; check Transactions before taking payment again.'
            : 'An earlier cash attempt could not be confirmed. Check Transactions for a completed sale before taking payment again; nothing new was sent.',
          undefined,
          'cash_attempt_unresolved',
        );
      }
      // Laravel confirmed the earlier attempt never became a sale, so the
      // revised cart can be charged with a fresh key without duplicating it.
      uncertainCashRef.current = undefined;
    }

    const pending = cashRequests.current.get(payloadSignature);
    if (pending) return pending;

    const idempotencyKey = cashKeys.current.get(payloadSignature) ?? createIdempotencyKey();
    cashKeys.current.set(payloadSignature, idempotencyKey);
    const requestCart = lines;
    const requestTotal = total;
    const request = (async () => {
      try {
        const sale = await client.createSale({
          idempotencyKey,
          items: requestCart.map((line) => ({
            productId: line.product.id,
            quantity: line.quantity,
            unitPrice: Math.round(line.product.price * 100),
          })),
          total: Math.round(requestTotal * 100),
          paymentMethod: 'cash',
          cashReceived: cashCents,
        });

        if (uncertainCashRef.current?.payloadSignature === payloadSignature) uncertainCashRef.current = undefined;
        cashKeys.current.delete(payloadSignature);
        setSales((current) => mergeSales(current, [sale]));
        if (sameCart(cartRef.current.lines, requestCart)) commitCart({ type: 'reset' });

        // The sale response is authoritative for the receipt. These reads make
        // inventory and history authoritative too, even after a retry response.
        await Promise.allSettled([refreshInventory(), refreshSales()]);
        return sale;
      } catch (error) {
        // No HTTP answer, or a server error: Laravel may have committed the
        // sale. Keep the key and bind the attempt to its payload so a later
        // repriced cart cannot replay the old sale.
        if (isUncertainCashFailure(error)) {
          uncertainCashRef.current = { payloadSignature, idempotencyKey };
        }
        throw error;
      }
    })();
    cashRequests.current.set(payloadSignature, request);
    request.then(
      () => cashRequests.current.delete(payloadSignature),
      () => cashRequests.current.delete(payloadSignature),
    );
    return request;
  }, [client, commitCart, refreshInventory, refreshSales, resolveCashAttempt, total]);

  const startQrPhPayment = useCallback(async (forceNew = false) => {
    commitCart({ type: 'discard-undo' });
    const lines = cartRef.current.lines;
    if (lines.length === 0) {
      throw new ApiClientError('The cart is empty. Add a product before starting QR Ph payment.');
    }
    if (!client.isConfigured) {
      throw new ApiClientError('Laravel API is not configured. QR Ph payment requires the backend; no sale was recorded.');
    }

    const signature = qrCartSignature(lines);
    if (forceNew) {
      qrKeys.current.delete(signature);
      qrPayments.current.delete(signature);
    } else {
      const knownPayment = qrPayments.current.get(signature);
      if (knownPayment) return knownPayment;
      const existingRequest = qrRequests.current.get(signature);
      if (existingRequest) return existingRequest;
    }

    const idempotencyKey = qrKeys.current.get(signature) ?? createIdempotencyKey('mobile-qr');
    qrKeys.current.set(signature, idempotencyKey);
    const requestCart = lines;
    const request = client.createQrPhPayment({
      idempotencyKey,
      items: requestCart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
    });
    qrRequests.current.set(signature, request);

    try {
      const payment = await request;
      qrPayments.current.set(signature, payment);
      return payment;
    } finally {
      qrRequests.current.delete(signature);
    }
  }, [client, commitCart]);

  const refreshQrPhPayment = useCallback(async (paymentId: string) => {
    if (!client.isConfigured) {
      throw new ApiClientError('Laravel API is not configured. Payment verification is unavailable.');
    }
    // The refresh endpoint asks the PayMongo sandbox for the latest verified
    // outcome and settles it server-side. There is no cashier cancel action:
    // leaving a pending attempt alone lets the reservation expire on its own.
    const payment = await client.refreshPayment(paymentId);
    rememberQrPayment(qrPayments.current, payment);
    return payment;
  }, [client]);

  const confirmQrPhPayment = useCallback(async (payment: Payment) => {
    // Only settled money is verified. `paid` completes the sale and clears the
    // cart; `paid_unfulfilled` refreshes authoritative state but keeps the cart
    // because no sale was recorded and a new payment could double-charge.
    if (payment.status !== 'paid' && payment.status !== 'paid_unfulfilled') return;
    const existingSettlement = qrSettlements.current.get(payment.id);
    if (existingSettlement) return existingSettlement;

    const settlement = Promise.all([refreshInventory(), refreshSales()]).then(([inventoryRefreshed, salesRefreshed]) => {
      if (!inventoryRefreshed || !salesRefreshed) {
        throw new ApiClientError('Laravel confirmed the QR payment, but inventory or history verification is unavailable. Retry verification.');
      }
      // A `paid_unfulfilled` payment took money without recording a sale, so
      // the cart is kept for operator reconciliation.
      if (payment.status !== 'paid') return;
      const completedSignature = [...qrPayments.current.entries()].find(([, known]) => known.id === payment.id)?.[0];
      if (completedSignature && qrCartSignature(cartRef.current.lines) === completedSignature) {
        commitCart({ type: 'reset' });
      }
    });
    qrSettlements.current.set(payment.id, settlement);
    settlement.then(
      () => qrSettlements.current.delete(payment.id),
      () => qrSettlements.current.delete(payment.id),
    );
    return settlement;
  }, [commitCart, refreshInventory, refreshSales]);

  const saveRemoteProduct = useCallback(async (
    operation: () => Promise<Product>,
    status: 'created' | 'updated',
  ): Promise<ProductMutationResult> => {
    if (!client.isConfigured) {
      return {
        ok: false,
        status: 'unavailable',
        message: 'The Laravel API is not configured. Connect to the API and try again; no local product was saved.',
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
          message: 'Product saved, but the authoritative inventory could not be refreshed. Retry the inventory refresh before leaving this screen.',
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

  const updateProduct = useCallback((updated: Product) => saveRemoteProduct(
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
        apiConfigured: client.isConfigured,
        searchProducts,
        refreshProducts,
        refreshInventory,
        refreshSales,
        startQrPhPayment,
        refreshQrPhPayment,
        confirmQrPhPayment,
      }}
    >
      {children}
    </PosContext.Provider>
  );
}

function productMutationFailure(error: unknown): ProductMutationResult {
  if (!(error instanceof ApiClientError)) {
    return {
      ok: false,
      status: 'unavailable',
      message: 'Could not reach the Laravel API. Check the connection and try again; your changes are still on this form.',
    };
  }

  const fieldErrors = extractFieldErrors(error.details);
  const barcodeError = fieldErrors.barcode?.toLowerCase() ?? '';
  if (error.status === 422) {
    if (barcodeError.includes('taken') || barcodeError.includes('already') || barcodeError.includes('unique')) {
      return {
        ok: false,
        status: 'validation',
        fieldErrors: { ...fieldErrors, barcode: 'Barcode already exists. Use a different barcode.' },
        message: 'Barcode already exists. Use a different barcode, then try again.',
      };
    }
    return {
      ok: false,
      status: 'validation',
      fieldErrors,
      message: error.message || 'The API rejected these product details. Check the highlighted fields and try again.',
    };
  }

  if (error.status === undefined) {
    return {
      ok: false,
      status: 'unavailable',
      message: 'Could not reach the Laravel API. Check the connection and try again; your changes are still on this form.',
    };
  }

  if (error.status >= 500) {
    return {
      ok: false,
      status: 'unavailable',
      message: 'Could not save the product because the Laravel API is unavailable. Check the connection and try again.',
    };
  }

  return {
    ok: false,
    status: 'error',
    fieldErrors,
    message: error.message || 'The Laravel API rejected the product. Check the details and try again.',
  };
}

function extractFieldErrors(details: unknown): Partial<Record<ProductField, string>> {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  const result: Partial<Record<ProductField, string>> = {};
  for (const field of ['name', 'barcode', 'price', 'stock'] as ProductField[]) {
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

function sameCart(current: CartLine[], expected: CartLine[]) {
  return current.length === expected.length && current.every((line, index) =>
    line.product.id === expected[index]?.product.id && line.quantity === expected[index]?.quantity,
  );
}

function qrCartSignature(cart: CartLine[]) {
  return cart
    .map((line) => `${line.product.id}:${line.quantity}`)
    .sort()
    .join('|');
}

function rememberQrPayment(payments: Map<string, Payment>, payment: Payment) {
  for (const [signature, known] of payments) {
    if (known.id === payment.id) payments.set(signature, payment);
  }
}

/**
 * Identity of the exact cash payload the mobile app sent. Unlike the API's
 * canonical request (items and cash only), this includes the per-line price, so
 * a repriced cart is a different attempt and cannot silently reuse an earlier
 * uncertain attempt's idempotency key (defect F3).
 */
function cashPayloadSignature(lines: CartLine[], cashCents: number) {
  const items = lines
    .map((line) => `${line.product.id}:${line.quantity}:${Math.round(line.product.price * 100)}`)
    .join('|');
  return `${items}|cash:${cashCents}`;
}

/**
 * True when a cash attempt failed without a definite answer, so Laravel may
 * still have committed the sale: a transport failure (no HTTP status) or a
 * server-side error.
 */
function isUncertainCashFailure(error: unknown) {
  if (!(error instanceof ApiClientError)) return true;
  return error.status === undefined || error.status >= 500;
}

function createIdempotencyKey(prefix: 'mobile-cash' | 'mobile-qr' = 'mobile-cash') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function usePos() {
  const context = useContext(PosContext);
  if (!context) throw new Error('usePos must be used within PosProvider');
  return context;
}
