import React from 'react';
import { Text } from 'react-native';
import { act, render, waitFor } from '@testing-library/react-native';
import { ApiClient } from '@/src/api/client';
import { TokenStore } from '@/src/auth/tokenStore';
import { AuthProvider, useAuth } from '@/src/context/AuthContext';

const cashier = { id: 2, name: 'Cashier', email: 'cashier@example.test', role: 'cashier', is_active: true };
const admin = { ...cashier, id: 1, role: 'admin' };
function response(body: unknown, status = 200) {
  return { ok: status < 400, status, json: async () => body } as Response;
}
function makeStore(token: string | null = null) {
  return { get: jest.fn().mockResolvedValue(token), set: jest.fn().mockResolvedValue(undefined), remove: jest.fn().mockResolvedValue(undefined) };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function setup(fetchImpl: jest.Mock, store: TokenStore = makeStore()) {
  const client = new ApiClient({ baseUrl: 'https://api.example.test/api/v1', fetchImpl });
  let auth!: ReturnType<typeof useAuth>;
  function Probe() {
    auth = useAuth();
    return <Text>{`${auth.status}:${auth.user?.role ?? 'none'}`}</Text>;
  }
  const screen = render(<AuthProvider client={client} store={store}><Probe /></AuthProvider>);
  return { ...screen, client, auth: () => auth };
}

describe('AuthProvider', () => {
  it('starts signed out with no stored token and performs no protected reads', async () => {
    const fetchImpl = jest.fn();
    const screen = setup(fetchImpl);
    await waitFor(() => expect(screen.getByText('signed-out:none')).toBeTruthy());
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps restoration gated until me validates the token and obtains the current role', async () => {
    const me = deferred<Response>();
    const fetchImpl = jest.fn().mockReturnValue(me.promise);
    const screen = setup(fetchImpl, makeStore('saved-token'));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    expect(screen.getByText('loading:none')).toBeTruthy();
    expect(fetchImpl.mock.calls[0][1].headers.Authorization).toBe('Bearer saved-token');
    await act(async () => { me.resolve(response({ data: { user: cashier } })); });
    expect(screen.getByText('signed-in:cashier')).toBeTruthy();
    expect(screen.auth().isAdmin).toBe(false);
  });

  it('persists login before exposing the signed-in session and injects the runtime bearer', async () => {
    const saved = deferred<void>();
    const store = makeStore();
    store.set.mockReturnValue(saved.promise);
    const fetchImpl = jest.fn().mockResolvedValue(response({ data: { token: 'issued-token', token_type: 'Bearer', user: admin } }));
    const screen = setup(fetchImpl, store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-out'));
    let login!: Promise<void>;
    act(() => { login = screen.auth().signIn(' admin@example.test ', 'secret'); });
    await waitFor(() => expect(store.set).toHaveBeenCalledWith('issued-token'));
    expect(screen.auth().status).toBe('signed-out');
    await act(async () => { saved.resolve(); await login; });
    expect(screen.auth().isAdmin).toBe(true);
    await screen.client.health();
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer issued-token');
  });

  it('never opens protected routes if secure persistence fails', async () => {
    const store = makeStore();
    store.set.mockRejectedValue(new Error('keychain locked'));
    const screen = setup(jest.fn().mockResolvedValue(response({ data: { token: 'token', user: cashier } })), store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-out'));
    await act(async () => {
      await expect(screen.auth().signIn('cashier@example.test', 'secret')).rejects.toThrow('Unable to save your session securely');
    });
    expect(screen.auth().status).toBe('signed-out');
  });

  it.each([{ ...cashier, is_active: false }, { ...cashier, role: 'owner' }])('rejects inactive or unknown-role accounts without saving the token: %j', async (user) => {
    const store = makeStore();
    const screen = setup(jest.fn().mockResolvedValue(response({ data: { token: 'token', user } })), store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-out'));
    await act(async () => { await expect(screen.auth().signIn('cashier@example.test', 'secret')).rejects.toThrow('cannot access'); });
    expect(store.set).not.toHaveBeenCalled();
    expect(screen.auth().status).toBe('signed-out');
  });

  it('keeps failed credentials signed out and removes any previous saved token on login 401', async () => {
    const store = makeStore();
    const screen = setup(jest.fn().mockResolvedValue(response({ message: 'The provided credentials are incorrect.' }, 401)), store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-out'));
    await act(async () => { await expect(screen.auth().signIn('cashier@example.test', 'wrong')).rejects.toMatchObject({ status: 401 }); });
    expect(screen.auth().status).toBe('signed-out');
    expect(store.set).not.toHaveBeenCalled();
    expect(store.remove).toHaveBeenCalled();
  });

  it('keeps the POS closed if the secure store is unavailable', async () => {
    const store = makeStore();
    store.get.mockRejectedValue(new Error('secure store locked'));
    const fetchImpl = jest.fn();
    const screen = setup(fetchImpl, store);
    await waitFor(() => expect(screen.auth().sessionFailure?.body).toBe('secure store locked'));
    expect(screen.auth().status).toBe('signed-out');
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('keeps the session closed and reports a failure to remove secure storage', async () => {
    const store = makeStore('token');
    store.remove.mockRejectedValue(new Error('store unavailable'));
    const fetchImpl = jest.fn().mockResolvedValueOnce(response({ data: { user: cashier } })).mockResolvedValue(response(undefined, 401));
    const screen = setup(fetchImpl, store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-in'));
    await act(async () => { await expect(screen.client.me()).rejects.toMatchObject({ status: 401 }); });
    await waitFor(() => expect(screen.auth().sessionFailure?.body).toContain('saved session could not be removed'));
    expect(screen.auth().status).toBe('signed-out');
  });

  it('clears a saved expired token on restoration 401', async () => {
    const store = makeStore('expired');
    const screen = setup(jest.fn().mockResolvedValue(response({ message: 'Unauthenticated' }, 401)), store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-out'));
    await waitFor(() => expect(store.remove).toHaveBeenCalled());
  });

  it('clears an active session on a 401 from a non-auth endpoint', async () => {
    const store = makeStore('valid');
    const fetchImpl = jest.fn().mockResolvedValueOnce(response({ data: { user: cashier } })).mockResolvedValue(response(undefined, 401));
    const screen = setup(fetchImpl, store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-in'));
    await act(async () => { await expect(screen.client.listSales()).rejects.toMatchObject({ status: 401 }); });
    expect(screen.auth().status).toBe('signed-out');
    // A mid-sale 401 now explains itself instead of dropping the cashier on the
    // sign-in screen with no words (defect F6).
    expect(screen.auth().sessionFailure?.title).toBe('You have been signed out');
    expect(store.remove).toHaveBeenCalled();
  });

  it('retains saved tokens but stays signed out on transport failure, and allows restoration retry', async () => {
    const store = makeStore('valid');
    const fetchImpl = jest.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(response({ data: { user: cashier } }));
    const screen = setup(fetchImpl, store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-out'));
    expect(screen.auth().sessionFailure?.title).toBe('We cannot reach the shop server');
    expect(screen.auth().sessionFailure?.body).not.toContain('offline');
    expect(screen.auth().sessionFailure?.reference).toMatch(/^PRS-/);
    expect(store.remove).not.toHaveBeenCalled();
    await act(async () => { await screen.auth().retrySession(); });
    expect(screen.auth().status).toBe('signed-in');
  });

  it('signs out immediately, revokes with the old bearer, and remains signed out if the network fails', async () => {
    const logout = deferred<Response>();
    const store = makeStore('valid');
    const fetchImpl = jest.fn().mockResolvedValueOnce(response({ data: { user: cashier } })).mockReturnValue(logout.promise);
    const screen = setup(fetchImpl, store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-in'));
    let signingOut!: Promise<void>;
    act(() => { signingOut = screen.auth().signOut(); });
    expect(screen.auth().status).toBe('signed-out');
    expect(fetchImpl.mock.calls[1][1].headers.Authorization).toBe('Bearer valid');
    await act(async () => { logout.resolve(response(undefined, 503)); await signingOut; });
    expect(store.remove).toHaveBeenCalled();
  });

  it('does not restore a late me response after sign-out', async () => {
    const me = deferred<Response>();
    const fetchImpl = jest.fn().mockReturnValueOnce(me.promise).mockResolvedValue(response(undefined, 204));
    const screen = setup(fetchImpl, makeStore('valid'));
    await waitFor(() => expect(fetchImpl).toHaveBeenCalled());
    await act(async () => { await screen.auth().signOut(); });
    await act(async () => { me.resolve(response({ data: { user: admin } })); });
    expect(screen.auth().status).toBe('signed-out');
  });

  it('serializes a pending secure write before sign-out deletion', async () => {
    const saved = deferred<void>();
    const store = makeStore();
    store.set.mockReturnValue(saved.promise);
    const screen = setup(jest.fn().mockResolvedValue(response({ data: { token: 'token', user: cashier } })), store);
    await waitFor(() => expect(screen.auth().status).toBe('signed-out'));
    let login!: Promise<void>;
    act(() => { login = screen.auth().signIn('cashier@example.test', 'secret'); });
    const rejected = expect(login).rejects.toThrow('session changed');
    await waitFor(() => expect(store.set).toHaveBeenCalled());
    let logout!: Promise<void>;
    act(() => { logout = screen.auth().signOut(); });
    expect(store.remove).not.toHaveBeenCalled();
    await act(async () => { saved.resolve(); await rejected; await logout; });
    expect(store.remove).toHaveBeenCalled();
    expect(screen.auth().status).toBe('signed-out');
  });
});
