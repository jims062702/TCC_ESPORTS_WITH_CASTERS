import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Download, Link2, Link2Off, MonitorPlay, Music, RefreshCw, Volume2, Wand2 } from 'lucide-react';
import type { LivePhase } from '@/types';
import { buildSceneCollection, getObsSettings, obsBridge, overlayBase, sceneForPhase, useObsSettings } from '@/services/obs';
import { breakMusic, playStinger, type Stinger } from '@/overlay/sound';
import { Badge, Button, Field, Input, Select, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/** Live connection state of the OBS bridge. */
export function useObsConnected() {
  const [connected, setConnected] = useState(obsBridge.connected);
  const [error, setError] = useState<string | null>(null);
  useEffect(
    () =>
      obsBridge.onChange((c, err) => {
        setConnected(c);
        setError(c ? null : (err ?? null));
      }),
    [],
  );
  return { connected, error };
}

/**
 * Hands-free OBS: reconnects when the controller opens (if you connected
 * before) and cuts to the right scene whenever the phase changes — Go live /
 * next draft → Draft, Start game → In-game HUD, Go to break → Break. Instant
 * replays switch to the replay scene and back to the In-game HUD by themselves.
 */
export function useObsAutomation(phase: LivePhase, onAir: boolean) {
  const toast = useToast();
  const prev = useRef<LivePhase | null>(null);

  useEffect(() => {
    const s = getObsSettings();
    if (s.autoConnect && !obsBridge.connected) obsBridge.connect(s).catch(() => {});
  }, []);

  useEffect(() => {
    const current: LivePhase = onAir ? phase : 'idle';
    const before = prev.current;
    prev.current = current;
    if (before === null || before === current) return;
    const s = getObsSettings();
    const scene = sceneForPhase(s, current);
    if (!s.autoScenes || !scene || !obsBridge.connected) return;
    obsBridge.switchScene(scene).catch((e: Error) => toast.error(`OBS: ${e.message}`));
  }, [phase, onAir, toast]);
}

const STINGERS: { kind: Stinger; label: string }[] = [
  { kind: 'draft', label: 'Draft start' },
  { kind: 'game', label: 'Game start' },
  { kind: 'replayIn', label: 'Into replay' },
  { kind: 'replayOut', label: 'Back to game' },
];

/** OBS connection, automatic scenes, one-click scene setup / import file, and a sound check. */
export function ObsPanel({ phase }: { phase: LivePhase }) {
  const toast = useToast();
  const [s, update] = useObsSettings();
  const { connected, error } = useObsConnected();
  const [open, setOpen] = useState(!s.autoConnect);
  const [scenes, setScenes] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [music, setMusic] = useState(false);

  useEffect(() => {
    if (connected) void obsBridge.listScenes().then(setScenes).catch(() => {});
  }, [connected]);
  useEffect(() => () => breakMusic.stop(0.2), []);

  const connect = async () => {
    setBusy(true);
    try {
      await obsBridge.connect(getObsSettings());
      update({ autoConnect: true });
      toast.success('Connected to OBS — scenes will follow the controller');
    } catch {
      toast.error('Could not reach OBS. Is OBS open with the WebSocket server enabled?');
    }
    setBusy(false);
  };

  const setup = async () => {
    setBusy(true);
    const report = await toast.run(() => obsBridge.setupScenes(getObsSettings(), overlayBase()));
    setBusy(false);
    if (report) {
      toast.success(`OBS ready — ${report.length} step${report.length === 1 ? '' : 's'}. Add your game capture to "${s.gameFeedScene}".`);
      setScenes(await obsBridge.listScenes());
    }
  };

  const download = () => {
    const json = JSON.stringify(buildSceneCollection(s, overlayBase()), null, 2);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    a.download = 'TCC-Esports-OBS-scenes.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  const sceneField = (label: string, key: 'draftScene' | 'hudScene' | 'replayScene' | 'breakScene' | 'gameFeedScene') => (
    <Field label={label}>
      {scenes.length ? (
        <Select value={s[key]} onChange={(e) => update({ [key]: e.target.value })}>
          {!scenes.includes(s[key]) && <option value={s[key]}>{s[key]} (not in OBS yet)</option>}
          {scenes.map((sc) => (
            <option key={sc}>{sc}</option>
          ))}
        </Select>
      ) : (
        <Input value={s[key]} onChange={(e) => update({ [key]: e.target.value })} />
      )}
    </Field>
  );

  const nextScene = sceneForPhase(s, phase);

  return (
    <div className="card overflow-hidden">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full flex-wrap items-center gap-3 px-4 py-3 text-left">
        <MonitorPlay className="h-5 w-5 text-brand" />
        <span className="font-display text-xl uppercase leading-none">OBS</span>
        <Badge tone={connected ? 'success' : 'muted'}>{connected ? 'Connected' : 'Not connected'}</Badge>
        {connected && s.autoScenes && <span className="text-xs text-muted">Scenes follow the controller{nextScene ? ` · now: ${nextScene}` : ''}</span>}
        {!connected && error && <span className="truncate text-xs text-amber-600 dark:text-amber-400">{error}</span>}
        <ChevronDown className={cn('ml-auto h-4 w-4 text-muted transition', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="space-y-4 border-t border-line p-4">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-muted">
            <li>
              In OBS (28 or newer): <strong className="text-fg">Tools → WebSocket Server Settings</strong> → tick <strong className="text-fg">Enable WebSocket server</strong> → <strong className="text-fg">Show Connect Info</strong> → copy the password.
            </li>
            <li>Paste it below and press <strong className="text-fg">Connect</strong> (it reconnects by itself next time).</li>
            <li>
              Press <strong className="text-fg">Create all scenes in OBS</strong> — or download the scene file and in OBS use <strong className="text-fg">Scene Collection → Import</strong>.
            </li>
            <li>
              Put your game capture (phone mirror / emulator window / capture card) in the <strong className="text-fg">{s.gameFeedScene}</strong> scene once — Draft and In-game HUD both use it.
            </li>
          </ol>

          <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
            <Field label="WebSocket URL">
              <Input value={s.url} onChange={(e) => update({ url: e.target.value })} />
            </Field>
            <Field label="Password">
              <Input type="password" value={s.password} onChange={(e) => update({ password: e.target.value })} />
            </Field>
            {connected ? (
              <Button variant="secondary" icon={<Link2Off className="h-4 w-4" />} onClick={() => { update({ autoConnect: false }); void obsBridge.disconnect(); }}>
                Disconnect
              </Button>
            ) : (
              <Button loading={busy} icon={<Link2 className="h-4 w-4" />} onClick={connect}>
                Connect
              </Button>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            {sceneField('Draft scene', 'draftScene')}
            {sceneField('In-game HUD scene', 'hudScene')}
            {sceneField('Instant replay scene', 'replayScene')}
            {sceneField('Break scene', 'breakScene')}
            {sceneField('Game feed scene', 'gameFeedScene')}
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Switch checked={s.autoScenes} onChange={(autoScenes) => update({ autoScenes })} label="Switch OBS scenes automatically from the controller" />
            <Switch checked={s.autoSwitch} onChange={(autoSwitch) => update({ autoSwitch })} label="Instant replay → replay scene → back to In-game HUD" />
          </div>

          <div className="flex flex-wrap gap-2">
            <Button disabled={!connected} loading={busy} icon={<Wand2 className="h-4 w-4" />} onClick={setup}>
              Create all scenes in OBS
            </Button>
            <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={download}>
              Download scene file (OBS → Scene Collection → Import)
            </Button>
            {connected && (
              <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={() => nextScene && toast.run(() => obsBridge.switchScene(nextScene))}>
                Go to the current scene
              </Button>
            )}
          </div>

          <div className="rounded-xl border border-line bg-surface2 p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Volume2 className="h-4 w-4 text-brand" /> Sound check (plays on this computer)
            </p>
            <p className="mt-1 text-xs text-muted">
              The overlays play these in OBS automatically: draft start, game start, into the replay and back to the game, and the 5-minute break track (loops on long breaks). In
              OBS keep <strong>Control audio via OBS</strong> ticked on the browser sources (the scene setup does it) and set the level in the Audio Mixer.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {STINGERS.map((x) => (
                <Button key={x.kind} size="sm" variant="secondary" onClick={() => playStinger(x.kind)}>
                  {x.label}
                </Button>
              ))}
              <Button
                size="sm"
                variant={music ? 'primary' : 'secondary'}
                icon={<Music className="h-4 w-4" />}
                onClick={() => {
                  if (music) breakMusic.stop();
                  else breakMusic.start(0.5);
                  setMusic(!music);
                }}
              >
                {music ? 'Stop break music' : 'Play break music'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
