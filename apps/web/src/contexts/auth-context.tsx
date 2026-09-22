'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import {
  guestCheckoutApi,
  loginApi,
  refreshApi,
  registerApi,
  type AuthTokens,
} from '@/lib/auth-api';

interface AuthUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  phone: string | null;
  avatarUrl: string | null;
  emailVerifiedAt: string | null;
}

interface AuthContextType {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string, turnstileToken?: string) => Promise<void>;
  register: (
    name: string,
    email: string,
    password: string,
    turnstileToken?: string,
  ) => Promise<void>;
  // Checkout sem cadastro visível (hoje só pro produto Clube Reversa) — cria
  // uma sessão de verdade por trás dos panos, sem tela de login/senha.
  // Retorna o accessToken fresco pro chamador poder usar na hora (ex: colocar
  // o produto no carrinho) sem esperar o próximo render — o `token` do
  // contexto só reflete o valor novo depois que o componente re-renderiza.
  guestCheckout: (
    name: string,
    phone: string,
    cpf: string,
    turnstileToken?: string,
  ) => Promise<AuthTokens>;
  // Persiste uma sessão já emitida por outro endpoint (ex: club-signup para
  // quem assinou o Clube Reversa como convidado). Quem já estava logado
  // nunca chama isso — o backend não devolve tokens novos nesse caso.
  applySession: (tokens: AuthTokens) => void;
  logout: () => void;
  updateUser: (partial: Partial<AuthUser>) => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

const ACCESS_KEY = 'saldao:access';
const REFRESH_KEY = 'saldao:refresh';
const USER_KEY = 'saldao:user';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const persist = useCallback(
    (tokens: { accessToken: string; refreshToken: string; user: AuthUser }) => {
      localStorage.setItem(ACCESS_KEY, tokens.accessToken);
      localStorage.setItem(REFRESH_KEY, tokens.refreshToken);
      localStorage.setItem(USER_KEY, JSON.stringify(tokens.user));
      setToken(tokens.accessToken);
      setUser(tokens.user);
    },
    [],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(USER_KEY);
    setToken(null);
    setUser(null);
  }, []);

  const scheduleRefresh = useCallback(
    (accessToken: string) => {
      try {
        const payload = JSON.parse(
          atob(accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
        );
        const msUntilExpiry = payload.exp * 1000 - Date.now();
        // Refresh 60 seconds before expiry
        const delay = Math.max(0, msUntilExpiry - 60_000);
        const timer = setTimeout(() => {
          const storedRefresh = localStorage.getItem(REFRESH_KEY);
          if (!storedRefresh) return;
          refreshApi(storedRefresh)
            .then((data) => persist({ ...data }))
            .catch(() => logout());
        }, delay);
        return timer;
      } catch {
        return undefined;
      }
    },
    [persist, logout],
  );

  useEffect(() => {
    const stored = localStorage.getItem(ACCESS_KEY);
    const storedUser = localStorage.getItem(USER_KEY);
    const storedRefresh = localStorage.getItem(REFRESH_KEY);

    if (stored && storedUser) {
      try {
        const payload = JSON.parse(
          atob(stored.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
        );
        const expired = payload.exp * 1000 < Date.now();

        if (!expired) {
          setToken(stored);
          setUser(JSON.parse(storedUser));
          setLoading(false);
          return;
        }
      } catch {
        // invalid token
      }

      // Try refresh
      if (storedRefresh) {
        refreshApi(storedRefresh)
          .then((data) => persist({ ...data }))
          .catch(() => logout())
          .finally(() => setLoading(false));
        return;
      }

      logout();
    }
    setLoading(false);
  }, [logout, persist]);

  // Schedule silent refresh whenever the access token changes
  useEffect(() => {
    if (!token) return;
    const timer = scheduleRefresh(token);
    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [token, scheduleRefresh]);

  const login = useCallback(
    async (email: string, password: string, turnstileToken?: string) => {
      const data = await loginApi(email, password, turnstileToken);
      persist(data);
    },
    [persist],
  );

  const register = useCallback(
    async (name: string, email: string, password: string, turnstileToken?: string) => {
      const data = await registerApi(name, email, password, turnstileToken);
      persist(data);
    },
    [persist],
  );

  const guestCheckout = useCallback(
    async (name: string, phone: string, cpf: string, turnstileToken?: string) => {
      const data = await guestCheckoutApi(name, phone, cpf, turnstileToken);
      persist(data);
      return data;
    },
    [persist],
  );

  const applySession = useCallback(
    (tokens: AuthTokens) => {
      persist(tokens);
    },
    [persist],
  );

  const updateUser = useCallback((partial: Partial<AuthUser>) => {
    setUser((prev) => {
      if (!prev) return prev;
      const next = { ...prev, ...partial };
      localStorage.setItem(USER_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        login,
        register,
        guestCheckout,
        applySession,
        logout,
        updateUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
