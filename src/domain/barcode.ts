import { Product } from '@/src/types';

/**
 * The scanner's decision layer, kept free of React Native and of the camera so
 * it can be driven by fixtures in Jest.
 */

/** Result of resolving one scanned value against the catalog. */
export type BarcodeLookupResult = {
  ok: boolean;
  product?: Product;
  status: 'found' | 'not-found' | 'unavailable' | 'out-of-stock' | 'limit-reached';
  message: string;
  /** True when the answer came from the offline demo catalog rather than Laravel. */
  usingFallback?: boolean;
  /** The catalog barcode that actually matched, when it differs from the scanned value. */
  matchedBarcode?: string;
};

/** Resolves one scanned value. Injected so tests can drive the session without a camera. */
export type BarcodeResolver = (barcode: string) => Promise<BarcodeLookupResult>;

/** The documented API barcode shape: `^\d{8,64}$`. */
export const BARCODE_SHAPE = /^\d{8,64}$/;

/** GTIN symbol lengths that carry a mod-10 check digit. */
export const GTIN_LENGTHS = [8, 12, 13, 14] as const;

export type GtinLength = (typeof GTIN_LENGTHS)[number];

export type BarcodeShape =
  | { ok: true; digits: string; gtinLength?: GtinLength; checkDigitValid?: boolean }
  | { ok: false; reason: 'empty' | 'not-digits' | 'too-short' | 'too-long' };

/**
 * Validate a scanned value before it is allowed to reach the network.
 *
 * The hard gate is exactly the API's documented barcode shape, so nothing the
 * catalog can hold is ever rejected locally. The GTIN check digit is reported
 * but never blocks: the seeded catalog and the plan's own fixture list are not
 * mod-10 valid, and Laravel stays the authority on whether a barcode exists.
 */
export function validateBarcodeShape(value: string): BarcodeShape {
  const digits = value.trim();
  if (!digits) return { ok: false, reason: 'empty' };
  if (!/^\d+$/.test(digits)) return { ok: false, reason: 'not-digits' };
  if (digits.length < 8) return { ok: false, reason: 'too-short' };
  if (digits.length > 64) return { ok: false, reason: 'too-long' };

  if (isGtinLength(digits.length)) {
    return { ok: true, digits, gtinLength: digits.length, checkDigitValid: hasValidCheckDigit(digits) };
  }
  return { ok: true, digits };
}

function isGtinLength(length: number): length is GtinLength {
  return (GTIN_LENGTHS as readonly number[]).includes(length);
}

/**
 * GS1 mod-10 check digit: payload digits weighted 3/1/3/1 from the right,
 * `check = (10 - (sum mod 10)) mod 10`. GS1's published worked example is
 * `6291041500213`.
 */
export function checkDigit(payload: string): number {
  let sum = 0;
  for (let index = payload.length - 1, weight = 3; index >= 0; index -= 1, weight = weight === 3 ? 1 : 3) {
    sum += Number(payload[index]) * weight;
  }
  return (10 - (sum % 10)) % 10;
}

export function hasValidCheckDigit(gtin: string): boolean {
  if (gtin.length < 2 || !/^\d+$/.test(gtin)) return false;
  return checkDigit(gtin.slice(0, -1)) === Number(gtin[gtin.length - 1]);
}

/**
 * UPC-A and EAN-13 are the same number: a UPC-A symbol is an EAN-13 payload
 * with an implied leading zero (Apple TN2325, GS1). iOS reports the 13-digit
 * form while Android may report the 12-digit form, so a barcode stored in one
 * shape must resolve when the phone reports the other.
 *
 * Returns the candidate list to try, most likely form first.
 */
export function barcodeCandidates(value: string): string[] {
  const digits = value.trim();
  if (digits.length === 12) return [digits, `0${digits}`];
  if (digits.length === 13 && digits.startsWith('0')) return [digits, digits.slice(1)];
  return [digits];
}

/** The alternate UPC-A/EAN-13 form, when one exists. */
export function alternateBarcodeForm(value: string): string | undefined {
  const [, alternate] = barcodeCandidates(value);
  return alternate;
}
