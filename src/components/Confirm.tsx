import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, HelpCircle } from 'lucide-react';
import { Button, Input, Modal } from './ui';

export interface ConfirmOptions {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button + warning icon (deleting, erasing, taking off air…). */
  danger?: boolean;
  /** The operator must type this word (e.g. "RESET") before confirming. */
  requireText?: string;
}

type Ask = (opts: ConfirmOptions) => Promise<boolean>;
const ConfirmContext = createContext<Ask | null>(null);

/**
 * In-app confirmation dialog — replaces the browser's default confirm() box
 * everywhere, styled like the rest of the control room. Enter confirms, Esc cancels.
 */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null);
  const [typed, setTyped] = useState('');
  const confirmBtn = useRef<HTMLButtonElement>(null);
  const textBox = useRef<HTMLInputElement>(null);

  const ask = useCallback<Ask>(
    (opts) =>
      new Promise((resolve) => {
        setTyped('');
        setState({ ...opts, resolve });
      }),
    [],
  );
  const locked = Boolean(state?.requireText) && typed.trim() !== state?.requireText;
  const close = (v: boolean) => {
    if (v && locked) return;
    state?.resolve(v);
    setState(null);
  };

  useEffect(() => {
    if (!state) return;
    const t = setTimeout(() => (state.requireText ? textBox.current : confirmBtn.current)?.focus(), 50);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        close(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [state, typed]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ConfirmContext.Provider value={ask}>
      {children}
      <Modal open={!!state} onClose={() => close(false)} title={state?.title ?? ''}>
        {state && (
          <div className="space-y-5">
            <div className="flex gap-3">
              <span className={state.danger ? 'mt-0.5 text-red-500' : 'mt-0.5 text-brand'}>
                {state.danger ? <AlertTriangle className="h-6 w-6" /> : <HelpCircle className="h-6 w-6" />}
              </span>
              <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted">{state.message}</div>
            </div>
            {state.requireText && (
              <Input ref={textBox} value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={`Type ${state.requireText}`} aria-label={`Type ${state.requireText} to confirm`} />
            )}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => close(false)}>
                {state.cancelLabel ?? 'Cancel'}
              </Button>
              <Button ref={confirmBtn} variant={state.danger ? 'destructive' : 'primary'} disabled={locked} onClick={() => close(true)}>
                {state.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </ConfirmContext.Provider>
  );
}

/** `const ask = useConfirm(); if (!(await ask({ title, message, danger: true }))) return;` */
export function useConfirm(): Ask {
  const ask = useContext(ConfirmContext);
  if (!ask) throw new Error('useConfirm must be used inside <ConfirmProvider>');
  return ask;
}
