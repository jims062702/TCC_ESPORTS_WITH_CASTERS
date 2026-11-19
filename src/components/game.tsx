import { Axe, Flame, Footprints, HeartPulse, MapPin, Mountain, Repeat, Shield, Skull, Sparkles, Swords, Zap, type LucideIcon } from 'lucide-react';
import type { BattleSpell, SeriesFormat } from '@/types';
import { MLBB_HEROES, SPELL_COOLDOWN, winsNeeded } from '@/lib/constants';
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
export function SpellBadge({ spell, readyAt, now, size = 28, className }: { spell: BattleSpell; readyAt?: number | null; now: number; size?: number; className?: string }) {
  const Icon = SPELL_ICON[spell] ?? Sparkles;
  const total = (SPELL_COOLDOWN[spell] ?? 90) * 1000;
  const left = readyAt ? Math.max(0, readyAt - now) : 0;
  const onCd = left > 0;
  const pct = onCd ? (left / total) * 100 : 0;
  return (
    <span
      title={`${spell}${onCd ? ` — ${Math.ceil(left / 1000)}s` : ' — ready'}`}
      className={cn('relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border', onCd ? 'border-ink-600 bg-ink-900 text-ink-400' : 'border-teal-glow/70 bg-ink-900 text-teal-glow', className)}
      style={{ width: size, height: size }}
    >
      <Icon style={{ width: size * 0.55, height: size * 0.55 }} />
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
        {MLBB_HEROES.map((h) => (
          <option key={h} value={h} />
        ))}
      </datalist>
    </>
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
