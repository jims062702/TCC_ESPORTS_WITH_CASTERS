import { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Ban, Sparkles } from 'lucide-react';
import type { DraftState, LivePlayer, Side } from '@/types';
import type { HeroDraftStats, NewLock, Prediction } from '@/services/draftPredictor';
import { newLocks } from '@/services/draftPredictor';
import { POSITION_LABEL } from '@/lib/constants';
import { HeroArt } from '@/components/game';
import { cn } from '@/lib/utils';
import { SIDE_COLOR } from './OverlayKit';

// ─────────────────────────────────────────────────────────────────────────────
// Draft overlay extras:
//   • AI Draft Predictor — hero cards with %, shown only on the side that is on
//     the clock. Blue scrolls endlessly to the right, red to the left.
//   • Lock cards — right after a pick: Pick · Contention rate · Win rate;
//     right after a ban: BAN / 5x. Both animate in and out.
// ─────────────────────────────────────────────────────────────────────────────

const CARD_W = 112;
const GAP = 12;
const STRIP_W = 880;
const SPEED = 55; // px per second

const KEYFRAMES = `
@keyframes tcc-marquee-right { from { transform: translate3d(-50%,0,0); } to { transform: translate3d(0,0,0); } }
@keyframes tcc-marquee-left { from { transform: translate3d(0,0,0); } to { transform: translate3d(-50%,0,0); } }
@keyframes tcc-sheen { from { transform: translateX(-120%) skewX(-18deg); } to { transform: translateX(320%) skewX(-18deg); } }
`;

export function InsightStyles() {
  return <style>{KEYFRAMES}</style>;
}

const sidePos = (side: Side) => (side === 'blue' ? { left: 32 } : { right: 32 });

/** Endless strip of predicted heroes for the side on the clock. */
export function PredictorStrip({ side, kind, teamName, predictions, portraits }: { side: Side; kind: 'ban' | 'pick'; teamName: string; predictions: Prediction[]; portraits: Record<string, string> }) {
  const color = SIDE_COLOR[side];
  const accent = kind === 'ban' ? '#f8312f' : color;
  const right = side === 'red';
  // One "set" is wide enough to fill the strip; two sets back to back loop seamlessly.
  const set = useMemo(() => {
    if (!predictions.length) return [];
    const ranked = predictions.map((p, i) => ({ ...p, rank: i + 1 }));
    const per = ranked.length * (CARD_W + GAP);
    const copies = Math.max(1, Math.ceil(STRIP_W / per));
    return Array.from({ length: copies }, () => ranked).flat();
  }, [predictions]);
  const setWidth = set.length * (CARD_W + GAP);
  const duration = Math.max(12, setWidth / SPEED);
  const listKey = predictions.map((p) => p.hero).join('|');

  return (
    <motion.div
      className="absolute bottom-[440px] z-10"
      style={{ ...sidePos(side), width: STRIP_W }}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 30 }}
      transition={{ type: 'spring', damping: 22, stiffness: 220 }}
      data-testid={`predictor-${side}`}
      data-kind={kind}
    >
      <div className={cn('mb-2 flex items-center gap-3', right && 'flex-row-reverse')}>
        <span className="flex items-center gap-1.5 rounded-md bg-white px-2.5 py-1 font-cond text-sm font-bold uppercase tracking-[0.25em] text-ink-950">
          <Sparkles className="h-4 w-4" style={{ color: accent }} /> AI Draft Predictor
        </span>
        <span className="font-display text-3xl uppercase leading-none" style={{ color, textShadow: `0 0 14px ${color}88` }}>
          {teamName} <span style={{ color: accent }}>{kind}</span>
        </span>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-white/10 bg-ink-950/80 py-2.5 backdrop-blur-md" style={{ maskImage: 'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)', WebkitMaskImage: 'linear-gradient(90deg, transparent, #000 6%, #000 94%, transparent)' }}>
        <AnimatePresence mode="wait">
          <motion.div key={listKey} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.3 }}>
            <div
              className="flex w-max"
              style={{ animation: `${right ? 'tcc-marquee-left' : 'tcc-marquee-right'} ${duration}s linear infinite` }}
            >
              {[0, 1].map((copy) =>
                set.map((p, i) => <PredictCard key={`${copy}-${i}`} p={p} rank={p.rank} accent={accent} portraits={portraits} />),
              )}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function PredictCard({ p, rank, accent, portraits }: { p: Prediction; rank: number; accent: string; portraits: Record<string, string> }) {
  const top = rank === 1;
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-lg border-2 bg-ink-900"
      style={{ width: CARD_W, marginRight: GAP, borderColor: top ? accent : 'rgba(255,255,255,0.12)', boxShadow: top ? `0 0 18px ${accent}88` : undefined }}
    >
      <div className="relative h-[92px]">
        <HeroArt name={p.hero} portraits={portraits} className="h-full w-full text-lg" />
        <span className="absolute left-1 top-1 rounded bg-black/75 px-1.5 font-cond text-xs font-bold text-white">#{rank}</span>
      </div>
      <div className="px-1.5 pb-1 pt-0.5 text-center">
        <p className="font-display text-[34px] leading-none tabular" style={{ color: accent }}>
          {p.pct}%
        </p>
        <p className="truncate font-cond text-[13px] font-semibold uppercase tracking-wider text-white/85">{p.hero}</p>
      </div>
    </div>
  );
}

// ── Lock cards ──────────────────────────────────────────────────────────────

export interface LockCard extends NewLock {
  id: string;
}

const CARD_MS = 5200;

/**
 * Cards for heroes that were just locked, one per side, each shown for ~5 s.
 * Undo (the hero leaves the draft) removes its card at once.
 */
export function useLockCards(draft: DraftState) {
  const prev = useRef<DraftState | null>(null);
  const [cards, setCards] = useState<Record<Side, LockCard | null>>({ blue: null, red: null });

  useEffect(() => {
    const locks = newLocks(prev.current, draft);
    prev.current = draft;
    setCards((c) => {
      const next = { ...c };
      for (const l of locks) next[l.side] = { ...l, id: `${l.kind}-${l.hero}-${Date.now()}` };
      for (const s of ['blue', 'red'] as Side[]) {
        const card = next[s];
        if (card && draft[`${card.side}${card.kind === 'ban' ? 'Bans' : 'Picks'}`][card.slot] !== card.hero) next[s] = null;
      }
      return next.blue === c.blue && next.red === c.red ? c : next;
    });
  }, [draft]);

  // Each card leaves on its own after a few seconds.
  useEffect(() => {
    const timers = (['blue', 'red'] as Side[])
      .filter((s) => cards[s])
      .map((s) => {
        const id = cards[s]!.id;
        return setTimeout(() => setCards((c) => (c[s]?.id === id ? { ...c, [s]: null } : c)), CARD_MS);
      });
    return () => timers.forEach(clearTimeout);
  }, [cards]);

  return cards;
}

/** Counts up from 0 when the card appears. */
function CountUp({ value, suffix = '', delay = 0.35 }: { value: number | null; suffix?: string; delay?: number }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (value === null) return;
    let raf = 0;
    const start = performance.now() + delay * 1000;
    const tick = (t: number) => {
      const k = Math.min(1, Math.max(0, (t - start) / 800));
      setShown(Math.round(value * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, delay]);
  return (
    <>
      {value === null ? '—' : shown}
      {value === null ? '' : suffix}
    </>
  );
}

export function LockStatCard({ card, stats, player, playerRecord, portraits }: { card: LockCard; stats: HeroDraftStats; player: LivePlayer | null; playerRecord: { games: number; wins: number } | null; portraits: Record<string, string> }) {
  const color = SIDE_COLOR[card.side];
  const right = card.side === 'red';
  const ban = card.kind === 'ban';
  const accent = ban ? '#f8312f' : color;
  const from = right ? 'inset(0 0 0 100%)' : 'inset(0 100% 0 0)';

  return (
    <motion.div
      className="absolute bottom-[440px] z-20"
      style={sidePos(card.side)}
      initial={{ opacity: 0, x: right ? 80 : -80, clipPath: from }}
      animate={{ opacity: 1, x: 0, clipPath: 'inset(0 0% 0 0%)' }}
      exit={{ opacity: 0, x: right ? 60 : -60, clipPath: from, transition: { duration: 0.45, ease: 'easeIn' } }}
      transition={{ type: 'spring', damping: 24, stiffness: 200 }}
      data-testid={`lockcard-${card.side}`}
      data-kind={card.kind}
    >
      <div className={cn('relative flex overflow-hidden rounded-2xl border-2 bg-ink-950/90 shadow-[0_14px_50px_rgba(0,0,0,0.6)] backdrop-blur-md', right && 'flex-row-reverse')} style={{ borderColor: `${accent}aa` }}>
        {/* light sweep on entry */}
        <span className="pointer-events-none absolute inset-y-0 left-0 z-10 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent" style={{ animation: 'tcc-sheen 1.1s ease-out 0.25s 1 both' }} />
        <span className="absolute inset-y-0 w-1.5" style={{ background: accent, [right ? 'right' : 'left']: 0 }} />
        <motion.div className="relative h-[176px] w-[150px] shrink-0" initial={{ scale: 1.25 }} animate={{ scale: 1 }} transition={{ duration: 0.6, ease: 'easeOut' }}>
          <HeroArt name={card.hero} portraits={portraits} className="h-full w-full text-2xl" dim={ban} />
          {ban && (
            <span className="absolute inset-0 flex items-center justify-center bg-black/40">
              <Ban className="h-16 w-16 text-crimson-500" />
            </span>
          )}
        </motion.div>
        <div className={cn('flex min-w-0 flex-col justify-center px-6 py-3', right && 'items-end text-right')}>
          <p className="font-cond text-base font-bold uppercase tracking-[0.3em]" style={{ color }}>
            {card.side} {ban ? 'ban' : 'pick'}
            {!ban && player ? <span className="text-white/70"> · {player.ign} ({POSITION_LABEL[player.role] ?? player.role})</span> : null}
          </p>
          <motion.p className="font-display text-6xl uppercase leading-[0.9]" initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
            {stats.hero}
          </motion.p>
          {ban ? (
            <motion.div className={cn('mt-2 flex flex-col leading-none', right ? 'items-end' : 'items-start')} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <span className="font-cond text-xl font-bold uppercase tracking-[0.35em] text-white/70">Ban</span>
              <span className="font-display text-[64px] leading-[0.9] tabular" style={{ color: accent, textShadow: `0 0 18px ${accent}88` }} data-testid="ban-count">
                <CountUp value={stats.bans} suffix="x" />
              </span>
            </motion.div>
          ) : (
            <>
              <div className={cn('mt-3 flex gap-6', right && 'justify-end')}>
                <Stat label="Pick" delay={0.3} color={accent}>
                  <CountUp value={stats.picks} delay={0.35} />
                </Stat>
                <Stat label="Contention rate" delay={0.4} color={accent}>
                  <CountUp value={stats.contention} suffix="%" delay={0.45} />
                </Stat>
                <Stat label="Win rate" delay={0.5} color={accent}>
                  <CountUp value={stats.winRate} suffix="%" delay={0.55} />
                </Stat>
              </div>
              {playerRecord && player && (
                <p className="mt-1.5 font-cond text-sm uppercase tracking-wider text-white/60">
                  {player.ign}: {playerRecord.games} game{playerRecord.games === 1 ? '' : 's'} · {playerRecord.wins} win{playerRecord.wins === 1 ? '' : 's'} on {stats.hero}
                </p>
              )}
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function Stat({ label, delay, color, children }: { label: string; delay: number; color: string; children: React.ReactNode }) {
  return (
    <motion.div className="flex flex-col leading-none" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
      <span className="font-cond text-sm font-bold uppercase tracking-[0.2em] text-white/60">{label}</span>
      <span className="mt-1 font-display text-[52px] leading-[0.9] tabular" style={{ color }}>
        {children}
      </span>
    </motion.div>
  );
}
