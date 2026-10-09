import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { CheckoutHandle, CheckoutStorage } from '@/src/domain/durableCheckout';

/** Retain identity/keys, not financial truth or provider capabilities. Shared across operators on this device. */
export function checkoutStorage(baseUrl: string): CheckoutStorage {
  const hash = Array.from(baseUrl).reduce((n, char) => (Math.imul(n, 31) + char.charCodeAt(0)) | 0, 0);
  const name = `porsca.checkout.v3.${hash >>> 0}`;
  return {
    async load() {
      const value = Platform.OS === 'web' ? globalThis.localStorage.getItem(name) : await SecureStore.getItemAsync(name);
      if (!value) return null;
      const handle = JSON.parse(value) as CheckoutHandle;
      if (typeof handle.key !== 'string' || typeof handle.signature !== 'string') throw new Error('Stored checkout identity is invalid. Recovery is required.');
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
