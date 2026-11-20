import type { Side } from '@/types';
import { createHighlight } from './db';
import { isCloudinaryConfigured, uploadToCloudinary, videoPoster } from './cloudinary';
import { safeLocalGet, safeLocalSet } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Instant replays → highlights / break loop.
//
// OBS saves every replay as a file on the streaming PC. The browser can't read
// that folder on its own, so the operator connects it ONCE (Edge/Chrome folder
// access, remembered in this browser). After that one click on "Save as
// highlight" (or auto-save) uploads the clip to Cloudinary and adds it to the
// Highlights list — and to the break loop if wanted.
// ─────────────────────────────────────────────────────────────────────────────

export interface RecentReplay {
  id: string;
  title: string;
  description: string;
  side: Side | null;
  /** Full path OBS saved the clip to. */
  path: string;
  matchId: string | null;
  label: string;
  at: number;
  /** Set once uploaded. */
  highlightUrl?: string;
}

const KEY = 'tcc.recentReplays';
const listeners = new Set<() => void>();
let cache: RecentReplay[] | null = null;

export const recentReplays = (): RecentReplay[] => {
  if (!cache) {
    const saved = safeLocalGet<RecentReplay[]>(KEY, []);
    cache = Array.isArray(saved) ? saved.filter((r) => r && typeof r.path === 'string') : [];
  }
  return cache;
};
function save(list: RecentReplay[]) {
  cache = list.slice(0, 25);
  safeLocalSet(KEY, cache);
  listeners.forEach((l) => l());
}
export const subscribeReplays = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
// Keep every open admin tab in sync (the replay may be triggered in another tab).
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    cache = null;
    listeners.forEach((l) => l());
  });
}
export const addRecentReplay = (r: RecentReplay) => save([r, ...recentReplays().filter((x) => x.id !== r.id)]);
export const markReplaySaved = (id: string, highlightUrl: string) => save(recentReplays().map((r) => (r.id === id ? { ...r, highlightUrl } : r)));
export const forgetReplay = (id: string) => save(recentReplays().filter((r) => r.id !== id));

export const fileNameOf = (path: string) => path.split(/[\\/]/).pop() ?? path;

// ── Folder access (File System Access API, remembered in IndexedDB) ─────────

type DirHandle = FileSystemDirectoryHandle & {
  queryPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
  requestPermission?: (d: { mode: 'read' }) => Promise<PermissionState>;
};

export const folderAccessSupported = () => typeof window !== 'undefined' && 'showDirectoryPicker' in window;

function idb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('tcc-esports', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('handles');
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
async function idbGet<T>(key: string): Promise<T | null> {
  try {
    const db = await idb();
    return await new Promise((resolve) => {
      const req = db.transaction('handles').objectStore('handles').get(key);
      req.onsuccess = () => resolve((req.result as T) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}
async function idbSet(key: string, value: unknown) {
  const db = await idb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('handles', 'readwrite');
    tx.objectStore('handles').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export const getReplayFolder = () => idbGet<DirHandle>('obsReplayFolder');

/** Ask for OBS's replay folder once (Settings → Output → Recording Path in OBS). */
export async function connectReplayFolder(): Promise<string> {
  const pick = (window as unknown as { showDirectoryPicker: (o: object) => Promise<DirHandle> }).showDirectoryPicker;
  const dir = await pick({ id: 'obs-replays', mode: 'read' });
  await idbSet('obsReplayFolder', dir);
  return dir.name;
}

/** Folder permission for this visit (needs a click the first time after a reload). */
export async function folderReady(dir: DirHandle, ask: boolean): Promise<boolean> {
  const state = (await dir.queryPermission?.({ mode: 'read' })) ?? 'granted';
  if (state === 'granted') return true;
  if (!ask) return false;
  return ((await dir.requestPermission?.({ mode: 'read' })) ?? 'denied') === 'granted';
}

// ── Local replay files (served by the local dev server — no folder permission needed) ──

/** Where this computer serves a replay file (the break overlay in OBS plays it from here too). */
export const localReplayUrl = (path: string) => {
  const origin = typeof window !== 'undefined' ? window.location.origin.replace('//localhost', '//127.0.0.1') : '';
  return `${origin}/__replay-file?path=${encodeURIComponent(path)}`;
};

/** The replay file straight from OBS's folder via the local server (null when not running locally). */
export async function fetchLocalReplay(path: string): Promise<File | null> {
  try {
    const res = await fetch(localReplayUrl(path), { cache: 'no-store' });
    const type = res.headers.get('content-type') ?? '';
    if (!res.ok || !type.startsWith('video/')) return null;
    const blob = await res.blob();
    return new File([blob], fileNameOf(path), { type: type.split(';')[0] });
  } catch {
    return null;
  }
}

/** The replay file OBS saved: from the local server first, else from the connected folder. */
export async function readReplayFile(path: string, ask = true): Promise<File> {
  const local = await fetchLocalReplay(path);
  if (local) return local;
  const dir = await getReplayFolder();
  if (!dir) throw new Error('Connect your OBS replay folder first.');
  if (!(await folderReady(dir, ask))) throw new Error('Allow access to the replay folder (click "Save" again and choose Allow).');
  const name = fileNameOf(path);
  try {
    return await (await dir.getFileHandle(name)).getFile();
  } catch {
    throw new Error(`"${name}" isn't in the connected folder "${dir.name}". Connect the folder OBS saves replays to.`);
  }
}

export type ReplaySaveResult = 'cloud' | 'local' | 'needs-click';

/**
 * Save a replay OBS just recorded as a highlight (and into the break loop):
 * uploaded to Cloudinary for the website; if that isn't possible, the break
 * screen still plays it straight from this computer.
 */
export async function saveReplay(r: RecentReplay, opts: { inPlaylist: boolean; order: number; ask: boolean; onProgress?: (pct: number) => void }): Promise<ReplaySaveResult> {
  const title = `${r.title} — ${r.label}`;
  const local = await fetchLocalReplay(r.path);
  let file: File | null = local;
  if (!file) {
    try {
      file = await readReplayFile(r.path, opts.ask);
    } catch (e) {
      if (/Allow access/.test((e as Error).message) && !opts.ask) return 'needs-click';
      throw e;
    }
  }
  let cloudError: Error | null = null;
  if (isCloudinaryConfigured) {
    try {
      const url = await saveReplayAsHighlight(file, { title, matchId: r.matchId, inPlaylist: opts.inPlaylist, order: opts.order }, opts.onProgress);
      markReplaySaved(r.id, url);
      return 'cloud';
    } catch (e) {
      cloudError = e as Error;
    }
  }
  if (local) {
    // Break screen plays it from this PC (not shown on the public website).
    const url = localReplayUrl(r.path);
    await createHighlight({ title, videoUrl: url, thumbnailUrl: '', matchId: r.matchId, inPlaylist: opts.inPlaylist, showOnSite: false, order: opts.order });
    markReplaySaved(r.id, url);
    if (cloudError) console.warn('Cloudinary upload failed, using the local file:', cloudError.message);
    return 'local';
  }
  throw cloudError ?? new Error('Cloudinary is not configured');
}

/** Replay files already in OBS's folder (local server only), as entries for the replay list. */
export async function findSavedReplays(dir: string): Promise<RecentReplay[]> {
  const origin = window.location.origin.replace('//localhost', '//127.0.0.1');
  const res = await fetch(`${origin}/__replay-list?dir=${encodeURIComponent(dir)}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(res.status === 404 ? `OBS's folder "${dir}" was not found on this computer` : 'Finding replays works when the site runs on this computer (npm run dev)');
  const files = (await res.json()) as { path: string; name: string; mtime: number }[];
  return files.map((f) => ({
    id: `file-${f.name}`,
    title: `Instant replay · ${new Date(f.mtime).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`,
    description: '',
    side: null,
    path: f.path,
    matchId: null,
    label: 'Saved in OBS',
    at: f.mtime,
  }));
}

/** True for a highlight that plays from this computer (an instant replay not uploaded). */
export const isLocalClip = (url: string) => url.includes('/__replay-file?');

/** Upload a replay clip and add it to Highlights (and the break loop). */
export async function saveReplayAsHighlight(
  file: File,
  info: { title: string; matchId: string | null; inPlaylist: boolean; order: number },
  onProgress?: (pct: number) => void,
): Promise<string> {
  const res = await uploadToCloudinary(file, { folder: 'replays', resourceType: 'video', onProgress });
  await createHighlight({
    title: info.title,
    videoUrl: res.url,
    thumbnailUrl: videoPoster(res.url),
    matchId: info.matchId,
    inPlaylist: info.inPlaylist,
    showOnSite: true,
    ...(res.duration ? { durationSec: Math.round(res.duration) } : {}),
    order: info.order,
  });
  return res.url;
}
