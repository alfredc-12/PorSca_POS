import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ApiClientError, apiClient, ApiClient, AuthUser } from '@/src/api/client';
import { TokenStore, tokenStore } from '@/src/auth/tokenStore';
import { DescribedFailure, describeFailure, localFailure } from '@/src/domain/userFacingError';
import { describeAndRecordFailure } from '@/src/observability/diagnostics';

type AuthState =
  | { status: 'loading'; user?: undefined }
  | { status: 'signed-out'; user?: undefined }
  | { status: 'signed-in'; user: AuthUser };

type AuthContextValue = AuthState & {
  isAdmin: boolean;
  sessionFailure?: DescribedFailure;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  retrySession: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function assertActiveUser(user: AuthUser) {
  if (!user?.is_active || (user.role !== 'admin' && user.role !== 'cashier')) {
    throw new Error('This account cannot access PorSca POS. Contact your administrator.');
  }
}

export function AuthProvider({ children, client = apiClient, store = tokenStore }: {
  children: React.ReactNode;
  client?: ApiClient;
  store?: TokenStore;
}) {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const [sessionFailure, setSessionFailure] = useState<DescribedFailure>();
  const generation = useRef(0);
  // Serialize writes/deletes so a late storage operation cannot resurrect an
  // expired token, or remove a newer login's token.
  const storageQueue = useRef<Promise<void>>(Promise.resolve());
  const persist = useCallback((operation: () => Promise<void>) => {
    const next = storageQueue.current.catch(() => undefined).then(operation);
    storageQueue.current = next;
    return next;
  }, []);

  const clearSession = useCallback(async (reason?: 'expired') => {
    const current = ++generation.current;
    client.setToken(null);
    setState({ status: 'signed-out' });
    // A mid-use 401 lands the cashier back on the sign-in screen; say why
    // instead of dropping them there silently.
    setSessionFailure(reason === 'expired' ? describeFailure({ status: 401 }, { screen: 'session-expired' }) : undefined);
    try {
      await persist(() => store.remove());
    } catch {
      if (current === generation.current) {
        setSessionFailure(localFailure('Signed out with a warning', 'The saved session could not be removed. Try signing out again before sharing this device.'));
      }
    }
  }, [client, persist, store]);

  const retrySession = useCallback(async () => {
    const current = ++generation.current;
    setState({ status: 'loading' });
    setSessionFailure(undefined);
    client.setToken(null);
    try {
      await storageQueue.current.catch(() => undefined);
      const token = await store.get();
      if (current !== generation.current) return;
      if (!token) {
        setState({ status: 'signed-out' });
        return;
      }
      client.setToken(token);
      const { user } = await client.me();
      if (current !== generation.current) return;
      assertActiveUser(user);
      setState({ status: 'signed-in', user });
    } catch (error) {
      // A 401 was already handled synchronously by the client. Transport errors
      // retain the saved token for an explicit retry, but never open the POS.
      if (current !== generation.current) return;
      client.setToken(null);
      setState({ status: 'signed-out' });
      setSessionFailure(error instanceof ApiClientError
        ? describeAndRecordFailure(
            { status: error.status, code: error.code, message: error.message, details: error.details },
            { screen: 'session-restore' },
          )
        : localFailure('We could not open your saved session', error instanceof Error ? error.message : 'Sign in again to keep selling.', { action: 'sign-in', actionLabel: 'Sign in again' }));
    }
  }, [client, store]);

  useEffect(() => {
    client.setUnauthorizedHandler(() => { void clearSession('expired'); });
    // Restoration is asynchronous; the initial render is already loading.
    let active = true;
    void Promise.resolve().then(() => { if (active) void retrySession(); });
    return () => {
      active = false;
      generation.current += 1;
      client.setUnauthorizedHandler(undefined);
      client.setToken(null);
    };
  }, [clearSession, client, retrySession]);

  const signIn = useCallback(async (email: string, password: string) => {
    const current = ++generation.current;
    setSessionFailure(undefined);
    const result = await client.login(email.trim(), password);
    if (current !== generation.current) throw new Error('Your session changed. Please sign in again.');
    assertActiveUser(result.user);
    if (!result.token?.trim()) throw new Error('The API did not return a session token. Please try again.');
    // Do not expose protected routes until secure persistence has succeeded.
    try {
      await persist(() => store.set(result.token));
    } catch {
      throw new Error('Unable to save your session securely. Please try again.');
    }
    if (current !== generation.current) throw new Error('Your session changed. Please sign in again.');
    client.setToken(result.token);
    setState({ status: 'signed-in', user: result.user });
  }, [client, persist, store]);

  const signOut = useCallback(async () => {
    // Dispatch revocation with the old token before clearing it locally. Local
    // sign-out is immediate even when the network is unavailable.
    const revocation = client.logout().catch(() => undefined);
    await clearSession();
    await revocation;
  }, [clearSession, client]);

  return (
    <AuthContext.Provider value={{ ...state, isAdmin: state.user?.role === 'admin', sessionFailure, signIn, signOut, retrySession }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
}
