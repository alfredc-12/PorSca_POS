import {
  cashTenderPresets, formatCheckoutMoney, isCentavos, meetsStagingProvisionalQrMinimum,
  STAGING_PROVISIONAL_QR_MINIMUM_CENTAVOS, validateCashTender,
} from './checkoutMoney';

describe('strict cash grammar and integer centavos', () => {
  it.each(['1', '1.0', '1.00', '001.00'])('accepts decimal %s without drift', (input) => {
    expect(validateCashTender(input, 100)).toEqual({ kind: 'sufficient', amountCentavos: 100, changeCentavos: 0 });
  });
  it.each([' ', ' 1', '1 ', '1\n', '+1', '-1', '1,000', '₱1', '1e2', 'NaN', 'Infinity', '.50', '1.', '1.001', '0x10', '١'])
  ('rejects %j, never normalizing invalid input to zero', (input) => {
    expect(validateCashTender(input, 0)).toEqual({ kind: 'invalid' });
  });
  it('distinguishes empty, insufficient, exact, change, and zero total', () => {
    expect(validateCashTender('', 0)).toEqual({ kind: 'empty' });
    expect(validateCashTender('0', 0)).toEqual({ kind: 'sufficient', amountCentavos: 0, changeCentavos: 0 });
    expect(validateCashTender('0.29', 30)).toEqual({ kind: 'insufficient', amountCentavos: 29, shortfallCentavos: 1 });
    expect(validateCashTender('0.30', 29)).toEqual({ kind: 'sufficient', amountCentavos: 30, changeCentavos: 1 });
  });
  it('handles the safe integer boundary exactly instead of rounding into range', () => {
    expect(validateCashTender('90071992547409.91', Number.MAX_SAFE_INTEGER)).toEqual({
      kind: 'sufficient', amountCentavos: Number.MAX_SAFE_INTEGER, changeCentavos: 0,
    });
    expect(validateCashTender('90071992547409.92', 0)).toEqual({ kind: 'invalid' });
    expect(formatCheckoutMoney(Number.MAX_SAFE_INTEGER)).toBe('₱90071992547409.91');
  });
  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1])('rejects unsafe money %s', (amount) => {
    expect(isCentavos(amount)).toBe(false);
    expect(() => formatCheckoutMoney(amount)).toThrow(RangeError);
    expect(() => validateCashTender('1', amount)).toThrow(RangeError);
    expect(() => cashTenderPresets(amount)).toThrow(RangeError);
  });
  it.each([[0, '₱0.00'], [1, '₱0.01'], [100, '₱1.00'], [12345, '₱123.45']])('formats %s purely', (amount, expected) => {
    expect(formatCheckoutMoney(amount)).toBe(expected);
  });
  it('supplies exact plus all decided denominations as grammar-valid input', () => {
    const presets = cashTenderPresets(12345);
    expect(presets.map((preset) => preset.label)).toEqual(['Exact', '20', '50', '100', '200', '500', '1000']);
    expect(presets.map((preset) => preset.input)).toEqual(['123.45', '20.00', '50.00', '100.00', '200.00', '500.00', '1000.00']);
    for (const preset of presets) expect(validateCashTender(preset.input, 0).kind).toBe('sufficient');
    expect(validateCashTender(cashTenderPresets(0)[0].input, 0).kind).toBe('sufficient');
  });
  it('keeps the staging-provisional QR minimum separate from cash eligibility', () => {
    const minimum = STAGING_PROVISIONAL_QR_MINIMUM_CENTAVOS;
    expect(meetsStagingProvisionalQrMinimum(minimum - 1)).toBe(false);
    expect(meetsStagingProvisionalQrMinimum(minimum)).toBe(true);
    expect(meetsStagingProvisionalQrMinimum(minimum + 1)).toBe(true);
    expect(validateCashTender('0.01', 1).kind).toBe('sufficient');
  });
});
