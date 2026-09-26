import { useCallback, useEffect, useRef, useState } from 'react';
import {
  BarcodeLookupResult,
  BarcodeResolver,
  BarcodeShape,
  validateBarcodeShape,
} from '@/src/domain/barcode';
import { Product } from '@/src/types';

/**
 * The scan session: it owns the lock, the cooldown, the input validation, the
 * lookup and the per-status outcome so the camera screen only has to render.
 * The camera binding stays in `app/scanner.tsx`; everything decided here is
 * plain JavaScript and is driven by fixtures in Jest.
 */

/**
 * A code left in frame keeps firing native callbacks. Retail scanner guidance
 * for "same symbol" suppression lands between 500 ms and 1500 ms; 1200 ms is
 * deliberately at the top of that range because the lock and the cooldown are
 * two separate defences (see `handleBarcode`).
 */
export const SAME_BARCODE_COOLDOWN_MS = 1200;

export type BarcodeScanKind =
  | 'found'
  | 'not-found'
  | 'unavailable'
  | 'out-of-stock'
  | 'limit-reached'
  | 'invalid'
  | 'error';

export type BarcodeScanOutcome = {
  /** The value the camera reported, trimmed. */
  barcode: string;
  kind: BarcodeScanKind;
  /** Headline for the resolved card. */
  title: string;
  /** Names the problem and the recovery action. */
  message: string;
  product?: Product;
  /** Cart quantity after a successful add, when the resolver reports one. */
  quantity?: number;
  usingFallback: boolean;
  /** The catalog barcode that matched, when it differs from the scanned value. */
  matchedBarcode?: string;
  /** GTIN mod-10 result for the scanned value, when it has a check digit. */
  checkDigitValid?: boolean;
  /** Why a scanned value was rejected before it could reach the network. */
  rejectedReason?: Extract<BarcodeShape, { ok: false }>['reason'];
};

export type UseBarcodeScanOptions = {
  /** Resolves one scanned value against the catalog. */
  resolve: BarcodeResolver;
  /** Scanning stays disarmed until the camera reports it is ready. */
  cameraReady?: boolean;
  /** Same-symbol suppression window in milliseconds. */
  cooldownMs?: number;
  /** Injectable clock so the cooldown is testable. */
  now?: () => number;
};

export type UseBarcodeScan = {
  /** True while a scanned value is being resolved. */
  busy: boolean;
  /** Set once a scan resolves; cleared only by `rearm`. */
  outcome?: BarcodeScanOutcome;
  /** Whether the camera callback should be armed. */
  scanning: boolean;
  /** Wire this to the camera's `onBarcodeScanned`. */
  handleBarcode: (data: string) => void;
  /** Explicit retry: re-arm the scanner after a resolved scan. */
  rearm: () => void;
};

export function useBarcodeScan({
  resolve,
  cameraReady = true,
  cooldownMs = SAME_BARCODE_COOLDOWN_MS,
  now = Date.now,
}: UseBarcodeScanOptions): UseBarcodeScan {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<BarcodeScanOutcome>();
  /**
   * The lock is a ref, not state. Several native callbacks can arrive in one
   * tick, before React has re-rendered, and a `useState` lock lets them all
   * through. The ref flips synchronously at the top of the handler and is only
   * released by `rearm`, so one scan session can never add the same product
   * twice. The cooldown is the second, value-scoped defence: a symbol left in
   * frame keeps firing while the previous answer is still on screen, and after
   * an explicit retry the same symbol would otherwise re-fire at once (defect
   * G4). It is time-bounded, so holding a failing code in frame retries at most
   * once per window instead of raising an alert storm. `rearm` deliberately
   * keeps the cooldown and clears only the lock.
   */
  const lockedRef = useRef(false);
  const lastScanRef = useRef<{ barcode: string; at: number } | undefined>(undefined);
  // Keep the latest resolver without restarting the session on every re-render;
  // the POS resolver changes identity whenever the cart changes.
  const resolveRef = useRef(resolve);
  useEffect(() => {
    resolveRef.current = resolve;
  }, [resolve]);
  const cameraReadyRef = useRef(cameraReady);
  useEffect(() => {
    cameraReadyRef.current = cameraReady;
  }, [cameraReady]);

  const rearm = useCallback(() => {
    lockedRef.current = false;
    setOutcome(undefined);
    setBusy(false);
  }, []);

  const handleBarcode = useCallback((data: string) => {
    if (!cameraReadyRef.current) return;
    if (lockedRef.current) return;

    const barcode = data.trim();
    const last = lastScanRef.current;
    if (last && last.barcode === barcode && now() - last.at < cooldownMs) return;

    lockedRef.current = true;
    lastScanRef.current = { barcode, at: now() };

    const shape = validateBarcodeShape(barcode);
    if (!shape.ok) {
      // Nothing that Laravel could store as a barcode: answer locally instead
      // of spending a request on it.
      setOutcome(invalidOutcome(barcode, shape.reason));
      return;
    }

    setBusy(true);
    void resolveRef.current(shape.digits)
      .then((result) => setOutcome(toOutcome(shape, result)))
      .catch(() => setOutcome(errorOutcome(shape.digits)))
      .finally(() => setBusy(false));
  }, [cooldownMs, now]);

  return { busy, outcome, scanning: cameraReady && !busy && !outcome, handleBarcode, rearm };
}

const INVALID_MESSAGES: Record<Extract<BarcodeShape, { ok: false }>['reason'], string> = {
  empty: 'No barcode value was read. Hold the code inside the frame and hold still.',
  'not-digits': 'This is not a numeric product barcode. PorSca reads GTIN, EAN, and UPC codes: use Search to find this product by name instead.',
  'too-short': 'This code is too short to be a product barcode: a GTIN has at least 8 digits. Check the code and scan again.',
  'too-long': 'This code is longer than the 64-digit maximum for a product barcode. Check the code and scan again.',
};

function invalidOutcome(barcode: string, reason: Extract<BarcodeShape, { ok: false }>['reason']): BarcodeScanOutcome {
  return {
    barcode,
    kind: 'invalid',
    title: 'Not a product barcode',
    message: INVALID_MESSAGES[reason],
    usingFallback: false,
    rejectedReason: reason,
  };
}

function errorOutcome(barcode: string): BarcodeScanOutcome {
  return {
    barcode,
    kind: 'error',
    title: 'Scan failed',
    message: 'The barcode could not be resolved. Check the connection and scan again.',
    usingFallback: false,
  };
}

function toOutcome(shape: Extract<BarcodeShape, { ok: true }>, result: BarcodeLookupResult): BarcodeScanOutcome {
  const base = {
    barcode: shape.digits,
    product: result.product,
    quantity: result.quantity,
    usingFallback: Boolean(result.usingFallback),
    matchedBarcode: result.matchedBarcode,
    checkDigitValid: shape.checkDigitValid,
  };

  switch (result.status) {
    case 'found':
      return { ...base, kind: 'found', title: 'Product found', message: result.message };
    case 'out-of-stock':
      return { ...base, kind: 'out-of-stock', title: 'Out of stock', message: result.message };
    case 'limit-reached':
      return { ...base, kind: 'limit-reached', title: 'Stock limit reached', message: result.message };
    case 'unavailable':
      return { ...base, kind: 'unavailable', title: 'API unavailable', message: result.message };
    case 'not-found':
      return {
        ...base,
        kind: 'not-found',
        title: 'Product not found',
        message: shape.checkDigitValid === false
          ? `No product matches ${shape.digits}, and its check digit is invalid: the symbol may have been misread. Check the code and scan again.`
          : `No product matches ${shape.digits}, in either the UPC-A or the EAN-13 form. Check the code, or add the product from Inventory.`,
      };
  }
}
