/**
 * Offline policy (the captain's Q5 answer, option O1: strict online with the
 * demo catalog behind an off-by-default flag).
 *
 * The seeded catalog used to substitute itself whenever an API read failed,
 * which meant a cashier could add a demo product and even complete a "sale"
 * that never reached Laravel and never moved real stock (defect G10). The demo
 * catalog is now opt-in and, when it is off, nothing is substituted: the app
 * reports the offline state and keeps the cart editable.
 */

export const DEMO_CATALOG_ENV_VAR = 'EXPO_PUBLIC_ALLOW_DEMO_CATALOG';

/** Only the exact value `1` enables the demo catalog. Absent, empty or anything else keeps strict online mode. */
export function isDemoCatalogEnabled(
  env: Record<string, string | undefined> = {
    // Expo can inline this direct reference into production client bundles.
    EXPO_PUBLIC_ALLOW_DEMO_CATALOG: process.env.EXPO_PUBLIC_ALLOW_DEMO_CATALOG,
  },
): boolean {
  return env[DEMO_CATALOG_ENV_VAR] === '1';
}

export const OFFLINE_COPY = {
  catalogUnavailable: 'Laravel API is unavailable. Connect to the API to load the catalog; no demo catalog is in use.',
  catalogNotConfigured: 'Laravel API is not configured. Set EXPO_PUBLIC_API_URL and connect before searching the catalog.',
  inventoryUnavailable: 'Laravel API is unavailable. Connect to the API to load authoritative inventory.',
  inventoryNotConfigured: 'Laravel API is not configured. Set EXPO_PUBLIC_API_URL and connect before managing inventory.',
  salesNotConfigured: 'Laravel API is not configured. Connect to the API to load transaction history; no local sale was recorded.',
  barcodeNotConfigured: 'Laravel API is not configured, so barcodes cannot be checked against the catalog. Connect to the API and try again.',
  checkoutNotConfigured: 'Laravel API is not configured. No sale was recorded and stock was not changed. Connect to the API and try again.',
  checkoutOffline: 'Connect to the Laravel API to complete a sale. The cart stays editable and nothing is recorded locally.',
} as const;
