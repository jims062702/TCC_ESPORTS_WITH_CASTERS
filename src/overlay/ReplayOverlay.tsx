import { AnimatePresence, motion } from 'framer-motion';
import { useNow } from '@/hooks/useFirestore';
import { useOverlayLive } from './demo';
import { sideTeam } from '@/services/facts';
import { Logo, TeamLogo } from '@/components/Brand';
import { CasterStrip, Glass, OverlayStage, SIDE_COLOR, flag, useQuery } from './OverlayKit';
import { REPLAY_PIP } from './layout';

/**
 * Frame for the live In-game HUD while the replay plays. Everything is drawn
 * OUTSIDE the rectangle (outline, glow, LIVE badge) so the picture inside is
 * never covered. In OBS, nest the In-game HUD scene at exactly REPLAY_PIP (the
 * controller's "Set up live PiP in OBS" button does it automatically).
 */
function LivePip({ placeholder }: { placeholder: boolean }) {
  const { x, y, w, h } = REPLAY_PIP;
  return (
    <motion.div
      className="absolute"
      style={{ left: x, top: y, width: w, height: h }}
      initial={{ opacity: 0, x: 60 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: 'spring', damping: 20, delay: 0.15 }}
    >
      <div className="absolute -top-11 left-0 flex items-center gap-2">
        <span className="flex items-center gap-1.5 rounded-md bg-crimson-600 px-2.5 py-1 font-cond text-lg font-bold uppercase tracking-widest text-white shadow-lg">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-white" /> Live
        </span>
        <span className="rounded-md bg-black/70 px-2.5 py-1 font-cond text-lg font-semibold uppercase tracking-widest text-white/90">In-game</span>
      </div>
      <div
        className="absolute inset-0 rounded-sm"
        style={{ outline: '4px solid rgba(255,255,255,0.95)', outlineOffset: 0, boxShadow: '0 0 0 8px rgba(13,11,14,0.55), 0 10px 40px rgba(0,0,0,0.7), 0 0 30px rgba(248,49,47,0.45)' }}
      />
      {placeholder && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-[repeating-linear-gradient(-45deg,rgba(255,255,255,0.06)_0_14px,transparent_14px_28px)] text-center">
          <p className="font-display text-4xl uppercase leading-none text-white/80">In-game HUD · live</p>
          <p className="mt-1 font-cond text-base uppercase tracking-wider text-white/50">
            OBS scene here · x {x} · y {y} · {w}×{h}
          </p>
        </div>
      )}
    </motion.div>
  );
}

/**
 * OBS Browser Source: /overlay/replay — place it ABOVE the replay Media Source
 * (and the nested In-game HUD scene) in your "Instant Replay" scene. It is fully
 * transparent until the controller triggers an instant replay. ?pip=0 hides the
 * live-game frame.
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

            {/* Live In-game HUD picture-in-picture (the nested OBS scene sits in this transparent window) */}
            {flag(q, 'pip') && <LivePip placeholder={demo || flag(q, 'preview', false)} />}

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
