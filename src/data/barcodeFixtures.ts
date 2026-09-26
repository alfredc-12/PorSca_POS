/**
 * Barcode fixtures for the scanner/cart test plan and for the one manual step
 * in that plan, the printed fixture card (for example
 * `zint -b EANX13 -d 4800000000010`).
 *
 * These are synthetic codes, not real products.
 *
 * The `EAN13_*` values below are the codes named in the approved week-6 plan.
 * They are **not** GS1 mod-10 valid: the plan's fixture list is off by one on
 * every check digit (for example the correct check digit for the payload
 * `480000000001` is `9`, not `0`), and the repository's own seeded catalog is
 * not mod-10 valid either (`4800010000011` has the same defect). That is why
 * the scanner treats the GTIN check digit as a soft signal rather than a hard
 * gate - a hard gate would reject the plan's own happy-path fixture and every
 * row in the seeded catalog. The GS1 publish worked example is used instead
 * when a test needs a genuinely check-digit-valid code.
 */

/** Product exists in the catalog with a healthy stock level. */
export const EAN13_IN_STOCK = '4800000000010';
/** Product exists with stock at or below its reorder level. */
export const EAN13_LOW_STOCK = '4800000000027';
/** Product exists but has no stock left. */
export const EAN13_OUT_OF_STOCK = '4800000000034';
/** Product exists with a large stock level, for multi-add exposure tests. */
export const EAN13_HIGH_STOCK = '4800000000041';
/** Well-formed code that is not in the catalog. */
export const UNKNOWN_BARCODE = '9999999999999';

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
