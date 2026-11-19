import { AnimatePresence, motion } from 'framer-motion';
import { useNow } from '@/hooks/useFirestore';
import { useOverlayLive } from './demo';
import { sideTeam } from '@/services/facts';
import { Logo, TeamLogo } from '@/components/Brand';
import { CasterStrip, Glass, OverlayStage, SIDE_COLOR, flag, useQuery } from './OverlayKit';

/**
 * OBS Browser Source: /overlay/replay — place it ABOVE the replay Media Source
 * in your "Instant Replay" scene (or on top of everything). It is fully
 * transparent until the controller triggers an instant replay.
 */
export default function ReplayOverlay() {
  const { live, demo } = useOverlayLive();
  const now = useNow(100);
  const q = useQuery();
  const r = live.replay;
  const always = flag(q, 'always', false) || demo;
  const active = (r.active && now < r.endsAt) || always;
  const total = Math.max(1, r.endsAt - r.startedAt);
  const progress = always ? 0.4 : Math.min(1, Math.max(0, (now - r.startedAt) / total));
  const color = r.side ? SIDE_COLOR[r.side] : '#f8312f';
  const team = r.side ? sideTeam(live, r.side) : null;

  return (
    <OverlayStage>
      <AnimatePresence>
        {active && (
          <motion.div key={r.eventId ?? 'replay'} className="absolute inset-0" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {/* Frame */}
            <div className="absolute inset-0 border-[10px]" style={{ borderColor: color, boxShadow: `inset 0 0 80px ${color}66` }} />
            {[
              'left-6 top-6 border-l-[8px] border-t-[8px]',
              'right-6 top-6 border-r-[8px] border-t-[8px]',
              'bottom-6 left-6 border-b-[8px] border-l-[8px]',
              'bottom-6 right-6 border-b-[8px] border-r-[8px]',
            ].map((pos) => (
              <span key={pos} className={`absolute h-24 w-24 border-white ${pos}`} />
            ))}
            {/* Scanline */}
            <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
              <div className="h-1/3 w-full animate-scan bg-gradient-to-b from-transparent via-white/30 to-transparent" />
            </div>

            {/* INSTANT REPLAY watermark */}
            <motion.div initial={{ x: -400 }} animate={{ x: 0 }} transition={{ type: 'spring', damping: 18 }} className="absolute left-14 top-14 flex items-center gap-4">
              <span className="flex items-center gap-2 rounded-md bg-crimson-600 px-3 py-1 font-cond text-2xl font-bold uppercase tracking-widest">
                <span className="h-3.5 w-3.5 animate-pulse rounded-full bg-white" /> Replay
              </span>
              <p className="font-display text-[120px] uppercase leading-[0.8] tracking-wide text-white/90" style={{ textShadow: `0 0 30px ${color}` }}>
                Instant Replay
              </p>
            </motion.div>
            <div className="absolute right-14 top-12 opacity-90">
              <Logo size={120} className="drop-shadow-[0_0_24px_rgba(248,49,47,0.6)]" />
            </div>

            {/* Lower third */}
            <motion.div initial={{ y: 200 }} animate={{ y: 0 }} transition={{ type: 'spring', damping: 20, delay: 0.1 }} className="absolute bottom-16 left-14 max-w-[1100px]">
              <Glass className="clip-slant-r flex items-center gap-5 rounded-l-xl py-4 pl-5 pr-16" style={{ borderLeft: `8px solid ${color}` }}>
                {team && <TeamLogo url={team.logoUrl} name={team.name} size={80} />}
                <div className="min-w-0">
                  <p className="font-display text-6xl uppercase leading-[0.85]">{r.title || 'Instant Replay'}</p>
                  {r.description && <p className="mt-1 text-2xl font-semibold text-white/80">{r.description}</p>}
                </div>
              </Glass>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
                <div className="h-full rounded-full" style={{ width: `${progress * 100}%`, background: color, boxShadow: `0 0 10px ${color}` }} />
              </div>
            </motion.div>

            {flag(q, 'captions') && (
              <div className="absolute bottom-16 right-14 flex max-w-[700px] justify-end">
                <CasterStrip casters={live.casters} size="sm" />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayStage>
  );
}
