import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from 'firebase/auth';
import { checkIsAdmin, watchAuth } from '@/services/firebase';

interface AuthCtx {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({ user: null, isAdmin: false, loading: true });

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthCtx>({ user: null, isAdmin: false, loading: true });

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = watchAuth(async (user) => {
      if (!user) {
        if (!cancelled) setState({ user: null, isAdmin: false, loading: false });
        return;
      }
      setState((s) => ({ ...s, user, loading: true }));
      const isAdmin = await checkIsAdmin(user.uid);
      if (!cancelled) setState({ user, isAdmin, loading: false });
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);
