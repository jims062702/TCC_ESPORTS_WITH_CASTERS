import type { LiveState } from '@/types';

/** Elapsed game time in ms (stops while the clock is paused). */
export const gameElapsedMs = (live: Pick<LiveState, 'gameStartedAt' | 'clockPausedAt'>, now = Date.now()) =>
  live.gameStartedAt ? Math.max(0, (live.clockPausedAt ?? now) - live.gameStartedAt) : 0;

/** 754000 → "12:34" (and "1:02:03" past an hour). */
export function formatClock(ms: number) {
  const total = Math.floor(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return h ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : `${m}:${String(s).padStart(2, '0')}`;
}

/** "12:34" → 754, "754" → 754, invalid → null. */
export function parseClock(text: string): number | null {
  const t = text.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return Number(t);
  const parts = t.split(':').map((x) => Number(x));
  if (parts.some((x) => !Number.isFinite(x) || x < 0)) return null;
  return parts.reduce((acc, x) => acc * 60 + x, 0);
}
