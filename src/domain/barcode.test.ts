import {
  alternateBarcodeForm,
  barcodeCandidates,
  checkDigit,
  hasValidCheckDigit,
  validateBarcodeShape,
} from '@/src/domain/barcode';
import {
  EAN13_HIGH_STOCK,
  EAN13_IN_STOCK,
  EAN13_LOW_STOCK,
  EAN13_OUT_OF_STOCK,
  GS1_EXAMPLE_INVALID,
  GS1_EXAMPLE_VALID,
  MALFORMED_LONG_CODE,
  MALFORMED_SHORT_CODE,
  NON_PRODUCT_CODE,
  UNKNOWN_BARCODE,
  UPC_A_AS_EAN13,
  UPC_A_VALID,
} from '@/src/data/barcodeFixtures';

describe('barcode shape validation', () => {
  it('accepts the documented API barcode shape', () => {
    const shape = validateBarcodeShape(EAN13_IN_STOCK);
    expect(shape).toEqual({ ok: true, digits: EAN13_IN_STOCK, gtinLength: 13, checkDigitValid: true });
    expect(validateBarcodeShape(' 4800010000011 ')).toMatchObject({ ok: true, digits: '4800010000011' });
    expect(validateBarcodeShape('12345678')).toMatchObject({ ok: true, gtinLength: 8 });
  });

  it('rejects values Laravel could never store as a barcode', () => {
    expect(validateBarcodeShape('')).toEqual({ ok: false, reason: 'empty' });
    expect(validateBarcodeShape('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(validateBarcodeShape(NON_PRODUCT_CODE)).toEqual({ ok: false, reason: 'not-digits' });
    expect(validateBarcodeShape(MALFORMED_SHORT_CODE)).toEqual({ ok: false, reason: 'too-short' });
    expect(validateBarcodeShape(MALFORMED_LONG_CODE)).toEqual({ ok: false, reason: 'too-long' });
  });

  it('reports the check digit without blocking a code the API would accept', () => {
    expect(validateBarcodeShape(GS1_EXAMPLE_VALID)).toMatchObject({ ok: true, checkDigitValid: true });
    expect(validateBarcodeShape(GS1_EXAMPLE_INVALID)).toMatchObject({ ok: true, checkDigitValid: false });
  });

  it('ships printable fixtures whose check digits are valid', () => {
    // The plan's original fixture list was off by one on every check digit, so a
    // printed EAN-13 symbol could not decode to it. These are the corrected
    // values a printed card can actually carry (defect F6).
    for (const fixture of [EAN13_IN_STOCK, EAN13_LOW_STOCK, EAN13_OUT_OF_STOCK, EAN13_HIGH_STOCK, UNKNOWN_BARCODE]) {
      expect(fixture).toMatch(/^\d{13}$/);
      expect(hasValidCheckDigit(fixture)).toBe(true);
    }
  });
});

describe('GS1 mod-10 check digit', () => {
  it('matches the GS1 published worked example', () => {
    expect(checkDigit('629104150021')).toBe(3);
    expect(hasValidCheckDigit(GS1_EXAMPLE_VALID)).toBe(true);
    expect(hasValidCheckDigit(GS1_EXAMPLE_INVALID)).toBe(false);
  });

  it('validates UPC-A and EAN-13 with the same rule', () => {
    expect(hasValidCheckDigit(UPC_A_VALID)).toBe(true);
    expect(hasValidCheckDigit(UPC_A_AS_EAN13)).toBe(true);
  });
});

describe('UPC-A / EAN-13 canonicalisation', () => {
  it('tries the EAN-13 leading-zero form of a 12-digit UPC-A symbol', () => {
    expect(barcodeCandidates(UPC_A_VALID)).toEqual([UPC_A_VALID, UPC_A_AS_EAN13]);
    expect(alternateBarcodeForm(UPC_A_VALID)).toBe(UPC_A_AS_EAN13);
  });

  it('tries the 12-digit UPC-A form of a leading-zero EAN-13 symbol', () => {
    expect(barcodeCandidates(UPC_A_AS_EAN13)).toEqual([UPC_A_AS_EAN13, UPC_A_VALID]);
    expect(alternateBarcodeForm(UPC_A_AS_EAN13)).toBe(UPC_A_VALID);
  });

  it('leaves other GTIN lengths alone', () => {
    expect(barcodeCandidates(EAN13_IN_STOCK)).toEqual([EAN13_IN_STOCK]);
    expect(alternateBarcodeForm(EAN13_IN_STOCK)).toBeUndefined();
  });
});
