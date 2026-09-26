import { useCallback, useEffect, useRef, useState } from 'react';
import { BarcodeLookupResult, BarcodeResolver } from '@/src/domain/barcode';
import { Product } from '@/src/types';

/**
 * The scan session: it owns the lock, the lookup and the per-status outcome so
 * the camera screen only has to render. The camera binding stays in
 * `app/scanner.tsx`; everything decided here is plain JavaScript and can be
 * driven by fixtures in Jest.
 */

export type BarcodeScanOutcome = {
  /** The value the camera reported, trimmed. */
  barcode: string;
  kind: 'found' | 'not-found' | 'unavailable' | 'out-of-stock' | 'limit-reached' | 'error';
  product?: Product;
  message: string;
  usingFallback: boolean;
  /** The catalog barcode that matched, when it differs from the scanned value. */
  matchedBarcode?: string;
};

export type UseBarcodeScanOptions = {
  /** Resolves one scanned value against the catalog. */
  resolve: BarcodeResolver;
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

export function useBarcodeScan({ resolve }: UseBarcodeScanOptions): UseBarcodeScan {
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<BarcodeScanOutcome>();
  // Keep the latest resolver without making the session restart on every
  // re-render; the POS resolver changes identity whenever the cart changes.
  const resolveRef = useRef(resolve);
  useEffect(() => {
    resolveRef.current = resolve;
  }, [resolve]);

  const handleBarcode = useCallback((data: string) => {
    const barcode = data.trim();
    setBusy(true);
    void resolveRef.current(barcode)
      .then((result) => {
        setOutcome(toOutcome(barcode, result));
      })
      .catch(() => {
        setOutcome({
          barcode,
          kind: 'error',
          message: 'The barcode could not be resolved. Check the connection and scan again.',
          usingFallback: false,
        });
      })
      .finally(() => {
        setBusy(false);
      });
  }, []);

  const rearm = useCallback(() => {
    setOutcome(undefined);
    setBusy(false);
  }, []);

  return { busy, outcome, scanning: !busy && !outcome, handleBarcode, rearm };
}

function toOutcome(barcode: string, result: BarcodeLookupResult): BarcodeScanOutcome {
  return {
    barcode,
    kind: result.status === 'found' ? 'found' : result.status,
    ...(result.product ? { product: result.product } : {}),
    message: result.message,
    usingFallback: Boolean(result.usingFallback),
    ...(result.matchedBarcode ? { matchedBarcode: result.matchedBarcode } : {}),
  };
}
