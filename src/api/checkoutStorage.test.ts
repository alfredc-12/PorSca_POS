import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { CheckoutIdentityError, CheckoutStorageCorruptionError } from '@/src/domain/durableCheckout';
import { checkoutStorage } from './checkoutStorage';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const originalPlatform = Platform.OS;
const url = 'https://shop.test/api/v1';
const first = { key: 'first-key', signature: '[[1,2]]', id: 'first-checkout' };
const replacement = { key: 'replacement-key', signature: '[[1,2]]', id: 'replacement-checkout', tender: { key: 'replacement-tender', signature: '[]' } };

describe.each(['ios', 'web'])('checkout identity storage on %s', os => {
  let value: string | null;
  let local: { getItem: jest.Mock; setItem: jest.Mock; removeItem: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    Object.defineProperty(Platform, 'OS', { configurable: true, value: os });
    value = '{malformed';
    local = {
      getItem: jest.fn(() => value),
      setItem: jest.fn((_key: string, next: string) => { value = next; }),
      removeItem: jest.fn(() => { value = null; }),
    };
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: local });
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => value);
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (_key: string, next: string) => { value = next; });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => { value = null; });
  });
  afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform }); });

  it.each(['', '{malformed', JSON.stringify({ key: 'creation-key', signature: 'not-a-basket' }), JSON.stringify({ key: 'creation-key', signature: '[[null,1]]' })])('preserves unreadable identity data for authority-backed recovery', async stored => {
    value = stored;
    await expect(checkoutStorage(url).load()).rejects.toBeInstanceOf(CheckoutStorageCorruptionError);
    expect(value).toBe(stored);
    if (Platform.OS === 'web') expect(local.removeItem).not.toHaveBeenCalled();
    else expect(SecureStore.deleteItemAsync).not.toHaveBeenCalled();
  });

  it('loads a valid retained checkout identity', async () => {
    value = JSON.stringify({ key: 'creation-key', signature: '[[1,2]]', id: 'checkout-uuid', tender: { key: 'tender-key', signature: '[]' } });
    await expect(checkoutStorage(url).load()).resolves.toEqual(JSON.parse(value));
  });

  it('refuses stale retirement while preserving the replacement identity and exact tender key', async () => {
    const oldOwner = checkoutStorage(url);
    const newOwner = checkoutStorage(url);
    await oldOwner.save(first);
    await newOwner.save(replacement);
    await expect(oldOwner.save(null, first.key)).rejects.toBeInstanceOf(CheckoutIdentityError);
    await expect(newOwner.load()).resolves.toEqual(replacement);
    await newOwner.save(null, replacement.key);
    await expect(newOwner.load()).resolves.toBeNull();
  });

  it('does not replace an unreadable identity with an ownership-based retirement', async () => {
    await expect(checkoutStorage(url).save(null, first.key)).rejects.toBeInstanceOf(CheckoutStorageCorruptionError);
    expect(value).toBe('{malformed');
  });
});

describe('native ownership check and write ordering', () => {
  afterEach(() => { Object.defineProperty(Platform, 'OS', { configurable: true, value: originalPlatform }); });

  it('keeps a replacement queued during a slow ownership check after the retirement', async () => {
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'ios' });
    let value: string | null = JSON.stringify(first);
    let finishRead!: (value: string) => void;
    let announceRead!: () => void;
    const readStarted = new Promise<void>(resolve => { announceRead = resolve; });
    (SecureStore.getItemAsync as jest.Mock).mockImplementation(async () => value).mockImplementationOnce(() => new Promise<string>(resolve => { finishRead = resolve; announceRead(); }));
    (SecureStore.setItemAsync as jest.Mock).mockImplementation(async (_key: string, next: string) => { value = next; });
    (SecureStore.deleteItemAsync as jest.Mock).mockImplementation(async () => { value = null; });
    const retirement = checkoutStorage(url).save(null, first.key);
    await readStarted;
    const creation = checkoutStorage(url).save(replacement);
    finishRead(JSON.stringify(first));
    await Promise.all([retirement, creation]);
    await expect(checkoutStorage(url).load()).resolves.toEqual(replacement);
  });
});
