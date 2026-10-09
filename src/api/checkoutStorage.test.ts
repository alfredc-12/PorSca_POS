import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { CheckoutStorageCorruptionError } from '@/src/domain/durableCheckout';
import { checkoutStorage } from './checkoutStorage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

describe('checkout identity storage', () => {
  let value: string;
  let local: { getItem: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock };

  beforeEach(() => {
    value = '{malformed';
    local = {
      getItem: jest.fn(() => value),
      setItem: jest.fn((_key: string, next: string) => { value = next; }),
      removeItem: jest.fn(() => { value = ''; }),
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => value);
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (_key: string, next: string) => { value = next; });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => { value = ''; });
  });

  it.each(['', '{malformed', JSON.stringify({ key: 'creation-key', signature: 'not-a-basket' })])('preserves unreadable identity data for authority-backed recovery', async stored => {
    value = stored;
    await expect(checkoutStorage('https://shop.test/api/v1').load()).rejects.toBeInstanceOf(CheckoutStorageCorruptionError);
    expect(value).toBe(stored);
    if (Platform.OS === 'web') expect(local.removeItem).not.toHaveBeenCalled();
    else expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('loads a valid retained checkout identity', async () => {
    value = JSON.stringify({ key: 'creation-key', signature: '[[1,2]]', id: 'checkout-uuid', tender: { key: 'tender-key', signature: '[]' } });
    await expect(checkoutStorage('https://shop.test/api/v1').load()).resolves.toEqual(JSON.parse(value));
  });
});
