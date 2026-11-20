import { useEffect, useRef, useState } from 'react';
import { Axe, Flame, Footprints, HeartPulse, MapPin, Mountain, Repeat, Shield, Skull, Sparkles, Swords, Zap, type LucideIcon } from 'lucide-react';
import type { BattleSpell, SeriesFormat } from '@/types';
import { SPELL_COOLDOWN, winsNeeded } from '@/lib/constants';
import { allHeroes, canonicalHero, heroInfo, searchHeroes } from '@/lib/heroData';
import { useSpellIcons } from '@/hooks/useFirestore';
import { cld } from '@/services/cloudinary';
import { cn } from '@/lib/utils';

export const SPELL_ICON: Record<BattleSpell, LucideIcon> = {
  Execute: Skull,
  Retribution: Axe,
  Inspire: Swords,
  Sprint: Footprints,
  Revitalize: HeartPulse,
  Aegis: Shield,
  Petrify: Mountain,
  Purify: Sparkles,
  Flameshot: Flame,
  Flicker: Zap,
  Arrival: MapPin,
  Vengeance: Repeat,
};

/** Battle spell icon with a radial cooldown sweep and seconds remaining. */
export function SpellBadge({ spell, readyAt, usedAt, now, size = 28, className }: { spell: BattleSpell | null; readyAt?: number | null; usedAt?: number | null; now: number; size?: number; className?: string }) {
  if (!spell) {
    // Not picked yet (Drafting phase).
    return (
      <span title="Battle spell not set — pick it in the Drafting phase" className={cn('relative inline-flex shrink-0 items-center justify-center rounded-full border border-dashed border-line font-cond font-bold text-muted', className)} style={{ width: size, height: size, fontSize: size * 0.4 }}>
        ?
      </span>
    );
  }
  return <SpellIcon spell={spell} readyAt={readyAt} usedAt={usedAt} now={now} size={size} className={className} />;
}

function SpellIcon({ spell, readyAt, usedAt, now, size, className }: { spell: BattleSpell; readyAt?: number | null; usedAt?: number | null; now: number; size: number; className?: string }) {
  const Icon = SPELL_ICON[spell] ?? Sparkles;
  // Uploaded icon (Settings → Battle spell icons) replaces the generic symbol.
  const iconUrl = useSpellIcons()[spell];
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [iconUrl]);
  // Real cooldown length when known (used → ready), else the spell's base cooldown.
  const total = usedAt && readyAt && readyAt > usedAt ? readyAt - usedAt : (SPELL_COOLDOWN[spell] ?? 90) * 1000;
  const left = readyAt ? Math.max(0, readyAt - now) : 0;
  const onCd = left > 0;
  const pct = onCd ? (left / total) * 100 : 0;
  return (
    <span
      title={`${spell}${onCd ? ` — ${Math.ceil(left / 1000)}s` : ' — ready'}`}
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border', onCd ? 'border-ink-600 bg-ink-900 text-ink-400' : 'border-teal-glow/70 bg-ink-900 text-teal-glow', className)}
      style={{ width: size, height: size }}
    >
      {iconUrl && !broken ? (
        <img src={cld(iconUrl, { w: size * 2, h: size * 2 })} alt={spell} onError={() => setBroken(true)} className="absolute inset-0 h-full w-full object-cover" draggable={false} />
      ) : (
        <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
      )}
      {onCd && (
        <>
          <span className="absolute inset-0" style={{ background: `conic-gradient(rgba(0,0,0,0.72) ${pct}%, transparent ${pct}% 100%)` }} />
          <span className="absolute inset-0 flex items-center justify-center font-cond font-bold text-white" style={{ fontSize: size * 0.4 }}>
            {Math.ceil(left / 1000)}
          </span>
        </>
      )}
    </span>
  );
}

/** Hero portrait (uploaded in Admin → Media) or a stylised name card. */
export function HeroArt({ name, portraits, className, dim }: { name: string; portraits: Record<string, string>; className?: string; dim?: boolean }) {
  const url = name ? portraits[name.toLowerCase()] : '';
  return (
    <div className={cn('relative overflow-hidden bg-ink-900', className)}>
      {url ? (
        <img src={cld(url, { w: 300, h: 400 })} alt={name} className={cn('h-full w-full object-cover', dim && 'grayscale')} />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-[radial-gradient(circle_at_50%_30%,rgba(248,49,47,0.35),transparent_70%)]">
          <span className={cn('px-1 text-center font-display uppercase leading-[0.85] text-white', dim && 'text-ink-400')} style={{ fontSize: 'clamp(14px, 1.4em, 40px)' }}>
            {name}
          </span>
        </div>
      )}
    </div>
  );
}

export function HeroInput({ value, onChange, onEnter, placeholder = 'Hero name', className, autoFocus, id = 'mlbb-heroes' }: { value: string; onChange: (v: string) => void; onEnter?: () => void; placeholder?: string; className?: string; autoFocus?: boolean; id?: string }) {
  return (
    <>
      <input
        className={cn('input', className)}
        list={id}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onEnter?.();
        }}
      />
      <datalist id={id}>
        {allHeroes().map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>
    </>
  );
}

/**
 * Hero search box for the draft: type a few letters → matching heroes appear;
 * Enter (or a click) takes the highlighted/top match right away. Heroes already
 * banned or picked are left out. The parent clears the value after a submit.
 */
export function HeroCombo({
  value,
  onChange,
  onSubmit,
  exclude,
  placeholder = 'Hero name',
  autoFocus,
  className,
}: {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (hero: string) => void;
  exclude?: Set<string>;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const matches = searchHeroes(value, exclude);
  useEffect(() => setHi(0), [value]);

  const submit = (hero?: string) => {
    const typed = value.trim();
    const exact = typed && allHeroes().some((h) => h.toLowerCase() === typed.toLowerCase()) ? canonicalHero(typed) : '';
    const choice = hero ?? (matches[hi] && (hi > 0 || !exact) ? matches[hi] : exact || matches[0] || typed);
    if (!choice) return;
    onSubmit(choice);
    setOpen(false);
    input.current?.focus();
  };

  return (
    <div className="relative">
      <input
        ref={input}
        className={cn('input', className)}
        value={value}
        placeholder={placeholder}
        autoFocus={autoFocus}
        autoComplete="off"
        spellCheck={false}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setHi((i) => Math.min(i + 1, Math.max(0, matches.length - 1)));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setHi((i) => Math.max(0, i - 1));
          } else if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          } else if (e.key === 'Escape') {
            onChange('');
          }
        }}
      />
      {open && value.trim() && (
        <ul className="absolute inset-x-0 top-full z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-xl">
          {matches.length ? (
            matches.map((h, i) => {
              const info = heroInfo(h);
              return (
                <li key={h}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onMouseEnter={() => setHi(i)}
                    onClick={() => submit(h)}
                    className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm', i === hi ? 'bg-brand text-white' : 'hover:bg-surface2')}
                  >
                    <span className="font-semibold">{h}</span>
                    {info && <span className={cn('text-xs', i === hi ? 'text-white/80' : 'text-muted')}>{info.classes.join('/')} · {info.lanes.join('/')}</span>}
                  </button>
                </li>
              );
            })
          ) : (
            <li className="px-3 py-2 text-xs text-muted">No hero matches “{value.trim()}” (already used, or add new heroes in Settings → Heroes).</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Series win pips (e.g. Bo5 → 3 pips per team). */
export function SeriesPips({ format, wins, color = '#f8312f', reverse, size = 10 }: { format: SeriesFormat; wins: number; color?: string; reverse?: boolean; size?: number }) {
  const n = winsNeeded(format);
  return (
    <span className={cn('inline-flex gap-1', reverse && 'flex-row-reverse')}>
      {Array.from({ length: n }).map((_, i) => (
        <span
          key={i}
          className="rotate-45 border"
          style={{ width: size, height: size, borderColor: color, background: i < wins ? color : 'transparent', boxShadow: i < wins ? `0 0 8px ${color}` : undefined }}
        />
      ))}
    </span>
  );
}
