import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info } from 'lucide-react';
import { cn, uid } from '@/lib/utils';

type Tone = 'success' | 'error' | 'info';
interface ToastItem {
  id: string;
  tone: Tone;
  message: string;
}

interface ToastApi {
  success: (m: string) => void;
  error: (m: string) => void;
  info: (m: string) => void;
  /** Run an async action; shows an error toast if it throws. */
  run: <T>(fn: () => Promise<T>, okMessage?: string) => Promise<T | undefined>;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: Tone, message: string) => {
    const id = uid();
    setItems((xs) => [...xs.slice(-3), { id, tone, message }]);
    setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== id)), tone === 'error' ? 6000 : 3000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
      run: async (fn, ok) => {
        try {
          const r = await fn();
          if (ok) push('success', ok);
          return r;
        } catch (e) {
          console.error(e);
          push('error', (e as Error).message || 'Something went wrong');
          return undefined;
        }
      },
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(92vw,380px)] flex-col gap-2">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div
              key={t.id}
              layout
              initial={{ opacity: 0, x: 40 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 40 }}
              className={cn(
                'card pointer-events-auto flex items-start gap-3 px-4 py-3 text-sm shadow-lg',
                t.tone === 'error' && 'border-red-500/50',
                t.tone === 'success' && 'border-emerald-500/40',
              )}
            >
              {t.tone === 'success' && <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />}
              {t.tone === 'error' && <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />}
              {t.tone === 'info' && <Info className="mt-0.5 h-4 w-4 shrink-0 text-accent" />}
              <span>{t.message}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
};
