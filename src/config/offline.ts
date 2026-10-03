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
  catalogUnavailable: 'We cannot reach the shop server. Connect to it to load the catalog.',
  catalogNotConfigured: 'This phone is not connected to the shop server yet. Ask your administrator to finish setup before searching the catalog.',
  inventoryUnavailable: 'We cannot reach the shop server. Connect to it to load current stock.',
  inventoryNotConfigured: 'This phone is not connected to the shop server yet. Ask your administrator to finish setup before managing inventory.',
  salesNotConfigured: 'This phone is not connected to the shop server yet. Connect to load transaction history; no local sale was recorded.',
  barcodeNotConfigured: 'This phone is not connected to the shop server yet, so barcodes cannot be checked against the catalog. Connect to the server and try again.',
  checkoutNotConfigured: 'We cannot reach the shop server. No sale was recorded and stock was not changed. Check the connection, then start payment again.',
  checkoutOffline: 'Connect to the shop server to complete a sale. The cart stays editable and nothing is recorded locally.',
} as const;
