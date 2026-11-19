import OBSWebSocket from 'obs-websocket-js';
import { STORAGE_KEYS } from '@/lib/constants';
import { safeLocalGet, safeLocalSet } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Optional OBS Studio bridge (obs-websocket v5, built into OBS 28+).
// One click on "Instant Replay" in the controller can:
//   1. SaveReplayBuffer (last 10 s, set in OBS → Settings → Output → Replay Buffer)
//   2. load the saved file into the replay Media Source
//   3. cut to the replay scene, then cut back after the clip
// Without OBS connected, the operator presses the Replay Buffer hotkey manually
// and the overlay still shows the INSTANT REPLAY frame + casters narrate.
// ─────────────────────────────────────────────────────────────────────────────

export interface ObsSettings {
  url: string;
  password: string;
  replayScene: string;
  replaySource: string;
  returnScene: string;
  replaySeconds: number;
  autoSwitch: boolean;
}

export const DEFAULT_OBS_SETTINGS: ObsSettings = {
  url: 'ws://127.0.0.1:4455',
  password: '',
  replayScene: 'Instant Replay',
  replaySource: 'Replay Media',
  returnScene: '',
  replaySeconds: 10,
  autoSwitch: true,
};

export const loadObsSettings = () => safeLocalGet(STORAGE_KEYS.obs, DEFAULT_OBS_SETTINGS);
export const saveObsSettings = (s: ObsSettings) => safeLocalSet(STORAGE_KEYS.obs, s);

type Listener = (connected: boolean, error?: string) => void;

class ObsBridge {
  private obs = new OBSWebSocket();
  private listeners = new Set<Listener>();
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

  async listInputs(): Promise<string[]> {
    const res = await this.obs.call('GetInputList');
    return (res.inputs as { inputName: string }[]).map((i) => i.inputName);
  }

  async ensureReplayBuffer() {
    const { outputActive } = await this.obs.call('GetReplayBufferStatus');
    if (!outputActive) await this.obs.call('StartReplayBuffer');
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
      await this.obs.call('SetCurrentProgramScene', { sceneName: s.replayScene });
      await this.obs
        .call('TriggerMediaInputAction', { inputName: s.replaySource, mediaAction: 'OBS_WEBSOCKET_MEDIA_INPUT_ACTION_RESTART' })
        .catch(() => {});
      const back = s.returnScene || currentProgramSceneName;
      setTimeout(() => {
        this.obs.call('SetCurrentProgramScene', { sceneName: back }).catch(() => {});
      }, s.replaySeconds * 1000 + 400);
    }
    return path;
  }
}

export const obsBridge = new ObsBridge();
