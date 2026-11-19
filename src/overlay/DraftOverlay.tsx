import { AnimatePresence, motion } from 'framer-motion';
import { Ban } from 'lucide-react';
import type { LiveState, Side } from '@/types';
import { useHeroPortraits, useNow } from '@/hooks/useFirestore';
import { useOverlayLive } from './demo';
import { sideTeam } from '@/services/facts';
import { DRAFT_SEQUENCE, FORMAT_LABEL, POSITION_LABEL } from '@/lib/constants';
import { HeroArt, SeriesPips } from '@/components/game';
import { TeamLogo } from '@/components/Brand';
import { cn } from '@/lib/utils';
import { BrandBug, CasterStrip, EventBanner, Glass, OverlayStage, SIDE_COLOR, flag, useQuery } from './OverlayKit';
import { soundOptions, useBannerStinger } from './useBroadcastSound';

/** OBS Browser Source: /overlay/draft (1920×1080, transparent). */
export default function DraftOverlay() {
  const { live, demo } = useOverlayLive();
  const portraits = useHeroPortraits();
  const now = useNow(200);
  const q = useQuery();
  const snd = soundOptions(q, demo);
  useBannerStinger(live.banner, 'DRAFT_START', 'draft', snd.on, snd.vol);
  const d = live.draft;
  const step = DRAFT_SEQUENCE[d.step];
  const done = d.step >= DRAFT_SEQUENCE.length;
  const left = d.timerEndsAt ? Math.max(0, Math.ceil((d.timerEndsAt - now) / 1000)) : (d.timerPausedLeft ?? d.timerDuration);
  const visible = demo || (live.matchId && (live.phase === 'draft' || flag(q, 'always', false)));
  const stepColor = step ? SIDE_COLOR[step.side] : '#3ef0d8';

  return (
    <OverlayStage>
      <AnimatePresence>
        {visible && (
          <motion.div key="draft" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Top bar */}
            <motion.div initial={{ y: -80 }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 20 }} className="absolute inset-x-0 top-0 flex items-start justify-between px-10 pt-6">
              <BrandBug />
              <Glass className="clip-tab-down px-16 pb-3 pt-2 text-center">
                <p className="font-cond text-lg font-semibold uppercase tracking-[0.35em] text-crimson-400">{live.tournamentName}</p>
                <p className="font-display text-5xl uppercase leading-none">
                  {live.matchLabel} · Game {live.gameNumber}
                </p>
                <p className="font-cond text-base uppercase tracking-[0.3em] text-white/60">{FORMAT_LABEL[live.format]}</p>
              </Glass>
              {flag(q, 'casters') ? <CasterStrip casters={live.casters} captions={false} size="sm" /> : <div className="w-[300px]" />}
            </motion.div>

            <EventBanner banner={live.banner} allow={['DRAFT_START', 'GAME_INTRO', 'DRAFT_COMPLETE']} top={260} />

            {/* Captions while drafting */}
            {flag(q, 'captions') && (
              <div className="absolute inset-x-0 top-[560px] flex justify-center">
                <CasterStrip casters={live.casters} captionOnly />
              </div>
            )}

            {/* Bottom draft band */}
            <motion.div initial={{ y: 400 }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 22, delay: 0.1 }} className="absolute inset-x-0 bottom-0 h-[372px]">
              <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/95 to-transparent" />
              <div className="relative flex h-full items-end justify-between gap-6 px-8 pb-6">
                <SidePanel live={live} side="blue" portraits={portraits.map} activeKind={step?.side === 'blue' ? step.kind : null} activeIndex={step?.side === 'blue' ? (step.kind === 'pick' ? d.bluePicks.findIndex((h) => !h) : step.index) : -1} />

                {/* Centre: timer & phase */}
                <div className="flex w-[260px] shrink-0 flex-col items-center pb-2">
                  <p className="font-cond text-xl font-semibold uppercase tracking-[0.3em] text-white/60">{done ? 'Draft complete' : step.phase}</p>
                  <div className="relative my-3 flex h-[150px] w-[150px] items-center justify-center">
                    <svg className="absolute inset-0 -rotate-90" viewBox="0 0 100 100">
                      <circle cx="50" cy="50" r="45" fill="rgba(13,11,14,0.9)" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                      <circle
                        cx="50"
                        cy="50"
                        r="45"
                        fill="none"
                        stroke={stepColor}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray={2 * Math.PI * 45}
                        strokeDashoffset={2 * Math.PI * 45 * (1 - (done ? 1 : left / Math.max(1, d.timerDuration)))}
                        style={{ transition: 'stroke-dashoffset 0.25s linear', filter: `drop-shadow(0 0 6px ${stepColor})` }}
                      />
                    </svg>
                    <span className={cn('relative font-display text-[84px] leading-none tabular', left <= 5 && !done && d.timerEndsAt ? 'animate-pulse text-crimson-400' : 'text-white')}>{done ? '✓' : left}</span>
                  </div>
                  {!done && (
                    <p className="font-display text-4xl uppercase leading-none" style={{ color: stepColor, textShadow: `0 0 16px ${stepColor}` }}>
                      {step.side} {step.kind}
                    </p>
                  )}
                  <p className="mt-3 font-display text-6xl leading-none tabular">
                    {live.scoreA} <span className="text-white/40">-</span> {live.scoreB}
                  </p>
                  <p className="font-cond text-sm uppercase tracking-[0.3em] text-white/50">
                    {live.teamA?.tag} · Series · {live.teamB?.tag}
                  </p>
                </div>

                <SidePanel live={live} side="red" portraits={portraits.map} activeKind={step?.side === 'red' ? step.kind : null} activeIndex={step?.side === 'red' ? (step.kind === 'pick' ? d.redPicks.findIndex((h) => !h) : step.index) : -1} />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayStage>
  );
}

function SidePanel({ live, side, portraits, activeKind, activeIndex }: { live: LiveState; side: Side; portraits: Record<string, string>; activeKind: 'ban' | 'pick' | null; activeIndex: number }) {
  const team = sideTeam(live, side);
  const color = SIDE_COLOR[side];
  const wins = team?.id === live.teamA?.id ? live.scoreA : live.scoreB;
  const bans = live.draft[`${side}Bans`];
  const picks = live.draft[`${side}Picks`];
  const right = side === 'red';
  return (
    <div className={cn('flex flex-col gap-3', right && 'items-end')}>
      <div className={cn('flex items-center gap-4', right && 'flex-row-reverse')}>
        <TeamLogo url={team?.logoUrl} name={team?.name} size={84} />
        <div className={cn(right && 'text-right')}>
          <p className="font-cond text-lg font-bold uppercase tracking-[0.3em]" style={{ color }}>
            {side} side
          </p>
          <p className="font-display text-6xl uppercase leading-[0.85]">{team?.name ?? 'TBD'}</p>
          <div className={cn('mt-2 flex items-center gap-3', right && 'flex-row-reverse')}>
            <SeriesPips format={live.format} wins={wins} color={color} reverse={right} size={14} />
            <span className="font-cond text-lg font-semibold uppercase tracking-[0.2em] text-white/70">
              {live[side].coach?.name ? (
                <>
                  Coach <span className="text-white">{live[side].coach!.name}</span>
                </>
              ) : (
                'No coach'
              )}
            </span>
          </div>
        </div>
        <div className={cn('flex gap-2', right ? 'mr-6 flex-row-reverse' : 'ml-6')}>
          {bans.map((h, i) => {
            const active = activeKind === 'ban' && activeIndex === i;
            return (
              <div key={i} className={cn('relative h-[64px] w-[64px] overflow-hidden rounded-lg border-2 bg-ink-900', active ? 'animate-pulse' : 'border-white/10')} style={active ? { borderColor: color, boxShadow: `0 0 16px ${color}` } : undefined}>
                {h && h.toLowerCase() === 'none' ? (
                  <span className="flex h-full flex-col items-center justify-center font-cond text-[11px] font-bold uppercase leading-tight tracking-wider text-white/50">
                    No<br />ban
                  </span>
                ) : h ? (
                  <>
                    <HeroArt name={h} portraits={portraits} className="h-full w-full text-[10px]" dim />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/35">
                      <Ban className="h-8 w-8 text-crimson-500/90" />
                    </span>
                  </>
                ) : (
                  <span className="flex h-full items-center justify-center text-white/20">
                    <Ban className="h-6 w-6" />
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <div className={cn('flex gap-3', right && 'flex-row-reverse')}>
        {picks.map((h, i) => {
          const active = activeKind === 'pick' && activeIndex === i;
          const player = live[side].players[i];
          return (
            <div key={i} className="flex flex-col items-center gap-1.5">
              <motion.div
                layout
                className={cn('relative h-[176px] w-[132px] overflow-hidden rounded-xl border-2 bg-ink-900/90', active ? 'animate-pulse' : 'border-white/10')}
                style={active ? { borderColor: color, boxShadow: `0 0 24px ${color}` } : h ? { borderColor: `${color}88` } : undefined}
              >
                <AnimatePresence mode="wait">
                  {h ? (
                    <motion.div key={h} className="h-full w-full" initial={{ opacity: 0, scale: 1.2 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
                      <HeroArt name={h} portraits={portraits} className="h-full w-full text-2xl" />
                      {portraits[h.toLowerCase()] && (
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent px-2 pb-1.5 pt-6 text-center font-display text-2xl uppercase leading-none">{h}</div>
                      )}
                    </motion.div>
                  ) : (
                    <motion.span key="empty" className="flex h-full items-center justify-center font-display text-5xl text-white/10">
                      {i + 1}
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
              {player && (
                <span className="font-cond text-sm font-bold uppercase tracking-[0.2em]" style={{ color }}>
                  {POSITION_LABEL[player.role] ?? player.role}
                </span>
              )}
              <span className="-mt-1 max-w-[132px] truncate font-cond text-lg font-semibold uppercase tracking-wider text-white/80">{player?.ign ?? ''}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
