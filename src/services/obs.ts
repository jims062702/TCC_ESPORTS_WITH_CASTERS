import { useSyncExternalStore } from 'react';
import OBSWebSocket from 'obs-websocket-js';
import type { LivePhase } from '@/types';
import { STORAGE_KEYS } from '@/lib/constants';
import { safeLocalGet, safeLocalSet } from '@/lib/utils';
import { REPLAY_PIP } from '@/overlay/layout';

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
  /** Reconnect to OBS automatically when the controller opens. */
  autoConnect: boolean;
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
};

export const loadObsSettings = (): ObsSettings => {
  const s = safeLocalGet(STORAGE_KEYS.obs, DEFAULT_OBS_SETTINGS) as ObsSettings & { returnScene?: string };
  // Older versions stored a "return to scene" — it becomes the In-game HUD scene.
  const { returnScene, ...rest } = s;
  if (returnScene && !localStorageHas('hudScene')) rest.hudScene = returnScene;
  return rest;
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

class ObsBridge {
  private obs = new OBSWebSocket();
  private listeners = new Set<Listener>();
  /** Pending "cut back to the In-game HUD" after a replay (timer + media-ended listener). */
  private pendingReturn: { timer: ReturnType<typeof setTimeout>; off: () => void; scene: string } | null = null;
  connected = false;

  constructor() {
    this.obs.on('ConnectionClosed', () => this.setConnected(false));
  }

  onChange(fn: Listener) {
    this.listeners.add(fn);
    return () => void this.listeners.delete(fn);
  }

  private setConnected(v: boolean, error?: string) {
    this.connected = v;
    this.listeners.forEach((l) => l(v, error));
  }

  async connect(s: ObsSettings) {
    try {
      await this.obs.connect(s.url, s.password || undefined);
      this.setConnected(true);
    } catch (e) {
      this.setConnected(false, (e as Error).message || 'Could not reach OBS');
      throw e;
    }
  }

  async disconnect() {
    await this.obs.disconnect();
    this.setConnected(false);
  }

  async listScenes(): Promise<string[]> {
    const res = await this.obs.call('GetSceneList');
    return (res.scenes as { sceneName: string }[]).map((s) => s.sceneName).reverse();
  }

  /** Cut OBS to a scene (no-op if it doesn't exist or is already on air). */
  async switchScene(sceneName: string): Promise<boolean> {
    if (!this.connected || !sceneName) return false;
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');
    if (currentProgramSceneName === sceneName) return true;
    if (!(await this.listScenes()).includes(sceneName)) throw new Error(`OBS has no scene named "${sceneName}"`);
    await this.obs.call('SetCurrentProgramScene', { sceneName });
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
    const items = async (sceneName: string) => (await this.obs.call('GetSceneItemList', { sceneName })).sceneItems as unknown as Item[];
    const ensureScene = async (sceneName: string) => {
      if (scenes.has(sceneName)) return;
      await this.obs.call('CreateScene', { sceneName });
      scenes.add(sceneName);
      report.push(`Created scene "${sceneName}"`);
    };
    const ensureSource = async (sceneName: string, inputName: string, inputKind: string, inputSettings: Record<string, unknown>) => {
      if (!inputs.has(inputName)) {
        await this.obs.call('CreateInput', { sceneName, inputName, inputKind, inputSettings: inputSettings as never, sceneItemEnabled: true });
        inputs.add(inputName);
        report.push(`Added "${inputName}" to "${sceneName}"`);
        return;
      }
      if (inputKind === 'browser_source') await this.obs.call('SetInputSettings', { inputName, inputSettings: inputSettings as never, overlay: true });
      if (!(await items(sceneName)).some((i) => i.sourceName === inputName)) {
        await this.obs.call('CreateSceneItem', { sceneName, sourceName: inputName, sceneItemEnabled: true });
        report.push(`Added "${inputName}" to "${sceneName}"`);
      }
    };
    /** Nest a scene (e.g. Game Feed) at the bottom of another scene. */
    const ensureNestedAtBottom = async (sceneName: string, sourceName: string) => {
      let it = (await items(sceneName)).find((i) => i.sourceName === sourceName);
      if (!it) {
        const { sceneItemId } = await this.obs.call('CreateSceneItem', { sceneName, sourceName, sceneItemEnabled: true });
        it = { sceneItemId, sourceName };
        report.push(`Put "${sourceName}" in "${sceneName}"`);
      }
      await this.obs.call('SetSceneItemIndex', { sceneName, sceneItemId: it.sceneItemId, sceneItemIndex: 0 });
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
      await this.obs.call('SetSceneItemIndex', { sceneName: s.replayScene, sceneItemId: media.sceneItemId, sceneItemIndex: 0 });
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
    const { sceneItemId } = await this.obs.call('GetSceneItemId', { sceneName, sourceName });
    const video = await this.obs.call('GetVideoSettings');
    await this.obs.call('SetSceneItemTransform', {
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
    const res = await this.obs.call('GetSourceScreenshot', { sourceName, imageFormat: 'png', imageWidth: width });
    return String(res.imageData);
  }

  async listInputs(): Promise<string[]> {
    const res = await this.obs.call('GetInputList');
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
    const listItems = async () => ((await this.obs.call('GetSceneItemList', { sceneName })).sceneItems as unknown as Item[]);

    let items = await listItems();
    let pip = items.find((i) => i.sourceName === source);
    if (!pip) {
      const { sceneItemId } = await this.obs.call('CreateSceneItem', { sceneName, sourceName: source, sceneItemEnabled: true });
      items = await listItems();
      pip = items.find((i) => i.sceneItemId === sceneItemId)!;
    } else {
      await this.obs.call('SetSceneItemEnabled', { sceneName, sceneItemId: pip.sceneItemId, sceneItemEnabled: true });
    }

    // Fit into the PiP window, scaled from the 1920×1080 overlay stage to the OBS canvas.
    const video = await this.obs.call('GetVideoSettings');
    const sx = Number(video.baseWidth) / 1920;
    const sy = Number(video.baseHeight) / 1080;
    await this.obs.call('SetSceneItemTransform', {
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
      const { inputSettings } = await this.obs.call('GetInputSettings', { inputName: it.sourceName });
      if (String((inputSettings as { url?: string }).url ?? '').includes('/overlay/replay')) overlay = it;
    }
    const media = items.find((i) => i.sourceName === s.replaySource);
    let layering = 'placed on top (no /overlay/replay browser source found in this scene — add it above the PiP)';
    if (overlay) {
      const target = pip.sceneItemIndex > overlay.sceneItemIndex ? overlay.sceneItemIndex : pip.sceneItemIndex;
      if (target !== pip.sceneItemIndex) await this.obs.call('SetSceneItemIndex', { sceneName, sceneItemId: pip.sceneItemId, sceneItemIndex: target });
      layering = 'below the replay overlay';
    }
    if (media) {
      const now = await listItems();
      const p = now.find((i) => i.sceneItemId === pip!.sceneItemId)!;
      const m = now.find((i) => i.sceneItemId === media.sceneItemId)!;
      if (p.sceneItemIndex < m.sceneItemIndex) {
        await this.obs.call('SetSceneItemIndex', { sceneName, sceneItemId: pip.sceneItemId, sceneItemIndex: m.sceneItemIndex });
      }
      layering += ' and above the replay video';
    }
    return `"${source}" fitted to ${Math.round(REPLAY_PIP.w * sx)}×${Math.round(REPLAY_PIP.h * sy)} at (${Math.round(REPLAY_PIP.x * sx)}, ${Math.round(REPLAY_PIP.y * sy)}) in "${sceneName}", ${layering}.`;
  }

  async ensureReplayBuffer() {
    const { outputActive } = await this.obs.call('GetReplayBufferStatus');
    if (!outputActive) await this.obs.call('StartReplayBuffer');
  }

  /** Cut back to the In-game HUD now (e.g. the operator hid the replay early). */
  async endReplay() {
    const pending = this.pendingReturn;
    if (!pending) return;
    this.clearPendingReturn();
    if (this.connected) await this.obs.call('SetCurrentProgramScene', { sceneName: pending.scene }).catch(() => {});
  }

  private clearPendingReturn() {
    if (!this.pendingReturn) return;
    clearTimeout(this.pendingReturn.timer);
    this.pendingReturn.off();
    this.pendingReturn = null;
  }

  /**
   * Cut back to `scene` when the replay clip finishes playing, or after
   * `seconds` at the latest — whichever comes first.
   */
  private scheduleReturn(s: ObsSettings, scene: string, seconds: number) {
    this.clearPendingReturn();
    const startedAt = Date.now();
    const onEnded = (e: { inputName: string }) => {
      // Ignore a stray "ended" from the previous clip while the new one restarts.
      if (e.inputName === s.replaySource && Date.now() - startedAt > 1500) void this.endReplay();
    };
    this.obs.on('MediaInputPlaybackEnded', onEnded);
    this.pendingReturn = {
      scene,
      off: () => this.obs.off('MediaInputPlaybackEnded', onEnded),
      timer: setTimeout(() => void this.endReplay(), seconds * 1000 + 400),
    };
  }

  /** Save the last N seconds and play them back. Resolves with the saved file path. */
  async playInstantReplay(s: ObsSettings): Promise<string> {
    if (!this.connected) throw new Error('OBS is not connected');
    await this.ensureReplayBuffer();
    const { currentProgramSceneName } = await this.obs.call('GetCurrentProgramScene');

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
    await this.obs.call('SaveReplayBuffer');
    const path = await saved;

    await this.obs.call('SetInputSettings', {
      inputName: s.replaySource,
      inputSettings: { local_file: path, is_local_file: true, restart_on_activate: true, close_when_inactive: true },
      overlay: true,
    });

    if (s.autoSwitch) {
      // Full-screen replay, whatever size the clip was recorded at.
      await this.fitToCanvas(s.replayScene, s.replaySource).catch(() => {});
      await this.obs.call('SetCurrentProgramScene', { sceneName: s.replayScene });
      await this.obs
        .call('TriggerMediaInputAction', { inputName: s.replaySource, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' })
        .catch(() => {});
      // Back to the live game: the In-game HUD scene (or wherever we came from if it isn't set).
      const scenes = await this.listScenes().catch(() => [] as string[]);
      const hud = s.hudScene && scenes.includes(s.hudScene) ? s.hudScene : '';
      const back = hud || (currentProgramSceneName !== s.replayScene ? currentProgramSceneName : this.pendingReturn?.scene ?? currentProgramSceneName);
      this.scheduleReturn(s, back, s.replaySeconds);
    }
    return path;
  }
}

export const obsBridge = new ObsBridge();
