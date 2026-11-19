import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ClipboardList, Crown, Droplet, Flame, Gamepad2, HelpCircle, Leaf, Shell, Skull, Swords, Trophy } from 'lucide-react';
import type { Banner, EventType } from '@/types';
import { useSettings } from '@/hooks/useFirestore';
import { useOverlayCaption } from './demo';
import { flag, useQuery } from './query';
import { CASTER_BY_ID } from '@/services/casters';
import { cld } from '@/services/cloudinary';
import { CasterAvatar, Logo, TeamLogo } from '@/components/Brand';
import { cn, initials } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Shared building blocks for the OBS browser-source overlays.
// Everything is laid out on a fixed 1920×1080 stage and scaled to the source
// size, so it looks identical at 720p previews and 1080p output.
// ─────────────────────────────────────────────────────────────────────────────

export const SIDE_COLOR = { blue: '#38bdf8', red: '#f8312f' } as const;

export { flag, useQuery };

export function OverlayStage({ children }: { children: ReactNode }) {
  const q = useQuery();
  const preview = flag(q, 'preview', false);
  const [box, setBox] = useState({ scale: 1, x: 0, y: 0 });

  useEffect(() => {
    document.documentElement.classList.add('overlay-mode', 'dark');
    const fit = () => {
      const scale = Math.min(window.innerWidth / 1920, window.innerHeight / 1080);
      setBox({ scale, x: (window.innerWidth - 1920 * scale) / 2, y: (window.innerHeight - 1080 * scale) / 2 });
    };
    fit();
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
  }, []);

  return (
    <div
      className="fixed inset-0 overflow-hidden"
      style={
        preview
          ? { backgroundColor: '#3a3a3a', backgroundImage: 'linear-gradient(45deg,#2b2b2b 25%,transparent 25%,transparent 75%,#2b2b2b 75%),linear-gradient(45deg,#2b2b2b 25%,transparent 25%,transparent 75%,#2b2b2b 75%)', backgroundSize: '40px 40px', backgroundPosition: '0 0,20px 20px' }
          : undefined
      }
    >
      <div
        className="absolute left-0 top-0 font-sans text-white"
        style={{ width: 1920, height: 1080, transform: `translate(${box.x}px, ${box.y}px) scale(${box.scale})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  );
}

/** Dark glass panel used across overlays. */
export function Glass({ className, children, style }: { className?: string; children: ReactNode; style?: React.CSSProperties }) {
  return (
    <div className={cn('border border-white/10 bg-ink-950/85 shadow-[0_10px_40px_rgba(0,0,0,0.55)] backdrop-blur-md', className)} style={style}>
      {children}
    </div>
  );
}

// ── Event banner (kill streaks, objectives, results) ────────────────────────

const BANNER_ICON: Partial<Record<EventType, typeof Swords>> = {
  FIRST_BLOOD: Droplet,
  DOUBLE_KILL: Swords,
  TRIPLE_KILL: Swords,
  MANIAC: Skull,
  SAVAGE: Flame,
  TURTLE: Shell,
  LORD: Crown,
  BUFF: Leaf,
  OBJECTIVE_CONTEST: HelpCircle,
  GAME_RESULT: Trophy,
  SERIES_VICTORY: Trophy,
  DRAFT_START: ClipboardList,
  GAME_START: Gamepad2,
};

const BANNER_MS: Partial<Record<EventType, number>> = { SAVAGE: 6500, MANIAC: 5500, SERIES_VICTORY: 9000, GAME_RESULT: 7000, GAME_INTRO: 7000, OBJECTIVE_CONTEST: 6000, DRAFT_START: 6500, GAME_START: 6500 };

/** Shows the latest banner from live/current for a few seconds, with the player's photo. */
export function EventBanner({ banner, allow, top = 150 }: { banner: Banner | null; allow?: EventType[]; top?: number }) {
  const [visible, setVisible] = useState<Banner | null>(null);

  useEffect(() => {
    if (!banner || (allow && !allow.includes(banner.type))) return;
    const ms = BANNER_MS[banner.type] ?? 4800;
    const age = Date.now() - banner.at;
    if (age > ms) return; // stale (e.g. overlay refreshed later)
    setVisible(banner);
    const t = setTimeout(() => setVisible((v) => (v?.id === banner.id ? null : v)), ms - Math.max(0, age));
    return () => clearTimeout(t);
  }, [banner?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const color = visible?.side ? SIDE_COLOR[visible.side] : '#f8312f';
  const Icon = visible ? (BANNER_ICON[visible.type] ?? Swords) : Swords;
  const big = visible?.type === 'SAVAGE' || visible?.type === 'MANIAC' || visible?.type === 'SERIES_VICTORY';
  const hasPhoto = Boolean(visible?.ign);

  return (
    <div className="pointer-events-none absolute inset-x-0 flex justify-center" style={{ top }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            key={visible.id}
            initial={{ opacity: 0, scale: 0.7, y: -30 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: -20, transition: { duration: 0.35 } }}
            transition={{ type: 'spring', stiffness: 260, damping: 20 }}
            className="relative"
          >
            {/* glow */}
            <div className="absolute -inset-10 rounded-full opacity-60 blur-3xl" style={{ background: `radial-gradient(closest-side, ${color}, transparent)` }} />
            <div className="relative flex items-center gap-6">
              {hasPhoto && (
                <motion.div initial={{ x: -40, opacity: 0, rotate: -8 }} animate={{ x: 0, opacity: 1, rotate: 0 }} transition={{ delay: 0.12, type: 'spring', stiffness: 220, damping: 16 }} className="relative">
                  <div className="absolute -inset-2 animate-pulse rounded-full" style={{ boxShadow: `0 0 0 4px ${color}, 0 0 40px ${color}` }} />
                  <PlayerPhoto url={visible.photoUrl} name={visible.ign ?? ''} size={big ? 190 : 160} color={color} />
                  <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 rounded-md px-3 py-0.5 font-cond text-lg font-bold uppercase tracking-wider text-white shadow" style={{ background: color }}>
                    {visible.ign}
                  </span>
                </motion.div>
              )}
              <div className="clip-slant-r relative overflow-hidden pr-14" style={{ background: `linear-gradient(100deg, rgba(13,11,14,0.95) 0%, rgba(13,11,14,0.92) 60%, ${color}cc 100%)` }}>
                <motion.div className="absolute inset-y-0 w-40 -skew-x-12 bg-white/20" initial={{ x: -200 }} animate={{ x: 900 }} transition={{ duration: 0.9, delay: 0.25 }} />
                <div className="flex items-center gap-5 px-8 py-4">
                  <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl" style={{ background: color }}>
                    <Icon className="h-9 w-9 text-white" />
                  </span>
                  <div>
                    <p className={cn('font-display uppercase leading-[0.82] tracking-wide text-white', big ? 'text-[118px]' : 'text-[92px]')} style={{ textShadow: `0 0 24px ${color}` }}>
                      {visible.title}
                    </p>
                    {visible.subtitle && <p className="mt-1 font-cond text-3xl font-semibold uppercase tracking-wider text-white/85">{visible.subtitle}</p>}
                  </div>
                  {visible.teamLogo !== undefined && visible.teamName && (
                    <div className="ml-4 flex flex-col items-center gap-1">
                      <TeamLogo url={visible.teamLogo} name={visible.teamName} size={72} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function PlayerPhoto({ url, name, size, color }: { url?: string | null; name: string; size: number; color: string }) {
  return url ? (
    <img src={cld(url, { w: size * 2, h: size * 2, gravity: 'face' })} alt={name} className="relative rounded-full object-cover" style={{ width: size, height: size, border: `5px solid ${color}` }} />
  ) : (
    <span className="relative flex items-center justify-center rounded-full bg-ink-900 font-display text-white" style={{ width: size, height: size, border: `5px solid ${color}`, fontSize: size * 0.42 }}>
      {initials(name.replace(/^[A-Z]{2,4}\./, ''))}
    </span>
  );
}

// ── Caster strip (active pair + live captions) ──────────────────────────────

export function CasterStrip({
  casters,
  className,
  captions = true,
  captionOnly = false,
  size = 'md',
}: {
  casters: string[];
  className?: string;
  captions?: boolean;
  /** Render only the live subtitle bubble (no names strip). */
  captionOnly?: boolean;
  size?: 'sm' | 'md' | 'lg';
}) {
  const caption = useOverlayCaption();
  const settings = useSettings();
  const profiles = settings.data.casterProfiles;
  const current = caption?.current && Date.now() - caption.current.at < 20_000 ? caption.current : null;
  const avatar = size === 'lg' ? 64 : size === 'sm' ? 36 : 48;

  if (!casters.length && !captionOnly) return null;
  return (
    <div className={cn('flex flex-col items-center gap-2', className)}>
      <AnimatePresence mode="wait">
        {captions && current && (
          <motion.div
            key={current.at}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            className="flex max-w-[1100px] items-center gap-3 rounded-xl border border-white/10 bg-ink-950/90 py-2 pl-2 pr-5 text-left shadow-xl"
          >
            {/* Speaking caster's picture (set in Admin → Settings → Caster graphics) */}
            <CasterAvatar casterId={current.casterId} url={profiles[current.casterId]?.avatarUrl} size={size === 'lg' ? 52 : 44} speaking />
            <p className="min-w-0">
              <span className="mr-2 font-cond text-xl font-bold uppercase tracking-wider" style={{ color: CASTER_BY_ID[current.casterId]?.color }}>
                {profiles[current.casterId]?.displayName || CASTER_BY_ID[current.casterId]?.name}:
              </span>
              <span className={cn('font-semibold leading-snug text-white', size === 'lg' ? 'text-3xl' : 'text-2xl')}>{current.text}</span>
            </p>
          </motion.div>
        )}
      </AnimatePresence>
      {!captionOnly && (
      <Glass className="clip-tab flex items-center gap-5 px-10 py-2">
        <span className="font-cond text-sm font-bold uppercase tracking-[0.3em] text-crimson-400">On the mic</span>
        {casters.map((id) => {
          const c = CASTER_BY_ID[id];
          if (!c) return null;
          const speaking = current?.casterId === id;
          return (
            <motion.div key={id} layout className="flex items-center gap-2.5" animate={{ scale: speaking ? 1.06 : 1 }}>
              <CasterAvatar casterId={id} url={profiles[id]?.avatarUrl} size={avatar} speaking={speaking} />
              <div className="leading-none">
                <p className={cn('font-display uppercase', size === 'lg' ? 'text-4xl' : 'text-3xl')} style={{ color: speaking ? c.color : '#fff' }}>
                  {profiles[id]?.displayName || c.name}
                </p>
                <p className="font-cond text-xs font-semibold uppercase tracking-wider text-white/60">{c.role}</p>
              </div>
              {speaking && <SoundBars color={c.color} />}
            </motion.div>
          );
        })}
      </Glass>
      )}
    </div>
  );
}

function SoundBars({ color }: { color: string }) {
  return (
    <span className="flex h-6 items-end gap-0.5">
      {[0, 1, 2, 3].map((i) => (
        <motion.span key={i} className="w-1 rounded-full" style={{ background: color }} animate={{ height: [6, 22, 10, 18, 6] }} transition={{ repeat: Infinity, duration: 0.9, delay: i * 0.12 }} />
      ))}
    </span>
  );
}

export function BrandBug({ className }: { className?: string }) {
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <Logo size={72} className="drop-shadow-[0_0_18px_rgba(248,49,47,0.55)]" />
      <div className="leading-none">
        <p className="font-display text-4xl uppercase">TCC Esports</p>
        <p className="neon font-display text-lg uppercase tracking-[0.3em]">Let the game begin</p>
      </div>
    </div>
  );
}
