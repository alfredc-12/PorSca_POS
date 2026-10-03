import { PaymentMethod, PaymentStatus, Product, Sale, StockStatus } from '@/src/types';

/** The mobile/API contract version promoted with the staging workflow. */
export const API_CONTRACT_VERSION = 'porsca-mobile-api-v2';

export type AuthUser = {
  id: string | number;
  name: string;
  email: string;
  role: 'admin' | 'cashier';
  is_active: boolean;
};

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'cashier';
  is_active: boolean;
  created_at?: string | null;
};

export type CashierInput = { name: string; email: string; password: string };
export type UserUpdate = Partial<CashierInput> & { is_active?: boolean };

type ApiUser = Omit<ManagedUser, 'id'> & { id: string | number };

export type LoginResponse = { token: string; token_type: 'Bearer'; user: AuthUser };

export type ApiClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type ProductSearchOptions = {
  search?: string;
  barcode?: string;
};

export type InventoryItem = {
  productId: string;
  sku?: string;
  barcode: string;
  productName: string;
  quantity: number;
  reorderLevel: number;
  status: StockStatus;
};

type ApiStock = {
  quantity?: number;
  reorder_level?: number;
  status?: StockStatus;
  low_stock?: boolean;
  out_of_stock?: boolean;
};

type ApiProduct = {
  id: string | number;
  sku?: string | null;
  barcode: string;
  name: string;
  price: number | string;
  category?: Product['category'];
  stock?: number | ApiStock | null;
};

type ApiInventoryItem = {
  product_id: string | number;
  sku?: string | null;
  barcode?: string | null;
  product_name?: string | null;
  quantity?: number;
  reorder_level?: number;
  status?: StockStatus;
};

/** Product prices are pesos in the mobile UI and centavos on the API wire. */
export type ProductInput = Omit<Product, 'id'>;

export type InventoryUpdate = {
  stock: number;
  reorder_level?: number;
};

export type SaleRequest = {
  /** Stable client-generated key used by the API to reject duplicate retries. */
  idempotencyKey: string;
  /** Money fields are integer PHP centavos on the wire. */
  items: { productId: string; quantity: number; unitPrice: number }[];
  total: number;
  paymentMethod: PaymentMethod;
  /** Required for cash sales; integer PHP centavos on the wire. */
  cashReceived?: number;
  paymentId?: string;
};

export type ApiSaleItem = {
  product_id?: string | number;
  productId?: string | number;
  sku?: string | null;
  barcode?: string | null;
  name?: string | null;
  quantity: number;
  unit_price?: number | string;
  unitPrice?: number | string;
};

export type ApiSale = {
  id: string | number;
  idempotency_key?: string;
  idempotencyKey?: string;
  status: string;
  payment_method?: PaymentMethod;
  paymentMethod?: PaymentMethod;
  total_amount?: number | string;
  total?: number | string;
  cash_received?: number | string | null;
  cashReceived?: number | string | null;
  change_amount?: number | string | null;
  change?: number | string | null;
  completed_at?: string | null;
  created_at?: string | null;
  createdAt?: string | null;
  items?: ApiSaleItem[];
};

/** Whether the original cash receipt was found or conclusively absent. */
export type CashSaleAttemptResolution = 'found' | 'not-found' | 'unknown';

type ApiSalesPage = {
  items?: ApiSale[];
  pagination?: { current_page?: number; last_page?: number; total?: number };
};

export type ApiTransaction = {
  id: string | number;
  payment_id?: string | number | null;
  sale_id?: string | number | null;
  type: string;
  status: string;
  amount: number | string;
  currency?: string;
  metadata?: Record<string, unknown> | null;
  occurred_at?: string | null;
};

export type PaymentRequest = {
  idempotencyKey: string;
  items: { productId: string; quantity: number }[];
};

type ApiPayment = {
  id: string | number;
  status?: string;
  amount?: number | string;
  currency?: string;
  provider_payment_id?: string | null;
  qr_payload?: string | null;
  qrCode?: string | null;
  checkout_url?: string | null;
  checkoutUrl?: string | null;
  sale_id?: string | number | null;
  saleId?: string | number | null;
  failure_reason?: string | null;
  failureReason?: string | null;
  reservation_expires_at?: string | null;
  reservationExpiresAt?: string | null;
};

export type Payment = {
  id: string;
  status: PaymentStatus;
  /** Amount as returned by Laravel (integer PHP centavos). */
  amount: number;
  currency?: string;
  providerPaymentId?: string;
  qrPayload?: string;
  /** Legacy alias kept for callers that render a QR code directly. */
  qrCode?: string;
  checkoutUrl?: string;
  saleId?: string;
  failureReason?: string;
  /** ISO timestamp when the server-side stock reservation lapses. */
  reservationExpiresAt?: string;
};

export type ApiErrorBody = {
  error?: string | { code?: string; message?: string; details?: unknown };
  message?: string;
  details?: unknown;
};

export class ApiClientError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly details?: unknown;

  constructor(message: string, status?: number, code?: string, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function configuredBaseUrl() {
  const value = process.env.EXPO_PUBLIC_API_URL?.trim();
  return value ? value.replace(/\/+$/, '') : undefined;
}

export function isDeviceSafeApiUrl(value: string | undefined) {
  if (!value) return false;
  try {
    const url = new URL(value);
    return (url.protocol === 'http:' || url.protocol === 'https:') && !['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function unwrapData<T>(payload: T | { data: T }) {
  if (typeof payload === 'object' && payload !== null && 'data' in payload) {
    return (payload as { data: T }).data;
  }
  return payload as T;
}

/**
 * The only network boundary used by the mobile app. It intentionally contains
 * no PayMongo credentials; provider calls happen on the API server.
 */
export class ApiClient {
  readonly baseUrl?: string;
  private token?: string;
  private tokenRevision = 0;
  private onUnauthorized?: () => void;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? configuredBaseUrl())?.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get isConfigured() {
    return Boolean(this.baseUrl);
  }

  /** Tokens are runtime session state, never build-time public configuration. */
  setToken(token: string | null) {
    this.token = token?.trim() || undefined;
    this.tokenRevision += 1;
  }

  setUnauthorizedHandler(handler?: () => void) {
    this.onUnauthorized = handler;
  }

  login(email: string, password: string) {
    return this.request<LoginResponse>(this.versionedPath('/auth/login'), {
      method: 'POST', body: { email, password, device_name: 'PorSca POS' }, authenticated: false,
    });
  }

  me() {
    return this.request<{ user: AuthUser }>(this.versionedPath('/auth/me'));
  }

  logout() {
    return this.request<void>(this.versionedPath('/auth/logout'), { method: 'POST' });
  }

  listUsers() {
    return this.request<ApiUser[] | { items?: ApiUser[] }>(this.versionedPath('/users')).then((payload) => {
      const users = Array.isArray(payload) ? payload : payload.items ?? [];
      return users.map(normalizeManagedUser);
    });
  }

  createCashier(user: CashierInput) {
    return this.request<{ user: ApiUser }>(this.versionedPath('/users'), { method: 'POST', body: user })
      .then((payload) => normalizeManagedUser(payload.user));
  }

  updateUser(userId: string, update: UserUpdate) {
    return this.request<{ user: ApiUser }>(this.versionedPath(`/users/${encodeURIComponent(userId)}`), { method: 'PATCH', body: update })
      .then((payload) => normalizeManagedUser(payload.user));
  }

  deactivateUser(userId: string) {
    return this.request<void>(this.versionedPath(`/users/${encodeURIComponent(userId)}/deactivate`), { method: 'POST' });
  }

  async health() {
    return this.request<{ ok?: boolean; service?: string; status?: string }>(this.versionedPath('/health'));
  }

  listProducts(options: ProductSearchOptions = {}) {
    const search = options.search?.trim();
    const barcode = options.barcode?.trim();
    const query = barcode
      ? `?barcode=${encodeURIComponent(barcode)}&per_page=100`
      : search
        ? `?search=${encodeURIComponent(search)}&per_page=100`
        : '?per_page=100';
    return this.request<ApiProduct[] | { items?: ApiProduct[] }>(this.versionedPath(`/products${query}`)).then((payload) => {
      const items = Array.isArray(payload) ? payload : payload.items ?? [];
      return items.map(normalizeProduct);
    });
  }

  getProduct(productId: string) {
    return this.request<ApiProduct>(this.versionedPath(`/products/${encodeURIComponent(productId)}`)).then(normalizeProduct);
  }

  getProductByBarcode(barcode: string) {
    return this.request<ApiProduct>(this.versionedPath(`/products/barcode/${encodeURIComponent(barcode)}`)).then(normalizeProduct);
  }

  createProduct(product: ProductInput) {
    return this.request<ApiProduct>(this.versionedPath('/products'), { method: 'POST', body: serializeProductInput(product) }).then(normalizeProduct);
  }

  updateProduct(productId: string, product: Partial<ProductInput>) {
    return this.request<ApiProduct>(this.versionedPath(`/products/${encodeURIComponent(productId)}`), { method: 'PATCH', body: serializeProductPatch(product) }).then(normalizeProduct);
  }

  listInventory() {
    return this.request<ApiInventoryItem[] | { items?: ApiInventoryItem[] }>(this.versionedPath('/inventory')).then((payload) => {
      const items = Array.isArray(payload) ? payload : payload.items ?? [];
      return items.map(normalizeInventoryItem);
    });
  }

  updateInventory(productId: string, update: InventoryUpdate) {
    return this.request<ApiProduct>(this.versionedPath(`/products/${encodeURIComponent(productId)}/stock`), { method: 'PATCH', body: update }).then(normalizeProduct);
  }

  createSale(sale: SaleRequest) {
    return this.request<ApiSale>(this.versionedPath('/sales/checkout'), {
      method: 'POST',
      headers: { 'Idempotency-Key': sale.idempotencyKey },
      body: sale,
    }).then(normalizeSale);
  }

  listSales() {
    return this.readSalesPage().then((payload) => {
      const items = Array.isArray(payload) ? payload : payload.items ?? [];
      return items.map(normalizeSale);
    });
  }

  /** A missing receipt on an incomplete history page is never proof of absence. */
  async resolveCashSaleAttempt(idempotencyKey: string): Promise<CashSaleAttemptResolution> {
    const payload = await this.readSalesPage();
    const items = Array.isArray(payload) ? payload : payload.items ?? [];
    if (items.some((sale) => (sale.idempotency_key ?? sale.idempotencyKey) === idempotencyKey)) return 'found';

    if (!Array.isArray(payload) && Array.isArray(payload.items)) {
      const pagination = payload.pagination;
      if (pagination?.current_page === 1 && pagination.last_page === 1 && pagination.total === items.length) {
        return 'not-found';
      }
    }
    return 'unknown';
  }

  private readSalesPage() {
    return this.request<ApiSale[] | ApiSalesPage>(this.versionedPath('/sales?per_page=100'));
  }

  listTransactions() {
    return this.request<ApiTransaction[] | { items?: ApiTransaction[] }>(this.versionedPath('/transactions?per_page=100')).then((payload) => {
      const items = Array.isArray(payload) ? payload : payload.items ?? [];
      return items;
    });
  }

  getTransaction(transactionId: string) {
    return this.request<ApiTransaction>(this.versionedPath(`/transactions/${encodeURIComponent(transactionId)}`));
  }

  createQrPhPayment(payment: PaymentRequest) {
    return this.request<ApiPayment>(this.versionedPath('/payments'), {
      method: 'POST',
      headers: { 'Idempotency-Key': payment.idempotencyKey },
      body: payment,
    }).then(normalizePayment);
  }

  /** Stored-state read; it does not ask the provider for a newer outcome. */
  getPaymentStatus(paymentId: string) {
    return this.request<ApiPayment>(this.versionedPath(`/payments/${encodeURIComponent(paymentId)}`)).then(normalizePayment);
  }

  /**
   * Authoritative provider-verified check. Laravel inspects the PayMongo
   * sandbox and settles a verified outcome before responding. This endpoint
   * never cancels a payment; leaving a pending attempt alone lets the
   * server-side reservation expire on its own.
   */
  refreshPayment(paymentId: string) {
    return this.request<ApiPayment>(this.versionedPath(`/payments/${encodeURIComponent(paymentId)}/refresh`), { method: 'POST' }).then(normalizePayment);
  }

  private versionedPath(path: string) {
    const baseUrl = this.baseUrl ?? '';
    return /\/api\/v1$/i.test(baseUrl) ? path : `/api/v1${path}`;
  }

  private async request<T>(path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown; authenticated?: boolean } = {}) {
    if (!this.baseUrl) {
      throw new ApiClientError('The shop server address is not set up on this device.', undefined, 'server_not_configured');
    }

    // A late 401 from a previous session must not sign out a newly logged-in user.
    const revision = this.tokenRevision;
    const token = options.authenticated === false ? undefined : this.token;
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          'X-PorSca-Contract-Version': API_CONTRACT_VERSION,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network request failed.';
      throw new ApiClientError(`Unable to reach PorSca API: ${message}`);
    }

    if (response.status === 401 && revision === this.tokenRevision) {
      this.setToken(null);
      this.onUnauthorized?.();
    }

    const payload = await response.json().catch(() => undefined) as ApiErrorBody | T | undefined;
    if (!response.ok) {
      const errorPayload = payload as ApiErrorBody | undefined;
      const error = typeof errorPayload?.error === 'object' ? errorPayload.error : undefined;
      const message = error?.message ?? (typeof errorPayload?.error === 'string' ? errorPayload.error : undefined) ?? errorPayload?.message ?? `PorSca API request failed (${response.status}).`;
      throw new ApiClientError(message, response.status, error?.code, error?.details ?? errorPayload?.details);
    }

    return unwrapData(payload as T);
  }
}

function serializeProductInput(product: ProductInput) {
  return {
    ...(product.sku ? { sku: product.sku } : {}),
    barcode: product.barcode,
    name: product.name,
    ...(product.category ? { category: product.category } : {}),
    price: toApiPrice(product.price),
    stock: product.stock,
    ...(product.reorderLevel === undefined ? {} : { reorder_level: product.reorderLevel }),
  };
}

function serializeProductPatch(product: Partial<ProductInput>) {
  return {
    ...(product.sku === undefined ? {} : { sku: product.sku }),
    ...(product.barcode === undefined ? {} : { barcode: product.barcode }),
    ...(product.name === undefined ? {} : { name: product.name }),
    ...(product.category === undefined ? {} : { category: product.category }),
    ...(product.price === undefined ? {} : { price: toApiPrice(product.price) }),
    ...(product.stock === undefined ? {} : { stock: product.stock }),
    ...(product.reorderLevel === undefined ? {} : { reorder_level: product.reorderLevel }),
  };
}

function toApiPrice(price: number) {
  return Math.round(price * 100);
}

function normalizeManagedUser(user: ApiUser): ManagedUser {
  return {
    id: String(user.id),
    name: user.name,
    email: user.email,
    role: user.role,
    is_active: Boolean(user.is_active),
    ...(user.created_at === undefined ? {} : { created_at: user.created_at }),
  };
}

function normalizeProduct(product: ApiProduct): Product {
  const stock = typeof product.stock === 'object' && product.stock !== null ? product.stock : undefined;
  const quantity = stock ? Number(stock.quantity ?? 0) : Number(product.stock ?? 0);
  const reorderLevel = stock ? Number(stock.reorder_level ?? 0) : undefined;
  const status = stock?.status ?? (quantity === 0 ? 'out_of_stock' : reorderLevel !== undefined && quantity <= reorderLevel ? 'low_stock' : 'in_stock');
  const apiPrice = Number(product.price);

  return {
    id: String(product.id),
    barcode: product.barcode,
    name: product.name,
    // Laravel stores PHP money as integer centavos. Legacy mock-shaped
    // responses already use pesos and are kept compatible for local tests.
    price: stock ? apiPrice / 100 : apiPrice,
    stock: quantity,
    stockStatus: status,
    ...(reorderLevel === undefined ? {} : { reorderLevel }),
    ...(product.sku ? { sku: product.sku } : {}),
    ...(product.category ? { category: product.category } : {}),
  };
}

function normalizeSale(sale: ApiSale): Sale {
  const totalCents = Number(sale.total_amount ?? sale.total ?? 0);
  const cashReceivedCents = sale.cash_received ?? sale.cashReceived;
  const changeCents = sale.change_amount ?? sale.change;

  return {
    id: String(sale.id),
    createdAt: sale.completed_at ?? sale.createdAt ?? sale.created_at ?? new Date(0).toISOString(),
    total: totalCents / 100,
    paymentMethod: sale.payment_method ?? sale.paymentMethod ?? 'cash',
    // Laravel calls a completed sale "completed"; the mobile payment status
    // uses "paid" for the same externally visible state.
    status: sale.status === 'completed' ? 'paid' : normalizePaymentStatus(sale.status),
    ...(sale.idempotency_key || sale.idempotencyKey ? { idempotencyKey: sale.idempotency_key ?? sale.idempotencyKey } : {}),
    ...(cashReceivedCents === null || cashReceivedCents === undefined ? {} : { cashReceived: Number(cashReceivedCents) / 100 }),
    ...(changeCents === null || changeCents === undefined ? {} : { change: Number(changeCents) / 100 }),
    items: (sale.items ?? []).map((item) => ({
      product: {
        id: String(item.product_id ?? item.productId ?? ''),
        barcode: item.barcode ?? '',
        name: item.name ?? 'Unnamed product',
        price: Number(item.unit_price ?? item.unitPrice ?? 0) / 100,
        stock: 0,
        ...(item.sku ? { sku: item.sku } : {}),
      },
      quantity: Number(item.quantity),
    })),
  };
}

function normalizePayment(payment: ApiPayment): Payment {
  const qrPayload = payment.qr_payload ?? payment.qrCode ?? undefined;
  const checkoutUrl = payment.checkout_url ?? payment.checkoutUrl ?? undefined;
  const saleId = payment.sale_id ?? payment.saleId;
  const failureReason = payment.failure_reason ?? payment.failureReason ?? undefined;
  const providerPaymentId = payment.provider_payment_id ?? undefined;
  const reservationExpiresAt = payment.reservation_expires_at ?? payment.reservationExpiresAt ?? undefined;

  return {
    id: String(payment.id),
    status: normalizePaymentStatus(payment.status ?? 'pending'),
    amount: Number(payment.amount ?? 0),
    ...(payment.currency ? { currency: payment.currency } : {}),
    ...(providerPaymentId ? { providerPaymentId } : {}),
    ...(qrPayload ? { qrPayload, qrCode: qrPayload } : {}),
    ...(checkoutUrl ? { checkoutUrl } : {}),
    ...(saleId === null || saleId === undefined ? {} : { saleId: String(saleId) }),
    ...(failureReason ? { failureReason } : {}),
    ...(reservationExpiresAt ? { reservationExpiresAt } : {}),
  };
}

function normalizePaymentStatus(status: string): PaymentStatus {
  // `paid_unfulfilled` means the provider took the money but Laravel could not
  // fulfil stock. It is terminal and must never read as pending or paid.
  return status === 'pending' || status === 'paid' || status === 'paid_unfulfilled' || status === 'failed' || status === 'cancelled' || status === 'expired'
    ? status
    : 'pending';
}

function normalizeInventoryItem(item: ApiInventoryItem): InventoryItem {
  const quantity = Number(item.quantity ?? 0);
  const reorderLevel = Number(item.reorder_level ?? 0);
  const status = item.status ?? (quantity === 0 ? 'out_of_stock' : quantity <= reorderLevel ? 'low_stock' : 'in_stock');

  return {
    productId: String(item.product_id),
    sku: item.sku ?? undefined,
    barcode: item.barcode ?? '',
    productName: item.product_name ?? 'Unnamed product',
    quantity,
    reorderLevel,
    status,
  };
}

/** Shared client instance; inject ApiClient in tests or alternate app shells. */
export const apiClient = new ApiClient();
