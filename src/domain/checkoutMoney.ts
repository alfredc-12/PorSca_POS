/** Integer PHP centavos inside the new checkout domain; no wire DTOs live here. */
export function isCentavos(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

export function assertCentavos(value: number): void {
  if (!isCentavos(value)) throw new RangeError('Money must be non-negative safe integer centavos.');
}

export type CashTender =
  | { kind: 'empty' }
  | { kind: 'invalid' }
  | { kind: 'insufficient'; amountCentavos: number; shortfallCentavos: number }
  | { kind: 'sufficient'; amountCentavos: number; changeCentavos: number };

/**
 * Full-string decimal grammar: digits, optionally a dot and 1–2 digits.
 * No trimming, signs, grouping, exponent notation, or fractional centavos.
 * Empty is not submitted; zero is valid (and sufficient for a zero total).
 * Parse with integer arithmetic rather than rounding a floating peso amount.
 */
export function validateCashTender(input: string, totalCentavos: number): CashTender {
  assertCentavos(totalCentavos);
  if (input === '') return { kind: 'empty' };
  if (!/^[0-9]+(?:\.[0-9]{1,2})?$/.test(input)) return { kind: 'invalid' };
  const [whole, fraction = ''] = input.split('.');
  const amount = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) return { kind: 'invalid' };
  const amountCentavos = Number(amount);
  return amountCentavos < totalCentavos
    ? { kind: 'insufficient', amountCentavos, shortfallCentavos: totalCentavos - amountCentavos }
    : { kind: 'sufficient', amountCentavos, changeCentavos: amountCentavos - totalCentavos };
}

/** One pure formatter for the new centavo domain (not the existing peso seam). */
export function formatCheckoutMoney(amountCentavos: number): string {
  assertCentavos(amountCentavos);
  const digits = String(amountCentavos).padStart(3, '0');
  return `₱${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

export const CASH_PRESET_PESOS = Object.freeze([20, 50, 100, 200, 500, 1000] as const);

/** Text to fill tender input, not a confirmation that cash was received. */
export function cashTenderPresets(totalCentavos: number): readonly { label: string; input: string }[] {
  assertCentavos(totalCentavos);
  return [
    { label: 'Exact', input: formatCheckoutMoney(totalCentavos).slice(1) },
    ...CASH_PRESET_PESOS.map((pesos) => ({ label: String(pesos), input: `${pesos}.00` })),
  ];
}

/** STAGING-PROVISIONAL only: replace once provider GATE-04 establishes limits. */
export const STAGING_PROVISIONAL_QR_MINIMUM_CENTAVOS = 100;

/** Local eligibility rule; never asserts provider/account eligibility or payment. */
export function meetsStagingProvisionalQrMinimum(amountCentavos: number): boolean {
  assertCentavos(amountCentavos);
  return amountCentavos >= STAGING_PROVISIONAL_QR_MINIMUM_CENTAVOS;
}
