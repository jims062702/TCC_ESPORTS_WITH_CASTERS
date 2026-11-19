import { safeLocalGet, safeLocalSet } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Automatic gold difference — reads the gold numbers straight from the game.
//
// Every few seconds the controller grabs a still frame of the game feed from OBS
// (obs-websocket GetSourceScreenshot), crops the spot(s) you marked once where
// the spectator UI shows the team gold (or the gold difference), and reads the
// digits with Tesseract OCR running in the browser (free, no account). Glitchy
// reads are ignored; the manual slider always stays available as an override.
// ─────────────────────────────────────────────────────────────────────────────

/** Normalised rectangle (0–1 of the frame), so it works at any capture size. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface GoldReaderSettings {
  enabled: boolean;
  /** OBS scene or source holding the game capture. */
  source: string;
  /** 'teams' = two numbers (blue total, red total); 'diff' = one number (the difference) + its colour. */
  mode: 'teams' | 'diff';
  blue?: Rect;
  red?: Rect;
  diff?: Rect;
  intervalSec: number;
  /** The game shows red on the left / colours reversed. */
  flip: boolean;
}

const KEY = 'tcc-gold-reader';
export const DEFAULT_GOLD_READER: GoldReaderSettings = { enabled: false, source: 'Game Feed', mode: 'teams', intervalSec: 5, flip: false };
export const loadGoldReader = () => safeLocalGet(KEY, DEFAULT_GOLD_READER);
export const saveGoldReader = (s: GoldReaderSettings) => safeLocalSet(KEY, s);
export const goldReaderReady = (s: GoldReaderSettings) => (s.mode === 'teams' ? Boolean(s.blue && s.red) : Boolean(s.diff));

/** "12.3k" → 12300, "12,345" → 12345, "9.8K" → 9800, junk → null. */
export function parseGold(text: string): number | null {
  const t = text.replace(/\s+/g, '').replace(/[oO]/g, '0').replace(/[lI|]/g, '1').replace(/[^0-9.,kK]/g, '');
  const k = t.match(/(\d{1,3}(?:[.,]\d{1,2})?)[kK]/);
  if (k) return Math.round(Number(k[1].replace(',', '.')) * 1000);
  const digits = t.replace(/[.,]/g, '');
  if (!/^\d{1,6}$/.test(digits)) return null;
  return Number(digits);
}

let workerPromise: Promise<import('tesseract.js').Worker> | null = null;
async function ocrWorker() {
  workerPromise ??= (async () => {
    const T = await import('tesseract.js');
    const worker = await T.createWorker('eng');
    await worker.setParameters({ tessedit_char_whitelist: '0123456789.,kK', tessedit_pageseg_mode: T.PSM.SINGLE_LINE });
    return worker;
  })();
  return workerPromise;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not read the OBS frame'));
    img.src = src;
  });
}

/** Crop, upscale ×3 and turn bright text into black-on-white for the OCR. */
export function preparedCrop(img: HTMLImageElement, r: Rect, scale = 3): HTMLCanvasElement {
  const sx = Math.max(0, Math.round(r.x * img.naturalWidth));
  const sy = Math.max(0, Math.round(r.y * img.naturalHeight));
  const sw = Math.max(2, Math.round(r.w * img.naturalWidth));
  const sh = Math.max(2, Math.round(r.h * img.naturalHeight));
  const c = document.createElement('canvas');
  c.width = sw * scale;
  c.height = sh * scale;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = true;
  g.drawImage(img, sx, sy, sw, sh, 0, 0, c.width, c.height);
  const data = g.getImageData(0, 0, c.width, c.height);
  const px = data.data;
  // Otsu threshold on luminance: spectator numbers are bright on a dark bar.
  const hist = new Array(256).fill(0);
  const lum = new Uint8Array(px.length / 4);
  for (let i = 0; i < lum.length; i++) {
    const l = Math.round(0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]);
    lum[i] = l;
    hist[l]++;
  }
  let sum = 0;
  for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let threshold = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = lum.length - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      threshold = t;
    }
  }
  // Text is whichever side of the threshold is the minority (usually the bright digits).
  const bright = lum.reduce((n, l) => n + (l > threshold ? 1 : 0), 0);
  const textIsBright = bright < lum.length / 2;
  for (let i = 0; i < lum.length; i++) {
    const isText = textIsBright ? lum[i] > threshold : lum[i] <= threshold;
    const v = isText ? 0 : 255;
    px[i * 4] = px[i * 4 + 1] = px[i * 4 + 2] = v;
    px[i * 4 + 3] = 255;
  }
  g.putImageData(data, 0, 0);
  return c;
}

/** Which team colour the bright pixels in a box lean to (for difference mode). */
export function dominantSide(img: HTMLImageElement, r: Rect): 'blue' | 'red' | null {
  const c = document.createElement('canvas');
  c.width = Math.max(2, Math.round(r.w * img.naturalWidth));
  c.height = Math.max(2, Math.round(r.h * img.naturalHeight));
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, r.x * img.naturalWidth, r.y * img.naturalHeight, c.width, c.height, 0, 0, c.width, c.height);
  const px = g.getImageData(0, 0, c.width, c.height).data;
  let rs = 0;
  let bs = 0;
  let n = 0;
  for (let i = 0; i < px.length; i += 4) {
    const l = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    if (l < 90) continue;
    rs += px[i];
    bs += px[i + 2];
    n++;
  }
  if (!n) return null;
  const diff = (bs - rs) / n;
  return diff > 18 ? 'blue' : diff < -18 ? 'red' : null;
}

async function readBox(img: HTMLImageElement, r: Rect) {
  const worker = await ocrWorker();
  const { data } = await worker.recognize(preparedCrop(img, r));
  return { text: data.text.trim(), value: parseGold(data.text), confidence: data.confidence };
}

export interface GoldReading {
  /** + = blue ahead. */
  diff: number;
  blue?: number;
  red?: number;
  text: string;
  confidence: number;
}

/** Read the gold difference from one frame (PNG data URL). Throws when unreadable. */
export async function readGold(frame: string, s: GoldReaderSettings): Promise<GoldReading> {
  const img = await loadImage(frame);
  if (s.mode === 'teams') {
    if (!s.blue || !s.red) throw new Error('Mark the blue and red gold boxes first');
    const [a, b] = await Promise.all([readBox(img, s.blue), readBox(img, s.red)]);
    if (a.value === null || b.value === null) throw new Error(`Could not read the numbers ("${a.text}" / "${b.text}")`);
    const [blue, red] = s.flip ? [b.value, a.value] : [a.value, b.value];
    if (blue > 250_000 || red > 250_000) throw new Error('Reading out of range');
    return { diff: blue - red, blue, red, text: `${a.text} | ${b.text}`, confidence: Math.min(a.confidence, b.confidence) };
  }
  if (!s.diff) throw new Error('Mark the gold-difference box first');
  const r = await readBox(img, s.diff);
  if (r.value === null) throw new Error(`Could not read the number ("${r.text}")`);
  if (r.value > 80_000) throw new Error('Reading out of range');
  let side = dominantSide(img, s.diff);
  if (s.flip && side) side = side === 'blue' ? 'red' : 'blue';
  if (r.value !== 0 && !side) throw new Error('Could not tell which team is ahead (colour)');
  return { diff: side === 'red' ? -r.value : r.value, text: r.text, confidence: r.confidence };
}

/**
 * Glitch filter: accept a reading when it is close to the last accepted one, or
 * when the same big jump is read twice in a row (a real swing after a teamfight).
 */
export class GoldFilter {
  private last: number | null = null;
  private pending: number | null = null;
  accept(value: number): boolean {
    if (this.last === null || Math.abs(value - this.last) <= 6000) {
      this.last = value;
      this.pending = null;
      return true;
    }
    if (this.pending !== null && Math.abs(value - this.pending) <= 1500) {
      this.last = value;
      this.pending = null;
      return true;
    }
    this.pending = value;
    return false;
  }
  reset() {
    this.last = null;
    this.pending = null;
  }
}
