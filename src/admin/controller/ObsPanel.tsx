import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Clapperboard, Download, Link2, Link2Off, MonitorPlay, Music, PictureInPicture2, RefreshCw, Volume2, Wand2 } from 'lucide-react';
import type { LivePhase } from '@/types';
import { buildSceneCollection, getObsSettings, obsBridge, overlayBase, pipSourceOf, sceneForPhase, useObsSettings } from '@/services/obs';
import { REPLAY_PIP } from '@/overlay/layout';
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
 * Hands-free OBS: cuts to the right scene whenever the phase changes (the
 * admin layout keeps OBS connected, also after a refresh) — Go live /
 * next draft → Draft, Start game → In-game HUD, Go to break → Break. Instant
 * replays switch to the replay scene and back to the In-game HUD by themselves.
 */
export function useObsAutomation(phase: LivePhase, onAir: boolean) {
  const toast = useToast();
  const prev = useRef<LivePhase | null>(null);

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
  { kind: 'reveal', label: 'Battlefield reveal' },
];

/** OBS connection, automatic scenes, instant-replay setup, one-click scene setup / import file, and a sound check. */
export function ObsPanel({ phase, defaultOpen = false }: { phase: LivePhase; matchId?: string | null; defaultOpen?: boolean }) {
  const toast = useToast();
  const [s, update] = useObsSettings();
  const { connected, error } = useObsConnected();
  const [open, setOpen] = useState(defaultOpen || !s.autoConnect);
  const [scenes, setScenes] = useState<string[]>([]);
  const [inputs, setInputs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pipBusy, setPipBusy] = useState(false);
  const [music, setMusic] = useState(false);

  useEffect(() => {
    if (!connected) return;
    void obsBridge.listScenes().then(setScenes).catch(() => {});
    void obsBridge.listInputs().then(setInputs).catch(() => {});
  }, [connected]);
  useEffect(() => () => breakMusic.stop(0.2), []);

  const connect = async () => {
    setBusy(true);
    try {
      update({ autoConnect: true });
      await obsBridge.connect(getObsSettings());
      toast.success('Connected to OBS — scenes will follow the controller');
    } catch {
      update({ autoConnect: false });
      toast.error(`Could not reach OBS (${obsBridge.lastError ?? 'no answer'}). Is OBS open with the WebSocket server enabled?`);
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
              <span className="sm:hidden">Download scene file</span>
              <span className="hidden sm:inline">Download scene file (OBS → Scene Collection → Import)</span>
            </Button>
            {connected && (
              <Button variant="ghost" icon={<RefreshCw className="h-4 w-4" />} onClick={() => nextScene && toast.run(() => obsBridge.switchScene(nextScene))}>
                Go to the current scene
              </Button>
            )}
          </div>

          {/* Instant replay — the trigger button is in Event triggers; everything else is set here */}
          <div className="rounded-xl border border-line bg-surface2 p-3" data-testid="obs-replay-settings">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <Clapperboard className="h-4 w-4 text-brand" /> Instant replay
            </p>
            <p className="mt-1 text-xs text-muted">
              OBS → Settings → Output → <strong>Replay Buffer</strong>: enable, <strong>Maximum Replay Time 10 s</strong>. The <strong>Instant replay</strong> button is in the Live
              Controller&apos;s <strong>Event triggers</strong>: it saves the buffer, zooms the clip out of a small window, keeps the live In-game HUD in the LIVE window, and zooms back to
              the game at the end.
            </p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Replay media source">
                {inputs.length ? (
                  <Select value={s.replaySource} onChange={(e) => update({ replaySource: e.target.value })}>
                    {!inputs.includes(s.replaySource) && <option value={s.replaySource}>{s.replaySource} (not in OBS yet)</option>}
                    {inputs.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </Select>
                ) : (
                  <Input value={s.replaySource} onChange={(e) => update({ replaySource: e.target.value })} />
                )}
              </Field>
              <Field label="Small live window during replays">
                <Select value={s.pipSource} onChange={(e) => update({ pipSource: e.target.value })}>
                  <option value="">In-game HUD scene (recommended)</option>
                  {inputs.length > 0 && (
                    <optgroup label="Sources">
                      {inputs.map((x) => (
                        <option key={`i-${x}`} value={x}>
                          {x}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {scenes.filter((sc) => sc !== s.replayScene && sc !== s.hudScene).length > 0 && (
                    <optgroup label="Other scenes">
                      {scenes
                        .filter((sc) => sc !== s.replayScene && sc !== s.hudScene)
                        .map((sc) => (
                          <option key={`s-${sc}`} value={sc}>
                            {sc}
                          </option>
                        ))}
                    </optgroup>
                  )}
                  {s.pipSource && !inputs.includes(s.pipSource) && !scenes.includes(s.pipSource) && <option value={s.pipSource}>{s.pipSource}</option>}
                </Select>
              </Field>
              <Field label="Replay length (s)">
                <Input type="number" min={5} max={30} value={s.replaySeconds} onChange={(e) => update({ replaySeconds: Math.max(5, Number(e.target.value) || 10) })} />
              </Field>
              <div className="flex items-end pb-2">
                <Switch checked={s.replayZoom} onChange={(replayZoom) => update({ replayZoom })} label="Zoom transitions" />
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                variant="secondary"
                loading={pipBusy}
                disabled={!connected || !pipSourceOf(s)}
                icon={<PictureInPicture2 className="h-4 w-4" />}
                onClick={async () => {
                  setPipBusy(true);
                  const msg = await toast.run(() => obsBridge.setupReplayPip(getObsSettings()));
                  setPipBusy(false);
                  if (msg) toast.success(msg);
                }}
              >
                Set up live PiP in OBS
              </Button>
              <p className="text-xs text-muted">
                Nests &ldquo;{pipSourceOf(s) || 'In-game HUD'}&rdquo; in the replay scene at {REPLAY_PIP.x}, {REPLAY_PIP.y} · {REPLAY_PIP.w}×{REPLAY_PIP.h} under the replay overlay (Create all scenes does it too).
              </p>
            </div>
            <p className="mt-3 text-xs text-muted">Replays are saved in OBS&apos;s recording folder. Upload the ones you want on the break screen and the website in <strong>Media &amp; Replays</strong> (add a description, keywords and the player).</p>
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
