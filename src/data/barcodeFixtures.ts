/**
 * Barcode fixtures for the scanner/cart test plan and for the one manual step
 * in that plan, the printed fixture card (for example
 * `zint -b EANX13 -d 4800000000019`).
 *
 * These are synthetic codes, not real products, but every `EAN13_*` value below
 * is now a genuine GS1 mod-10 symbol. The approved week-6 plan's original list
 * was off by one on every check digit (`4800000000010` instead of
 * `4800000000019`), so no valid printed symbol could decode to those values; a
 * printed fixture card could never have passed. The codes below carry the
 * correct check digit and can be generated and scanned as-is.
 *
 * The scanner still reports the check digit rather than gating on it, because
 * legacy rows in the seeded catalog (`4800010000011` and the other pre-existing
 * identifiers) are not mod-10 valid, and Laravel stays the authority on whether
 * a barcode exists. Whether those legacy identifiers need tolerated lookup
 * separately from GTIN validation is still an open decision.
 */

/** Product exists in the catalog with a healthy stock level. */
export const EAN13_IN_STOCK = '4800000000019';
/** Product exists with stock at or below its reorder level. */
export const EAN13_LOW_STOCK = '4800000000026';
/** Product exists but has no stock left. */
export const EAN13_OUT_OF_STOCK = '4800000000033';
/** Product exists with a large stock level, for multi-add exposure tests. */
export const EAN13_HIGH_STOCK = '4800000000040';
/** Well-formed, check-digit-valid code that is not in the catalog. */
export const UNKNOWN_BARCODE = '9999999999994';

/** Code128/QR-shaped value. The API only accepts 8-64 digits, so this can never be a product barcode. */
export const NON_PRODUCT_CODE = 'PSCA-CART-42';
/** Fewer than 8 digits: a plausible misread of a real symbol. */
export const MALFORMED_SHORT_CODE = '12345';
/** More than 64 digits: outside the documented API barcode shape. */
export const MALFORMED_LONG_CODE = '1'.repeat(65);

/** The GS1 worked example from the plan's research: a genuinely valid EAN-13 check digit. */
export const GS1_EXAMPLE_VALID = '6291041500213';
/** The same payload with a deliberately wrong check digit. */
export const GS1_EXAMPLE_INVALID = '6291041500214';

/** Valid 12-digit UPC-A symbol. */
export const UPC_A_VALID = '036000291452';
/** The same number as iOS reports it: UPC-A is decoded as EAN-13 with a leading zero. */
export const UPC_A_AS_EAN13 = '0036000291452';

/** Every fixture the camera test plan drives, in plan order. */
export const cameraFixtures = [
  { name: 'in stock', barcode: EAN13_IN_STOCK },
  { name: 'low stock', barcode: EAN13_LOW_STOCK },
  { name: 'out of stock', barcode: EAN13_OUT_OF_STOCK },
  { name: 'high stock', barcode: EAN13_HIGH_STOCK },
  { name: 'unknown', barcode: UNKNOWN_BARCODE },
  { name: 'non-product code', barcode: NON_PRODUCT_CODE },
  { name: 'malformed short code', barcode: MALFORMED_SHORT_CODE },
  { name: 'GS1 example with a bad check digit', barcode: GS1_EXAMPLE_INVALID },
  { name: 'UPC-A as iOS reports it', barcode: UPC_A_AS_EAN13 },
] as const;
