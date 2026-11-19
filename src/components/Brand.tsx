import { Moon, Sun } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme } from '@/hooks/useTheme';
import { cld } from '@/services/cloudinary';
import { CASTER_BY_ID } from '@/services/casters';
import { cn, initials } from '@/lib/utils';

/**
 * The TCC Esports badge — a transparent PNG (public/logo.png) cut from the
 * original artwork, so it sits cleanly on both the light and dark themes.
 */
export function Logo({ size = 40, glow = false, className }: { size?: number; glow?: boolean; className?: string }) {
  return (
    <img
      src={size > 200 ? '/logo.png' : '/logo-512.png'}
      width={size}
      height={size}
      alt="TCC Esports"
      draggable={false}
      className={cn('select-none', glow && 'drop-shadow-[0_0_28px_rgba(248,49,47,0.45)]', className)}
      style={{ width: size, height: size }}
    />
  );
}

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === 'dark';
  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${dark ? 'light' : 'dark'} mode`}
      title={`Switch to ${dark ? 'light' : 'dark'} mode`}
      className={cn('relative flex h-9 w-16 items-center rounded-full border border-line bg-surface2 px-1 transition hover:border-brand/60', className)}
    >
      <motion.span
        layout
        transition={{ type: 'spring', stiffness: 500, damping: 32 }}
        className={cn('flex h-7 w-7 items-center justify-center rounded-full bg-brand text-white shadow', dark ? 'ml-auto' : 'ml-0')}
      >
        {dark ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
      </motion.span>
    </button>
  );
}

/** Team logo with a crimson initials badge fallback. */
export function TeamLogo({ url, name, size = 40, className }: { url?: string | null; name?: string; size?: number; className?: string }) {
  if (url) {
    return (
      <img
        src={cld(url, { w: size * 2, h: size * 2, crop: 'pad' })}
        alt={name ?? 'Team logo'}
        width={size}
        height={size}
        loading="lazy"
        className={cn('shrink-0 object-contain', className)}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-crimson-500 to-crimson-800 font-display uppercase leading-none text-white shadow-inner', className)}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-label={name}
    >
      {(name ?? '?').replace(/[^A-Za-z0-9 ]/g, '').split(' ').filter(Boolean).slice(0, 3).map((w) => w[0]).join('') || '?'}
    </span>
  );
}

export function Avatar({ url, name, size = 36, className, ring }: { url?: string | null; name: string; size?: number; className?: string; ring?: string }) {
  const style = { width: size, height: size, ...(ring ? { boxShadow: `0 0 0 2px ${ring}` } : {}) };
  if (url) {
    return (
      <img
        src={cld(url, { w: size * 2, h: size * 2, gravity: 'face' })}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className={cn('shrink-0 rounded-full object-cover', className)}
        style={style}
      />
    );
  }
  return (
    <span
      className={cn('flex shrink-0 items-center justify-center rounded-full bg-ink-800 font-cond font-bold text-white', className)}
      style={{ ...style, fontSize: size * 0.38 }}
    >
      {initials(name.replace(/^[A-Z]{2,4}\./, ''))}
    </span>
  );
}

/** Caster avatar: uploaded photo (Settings) or a persona-coloured monogram. */
export function CasterAvatar({ casterId, url, size = 40, speaking, className }: { casterId: string; url?: string; size?: number; speaking?: boolean; className?: string }) {
  const c = CASTER_BY_ID[casterId];
  const color = c?.color ?? '#f8312f';
  return (
    <span className={cn('relative inline-flex shrink-0', className)} style={{ width: size, height: size }}>
      {speaking && <span className="absolute -inset-1 animate-ping rounded-full opacity-60" style={{ background: color }} />}
      {url ? (
        <img src={cld(url, { w: size * 2, h: size * 2, gravity: 'face' })} alt={c?.name} className="relative h-full w-full rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${color}` }} />
      ) : (
        <span
          className="relative flex h-full w-full items-center justify-center rounded-full bg-ink-900 font-display leading-none"
          style={{ boxShadow: `0 0 0 2px ${color}`, color, fontSize: size * 0.5 }}
        >
          {initials(c?.name.replace(/^(Kuya|Ate|Direk)\s/, '') ?? '?')}
        </span>
      )}
    </span>
  );
}
