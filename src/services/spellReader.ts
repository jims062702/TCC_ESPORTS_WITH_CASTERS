import type { Side } from '@/types';
import { safeLocalGet, safeLocalSet } from '@/lib/utils';
import type { Rect } from './goldReader';

// ─────────────────────────────────────────────────────────────────────────────
// Automatic battle spell cooldowns — read straight from the game feed.
//
// Like the gold reader: the controller grabs a still frame of the game from OBS
// about once a second and looks at the battle spell icon of each player in the
// spectator UI (the 10 boxes you mark once). A spell on cooldown is drawn dark
// (grey sweep + countdown), so the icon's brightness drops well below what it
// was when every spell was ready (the calibration). Dark → the spell was used:
// its cooldown starts on the overlay and the casters call it. Bright again →
// the cooldown ended in the game, so the overlay timer ends there too.
// ─────────────────────────────────────────────────────────────────────────────

export type SpellSlot = `${Side}${0 | 1 | 2 | 3 | 4}`;
export const SPELL_SLOTS: SpellSlot[] = ['blue0', 'blue1', 'blue2', 'blue3', 'blue4', 'red0', 'red1', 'red2', 'red3', 'red4'];

export interface SpellReaderSettings {
  enabled: boolean;
  /** OBS scene or source holding the game capture. */
  source: string;
  /** Box around each player's battle spell icon (screen order, top to bottom). */
  slots: Partial<Record<SpellSlot, Rect>>;
  /** Icon brightness with the spell ready (from "Calibrate"). */
  baseline: Partial<Record<SpellSlot, number>>;
  /** Darker than this share of the ready brightness = on cooldown. */
  cooldownBelow: number;
  /** Brighter than this share = ready. */
  readyAbove: number;
}

const KEY = 'tcc-spell-reader';
export const DEFAULT_SPELL_READER: SpellReaderSettings = { enabled: false, source: 'Game Feed', slots: {}, baseline: {}, cooldownBelow: 0.62, readyAbove: 0.82 };
export const loadSpellReader = (): SpellReaderSettings => safeLocalGet(KEY, DEFAULT_SPELL_READER);
export const saveSpellReader = (s: SpellReaderSettings) => safeLocalSet(KEY, s);

/** Slots that are marked and calibrated. */
export const readySlots = (s: SpellReaderSettings) => SPELL_SLOTS.filter((k) => s.slots[k] && s.baseline[k]);
export const spellReaderReady = (s: SpellReaderSettings) => readySlots(s).length >= 2;

export const slotSide = (k: SpellSlot): Side => (k.startsWith('blue') ? 'blue' : 'red');
export const slotIndex = (k: SpellSlot) => Number(k.slice(-1));

/** Average brightness (0–255) of a box in the frame. */
export function boxBrightness(img: CanvasImageSource & { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number }, r: Rect): number {
  const W = (img.naturalWidth || (img.width as number)) ?? 0;
  const H = (img.naturalHeight || (img.height as number)) ?? 0;
  const w = Math.max(2, Math.round(r.w * W));
  const h = Math.max(2, Math.round(r.h * H));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, r.x * W, r.y * H, w, h, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  let sum = 0;
  for (let i = 0; i < px.length; i += 4) sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
  return sum / (px.length / 4);
}

export type SpellState = 'ready' | 'cooldown' | null;

/** Ready / cooldown / unsure for a brightness compared with the calibrated ready brightness. */
export function spellStateOf(brightness: number, baseline: number, s: Pick<SpellReaderSettings, 'cooldownBelow' | 'readyAbove'>): SpellState {
  if (!baseline) return null;
  const ratio = brightness / baseline;
  if (ratio < s.cooldownBelow) return 'cooldown';
  if (ratio > s.readyAbove) return 'ready';
  return null;
}

export interface SlotReading {
  slot: SpellSlot;
  brightness: number;
  ratio: number;
  state: SpellState;
}

/** Read every calibrated slot in one frame. */
export function readSpells(img: HTMLImageElement, s: SpellReaderSettings): SlotReading[] {
  return readySlots(s).map((slot) => {
    const brightness = boxBrightness(img, s.slots[slot]!);
    const base = s.baseline[slot]!;
    return { slot, brightness, ratio: base ? brightness / base : 0, state: spellStateOf(brightness, base, s) };
  });
}

/**
 * Turns frame-by-frame readings into actions. A change counts only after two
 * readings in a row agree, and a frame where most icons go dark at once (a
 * scene cut, the spectator UI hiding) is ignored.
 */
export class SpellTracker {
  private streak = new Map<SpellSlot, { state: Exclude<SpellState, null>; n: number }>();

  /** Slots whose state just changed (confirmed by two readings in a row). */
  update(readings: SlotReading[]): { slot: SpellSlot; state: 'ready' | 'cooldown' }[] {
    const darkNow = readings.filter((r) => r.state === 'cooldown').length;
    // Most icons dark in one frame → not real spell use (UI hidden / scene change).
    if (readings.length >= 6 && darkNow >= Math.ceil(readings.length * 0.8)) return [];
    const changes: { slot: SpellSlot; state: 'ready' | 'cooldown' }[] = [];
    for (const r of readings) {
      if (!r.state) continue;
      const prev = this.streak.get(r.slot);
      const next = prev && prev.state === r.state ? { state: r.state, n: prev.n + 1 } : { state: r.state, n: 1 };
      this.streak.set(r.slot, next);
      if (next.n === 2) changes.push({ slot: r.slot, state: r.state });
    }
    return changes;
  }

  reset() {
    this.streak.clear();
  }
}

/** Fill boxes 3–5 of a side from boxes 1 and 2 (the icons are evenly spaced). */
export function fillSlots(slots: Partial<Record<SpellSlot, Rect>>, side: Side): Partial<Record<SpellSlot, Rect>> {
  const a = slots[`${side}0` as SpellSlot];
  const b = slots[`${side}1` as SpellSlot];
  if (!a || !b) return slots;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const out = { ...slots };
  for (let i = 2; i < 5; i++) out[`${side}${i}` as SpellSlot] = { x: a.x + dx * i, y: a.y + dy * i, w: a.w, h: a.h };
  return out;
}
