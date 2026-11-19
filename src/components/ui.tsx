import { forwardRef, useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

// ── Button ──────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'accent';
type Size = 'xs' | 'sm' | 'md' | 'lg';

const variants: Record<Variant, string> = {
  primary: 'bg-brand text-white hover:bg-brand-strong shadow-sm shadow-brand/30',
  secondary: 'bg-surface2 text-fg hover:bg-line/70 border border-line',
  ghost: 'text-fg hover:bg-surface2',
  danger: 'bg-red-600/10 text-red-600 dark:text-red-400 hover:bg-red-600/20 border border-red-600/30',
  outline: 'border border-brand/60 text-brand hover:bg-brand/10',
  accent: 'bg-accent text-ink-950 hover:brightness-110',
};
const sizes: Record<Size, string> = {
  xs: 'h-7 px-2 text-xs gap-1 rounded-md',
  sm: 'h-8 px-3 text-sm gap-1.5 rounded-lg',
  md: 'h-10 px-4 text-sm gap-2 rounded-lg',
  lg: 'h-12 px-6 text-base gap-2 rounded-xl',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cn(
        'inline-flex select-none items-center justify-center whitespace-nowrap font-semibold transition active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50',
        variants[variant],
        sizes[size],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ── Form controls ───────────────────────────────────────────────────────────

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn('input', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn('input cursor-pointer pr-8', className)} {...rest}>
      {children}
    </select>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-sm disabled:opacity-50"
    >
      <span className={cn('relative h-5 w-9 rounded-full transition', checked ? 'bg-brand' : 'bg-line')}>
        <span className={cn('absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all', checked ? 'left-[18px]' : 'left-0.5')} />
      </span>
      {label}
    </button>
  );
}

// ── Display ─────────────────────────────────────────────────────────────────

export function Card({ className, children, title, actions, subtitle }: { className?: string; children: ReactNode; title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <section className={cn('card p-4 sm:p-5', className)}>
      {(title || actions) && (
        <header className="mb-4 flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="font-display text-2xl uppercase leading-none tracking-wide">{title}</h2>}
            {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {children}
    </section>
  );
}

export function Badge({ children, tone = 'neutral', className }: { children: ReactNode; tone?: 'neutral' | 'brand' | 'live' | 'accent' | 'success' | 'muted'; className?: string }) {
  const tones = {
    neutral: 'bg-surface2 text-fg border-line',
    brand: 'bg-brand/10 text-brand border-brand/30',
    live: 'bg-brand text-white border-brand',
    accent: 'bg-accent/15 text-accent border-accent/40',
    success: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30',
    muted: 'bg-transparent text-muted border-line',
  };
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-cond text-[11px] font-semibold uppercase tracking-wider', tones[tone], className)}>
      {children}
    </span>
  );
}

export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn('relative inline-flex h-2.5 w-2.5', className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-brand opacity-75" />
      <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-brand" />
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-brand', className)} />;
}

export function EmptyState({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      {icon && <div className="mb-3 text-muted">{icon}</div>}
      <p className="font-display text-2xl uppercase tracking-wide">{title}</p>
      {children && <div className="mt-2 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Notice({ tone = 'info', children, className }: { tone?: 'info' | 'warn' | 'error'; children: ReactNode; className?: string }) {
  const tones = {
    info: 'border-accent/40 bg-accent/10',
    warn: 'border-amber-500/40 bg-amber-500/10',
    error: 'border-red-500/40 bg-red-500/10',
  };
  return <div className={cn('rounded-xl border px-4 py-3 text-sm', tones[tone], className)}>{children}</div>;
}

export function Tabs<T extends string>({ value, onChange, items, className }: { value: T; onChange: (v: T) => void; items: { value: T; label: ReactNode }[]; className?: string }) {
  return (
    <div className={cn('inline-flex rounded-xl border border-line bg-surface2 p-1', className)} role="tablist">
      {items.map((it) => (
        <button
          key={it.value}
          role="tab"
          aria-selected={value === it.value}
          onClick={() => onChange(it.value)}
          className={cn(
            'relative rounded-lg px-3 py-1.5 font-cond text-sm font-semibold uppercase tracking-wider transition',
            value === it.value ? 'text-white' : 'text-muted hover:text-fg',
          )}
        >
          {value === it.value && <motion.span layoutId={`tab-${items.map((i) => i.value).join('')}`} className="absolute inset-0 rounded-lg bg-brand" transition={{ type: 'spring', bounce: 0.2, duration: 0.4 }} />}
          <span className="relative">{it.label}</span>
        </button>
      ))}
    </div>
  );
}

// ── Modal ───────────────────────────────────────────────────────────────────

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <motion.div className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
          <motion.div
            role="dialog"
            aria-modal="true"
            className={cn('card relative max-h-[92vh] w-full overflow-y-auto rounded-b-none p-5 sm:rounded-2xl', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}
            initial={{ y: 40, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.35 }}
          >
            <div className="mb-4 flex items-center justify-between gap-4">
              <h3 className="font-display text-2xl uppercase leading-none tracking-wide">{title}</h3>
              <button onClick={onClose} className="rounded-lg p-1.5 text-muted hover:bg-surface2 hover:text-fg" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
