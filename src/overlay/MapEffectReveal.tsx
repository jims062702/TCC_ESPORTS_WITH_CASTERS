import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { MapEffect } from '@/types';
import { MAP_EFFECTS } from '@/lib/constants';
import { MapEffectIcon } from '@/components/MapEffectIcon';
import { playStinger } from './sound';

const REVEAL_MS = 3400;

/**
 * Shows a big reveal when the operator picks the battlefield effect, then it
 * flies up into the top bar (next to "Best of"). Returns what to draw now.
 */
export function useMapEffectReveal(effect: MapEffect | null | undefined, sound: { on: boolean; vol: number }) {
  const prev = useRef(effect ?? null);
  const [revealing, setRevealing] = useState<MapEffect | null>(null);
  useEffect(() => {
    const next = effect ?? null;
    const before = prev.current;
    prev.current = next;
    if (!next || next === before) {
      if (!next) setRevealing(null);
      return;
    }
    setRevealing(next);
    if (sound.on) playStinger('reveal', sound.vol);
    const t = setTimeout(() => setRevealing((r) => (r === next ? null : r)), REVEAL_MS);
    return () => clearTimeout(t);
  }, [effect]); // eslint-disable-line react-hooks/exhaustive-deps
  return revealing;
}

/** The big centre reveal: burst, icon, name and what it does — exits by flying up to the top bar. */
export function MapEffectRevealCard({ effect }: { effect: MapEffect | null }) {
  return (
    <AnimatePresence>
      {effect && (
        <motion.div
          key={effect}
          className="pointer-events-none absolute inset-x-0 top-[250px] z-30 flex justify-center"
          initial={{ opacity: 0, scale: 0.55, filter: 'blur(12px)' }}
          animate={{ opacity: 1, scale: 1, y: 0, filter: 'blur(0px)' }}
          exit={{ opacity: 0, scale: 0.22, y: -150, filter: 'blur(2px)', transition: { duration: 0.55, ease: [0.6, 0, 0.8, 0.4] } }}
          transition={{ type: 'spring', damping: 16, stiffness: 180 }}
          data-testid="map-reveal"
        >
          <RevealBody effect={effect} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function RevealBody({ effect }: { effect: MapEffect }) {
  const e = MAP_EFFECTS[effect];
  const color = e.color;
  return (
    <div className="relative flex flex-col items-center">
      {/* dark spotlight so the reveal reads over the game feed */}
      <span className="absolute left-1/2 top-[190px] h-[620px] w-[1300px] -translate-x-1/2 -translate-y-1/2 rounded-[50%] bg-[radial-gradient(ellipse_at_center,rgba(13,11,14,0.9)_0%,rgba(13,11,14,0.7)_45%,transparent_72%)]" />
      {/* shock ring + rays */}
      <motion.span
        className="absolute left-1/2 top-[70px] h-[140px] w-[140px] -translate-x-1/2 -translate-y-1/2 rounded-full border-4"
        style={{ borderColor: color }}
        initial={{ scale: 0.4, opacity: 0.9 }}
        animate={{ scale: 4.2, opacity: 0 }}
        transition={{ duration: 1.1, ease: 'easeOut' }}
      />
      <motion.span
        className="absolute left-1/2 top-[70px] h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{ background: `conic-gradient(from 0deg, transparent 0 8%, ${color}33 10%, transparent 14% 33%, ${color}2e 36%, transparent 40% 60%, ${color}33 63%, transparent 67% 86%, ${color}2e 89%, transparent 93%)` }}
        initial={{ rotate: 0, opacity: 0 }}
        animate={{ rotate: 90, opacity: 1 }}
        transition={{ duration: 3.2, ease: 'linear' }}
      />
      <motion.div
        className="relative flex h-[140px] w-[140px] items-center justify-center rounded-full border-4 bg-ink-950/90"
        style={{ borderColor: color, boxShadow: `0 0 60px ${color}aa, inset 0 0 40px ${color}55` }}
        initial={{ rotate: -90 }}
        animate={{ rotate: 0 }}
        transition={{ type: 'spring', damping: 12 }}
      >
        <MapEffectIcon effect={effect} className="h-[72px] w-[72px]" style={{ color, filter: `drop-shadow(0 0 12px ${color})` }} />
      </motion.div>
      <motion.p className="relative mt-5 font-cond text-xl font-bold uppercase tracking-[0.5em] text-white/70" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        Battlefield effect
      </motion.p>
      <motion.p
        className="relative font-display text-[110px] uppercase leading-[0.9]"
        style={{ color: '#fff', textShadow: `0 0 30px ${color}, 0 4px 30px rgba(0,0,0,0.6)` }}
        initial={{ opacity: 0, letterSpacing: '0.4em' }}
        animate={{ opacity: 1, letterSpacing: '0.02em' }}
        transition={{ delay: 0.3, duration: 0.6, ease: 'easeOut' }}
      >
        {e.label}
      </motion.p>
      <motion.p
        className="relative mt-2 rounded-lg border bg-ink-950/85 px-5 py-2 font-cond text-2xl font-semibold uppercase tracking-[0.15em] text-white/90"
        style={{ borderColor: `${color}88` }}
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
      >
        {e.short}
      </motion.p>
    </div>
  );
}

/** Small label next to "Best of N" in the top bar — pops in after the reveal. */
export function MapEffectChip({ effect, size = 'md' }: { effect: MapEffect; size?: 'sm' | 'md' }) {
  const e = MAP_EFFECTS[effect];
  return (
    <motion.span
      key={effect}
      className={
        size === 'md'
          ? 'inline-flex items-center gap-1.5 rounded-md border bg-ink-950/80 px-2 py-0.5 font-cond text-base font-bold uppercase tracking-[0.2em]'
          : 'inline-flex items-center gap-1.5 rounded-md border bg-ink-950/85 px-2.5 py-0.5 font-cond text-sm font-bold uppercase tracking-[0.25em]'
      }
      style={{ borderColor: `${e.color}99`, color: e.color, boxShadow: `0 0 14px ${e.color}55` }}
      initial={{ opacity: 0, scale: 1.8 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 14, stiffness: 260, delay: 0.15 }}
      data-testid="map-chip"
    >
      <MapEffectIcon effect={effect} className="h-4 w-4" />
      {e.label}
    </motion.span>
  );
}
