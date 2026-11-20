import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import type { LevelPop } from '@/types';
import { cld } from '@/services/cloudinary';
import { formatClock } from '@/lib/clock';
import { initials } from '@/lib/utils';
import { Glass, SIDE_COLOR } from './OverlayKit';
import { playStinger } from './sound';

/** How long the Level 15 card stays on screen. */
export const LEVEL_POP_MS = 8000;
const GOLD = '#fbbf24';

/**
 * "LEVEL 15" card on the HUD: the game time the player hit the max level.
 * A new best time shows the old record getting slashed; otherwise the
 * standing record is shown under it.
 */
export function LevelPopCard({ pop, now, sound, vol }: { pop: LevelPop | null | undefined; now: number; sound: boolean; vol: number }) {
  const visible = Boolean(pop && now >= pop.at && now - pop.at < LEVEL_POP_MS);
  const played = useRef<string | null>(null);
  useEffect(() => {
    if (!pop || !visible || played.current === pop.id) return;
    played.current = pop.id;
    // Fresh pop only (an overlay reloading mid-pop stays quiet).
    if (sound && Date.now() - pop.at < 3000) playStinger('reveal', vol);
  }, [pop, visible, sound, vol]);

  const color = pop ? SIDE_COLOR[pop.side] : GOLD;
  const accent = pop?.best ? GOLD : color;

  return (
    <AnimatePresence>
      {visible && pop && (
        <motion.div
          key={pop.id}
          className="absolute left-1/2 top-[360px] w-[620px] -translate-x-1/2"
          initial={{ opacity: 0, y: 40, scale: 0.92 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -24, scale: 0.96 }}
          transition={{ type: 'spring', damping: 18, stiffness: 180 }}
          data-testid="level-pop"
        >
          <Glass className="relative overflow-hidden rounded-2xl" style={{ borderTop: `5px solid ${accent}` }}>
            {/* light sweep */}
            <motion.span
              className="pointer-events-none absolute inset-y-0 w-1/3 -skew-x-12"
              style={{ background: `linear-gradient(90deg, transparent, ${accent}33, transparent)` }}
              initial={{ left: '-40%' }}
              animate={{ left: '130%' }}
              transition={{ duration: 1.1, delay: 0.25, ease: 'easeOut' }}
            />
            <div className="flex items-center justify-between gap-3 px-6 pt-4">
              <p className="font-display text-5xl uppercase leading-none tracking-wide text-white">
                Level <span style={{ color: accent }}>15</span>
              </p>
              {pop.best ? (
                <motion.span
                  className="rounded-md px-3 py-1 font-cond text-lg font-bold uppercase tracking-[0.18em] text-ink-950"
                  style={{ background: GOLD, boxShadow: `0 0 26px ${GOLD}aa` }}
                  initial={{ scale: 0, rotate: -8 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.35, type: 'spring', damping: 10 }}
                  data-testid="level-pop-best"
                >
                  New best time
                </motion.span>
              ) : (
                <span className="font-cond text-base font-semibold uppercase tracking-[0.2em] text-white/60">Max level</span>
              )}
            </div>
            <div className="flex items-center gap-4 px-6 pb-4 pt-3">
              {pop.photoUrl ? (
                <img src={cld(pop.photoUrl, { w: 144, h: 144, gravity: 'face' })} alt="" className="h-[72px] w-[72px] shrink-0 rounded-full object-cover" style={{ boxShadow: `0 0 0 3px ${color}` }} />
              ) : (
                <span className="flex h-[72px] w-[72px] shrink-0 items-center justify-center rounded-full bg-ink-800 font-cond text-2xl font-bold" style={{ boxShadow: `0 0 0 3px ${color}` }}>
                  {initials(pop.ign)}
                </span>
              )}
              <div className="min-w-0 flex-1 leading-none">
                <p className="truncate font-display text-4xl uppercase leading-[0.95] text-white">{pop.ign}</p>
                <p className="mt-1 truncate font-cond text-base font-semibold uppercase tracking-wider text-white/60">{[pop.hero, pop.team].filter(Boolean).join(' · ')}</p>
              </div>
              <div className="text-right leading-none">
                <p className="font-cond text-xs font-bold uppercase tracking-[0.25em] text-white/50">Game time</p>
                <p className="font-display text-6xl leading-none tabular" style={{ color: accent, textShadow: pop.best ? `0 0 24px ${GOLD}88` : undefined }} data-testid="level-pop-time">
                  {formatClock(pop.sec * 1000)}
                </p>
              </div>
            </div>
            {pop.prev && (
              <div className="flex items-center justify-between gap-3 border-t border-white/10 bg-black/30 px-6 py-2.5">
                <span className="font-cond text-sm font-bold uppercase tracking-[0.2em] text-white/50">{pop.best ? 'Previous best' : 'Tournament best'}</span>
                <span className="relative inline-flex items-center gap-2" data-testid="level-pop-prev">
                  <motion.span
                    className="font-display text-3xl leading-none tabular text-white"
                    initial={{ opacity: 1 }}
                    animate={pop.best ? { opacity: 0.45 } : { opacity: 1 }}
                    transition={{ delay: 1.15, duration: 0.3 }}
                  >
                    {formatClock(pop.prev.sec * 1000)}
                  </motion.span>
                  <motion.span
                    className="font-cond text-base font-semibold uppercase tracking-wide text-white/70"
                    initial={{ opacity: 1 }}
                    animate={pop.best ? { opacity: 0.45 } : { opacity: 1 }}
                    transition={{ delay: 1.15, duration: 0.3 }}
                  >
                    {pop.prev.ign}
                    {pop.prev.team ? ` · ${pop.prev.team}` : ''}
                  </motion.span>
                  {pop.best && (
                    <>
                      {/* the slash across the old record */}
                      <motion.span
                        className="pointer-events-none absolute left-[-6%] top-1/2 h-[5px] origin-left rounded-full"
                        style={{ width: '112%', background: `linear-gradient(90deg, ${GOLD}, #f8312f)`, boxShadow: `0 0 14px ${GOLD}`, rotate: -8 }}
                        initial={{ scaleX: 0, opacity: 1 }}
                        animate={{ scaleX: 1 }}
                        transition={{ delay: 0.85, duration: 0.28, ease: [0.7, 0, 0.3, 1] }}
                        data-testid="level-pop-slash"
                      />
                      <motion.span
                        className="pointer-events-none absolute inset-0"
                        style={{ background: `radial-gradient(circle, ${GOLD}66, transparent 70%)` }}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ delay: 1.05, duration: 0.45 }}
                      />
                    </>
                  )}
                </span>
              </div>
            )}
          </Glass>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
