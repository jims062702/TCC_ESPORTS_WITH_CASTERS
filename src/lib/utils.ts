export type ClassValue = string | false | null | undefined | 0;

/** Tiny classnames helper (no dependency needed). */
export const cn = (...classes: ClassValue[]) => classes.filter(Boolean).join(' ');

export const uid = (prefix = '') =>
  `${prefix}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?';

/** 2450 → "2.5k", 800 → "800" */
export const formatGold = (gold: number) => {
  const abs = Math.abs(gold);
  if (abs >= 1000) return `${(abs / 1000).toFixed(abs >= 10000 ? 0 : 1).replace(/\.0$/, '')}k`;
  return String(abs);
};

export const kdaRatio = (k: number, d: number, a: number) => (k + a) / Math.max(1, d);

export const formatKda = (k: number, d: number, a: number) => kdaRatio(k, d, a).toFixed(2);

export const formatDuration = (sec: number) => {
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
};

export const formatDateTime = (ms: number | null | undefined) => {
  if (!ms) return 'TBA';
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

export const timeAgo = (ms: number) => {
  const diff = Math.round((Date.now() - ms) / 1000);
  if (diff < 5) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
};

export const pickRandom = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

export const shuffle = <T,>(arr: readonly T[]): T[] => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * Read a saved value. Objects are merged over the defaults (new settings keep
 * their default); arrays, numbers, strings and booleans come back as saved —
 * a value of the wrong shape falls back to the default.
 */
export const safeLocalGet = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed: unknown = JSON.parse(raw);
    if (isPlainObject(fallback)) return (isPlainObject(parsed) ? { ...fallback, ...parsed } : fallback) as T;
    if (Array.isArray(fallback)) return (Array.isArray(parsed) ? parsed : fallback) as T;
    if (fallback === null || fallback === undefined) return parsed as T;
    return (typeof parsed === typeof fallback ? parsed : fallback) as T;
  } catch {
    return fallback;
  }
};

export const safeLocalSet = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — ignore */
  }
};

export const SIDE_LABEL = { blue: 'Blue', red: 'Red' } as const;

/** JSON with sorted object keys — for comparing data that Firestore may return with keys in a different order. */
export function stableJson(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === 'object' && !Array.isArray(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, (v as Record<string, unknown>)[k]])) : v,
  );
}
