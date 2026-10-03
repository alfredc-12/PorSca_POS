import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export const SESSION_KEY = 'porsca.session.v1';

export type TokenStore = {
  get: () => Promise<string | null>;
  set: (token: string) => Promise<void>;
  remove: () => Promise<void>;
};

// SecureStore is native-only. Web development uses memory, not localStorage or
// an unencrypted persistent token. Reloading a web page requires another login.
let webToken: string | null = null;

export const tokenStore: TokenStore = {
  async get() {
    return Platform.OS === 'web' ? webToken : SecureStore.getItemAsync(SESSION_KEY);
  },
  async set(token) {
    if (Platform.OS === 'web') {
      webToken = token;
    } else {
      await SecureStore.setItemAsync(SESSION_KEY, token, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY });
    }
  },
  async remove() {
    if (Platform.OS === 'web') {
      webToken = null;
    } else {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    }
  },
};
