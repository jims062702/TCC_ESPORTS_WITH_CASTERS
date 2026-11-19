import { useEffect, useRef } from 'react';
import type { Banner, EventType, ReplayState } from '@/types';
import { breakMusic, playStinger, type Stinger } from './sound';
import { flag } from './query';

/** Overlay sound settings from the URL: ?sound=0 mutes, ?vol=0.5 sets the level (0–1). */
export function soundOptions(q: URLSearchParams, demo: boolean) {
  const vol = Math.min(1, Math.max(0, Number(q.get('vol') ?? 0.8) || 0));
  return { on: flag(q, 'sound', !demo) && vol > 0, vol };
}

/** A banner of this type that just appeared (ignores old banners when an overlay reloads). */
const freshBanner = (banner: Banner | null, type: EventType) => (banner && banner.type === type && Date.now() - banner.at < 6000 ? banner.id : null);

/** Play a stinger once each time a new banner of `type` appears. */
export function useBannerStinger(banner: Banner | null, type: EventType, kind: Stinger, on: boolean, vol: number, delayMs = 350) {
  const key = freshBanner(banner, type);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (!key || key === last.current) return;
    last.current = key;
    if (!on) return;
    // Small delay so OBS has switched to this scene before the sound starts.
    const t = setTimeout(() => playStinger(kind, vol), delayMs);
    return () => clearTimeout(t);
  }, [key, kind, on, vol, delayMs]);
}

/** Whoosh into the instant replay and back to the live game (played by the HUD, which stays on air in both). */
export function useReplayStingers(replay: ReplayState, now: number, on: boolean, vol: number) {
  const playing = replay.active && now < replay.endsAt && now - replay.startedAt < 60_000;
  const was = useRef(playing);
  useEffect(() => {
    if (playing === was.current) return;
    was.current = playing;
    if (!on) return;
    if (playing && Date.now() - replay.startedAt < 5000) playStinger('replayIn', vol);
    if (!playing) playStinger('replayOut', vol);
  }, [playing, on, vol, replay.startedAt]);
}

/** Intense break music (5:00 track, loops) while `active`. */
export function useBreakMusic(active: boolean, vol: number) {
  useEffect(() => {
    if (active) breakMusic.start(vol * 0.75);
    else breakMusic.stop();
  }, [active, vol]);
  useEffect(() => () => breakMusic.stop(0.3), []);
}
