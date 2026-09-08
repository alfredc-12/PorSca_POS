import { PaymentMethod, PaymentStatus, Product, Sale } from '@/src/types';

/** The mobile/API contract version promoted with the staging workflow. */
export const API_CONTRACT_VERSION = 'porsca-mobile-api-v1';

export type ApiClientOptions = {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
};

export type ProductInput = Omit<Product, 'id'>;

export type InventoryUpdate = {
  stock: number;
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
  error?: string;
  message?: string;
  details?: unknown;
};

export class ApiClientError extends Error {
  readonly status?: number;
  readonly details?: unknown;

  constructor(message: string, status?: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
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
  private readonly fetchImpl: typeof fetch;

  constructor(options: ApiClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? configuredBaseUrl())?.replace(/\/+$/, '');
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  get isConfigured() {
    return Boolean(this.baseUrl);
  }

  async health() {
    return this.request<{ ok: boolean; service: string }>('/health');
  }

  listProducts() {
    return this.request<Product[]>('/api/products');
  }

  getProduct(productId: string) {
    return this.request<Product>(`/api/products/${encodeURIComponent(productId)}`);
  }

  createProduct(product: ProductInput) {
    return this.request<Product>('/api/products', { method: 'POST', body: product });
  }

  updateProduct(productId: string, product: Partial<ProductInput>) {
    return this.request<Product>(`/api/products/${encodeURIComponent(productId)}`, { method: 'PATCH', body: product });
  }

  listInventory() {
    return this.request<Product[]>('/api/inventory');
  }

  updateInventory(productId: string, update: InventoryUpdate) {
    return this.request<Product>(`/api/inventory/${encodeURIComponent(productId)}`, { method: 'PATCH', body: update });
  }

  createSale(sale: SaleRequest) {
    return this.request<Sale>('/api/sales', {
      method: 'POST',
      headers: { 'Idempotency-Key': sale.idempotencyKey },
      body: sale,
    });
  }

  listTransactions() {
    return this.request<Sale[]>('/api/transactions');
  }

  getTransaction(transactionId: string) {
    return this.request<Sale>(`/api/transactions/${encodeURIComponent(transactionId)}`);
  }

  createQrPhPayment(payment: PaymentRequest) {
    return this.request<Payment>('/api/payments/qrph', {
      method: 'POST',
      headers: { 'Idempotency-Key': payment.idempotencyKey },
      body: payment,
    });
  }

  getPaymentStatus(paymentId: string) {
    return this.request<Payment>(`/api/payments/${encodeURIComponent(paymentId)}`);
  }

  cancelPayment(paymentId: string) {
    return this.request<Payment>(`/api/payments/${encodeURIComponent(paymentId)}/cancel`, { method: 'POST' });
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
          ...(options.body ? { 'Content-Type': 'application/json' } : {}),
          ...options.headers,
        },
        body: options.body ? JSON.stringify(options.body) : undefined,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network request failed.';
      throw new ApiClientError(`Unable to reach PorSca API: ${message}`);
    }

    const payload = await response.json().catch(() => undefined) as ApiErrorBody | T | undefined;
    if (!response.ok) {
      const errorPayload = payload as ApiErrorBody | undefined;
      throw new ApiClientError(errorPayload?.error ?? errorPayload?.message ?? `PorSca API request failed (${response.status}).`, response.status, errorPayload?.details);
    }

    return unwrapData(payload as T);
  }
}

/** Shared client instance; inject ApiClient in tests or alternate app shells. */
export const apiClient = new ApiClient();
