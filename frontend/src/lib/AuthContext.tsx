import { createContext, useContext, useState, type ReactNode } from 'react';

// Auth shape mirrors debt-tracker's AuthContext (token + user, persisted to
// localStorage) so its real GraphQL login/register/Google mutations can drop
// in later. For now signIn is a stub: the backend has no auth yet.

export interface AuthUser {
  email: string;
}

interface AuthState {
  token: string;
  user: AuthUser;
}

interface AuthContextValue {
  user: AuthUser | null;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
}

const STORAGE_KEY = 'bupis.auth';

const AuthContext = createContext<AuthContextValue | null>(null);

function readStoredAuth(): AuthState | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as AuthState) : null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [auth, setAuth] = useState<AuthState | null>(readStoredAuth);

  const signIn = async (email: string, _password: string) => {
    // Simulated network latency; replace with a login mutation when the
    // backend grows an auth resolver.
    await new Promise((resolve) => setTimeout(resolve, 500));
    const next: AuthState = { token: crypto.randomUUID(), user: { email } };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    setAuth(next);
  };

  const signOut = () => {
    localStorage.removeItem(STORAGE_KEY);
    setAuth(null);
  };

  return (
    <AuthContext.Provider
      value={{ user: auth?.user ?? null, isAuthenticated: auth !== null, signIn, signOut }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
