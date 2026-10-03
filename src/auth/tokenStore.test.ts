import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { SESSION_KEY, tokenStore } from '@/src/auth/tokenStore';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(), setItemAsync: jest.fn(), deleteItemAsync: jest.fn(), WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'device-only',
}));

describe('secure session storage', () => {
  const platform = Platform.OS;
  afterEach(() => { Platform.OS = platform; jest.clearAllMocks(); });

  it('reads, saves, and deletes only the agreed native key', async () => {
    Platform.OS = 'android';
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('session-token');
    await expect(tokenStore.get()).resolves.toBe('session-token');
    await tokenStore.set('session-token');
    await tokenStore.remove();
    expect(SESSION_KEY).toBe('porsca.session.v1');
    expect(SecureStore.getItemAsync).toHaveBeenCalledWith(SESSION_KEY);
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith(SESSION_KEY, 'session-token', { keychainAccessible: 'device-only' });
    expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(SESSION_KEY);
  });

  it('uses non-persistent memory on web rather than insecure localStorage', async () => {
    Platform.OS = 'web';
    await tokenStore.set('web-token');
    await expect(tokenStore.get()).resolves.toBe('web-token');
    await tokenStore.remove();
    await expect(tokenStore.get()).resolves.toBeNull();
    expect(SecureStore.getItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.setItemAsync).not.toHaveBeenCalled();
    expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });
});
