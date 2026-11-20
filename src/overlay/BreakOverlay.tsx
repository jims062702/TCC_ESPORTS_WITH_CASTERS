import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Film } from 'lucide-react';
import { useHighlights, useNow } from '@/hooks/useFirestore';
import { useOverlayLive } from './demo';
import { videoStreamUrl } from '@/services/cloudinary';
import { sideTeam } from '@/services/facts';
import { FORMAT_LABEL, winsNeeded } from '@/lib/constants';
import { Logo, TeamLogo } from '@/components/Brand';
import { SeriesPips } from '@/components/game';
import { formatDuration } from '@/lib/utils';
import { CasterStrip, Glass, OverlayStage, SIDE_COLOR, flag, useQuery } from './OverlayKit';
import { useBreakMusic } from './useBroadcastSound';

/**
 * OBS Browser Source: /overlay/break — full-screen break scene.
 * Loops the highlight playlist (<video autoplay muted loop>) with the series
 * score, next game info and an optional countdown. ?sound=1 plays clip audio.
 * Plays the generated 5-minute break track (loops) during breaks — ?music=0 turns it off, ?vol=0.5.
 */
export default function BreakOverlay() {
  const { live, demo } = useOverlayLive();
  const highlights = useHighlights();
  const now = useNow(1000);
  const q = useQuery();
  const sound = flag(q, 'sound', false);
  const vol = Math.min(1, Math.max(0, Number(q.get('vol') ?? 0.8) || 0));
  useBreakMusic(flag(q, 'music', !demo) && vol > 0 && Boolean(live.matchId || flag(q, 'always', false)) && (live.phase === 'break' || flag(q, 'always', false)), vol);
  const playlist = useMemo(() => {
    const all = highlights.data.filter((h) => h.inPlaylist);
    // Replays from the series on air play first (newest first), then the rest of the highlights.
    const isReplay = (h: (typeof all)[number]) => Boolean(live.matchId) && h.matchId === live.matchId;
    const replays = all.filter(isReplay).sort((a, b) => b.createdAt - a.createdAt);
    return [...replays, ...all.filter((h) => !isReplay(h))];
  }, [highlights.data, live.matchId]);
  const [index, setIndex] = useState(0);
  const clip = playlist.length ? playlist[index % playlist.length] : null;
  const clipIsReplay = Boolean(clip && live.matchId && clip.matchId === live.matchId);
  // Every new break / pause starts from the newest replay.
  const onBreak = live.phase === 'break';
  useEffect(() => {
    if (onBreak) setIndex(0);
  }, [onBreak]);

  useEffect(() => {
    if (index >= playlist.length && playlist.length) setIndex(0);
  }, [playlist.length, index]);

  const next = () => setIndex((i) => (playlist.length ? (i + 1) % playlist.length : 0));
  const left = live.breakEndsAt ? Math.max(0, Math.round((live.breakEndsAt - now) / 1000)) : null;
  const blue = sideTeam(live, 'blue');
  const red = sideTeam(live, 'red');
  const nextGame = live.scoreA + live.scoreB + 1;

  return (
    <OverlayStage>
      <div className="absolute inset-0 overflow-hidden bg-ink-950">
        {/* Video playlist */}
        <AnimatePresence mode="wait">
          {clip ? (
            <motion.video
              key={clip.id + index}
              src={videoStreamUrl(clip.videoUrl)}
              autoPlay
              muted={!sound}
              playsInline
              loop={playlist.length === 1}
              onEnded={next}
              onError={() => setTimeout(next, 1000)}
              className="absolute inset-0 h-full w-full object-cover"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.6 }}
            />
          ) : (
            <motion.div key="idle" className="absolute inset-0 flex items-center justify-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              <div className="absolute h-[900px] w-[900px] rounded-full bg-crimson-600/25 blur-[140px]" />
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 80, ease: 'linear' }} className="absolute h-[760px] w-[760px] rounded-full border-2 border-dashed border-crimson-500/30" />
              <Logo size={560} className="relative opacity-90" />
            </motion.div>
          )}
        </AnimatePresence>
        <div className="absolute inset-0 bg-gradient-to-r from-ink-950/95 via-ink-950/40 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-72 bg-gradient-to-t from-ink-950 to-transparent" />

        {/* Branding + message */}
        <div className="absolute left-20 top-20 max-w-[860px]">
          <Logo size={170} className="drop-shadow-[0_0_30px_rgba(248,49,47,0.55)]" />
          <p className="mt-6 font-cond text-2xl font-semibold uppercase tracking-[0.4em] text-crimson-400">{live.tournamentName || 'TCC Esports'}</p>
          <h1 className="font-display text-[150px] uppercase leading-[0.82]">{live.breakMessage || (live.breakPause ? 'Game paused' : "We'll be right back")}</h1>
          <p className="neon mt-4 font-display text-4xl uppercase tracking-[0.35em]">Let the game begin</p>
          {left !== null && (
            <Glass className="mt-8 inline-flex items-center gap-4 rounded-2xl px-6 py-3">
              <span className="font-cond text-xl font-semibold uppercase tracking-[0.3em] text-white/60">{live.breakPause ? 'Resuming in' : 'Back in'}</span>
              <span className="font-display text-7xl leading-none tabular">{formatDuration(left)}</span>
            </Glass>
          )}
        </div>

        {/* Series card */}
        {live.matchId && (
          <Glass className="absolute bottom-24 left-20 flex items-center gap-8 rounded-2xl px-8 py-5">
            <div className="text-center">
              <p className="font-cond text-lg font-semibold uppercase tracking-[0.3em] text-white/60">{live.matchLabel}</p>
              <p className="font-display text-4xl uppercase leading-none">
                {Math.max(live.scoreA, live.scoreB) >= winsNeeded(live.format) ? 'Final' : live.breakPause ? `Paused · Game ${live.gameNumber}` : `Up next · Game ${nextGame}`}
              </p>
              <p className="font-cond text-sm uppercase tracking-[0.3em] text-white/50">{FORMAT_LABEL[live.format]}</p>
            </div>
            {[blue, red].map((t, i) => {
              const side = i === 0 ? 'blue' : 'red';
              const wins = t?.id === live.teamA?.id ? live.scoreA : live.scoreB;
              return (
                <div key={side} className="flex items-center gap-3">
                  <TeamLogo url={t?.logoUrl} name={t?.name} size={72} />
                  <div>
                    <p className="font-display text-4xl uppercase leading-none">{t?.name}</p>
                    <div className="mt-1 flex items-center gap-3">
                      <SeriesPips format={live.format} wins={wins} color={SIDE_COLOR[side]} size={13} />
                      <span className="font-display text-4xl leading-none">{wins}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </Glass>
        )}

        {/* Now playing */}
        {clip && (
          <div className="absolute bottom-24 right-20 flex items-center gap-3 rounded-xl bg-ink-950/80 px-5 py-3">
            <Film className="h-6 w-6 text-crimson-400" />
            <div>
              <p className="font-cond text-sm font-semibold uppercase tracking-[0.3em] text-white/50">Now playing · {(index % playlist.length) + 1}/{playlist.length}</p>
              <p className="max-w-[560px] truncate font-display text-3xl uppercase leading-none">
                {clipIsReplay && <span className="mr-2 rounded bg-crimson-600 px-1.5 py-0.5 align-middle font-cond text-base tracking-widest">Replay</span>}
                {clip.title}
              </p>
            </div>
          </div>
        )}

        {flag(q, 'casters', false) && live.casters.length > 0 && (
          <div className="absolute inset-x-0 bottom-4 flex justify-center">
            <CasterStrip casters={live.casters} />
          </div>
        )}
      </div>
    </OverlayStage>
  );
}
