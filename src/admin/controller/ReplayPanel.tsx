import { useEffect, useState } from 'react';
import { Clapperboard, Link2, Link2Off, PictureInPicture2, RefreshCw, Settings2, X } from 'lucide-react';
import type { LiveState, Side } from '@/types';
import { clearReplay, triggerEvent } from '@/services/live';
import { obsBridge, pipSourceOf, saveObsSettings, useObsSettings, type ObsSettings } from '@/services/obs';
import { REPLAY_PIP } from '@/overlay/layout';
import { useNow } from '@/hooks/useFirestore';
import { Badge, Button, Card, Field, Input, Select, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';

export function ReplayPanel({ live }: { live: LiveState }) {
  const toast = useToast();
  const now = useNow(500);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [side, setSide] = useState<Side | ''>('');
  // Shared with the OBS card (one copy of the settings on this computer).
  const [obs, updateObs] = useObsSettings();
  const setObs = (next: ObsSettings) => updateObs(next);
  const [connected, setConnected] = useState(obsBridge.connected);
  const [showObs, setShowObs] = useState(false);
  const [scenes, setScenes] = useState<string[]>([]);
  const [inputs, setInputs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [pipBusy, setPipBusy] = useState(false);

  useEffect(() => obsBridge.onChange((c) => setConnected(c)), []);

  // Suggest a title from the latest HUD banner (e.g. "SAVAGE — Kairi").
  const recentBanner = live.banner && now - live.banner.at < 60_000 ? live.banner : null;
  const suggestion = recentBanner ? [recentBanner.title, recentBanner.ign].filter(Boolean).join(' — ') : '';

  const replayActive = live.replay.active && live.replay.endsAt > now;

  const refreshLists = async () => {
    try {
      setScenes(await obsBridge.listScenes());
      setInputs(await obsBridge.listInputs());
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const connect = async () => {
    saveObsSettings(obs);
    try {
      await obsBridge.connect(obs);
      toast.success('Connected to OBS');
      await refreshLists();
    } catch {
      /* toast handled by onChange */
    }
  };

  const trigger = async () => {
    setBusy(true);
    const finalTitle = title.trim() || suggestion || 'Instant Replay';
    const tasks: Promise<unknown>[] = [
      triggerEvent(live, 'INSTANT_REPLAY', {
        side: side || recentBanner?.side || null,
        note: note.trim(),
        replayTitle: finalTitle,
        replaySeconds: obs.replaySeconds,
        data: { linkedSummary: recentBanner ? `${recentBanner.title} ${recentBanner.subtitle}` : '' },
      }),
    ];
    if (connected) tasks.push(obsBridge.playInstantReplay(obs));
    const results = await Promise.allSettled(tasks);
    results.forEach((r) => r.status === 'rejected' && toast.error((r.reason as Error).message));
    if (results[0].status === 'fulfilled') {
      toast.success(
        connected
          ? obs.autoSwitch
            ? `Replay rolling — back to "${obs.hudScene || 'previous scene'}" when the clip ends`
            : 'Replay saved in OBS'
          : 'Replay frame on air — press your OBS Replay Buffer hotkey, then switch back to the In-game HUD after',
      );
      setTitle('');
      setNote('');
    }
    setBusy(false);
  };

  return (
    <Card
      title="Instant replay"
      subtitle="Shows the INSTANT REPLAY frame and the casters narrate the clip. Describe the play so the narration matches the footage."
      actions={
        <>
          <Badge tone={connected ? 'success' : 'muted'}>{connected ? 'OBS linked' : 'OBS manual'}</Badge>
          <Button size="sm" variant="ghost" icon={<Settings2 className="h-4 w-4" />} onClick={() => setShowObs((s) => !s)}>
            OBS
          </Button>
        </>
      }
    >
      <div className="grid gap-3 md:grid-cols-[1fr_1.4fr_auto]">
        <Field label="Headline">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestion || 'e.g. LORD STEAL — Kairi'} />
        </Field>
        <Field label="What the replay shows (fed to the casters)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Flickers over the wall, last-hits the Lord, escapes with 50 HP" />
        </Field>
        <Field label="Team">
          <Select value={side} onChange={(e) => setSide(e.target.value as Side | '')}>
            <option value="">Auto</option>
            <option value="blue">Blue side</option>
            <option value="red">Red side</option>
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="lg" className="flex-1" loading={busy} icon={<Clapperboard className="h-5 w-5" />} onClick={trigger}>
          Trigger instant replay ({obs.replaySeconds}s)
        </Button>
        {replayActive && (
          <Button
            size="lg"
            variant="secondary"
            icon={<X className="h-5 w-5" />}
            onClick={() => toast.run(() => Promise.all([clearReplay(), connected ? obsBridge.endReplay() : null]))}
          >
            {connected && obs.autoSwitch ? 'End replay → In-game HUD' : 'Hide frame'} ({Math.ceil((live.replay.endsAt - now) / 1000)}s)
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        With a description, a live Gemini call narrates the exact play; without one, the casters use the pre-shoutcast library (no AI quota used).
      </p>

      {showObs && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface2 p-4">
          <p className="text-sm text-muted">
            OBS 28+ → Tools → WebSocket Server Settings → enable. Set Settings → Output → Replay Buffer to <strong>10 s</strong>. You need two scenes: your <strong>In-game HUD</strong> scene (game
            capture + <code>/overlay/hud</code>) and an <strong>Instant Replay</strong> scene with a Media Source and the <code>/overlay/replay</code> browser source on top.
          </p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="WebSocket URL">
              <Input value={obs.url} onChange={(e) => setObs({ ...obs, url: e.target.value })} />
            </Field>
            <Field label="Password">
              <Input type="password" value={obs.password} onChange={(e) => setObs({ ...obs, password: e.target.value })} />
            </Field>
            <Field label="Replay scene">
              {scenes.length ? (
                <Select value={obs.replayScene} onChange={(e) => setObs({ ...obs, replayScene: e.target.value })}>
                  {scenes.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              ) : (
                <Input value={obs.replayScene} onChange={(e) => setObs({ ...obs, replayScene: e.target.value })} />
              )}
            </Field>
            <Field label="Replay media source">
              {inputs.length ? (
                <Select value={obs.replaySource} onChange={(e) => setObs({ ...obs, replaySource: e.target.value })}>
                  {inputs.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              ) : (
                <Input value={obs.replaySource} onChange={(e) => setObs({ ...obs, replaySource: e.target.value })} />
              )}
            </Field>
            <Field label="In-game HUD scene (live game + HUD)">
              {scenes.length ? (
                <Select value={obs.hudScene} onChange={(e) => setObs({ ...obs, hudScene: e.target.value })}>
                  {!scenes.includes(obs.hudScene) && <option value={obs.hudScene}>{obs.hudScene || '— choose —'}</option>}
                  {scenes
                    .filter((sc) => sc !== obs.replayScene)
                    .map((sc) => (
                      <option key={sc}>{sc}</option>
                    ))}
                </Select>
              ) : (
                <Input value={obs.hudScene} onChange={(e) => setObs({ ...obs, hudScene: e.target.value })} placeholder="In-game HUD" />
              )}
            </Field>
            <Field label="Small live window during replays">
              <Select value={obs.pipSource} onChange={(e) => setObs({ ...obs, pipSource: e.target.value })}>
                <option value="">In-game HUD scene (recommended)</option>
                {inputs.length > 0 && (
                  <optgroup label="Sources">
                    {inputs.map((s) => (
                      <option key={`i-${s}`} value={s}>
                        {s}
                      </option>
                    ))}
                  </optgroup>
                )}
                {scenes.filter((sc) => sc !== obs.replayScene && sc !== obs.hudScene).length > 0 && (
                  <optgroup label="Other scenes">
                    {scenes
                      .filter((sc) => sc !== obs.replayScene && sc !== obs.hudScene)
                      .map((sc) => (
                        <option key={`s-${sc}`} value={sc}>
                          {sc}
                        </option>
                      ))}
                  </optgroup>
                )}
                {obs.pipSource && !inputs.includes(obs.pipSource) && !scenes.includes(obs.pipSource) && <option value={obs.pipSource}>{obs.pipSource}</option>}
              </Select>
            </Field>
            <Field label="Replay length (s)">
              <Input type="number" min={5} max={30} value={obs.replaySeconds} onChange={(e) => setObs({ ...obs, replaySeconds: Math.max(5, Number(e.target.value) || 10) })} />
            </Field>
          </div>
          <div className="rounded-lg border border-line bg-surface p-3">
            <p className="flex items-center gap-1.5 text-sm font-semibold">
              <PictureInPicture2 className="h-4 w-4 text-brand" /> Live game picture-in-picture
            </p>
            <p className="mt-1 text-xs text-muted">
              During a replay the <strong>In-game HUD</strong> (live game with the scoreboard) stays visible in a small window on the right, and when the clip ends OBS cuts back to the In-game
              HUD automatically. Pick your In-game HUD scene above (Refresh lists if empty), then click the button — it nests that scene in the replay scene, fits it into the overlay&apos;s LIVE
              frame and layers it under the overlay.
            </p>
            <Button
              size="sm"
              className="mt-2"
              loading={pipBusy}
              disabled={!connected || !pipSourceOf(obs)}
              icon={<PictureInPicture2 className="h-4 w-4" />}
              onClick={async () => {
                saveObsSettings(obs);
                setPipBusy(true);
                const msg = await toast.run(() => obsBridge.setupReplayPip(obs));
                setPipBusy(false);
                if (msg) toast.success(msg);
              }}
            >
              Set up live PiP in OBS
            </Button>
            <p className="mt-2 text-xs text-muted">
              Manual setup (1920×1080 canvas): in the replay scene click <strong>+ → Scene</strong> → pick &ldquo;{obs.hudScene || 'In-game HUD'}&rdquo; → Edit Transform → Position {REPLAY_PIP.x},{' '}
              {REPLAY_PIP.y} · Bounding box &ldquo;Scale to inner bounds&rdquo; {REPLAY_PIP.w}×{REPLAY_PIP.h}. Order (top → bottom): /overlay/replay, In-game HUD, replay media.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Switch checked={obs.autoSwitch} onChange={(autoSwitch) => setObs({ ...obs, autoSwitch })} label="Auto-switch (replay → back to In-game HUD)" />
            <div className="ml-auto flex gap-2">
              {connected ? (
                <>
                  <Button size="sm" variant="secondary" icon={<RefreshCw className="h-4 w-4" />} onClick={refreshLists}>
                    Refresh lists
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Link2Off className="h-4 w-4" />} onClick={() => void obsBridge.disconnect()}>
                    Disconnect
                  </Button>
                </>
              ) : (
                <Button size="sm" icon={<Link2 className="h-4 w-4" />} onClick={connect}>
                  Connect to OBS
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  saveObsSettings(obs);
                  toast.success('OBS settings saved on this computer');
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}
