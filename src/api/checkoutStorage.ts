import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { CheckoutHandle, CheckoutStorage, CheckoutStorageCorruptionError } from '@/src/domain/durableCheckout';

/** Retain identity/keys, not financial truth or provider capabilities. Shared across operators on this device. */
function isCheckoutHandle(value: unknown): value is CheckoutHandle {
  if (!value || typeof value !== 'object') return false;
  const handle = value as Partial<CheckoutHandle>;
  if (typeof handle.key !== 'string' || !handle.key || typeof handle.signature !== 'string') return false;
  if (handle.id !== undefined && (typeof handle.id !== 'string' || !handle.id)) return false;
  if (handle.tender !== undefined && (!handle.tender || typeof handle.tender.key !== 'string' || !handle.tender.key || typeof handle.tender.signature !== 'string')) return false;
  try {
    const items: unknown = JSON.parse(handle.signature);
    return Array.isArray(items) && items.every(item => Array.isArray(item) && item.length === 2 && Number.isSafeInteger(item[0]) && item[0] > 0 && Number.isSafeInteger(item[1]) && item[1] > 0);
  } catch { return false; }
}

export function checkoutStorage(baseUrl: string): CheckoutStorage {
  const hash = Array.from(baseUrl).reduce((n, char) => (Math.imul(n, 31) + char.charCodeAt(0)) | 0, 0);
  const name = `porsca.checkout.v3.${hash >>> 0}`;
  return {
    async load() {
      const value = Platform.OS === 'web' ? globalThis.localStorage.getItem(name) : await SecureStore.getItemAsync(name);
      if (value === null) return null;
      let handle: unknown;
      try { handle = JSON.parse(value); } catch { throw new CheckoutStorageCorruptionError('Stored checkout identity is unreadable.'); }
      if (!isCheckoutHandle(handle)) throw new CheckoutStorageCorruptionError('Stored checkout identity is invalid.');
      return handle;
    },
    async save(handle) {
      if (Platform.OS === 'web') {
        if (handle) globalThis.localStorage.setItem(name, JSON.stringify(handle));
        else globalThis.localStorage.removeItem(name);
      } else if (handle) await SecureStore.setItemAsync(name, JSON.stringify(handle));
      else await SecureStore.deleteItemAsync(name);
    },
  };
}
