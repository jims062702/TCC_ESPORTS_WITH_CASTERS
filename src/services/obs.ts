import { useSyncExternalStore } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import type { LivePhase } from '@/types';
import { STORAGE_KEYS } from '@/lib/constants';
import { safeLocalGet, safeLocalSet } from '@/lib/utils';
import { REPLAY_PIP, REPLAY_ZOOM } from '@/overlay/layout';

// ─────────────────────────────────────────────────────────────────────────────
// Optional OBS Studio bridge (obs-websocket v5, built into OBS 28+).
// One click on "Instant Replay" in the controller can:
//   1. SaveReplayBuffer (last 10 s, set in OBS → Settings → Output → Replay Buffer)
//   2. load the saved file into the replay Media Source
//   3. cut to the replay scene (with the In-game HUD scene shown small on the
//      right), then cut back to the In-game HUD the moment the clip ends
// Without OBS connected, the operator presses the Replay Buffer hotkey manually
// and the overlay still shows the INSTANT REPLAY frame + casters narrate.
// ─────────────────────────────────────────────────────────────────────────────

export interface ObsSettings {
  url: string;
  password: string;
  replayScene: string;
  replaySource: string;
  /** The live-game scene (game capture + /overlay/hud). Shown small during replays and cut back to afterwards. */
  hudScene: string;
  /** Advanced: a different source for the small live window. Blank = the In-game HUD scene. */
  pipSource: string;
  replaySeconds: number;
  autoSwitch: boolean;
  /** Scene shown while drafting (game feed + /overlay/draft). */
  draftScene: string;
  /** Scene shown during breaks (/overlay/break). */
  breakScene: string;
  /** Scene that holds your game capture once; nested in Draft and In-game HUD. */
  gameFeedScene: string;
  /** Switch OBS scenes automatically when the controller changes phase. */
  autoScenes: boolean;
  /** Reconnect to OBS automatically (any admin page, after a refresh, when OBS restarts). */
  autoConnect: boolean;
  /** Zoom transitions: the replay grows out of a small window, the live game zooms back in at the end. */
  replayZoom: boolean;
}

export const DEFAULT_OBS_SETTINGS: ObsSettings = {
  url: 'ws://127.0.0.1:4455',
  password: '',
  replayScene: 'Instant Replay',
  replaySource: 'Replay Media',
  hudScene: 'In-game HUD',
  pipSource: '',
  replaySeconds: 10,
  autoSwitch: true,
  draftScene: 'Draft',
  breakScene: 'Break',
  gameFeedScene: 'Game Feed',
  autoScenes: true,
  autoConnect: false,
  replayZoom: true,
};

export const loadObsSettings = (): ObsSettings => {
  const s = safeLocalGet(STORAGE_KEYS.obs, DEFAULT_OBS_SETTINGS) as ObsSettings & { returnScene?: string };
  // Older versions stored a "return to scene" — it becomes the In-game HUD scene.
  const { returnScene, ...rest } = s;
  if (returnScene && !localStorageHas('hudScene')) rest.hudScene = returnScene;
  return { ...DEFAULT_OBS_SETTINGS, ...rest };
};
function localStorageHas(field: string) {
  try {
    return field in JSON.parse(localStorage.getItem(STORAGE_KEYS.obs) || '{}');
  } catch {
    return false;
  }
}
/** What sits in the small LIVE window during replays. */
export const pipSourceOf = (s: ObsSettings) => s.pipSource || s.hudScene;

// One shared copy of the OBS settings for every panel (saved on this computer).
let shared: ObsSettings | null = null;
const settingsListeners = new Set<() => void>();
export const getObsSettings = (): ObsSettings => (shared ??= loadObsSettings());
export function updateObsSettings(patch: Partial<ObsSettings>) {
  shared = { ...getObsSettings(), ...patch };
  saveObsSettings(shared);
  settingsListeners.forEach((l) => l());
}
export function useObsSettings(): [ObsSettings, (patch: Partial<ObsSettings>) => void] {
  const s = useSyncExternalStore(
    (cb) => {
      settingsListeners.add(cb);
      return () => void settingsListeners.delete(cb);
    },
    getObsSettings,
  );
  return [s, updateObsSettings];
}

/** Which OBS scene goes with each controller phase. */
export function sceneForPhase(s: ObsSettings, phase: LivePhase): string | null {
  if (phase === 'draft') return s.draftScene || null;
  if (phase === 'ingame' || phase === 'postgame') return s.hudScene || null;
  if (phase === 'break') return s.breakScene || null;
  return null;
}

/** Browser-source URLs for each overlay. OBS uses 127.0.0.1 so it can't hit a different local app. */
export const overlayBase = () => window.location.origin.replace('//localhost', '//127.0.0.1');
export const OVERLAY_SOURCES = [
  { input: 'TCC Draft Overlay', path: '/overlay/draft', scene: 'draft' },
  { input: 'TCC HUD Overlay', path: '/overlay/hud', scene: 'hud' },
  { input: 'TCC Replay Overlay', path: '/overlay/replay', scene: 'replay' },
  { input: 'TCC Break Overlay', path: '/overlay/break', scene: 'break' },
  { input: 'TCC Casters Overlay', path: '/overlay/casters', scene: 'casters' },
] as const;
const browserSettings = (url: string) => ({ url, width: 1920, height: 1080, reroute_audio: true, shutdown: false, restart_when_active: false, fps_custom: false });
const mediaSettings = { is_local_file: true, local_file: '', close_when_inactive: true, restart_on_activate: true };

/**
 * An OBS scene collection (Scene Collection → Import) with every scene and
 * overlay ready: Game Feed (add your capture here once), Draft, In-game HUD,
 * Instant Replay (with the live In-game HUD window), Break and Casters.
 * Positions assume a 1920×1080 canvas.
 */
export function buildSceneCollection(s: ObsSettings, base: string, name = 'TCC Esports') {
  let n = 0;
  const uuid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`);
  type Src = { id: string; versioned_id: string; name: string; uuid: string; settings: Record<string, unknown> } & Record<string, unknown>;
  const sources: Src[] = [];
  const source = (id: string, nm: string, settings: Record<string, unknown>): Src => {
    const src: Src = { id, versioned_id: id, name: nm, uuid: uuid(), settings, enabled: true, muted: false, volume: 1, balance: 0.5, mixers: 255, sync: 0, flags: 0, monitoring_type: 0, private_settings: {}, filters: [], hotkeys: {} };
    sources.push(src);
    return src;
  };
  const item = (src: Src, id: number, extra: Record<string, unknown> = {}) => ({
    name: src.name, source_uuid: src.uuid, visible: true, locked: false, rot: 0, pos: { x: 0, y: 0 }, scale: { x: 1, y: 1 }, align: 5,
    bounds_type: 0, bounds_align: 0, bounds: { x: 0, y: 0 }, crop_left: 0, crop_top: 0, crop_right: 0, crop_bottom: 0, id,
    group_item_backup: false, scale_filter: 'disable', blend_method: 'default', blend_type: 'normal', show_transition: { duration: 0 }, hide_transition: { duration: 0 }, private_settings: {},
    ...extra,
  });
  // Items are listed bottom → top.
  const scene = (nm: string, children: [Src, Record<string, unknown>?][]) =>
    source('scene', nm, { id_counter: children.length, custom_size: false, items: children.map(([c, extra], i) => item(c, i + 1, extra)) });
  const overlay = Object.fromEntries(OVERLAY_SOURCES.map((o) => [o.scene, source('browser_source', o.input, browserSettings(base + o.path))]));
  const media = source('ffmpeg_source', s.replaySource || 'Replay Media', mediaSettings);
  const feed = scene(s.gameFeedScene || 'Game Feed', []);
  scene(s.draftScene || 'Draft', [[feed], [overlay.draft]]);
  const hud = scene(s.hudScene || 'In-game HUD', [[feed], [overlay.hud]]);
  scene(s.replayScene || 'Instant Replay', [
    // The saved clip is often recorded at 1280×720 — always stretch it over the full canvas.
    [media, { bounds_type: 2, bounds_align: 0, bounds: { x: 1920, y: 1080 } }],
    [hud, { pos: { x: REPLAY_PIP.x, y: REPLAY_PIP.y }, bounds_type: 2, bounds_align: 0, bounds: { x: REPLAY_PIP.w, y: REPLAY_PIP.h } }],
    [overlay.replay],
  ]);
  scene(s.breakScene || 'Break', [[overlay.break]]);
  scene('Casters', [[overlay.casters]]);
  const order = [s.gameFeedScene || 'Game Feed', s.draftScene || 'Draft', s.hudScene || 'In-game HUD', s.replayScene || 'Instant Replay', s.breakScene || 'Break', 'Casters'];
  return {
    current_scene: order[1],
    current_program_scene: order[1],
    scene_order: order.map((nm) => ({ name: nm })),
    name,
    sources,
    groups: [],
    quick_transitions: [],
    transitions: [],
    saved_projectors: [],
    current_transition: 'Fade',
    transition_duration: 300,
    preview_locked: false,
    scaling_enabled: false,
    scaling_level: 0,
    scaling_off_x: 0,
    scaling_off_y: 0,
    modules: {},
  };
}
export const saveObsSettings = (s: ObsSettings) => safeLocalSet(STORAGE_KEYS.obs, s);

type Listener = (connected: boolean, error?: string) => void;
export type ObsStatus = 'connected' | 'connecting' | 'retrying' | 'offline';

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
const easeOut = (k: number) => 1 - Math.pow(1 - k, 3);
const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const lerpRect = (a: Rect, b: Rect, t: number): Rect => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, w: a.w + (b.w - a.w) * t, h: a.h + (b.h - a.h) * t });
/** Scene-item transform that fits a source into a rectangle (any source size). */
const rectTransform = (r: Rect) => ({
  positionX: r.x,
  positionY: r.y,
  alignment: 5, // top-left
  boundsType: 'OBS_BOUNDS_SCALE_INNER',
  boundsWidth: Math.max(2, r.w),
  boundsHeight: Math.max(2, r.h),
  boundsAlignment: 0,
  rotation: 0,
  cropLeft: 0,
  cropRight: 0,
  cropTop: 0,
  cropBottom: 0,
});

/** When the replay clip actually plays in OBS — so the overlay, sounds and casters line up with it. */
export interface ReplayTiming {
  playingAt: number;
  endsAt: number;
}

class ObsBridge {
  private obs = new OBSWebSocket();
  private listeners = new Set<Listener>();
  /** Pending "zoom back to the In-game HUD" after a replay (timer + media-ended listener). */
  private pendingReturn: { timer: ReturnType<typeof setTimeout>; off: () => void; scene: string; settings: ObsSettings; pipId: number | null } | null = null;
  private connecting: Promise<void> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retryDelay = 1500;
  private keeperOn = false;
  private closingOnPurpose = false;
  connected = false;
  status: ObsStatus = 'offline';
  lastError: string | null = null;

  constructor() {
    this.obs.on('ConnectionClosed', (e: { code?: number }) => {
      const was = this.connected;
      this.connected = false;
      if (this.closingOnPurpose) return this.emit();
      // OBS closed, restarted or the network blipped → keep trying in the background.
      if (was) this.lastError = 'OBS connection lost — reconnecting…';
      if (e?.code !== 4009) this.scheduleRetry();
      this.emit();
    });
  }

  /**
   * Every OBS request with a time limit — a request OBS never answers (busy,
   * half-closed socket) can't freeze the controller (e.g. the replay button).
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private call(method: string, params?: Record<string, unknown>, ms = 6000): Promise<any> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`OBS did not answer (${method})`)), ms);
      (this.obs.call(method as never, params as never) as Promise<unknown>).then(
        (v) => {
          clearTimeout(timer);
          resolve(v);
        },
        (e) => {
          clearTimeout(timer);
          reject(e);
        },
      );
    });
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private emit() {
    if (this.connected) this.status = 'connected';
    else if (this.connecting) this.status = 'connecting';
    else if (this.retryTimer) this.status = 'retrying';
    else this.status = 'offline';
    this.listeners.forEach((l) => l(this.connected, this.connected ? undefined : (this.lastError ?? undefined)));
  }

  /** Connect once (calls made while connecting share the same attempt). */
  connect(s: ObsSettings = getObsSettings()): Promise<void> {
    if (this.connected) return Promise.resolve();
    if (this.connecting) return this.connecting;
    this.clearRetry();
    this.connecting = (async () => {
      try {
        await this.obs.connect(s.url, s.password || undefined);
        this.connected = true;
        this.lastError = null;
        this.retryDelay = 1500;
        void this.recover(s);
      } catch (e) {
        const err = e as Error & { code?: number };
        this.connected = false;
        this.lastError = err.code === 4009 ? 'Wrong OBS WebSocket password' : err.message || 'Could not reach OBS';
        if (err.code !== 4009) queueMicrotask(() => this.scheduleRetry());
        throw e;
      } finally {
        this.connecting = null;
        this.emit();
      }
    })();
    this.emit();
    return this.connecting;
  }

  /**
   * Keep OBS connected for the whole admin session: connects on page load (so a
   * refresh reconnects by itself), retries while OBS is closed, and reconnects
   * when OBS restarts or the tab wakes up. Started once by the admin layout.
   */
  startKeeper() {
    if (this.keeperOn) return;
    this.keeperOn = true;
    if (getObsSettings().autoConnect && !this.connected) this.connect().catch(() => {});
    window.addEventListener('online', this.wake);
    document.addEventListener('visibilitychange', this.wake);
  }

  stopKeeper() {
    this.keeperOn = false;
    this.clearRetry();
    window.removeEventListener('online', this.wake);
    document.removeEventListener('visibilitychange', this.wake);
  }

  private wake = () => {
    if (this.connected || this.connecting || !this.keeperOn || !getObsSettings().autoConnect || document.visibilityState !== 'visible') return;
    this.clearRetry();
    this.retryDelay = 1500;
    this.connect().catch(() => {});
  };

  private scheduleRetry() {
    if (this.retryTimer || this.connected || this.connecting || !this.keeperOn || this.closingOnPurpose || !getObsSettings().autoConnect) return;
    const delay = this.retryDelay;
    this.retryDelay = Math.min(15_000, Math.round(this.retryDelay * 1.6));
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect().catch(() => {});
    }, delay);
    this.emit();
  }

  private clearRetry() {
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
  }

  /** The operator pressed Disconnect: close and stop reconnecting. */
  async disconnect() {
    updateObsSettings({ autoConnect: false });
    this.clearRetry();
    await this.close();
  }

  /** Close the socket but remember auto-connect (hot reload, page unload). */
  async close() {
    this.closingOnPurpose = true;
    try {
      await this.obs.disconnect();
    } catch {
      /* already closed */
    } finally {
      this.closingOnPurpose = false;
      this.connected = false;
      this.emit();
    }
  }

  /**
   * After a (re)connect: a refresh in the middle of a replay loses the timer
   * that cuts back to the game — if OBS is still on the replay scene, go back to
   * the In-game HUD and put the replay scene's layout back.
   */
  private async recover(s: ObsSettings) {
    try {
      if (this.pendingReturn) return;
      await this.resetReplayLayout(s).catch(() => {});
      const { currentProgramSceneName } = await this.call('GetCurrentProgramScene');
      if (s.autoSwitch && s.hudScene && currentProgramSceneName === s.replayScene) await this.switchScene(s.hudScene).catch(() => {});
    } catch {
      /* ignore */
    }
  }

  async listScenes(): Promise<string[]> {
    const res = await this.call('GetSceneList');
    return (res.scenes as { sceneName: string }[]).map((s) => s.sceneName).reverse();
  }

  /** Cut OBS to a scene (no-op if it doesn't exist or is already on air). */
  async switchScene(sceneName: string): Promise<boolean> {
    if (!this.connected || !sceneName) return false;
    const { currentProgramSceneName } = await this.call('GetCurrentProgramScene');
    if (currentProgramSceneName === sceneName) return true;
    if (!(await this.listScenes()).includes(sceneName)) throw new Error(`OBS has no scene named "${sceneName}"`);
    await this.call('SetCurrentProgramScene', { sceneName });
    return true;
  }

  /**
   * Build every scene in OBS for you (skips what already exists): Game Feed,
   * Draft, In-game HUD, Instant Replay (+ live HUD window), Break and Casters,
   * with the overlay browser sources pointing at this site. Returns a report.
   */
  async setupScenes(s: ObsSettings, base: string): Promise<string[]> {
    if (!this.connected) throw new Error('OBS is not connected');
    const report: string[] = [];
    const scenes = new Set(await this.listScenes());
    const inputs = new Set(await this.listInputs());
    type Item = { sceneItemId: number; sourceName: string };
    const items = async (sceneName: string) => (await this.call('GetSceneItemList', { sceneName })).sceneItems as unknown as Item[];
    const ensureScene = async (sceneName: string) => {
      if (scenes.has(sceneName)) return;
      await this.call('CreateScene', { sceneName });
      scenes.add(sceneName);
      report.push(`Created scene "${sceneName}"`);
    };
    const ensureSource = async (sceneName: string, inputName: string, inputKind: string, inputSettings: Record<string, unknown>) => {
      if (!inputs.has(inputName)) {
        await this.call('CreateInput', { sceneName, inputName, inputKind, inputSettings: inputSettings as never, sceneItemEnabled: true });
        inputs.add(inputName);
        report.push(`Added "${inputName}" to "${sceneName}"`);
        return;
      }
      if (inputKind === 'browser_source') await this.call('SetInputSettings', { inputName, inputSettings: inputSettings as never, overlay: true });
      if (!(await items(sceneName)).some((i) => i.sourceName === inputName)) {
        await this.call('CreateSceneItem', { sceneName, sourceName: inputName, sceneItemEnabled: true });
        report.push(`Added "${inputName}" to "${sceneName}"`);
      }
    };
    /** Nest a scene (e.g. Game Feed) at the bottom of another scene. */
    const ensureNestedAtBottom = async (sceneName: string, sourceName: string) => {
      let it = (await items(sceneName)).find((i) => i.sourceName === sourceName);
      if (!it) {
        const { sceneItemId } = await this.call('CreateSceneItem', { sceneName, sourceName, sceneItemEnabled: true });
        it = { sceneItemId, sourceName };
        report.push(`Put "${sourceName}" in "${sceneName}"`);
      }
      await this.call('SetSceneItemIndex', { sceneName, sceneItemId: it.sceneItemId, sceneItemIndex: 0 });
    };
    const url = (path: string) => browserSettings(base + path);

    const feed = s.gameFeedScene || 'Game Feed';
    await ensureScene(feed);
    await ensureScene(s.draftScene);
    await ensureSource(s.draftScene, 'TCC Draft Overlay', 'browser_source', url('/overlay/draft'));
    await ensureNestedAtBottom(s.draftScene, feed);
    await ensureScene(s.hudScene);
    await ensureSource(s.hudScene, 'TCC HUD Overlay', 'browser_source', url('/overlay/hud'));
    await ensureNestedAtBottom(s.hudScene, feed);
    await ensureScene(s.replayScene);
    await ensureSource(s.replayScene, s.replaySource, 'ffmpeg_source', mediaSettings);
    await ensureSource(s.replayScene, 'TCC Replay Overlay', 'browser_source', url('/overlay/replay'));
    // Replay video at the bottom, live In-game HUD window above it, replay frame on top.
    const media = (await items(s.replayScene)).find((i) => i.sourceName === s.replaySource);
    if (media) {
      await this.call('SetSceneItemIndex', { sceneName: s.replayScene, sceneItemId: media.sceneItemId, sceneItemIndex: 0 });
      await this.fitToCanvas(s.replayScene, s.replaySource);
    }
    report.push(await this.setupReplayPip({ ...s, pipSource: '' }));
    await ensureScene(s.breakScene);
    await ensureSource(s.breakScene, 'TCC Break Overlay', 'browser_source', url('/overlay/break'));
    await ensureScene('Casters');
    await ensureSource('Casters', 'TCC Casters Overlay', 'browser_source', url('/overlay/casters'));
    if (!report.length) report.push('Everything was already set up.');
    return report;
  }

  /**
   * Make a source fill the whole canvas (e.g. the replay clip, which OBS often
   * records at 1280×720 while the canvas is 1920×1080).
   */
  async fitToCanvas(sceneName: string, sourceName: string) {
    const { sceneItemId } = await this.call('GetSceneItemId', { sceneName, sourceName });
    const video = await this.call('GetVideoSettings');
    await this.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId,
      sceneItemTransform: {
        positionX: 0,
        positionY: 0,
        alignment: 5,
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsWidth: Number(video.baseWidth),
        boundsHeight: Number(video.baseHeight),
        boundsAlignment: 0,
        rotation: 0,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
      },
    });
  }

  /** A still frame of an OBS source/scene (PNG data URL) — used by the gold reader. */
  async screenshot(sourceName: string, width = 1280): Promise<string> {
    if (!this.connected) throw new Error('OBS is not connected');
    const res = await this.call('GetSourceScreenshot', { sourceName, imageFormat: 'png', imageWidth: width });
    return String(res.imageData);
  }

  /** The folder OBS saves recordings and replays to. */
  async recordDirectory(): Promise<string> {
    const res = await this.call('GetRecordDirectory');
    return String(res.recordDirectory ?? '');
  }

  async listInputs(): Promise<string[]> {
    const res = await this.call('GetInputList');
    return (res.inputs as { inputName: string }[]).map((i) => i.inputName);
  }

  /**
   * Live-game picture-in-picture for instant replays: adds the live game source
   * to the replay scene (if missing), fits it into the overlay's PiP window
   * (REPLAY_PIP, scaled to your OBS canvas) and layers it above the replay video
   * but below the /overlay/replay browser source. Returns a short summary.
   */
  async setupReplayPip(s: ObsSettings): Promise<string> {
    if (!this.connected) throw new Error('OBS is not connected');
    const source = pipSourceOf(s);
    if (!source) throw new Error('Enter your In-game HUD scene first');
    if (source === s.replayScene) throw new Error('The live game window cannot show the replay scene itself');
    const sceneName = s.replayScene;
    const [scenes, inputs] = await Promise.all([this.listScenes(), this.listInputs()]);
    if (!scenes.includes(sceneName)) throw new Error(`OBS has no scene named "${sceneName}" — create it or pick the right Replay scene`);
    if (!scenes.includes(source) && !inputs.includes(source)) throw new Error(`OBS has no scene or source named "${source}" — check the In-game HUD scene name`);
    type Item = { sceneItemId: number; sourceName: string; sceneItemIndex: number; inputKind?: string | null };
    const listItems = async () => ((await this.call('GetSceneItemList', { sceneName })).sceneItems as unknown as Item[]);

    let items = await listItems();
    let pip = items.find((i) => i.sourceName === source);
    if (!pip) {
      const { sceneItemId } = await this.call('CreateSceneItem', { sceneName, sourceName: source, sceneItemEnabled: true });
      items = await listItems();
      pip = items.find((i) => i.sceneItemId === sceneItemId)!;
    } else {
      await this.call('SetSceneItemEnabled', { sceneName, sceneItemId: pip.sceneItemId, sceneItemEnabled: true });
    }

    // Fit into the PiP window, scaled from the 1920×1080 overlay stage to the OBS canvas.
    const video = await this.call('GetVideoSettings');
    const sx = Number(video.baseWidth) / 1920;
    const sy = Number(video.baseHeight) / 1080;
    await this.call('SetSceneItemTransform', {
      sceneName,
      sceneItemId: pip.sceneItemId,
      sceneItemTransform: {
        positionX: REPLAY_PIP.x * sx,
        positionY: REPLAY_PIP.y * sy,
        alignment: 5, // top-left
        boundsType: 'OBS_BOUNDS_SCALE_INNER',
        boundsWidth: REPLAY_PIP.w * sx,
        boundsHeight: REPLAY_PIP.h * sy,
        boundsAlignment: 0, // centred inside the box
        rotation: 0,
        cropLeft: 0,
        cropRight: 0,
        cropTop: 0,
        cropBottom: 0,
      },
    });

    // Layering: replay media (bottom) < live PiP < replay overlay browser source (top).
    let overlay: Item | undefined;
    for (const it of items) {
      if (it.inputKind !== 'browser_source') continue;
      const { inputSettings } = await this.call('GetInputSettings', { inputName: it.sourceName });
      if (String((inputSettings as { url?: string }).url ?? '').includes('/overlay/replay')) overlay = it;
    }
    const media = items.find((i) => i.sourceName === s.replaySource);
    let layering = 'placed on top (no /overlay/replay browser source found in this scene — add it above the PiP)';
    if (overlay) {
      const target = pip.sceneItemIndex > overlay.sceneItemIndex ? overlay.sceneItemIndex : pip.sceneItemIndex;
      if (target !== pip.sceneItemIndex) await this.call('SetSceneItemIndex', { sceneName, sceneItemId: pip.sceneItemId, sceneItemIndex: target });
      layering = 'below the replay overlay';
    }
    if (media) {
      const now = await listItems();
      const p = now.find((i) => i.sceneItemId === pip!.sceneItemId)!;
      const m = now.find((i) => i.sceneItemId === media.sceneItemId)!;
      if (p.sceneItemIndex < m.sceneItemIndex) {
        await this.call('SetSceneItemIndex', { sceneName, sceneItemId: pip.sceneItemId, sceneItemIndex: m.sceneItemIndex });
      }
      layering += ' and above the replay video';
    }
    return `"${source}" fitted to ${Math.round(REPLAY_PIP.w * sx)}×${Math.round(REPLAY_PIP.h * sy)} at (${Math.round(REPLAY_PIP.x * sx)}, ${Math.round(REPLAY_PIP.y * sy)}) in "${sceneName}", ${layering}.`;
  }

  async ensureReplayBuffer() {
    const { outputActive } = await this.call('GetReplayBufferStatus');
    if (!outputActive) await this.call('StartReplayBuffer');
  }

  // ── zoom transitions ──────────────────────────────────────────────────────

  private async canvas() {
    const v = await this.call('GetVideoSettings');
    return { W: Number(v.baseWidth), H: Number(v.baseHeight) };
  }

  /** The live window during replays, scaled from the 1920×1080 overlay stage to the OBS canvas. */
  private pipRect(W: number, H: number): Rect {
    const sx = W / 1920;
    const sy = H / 1080;
    return { x: REPLAY_PIP.x * sx, y: REPLAY_PIP.y * sy, w: REPLAY_PIP.w * sx, h: REPLAY_PIP.h * sy };
  }

  private async itemId(sceneName: string, sourceName: string): Promise<number | null> {
    if (!sourceName) return null;
    try {
      return (await this.call('GetSceneItemId', { sceneName, sourceName })).sceneItemId;
    } catch {
      return null;
    }
  }

  private setRect(sceneName: string, sceneItemId: number, r: Rect) {
    return this.call('SetSceneItemTransform', { sceneName, sceneItemId, sceneItemTransform: rectTransform(r) as never });
  }

  /** Smoothly move/resize a scene item (~60 updates a second over the websocket). */
  private async animateRect(sceneName: string, sceneItemId: number, from: Rect, to: Rect, ms: number, ease: (k: number) => number) {
    const t0 = performance.now();
    for (;;) {
      const k = Math.min(1, (performance.now() - t0) / ms);
      await this.setRect(sceneName, sceneItemId, lerpRect(from, to, ease(k)));
      if (k >= 1) return;
      await wait(14);
    }
  }

  /** Replay video full screen, live window back in its box — the resting layout of the replay scene. */
  async resetReplayLayout(s: ObsSettings) {
    const { W, H } = await this.canvas();
    const media = await this.itemId(s.replayScene, s.replaySource);
    if (media !== null) await this.setRect(s.replayScene, media, { x: 0, y: 0, w: W, h: H });
    const pip = await this.itemId(s.replayScene, pipSourceOf(s));
    if (pip !== null) await this.setRect(s.replayScene, pip, this.pipRect(W, H));
  }

  /**
   * When the replay ends (epoch ms): the clip's real end from OBS, but never
   * later than the replay length after it started playing.
   */
  private async clipEnd(s: ObsSettings, playingAt: number): Promise<number> {
    const capEnd = playingAt + s.replaySeconds * 1000;
    for (let i = 0; i < 6; i++) {
      await wait(120);
      try {
        const st = (await this.call('GetMediaInputStatus', { inputName: s.replaySource })) as { mediaState?: string; mediaDuration?: number | null; mediaCursor?: number | null };
        if (st.mediaState === 'OBS_MEDIA_STATE_PLAYING' && st.mediaDuration && st.mediaDuration > 0) {
          return Math.min(capEnd, Date.now() + Math.max(1500, st.mediaDuration - (st.mediaCursor ?? 0)));
        }
        if (!st.mediaState) break; // this OBS doesn't report media status
      } catch {
        break;
      }
    }
    return capEnd;
  }

  /**
   * Back to the In-game HUD now (clip ending, or the operator ended it early):
   * the small live window zooms up to full screen, then OBS cuts to the HUD
   * scene — which looks identical, so the hand-off is seamless.
   */
  async endReplay(fast = false) {
    const pending = this.pendingReturn;
    if (!pending) return;
    this.clearPendingReturn();
    if (!this.connected) return;
    const s = pending.settings;
    try {
      if (s.replayZoom && pending.pipId !== null) {
        const { W, H } = await this.canvas();
        await this.animateRect(s.replayScene, pending.pipId, this.pipRect(W, H), { x: 0, y: 0, w: W, h: H }, fast ? REPLAY_ZOOM.outMs * 0.6 : REPLAY_ZOOM.outMs, easeInOut);
      }
    } catch {
      /* zoom is cosmetic — still cut back */
    }
    await this.call('SetCurrentProgramScene', { sceneName: pending.scene }).catch(() => {});
    // Restore the replay scene once it's off air (after the scene transition).
    setTimeout(() => void this.resetReplayLayout(s).catch(() => {}), 1200);
  }

  private clearPendingReturn() {
    if (!this.pendingReturn) return;
    clearTimeout(this.pendingReturn.timer);
    this.pendingReturn.off();
    this.pendingReturn = null;
  }

  /**
   * Zoom back to `scene` so the zoom finishes as the clip ends (or right away
   * if the clip ends early).
   */
  private scheduleReturn(s: ObsSettings, scene: string, endsAt: number, pipId: number | null) {
    this.clearPendingReturn();
    const startedAt = Date.now();
    const lead = s.replayZoom && pipId !== null ? REPLAY_ZOOM.outMs : 0;
    const onEnded = (e: { inputName: string }) => {
      // Ignore a stray "ended" from the previous clip while the new one restarts.
      if (e.inputName === s.replaySource && Date.now() - startedAt > 1500) void this.endReplay(true);
    };
    this.obs.on('MediaInputPlaybackEnded', onEnded);
    this.pendingReturn = {
      scene,
      settings: s,
      pipId,
      off: () => this.obs.off('MediaInputPlaybackEnded', onEnded),
      timer: setTimeout(() => void this.endReplay(), Math.max(0, endsAt - lead - Date.now())),
    };
  }

  /**
   * Save the last N seconds and play them back: the clip zooms out of a small
   * window (the size of the live window) to full screen, and near the end the
   * live game zooms back in. `onPlaying` reports when the clip really plays.
   * Resolves with the saved file path.
   */
  async playInstantReplay(s: ObsSettings, onPlaying?: (t: ReplayTiming) => void, onSaved?: (path: string) => void): Promise<string> {
    if (!this.connected) throw new Error('OBS is not connected');
    await this.ensureReplayBuffer();
    const { currentProgramSceneName } = await this.call('GetCurrentProgramScene');

    const saved = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.obs.off('ReplayBufferSaved', handler);
        reject(new Error('OBS did not confirm the replay save in time'));
      }, 8000);
      const handler = (e: { savedReplayPath: string }) => {
        clearTimeout(timer);
        this.obs.off('ReplayBufferSaved', handler);
        resolve(e.savedReplayPath);
      };
      this.obs.on('ReplayBufferSaved', handler);
    });
    await this.call('SaveReplayBuffer');
    const path = await saved;
    // The clip exists now — record it (highlights / break loop) even if a later step fails.
    try {
      onSaved?.(path);
    } catch {
      /* never block the replay */
    }

    await this.call('SetInputSettings', {
      inputName: s.replaySource,
      inputSettings: { local_file: path, is_local_file: true, restart_on_activate: true, close_when_inactive: true },
      overlay: true,
    });

    if (s.autoSwitch) {
      const previousBack = this.pendingReturn?.scene;
      this.clearPendingReturn();
      const { W, H } = await this.canvas();
      const full = { x: 0, y: 0, w: W, h: H };
      const live = this.pipRect(W, H);
      // Start the clip as a small window in the middle, the same size as the live window.
      const small = { x: (W - live.w) / 2, y: (H - live.h) / 2, w: live.w, h: live.h };
      const mediaId = await this.itemId(s.replayScene, s.replaySource);
      const pipId = await this.itemId(s.replayScene, pipSourceOf(s));
      const zoom = s.replayZoom && mediaId !== null;
      if (mediaId !== null) await this.setRect(s.replayScene, mediaId, zoom ? small : full).catch(() => {});
      if (pipId !== null) await this.setRect(s.replayScene, pipId, live).catch(() => {});
      await this.call('SetCurrentProgramScene', { sceneName: s.replayScene });
      await this.obs
        .call('TriggerMediaInputAction', { inputName: s.replaySource, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' })
        .catch(() => {});
      const playingAt = Date.now();
      if (zoom) void this.animateRect(s.replayScene, mediaId!, small, full, REPLAY_ZOOM.inMs, easeOut).catch(() => {});
      // Back to the live game: the In-game HUD scene (or wherever we came from if it isn't set).
      const scenes = await this.listScenes().catch(() => [] as string[]);
      const hud = s.hudScene && scenes.includes(s.hudScene) ? s.hudScene : '';
      const back = hud || (currentProgramSceneName !== s.replayScene ? currentProgramSceneName : previousBack ?? currentProgramSceneName);
      const endsAt = await this.clipEnd(s, playingAt);
      onPlaying?.({ playingAt, endsAt });
      this.scheduleReturn(s, back, endsAt, pipId);
    } else {
      onPlaying?.({ playingAt: Date.now(), endsAt: Date.now() + s.replaySeconds * 1000 });
    }
    return path;
  }
}

export const obsBridge = new ObsBridge();

// Hot reload (dev): close the old connection so only one bridge talks to OBS.
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    obsBridge.stopKeeper();
    void obsBridge.close();
  });
}
