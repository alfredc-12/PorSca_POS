import { PaymentMethod, PaymentStatus, Product, Sale, StockStatus } from '@/src/types';

/** The mobile/API contract version promoted with the staging workflow. */
export const API_CONTRACT_VERSION = 'porsca-mobile-api-v1';

export type ApiClientOptions = {
  baseUrl?: string;
  /** Staging/local API bearer token. Production credentials must not be bundled. */
  apiToken?: string;
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
  items: { productId: string; quantity: number; unitPrice: number }[];
  total: number;
  paymentMethod: PaymentMethod;
  paymentId?: string;
};

export type PaymentRequest = {
  transactionId: string;
  amount: number;
  idempotencyKey: string;
};

export type Payment = {
  id: string;
  status: PaymentStatus;
  amount: number;
  qrCode?: string;
  expiresAt?: string;
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

function configuredApiToken() {
  const value = process.env.EXPO_PUBLIC_API_TOKEN?.trim();
  return value || undefined;
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
  private readonly apiToken?: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? configuredBaseUrl())?.replace(/\/+$/, '');
    this.apiToken = options.apiToken?.trim() || configuredApiToken();
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get isConfigured() {
    return Boolean(this.baseUrl);
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
    return this.request<Sale>(this.versionedPath('/sales/checkout'), {
      method: 'POST',
      headers: { 'Idempotency-Key': sale.idempotencyKey },
      body: sale,
    });
  }

  listTransactions() {
    return this.request<Sale[]>(this.versionedPath('/transactions'));
  }

  getTransaction(transactionId: string) {
    return this.request<Sale>(this.versionedPath(`/transactions/${encodeURIComponent(transactionId)}`));
  }

  createQrPhPayment(payment: PaymentRequest) {
    return this.request<Payment>(this.versionedPath('/payments'), {
      method: 'POST',
      headers: { 'Idempotency-Key': payment.idempotencyKey },
      body: payment,
    });
  }

  getPaymentStatus(paymentId: string) {
    return this.request<Payment>(this.versionedPath(`/payments/${encodeURIComponent(paymentId)}`));
  }

  cancelPayment(paymentId: string) {
    return this.request<Payment>(this.versionedPath(`/payments/${encodeURIComponent(paymentId)}/status`), { method: 'POST' });
  }

  private versionedPath(path: string) {
    const baseUrl = this.baseUrl ?? '';
    return /\/api\/v1$/i.test(baseUrl) ? path : `/api/v1${path}`;
  }

  private async request<T>(path: string, options: { method?: string; headers?: Record<string, string>; body?: unknown } = {}) {
    if (!this.baseUrl) {
      throw new ApiClientError('API URL is not configured. Set EXPO_PUBLIC_API_URL before using the backend.');
    }

    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method: options.method ?? 'GET',
        headers: {
          Accept: 'application/json',
          'X-PorSca-Contract-Version': API_CONTRACT_VERSION,
          ...(this.apiToken ? { Authorization: `Bearer ${this.apiToken}` } : {}),
          ...(options.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network request failed.';
      throw new ApiClientError(`Unable to reach PorSca API: ${message}`);
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
