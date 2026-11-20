import { AnimatePresence, motion } from 'framer-motion';
import { Crown, Shell } from 'lucide-react';
import type { LivePlayer, LiveState, Side } from '@/types';
import { useNow } from '@/hooks/useFirestore';
import { useOverlayLive } from './demo';
import { sideTeam } from '@/services/facts';
import { cld } from '@/services/cloudinary';
import { SpellBadge, SeriesPips } from '@/components/game';
import { TeamLogo } from '@/components/Brand';
import { cn, formatGold, initials } from '@/lib/utils';
import { formatClock, gameElapsedMs } from '@/lib/clock';
import { MAP_EFFECTS } from '@/lib/constants';
import { CasterStrip, EventBanner, Glass, OverlayStage, SIDE_COLOR, flag, useQuery } from './OverlayKit';
import { soundOptions, useBannerStinger, useReplayStingers } from './useBroadcastSound';
import { MapEffectChip } from './MapEffectReveal';
import { LevelPopCard } from './LevelPop';

/**
 * OBS Browser Source: /overlay/hud (1920×1080, transparent).
 * Query flags: ?players=0 hides the player columns, ?casters=0 hides the caster
 * strip, ?captions=0 hides subtitles, ?top=0 hides the scoreboard, ?always=1 shows outside in-game.
 */
export default function HudOverlay() {
  const { live, demo } = useOverlayLive();
  const now = useNow(250);
  const q = useQuery();
  // Sound: game-start stinger + whoosh into / out of instant replays (?sound=0 mutes, ?vol=0.5).
  const snd = soundOptions(q, demo);
  useBannerStinger(live.banner, 'GAME_START', 'game', snd.on, snd.vol);
  useReplayStingers(live.replay, now, snd.on, snd.vol);
  const visible = demo || (live.matchId && (live.phase === 'ingame' || live.phase === 'postgame' || flag(q, 'always', false)));

  return (
    <OverlayStage>
      <AnimatePresence>
        {visible && (
          <motion.div key="hud" className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {flag(q, 'top') && <ScoreBar live={live} now={now} />}
            {flag(q, 'players') && (
              <>
                <PlayerColumn live={live} side="blue" now={now} />
                <PlayerColumn live={live} side="red" now={now} />
              </>
            )}
            <EventBanner banner={live.banner} top={170} />
            <LevelPopCard pop={live.levelPop} now={now} sound={snd.on} vol={snd.vol} />
            {flag(q, 'casters') && (
              <div className="absolute inset-x-0 bottom-3 flex justify-center">
                <CasterStrip casters={live.casters} captions={flag(q, 'captions')} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayStage>
  );
}

function ScoreBar({ live, now }: { live: LiveState; now: number }) {
  const blue = sideTeam(live, 'blue');
  const red = sideTeam(live, 'red');
  const kills = (s: Side) => live[s].players.reduce((n, p) => n + p.k, 0);
  const winsOf = (id?: string) => (id === live.teamA?.id ? live.scoreA : live.scoreB);
  const gd = live.goldDiff;
  const pct = Math.max(-1, Math.min(1, gd / 15000));

  const team = (side: Side) => {
    const t = side === 'blue' ? blue : red;
    const right = side === 'red';
    const color = SIDE_COLOR[side];
    return (
      <div className={cn('flex h-full items-center gap-4 px-5', right && 'flex-row-reverse')}>
        <TeamLogo url={t?.logoUrl} name={t?.name} size={58} />
        <div className={cn('leading-none', right && 'text-right')}>
          <p className="font-display text-[44px] uppercase leading-[0.85]">{t?.tag ?? 'TBD'}</p>
          <div className="mt-1">
            <SeriesPips format={live.format} wins={winsOf(t?.id)} color={color} reverse={right} size={11} />
          </div>
        </div>
        <div className={cn('flex items-center gap-3 font-display text-3xl leading-none', right && 'flex-row-reverse')}>
          <span className="flex items-center gap-1 text-white/80" title="Turtles">
            <Shell className="h-5 w-5" style={{ color }} /> {live[side].turtles}
          </span>
          <span className="flex items-center gap-1 text-white/80" title="Lords">
            <Crown className="h-5 w-5" style={{ color }} /> {live[side].lords}
          </span>
        </div>
        <motion.span key={kills(side)} initial={{ scale: 1.6, color: '#ffffff' }} animate={{ scale: 1, color }} className="min-w-[64px] text-center font-display text-[64px] leading-none tabular">
          {kills(side)}
        </motion.span>
      </div>
    );
  };

  return (
    <div className="absolute inset-x-0 top-0 flex justify-center">
    <motion.div initial={{ y: -120 }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 20 }}>
      <Glass className="clip-tab-down flex h-[86px] items-stretch">
        <div className="border-b-4" style={{ borderColor: SIDE_COLOR.blue }}>
          {team('blue')}
        </div>
        <div className="flex w-[230px] flex-col items-center justify-center border-x border-white/10 px-3">
          <p className="flex items-center gap-2 font-cond text-xs font-semibold uppercase tracking-[0.3em] text-white/50">
            Game {live.gameNumber} · {live.format.replace('BO', 'Bo')}
            {live.gameStartedAt && (
              <span className={cn('font-display text-lg tracking-normal tabular', live.clockPausedAt ? 'text-amber-300' : 'text-white')}>{formatClock(gameElapsedMs(live, now))}</span>
            )}
          </p>
          <p className="font-display text-3xl leading-none tabular" style={{ color: gd === 0 ? '#fff' : gd > 0 ? SIDE_COLOR.blue : SIDE_COLOR.red }}>
            {gd === 0 ? 'EVEN' : `${gd > 0 ? '◀' : ''} +${formatGold(gd)} ${gd < 0 ? '▶' : ''}`}
          </p>
          <div className="relative mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <span className="absolute left-1/2 top-0 h-full w-px bg-white/40" />
            <motion.span
              className="absolute top-0 h-full rounded-full"
              animate={{ left: pct >= 0 ? `${50 - pct * 50}%` : '50%', width: `${Math.abs(pct) * 50}%` }}
              style={{ background: gd >= 0 ? SIDE_COLOR.blue : SIDE_COLOR.red }}
              transition={{ type: 'spring', damping: 20 }}
            />
          </div>
          <p className="mt-0.5 font-cond text-[10px] uppercase tracking-[0.3em] text-white/40">Gold diff</p>
        </div>
        <div className="border-b-4" style={{ borderColor: SIDE_COLOR.red }}>
          {team('red')}
        </div>
      </Glass>
      {/* This game's battlefield effect (2026 map) */}
      {live.mapEffect && MAP_EFFECTS[live.mapEffect] && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mt-1 flex justify-center">
          <MapEffectChip effect={live.mapEffect} size="sm" />
        </motion.div>
      )}
    </motion.div>
    </div>
  );
}

function PlayerColumn({ live, side, now }: { live: LiveState; side: Side; now: number }) {
  const right = side === 'red';
  const color = SIDE_COLOR[side];
  return (
    <motion.div
      initial={{ x: right ? 320 : -320 }}
      animate={{ x: 0 }}
      transition={{ type: 'spring', damping: 22 }}
      className={cn('absolute top-[300px] flex w-[268px] flex-col gap-2', right ? 'right-0 items-end' : 'left-0')}
    >
      {live[side].players.map((p, i) => (
        <PlayerCard key={`${p.playerId}-${i}`} p={p} right={right} color={color} now={now} />
      ))}
    </motion.div>
  );
}

function PlayerCard({ p, right, color, now }: { p: LivePlayer; right: boolean; color: string; now: number }) {
  return (
    <Glass className={cn('flex h-[78px] w-[268px] items-center gap-3 px-3', right ? 'clip-slant-l flex-row-reverse rounded-l-xl pl-6' : 'clip-slant-r rounded-r-xl pr-6')} style={{ [right ? 'borderRight' : 'borderLeft']: `5px solid ${color}` } as React.CSSProperties}>
      {p.photoUrl ? (
        <img src={cld(p.photoUrl, { w: 112, h: 112, gravity: 'face' })} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" style={{ boxShadow: `0 0 0 2px ${color}` }} />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-ink-800 font-cond text-xl font-bold" style={{ boxShadow: `0 0 0 2px ${color}` }}>
          {initials(p.ign.replace(/^[A-Z]{2,4}\./, ''))}
        </span>
      )}
      <div className={cn('min-w-0 flex-1 leading-none', right && 'text-right')}>
        <p className="truncate font-display text-[28px] uppercase leading-[0.9]">{p.ign}</p>
        <p className="flex items-center gap-1.5 truncate font-cond text-sm font-semibold uppercase tracking-wider text-white/60" style={right ? { justifyContent: 'flex-end' } : undefined}>
          <span className="truncate">{p.hero || p.role}</span>
          {(p.level ?? 1) > 1 && (
            <span className={cn('shrink-0 rounded px-1 text-[11px] leading-[16px]', (p.level ?? 1) >= 15 ? 'bg-amber-400 text-ink-950' : 'bg-white/15 text-white')} data-testid="hud-level">
              Lv {p.level}
            </span>
          )}
        </p>
        <p className="mt-1 font-display text-2xl leading-none tabular">
          <span className="text-white">{p.k}</span>
          <span className="text-white/40"> / </span>
          <span className="text-crimson-400">{p.d}</span>
          <span className="text-white/40"> / </span>
          <span className="text-white/80">{p.a}</span>
        </p>
      </div>
      {p.spell && <SpellBadge spell={p.spell} readyAt={p.spellReadyAt} usedAt={p.spellUsedAt} now={now} size={36} />}
    </Glass>
  );
}
