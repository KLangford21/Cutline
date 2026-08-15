import {
  createContext, useCallback, useContext, useEffect, useMemo, useState, ReactNode,
} from 'react';
import { api, getToken, setToken } from './api';
import type { User } from './types';

type AuthValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (payload: { name: string; email: string; password: string; handicapIndex: number; homeClub?: string }) => Promise<void>;
  signOut: () => void;
  refresh: () => Promise<void>;
  patchUser: (user: User) => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const { user: me } = await api.me();
      setUser(me);
    } catch {
      setToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    signIn: async (email, password) => {
      const res = await api.login(email, password);
      setToken(res.token);
      setUser(res.user);
    },
    signUp: async (payload) => {
      const res = await api.register(payload);
      setToken(res.token);
      setUser(res.user);
    },
    signOut: () => {
      setToken(null);
      setUser(null);
    },
    refresh,
    patchUser: setUser,
  }), [user, loading, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

/* ---------------- toast ---------------- */

const ToastContext = createContext<(message: string) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const show = useCallback((text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage((current) => (current === text ? null : current)), 2400);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {message && <div className="toast">{message}</div>}
    </ToastContext.Provider>
  );
}

export const useToast = () => useContext(ToastContext);

/* ---------------- data fetching ---------------- */

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const run = useCallback(async () => {
    try {
      setError(null);
      setData(await loader());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => { void run(); }, [run]);

  return { data, error, loading, reload: run, setData };
}
