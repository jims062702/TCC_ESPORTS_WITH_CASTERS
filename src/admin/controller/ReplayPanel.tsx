import { useEffect, useState } from 'react';
import { Clapperboard, Link2, Link2Off, RefreshCw, Settings2, X } from 'lucide-react';
import type { LiveState, Side } from '@/types';
import { clearReplay, triggerEvent } from '@/services/live';
import { loadObsSettings, obsBridge, saveObsSettings, type ObsSettings } from '@/services/obs';
import { useNow } from '@/hooks/useFirestore';
import { Badge, Button, Card, Field, Input, Select, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';

export function ReplayPanel({ live }: { live: LiveState }) {
  const toast = useToast();
  const now = useNow(500);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [side, setSide] = useState<Side | ''>('');
  const [obs, setObs] = useState<ObsSettings>(loadObsSettings);
  const [connected, setConnected] = useState(obsBridge.connected);
  const [showObs, setShowObs] = useState(false);
  const [scenes, setScenes] = useState<string[]>([]);
  const [inputs, setInputs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => obsBridge.onChange((c, err) => {
    setConnected(c);
    if (err) toast.error(`OBS: ${err}`);
  }), [toast]);

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
      toast.success(connected ? 'Replay saved in OBS & rolling' : 'Replay frame on air — press your OBS Replay Buffer hotkey');
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
          <Button size="lg" variant="secondary" icon={<X className="h-5 w-5" />} onClick={() => toast.run(clearReplay)}>
            Hide frame ({Math.ceil((live.replay.endsAt - now) / 1000)}s)
          </Button>
        )}
      </div>
      <p className="mt-2 text-xs text-muted">
        With a description, a live Gemini call narrates the exact play; without one, the casters use the pre-shoutcast library (no AI quota used).
      </p>

      {showObs && (
        <div className="mt-4 space-y-3 rounded-xl border border-line bg-surface2 p-4">
          <p className="text-sm text-muted">
            OBS 28+ → Tools → WebSocket Server Settings → enable. Set Settings → Output → Replay Buffer to <strong>10 s</strong>. Create a scene with a Media Source for replays and put the
            <code> /overlay/replay</code> browser source above it.
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
            <Field label="Return to scene (blank = previous)">
              <Input value={obs.returnScene} onChange={(e) => setObs({ ...obs, returnScene: e.target.value })} />
            </Field>
            <Field label="Replay length (s)">
              <Input type="number" min={5} max={30} value={obs.replaySeconds} onChange={(e) => setObs({ ...obs, replaySeconds: Math.max(5, Number(e.target.value) || 10) })} />
            </Field>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Switch checked={obs.autoSwitch} onChange={(autoSwitch) => setObs({ ...obs, autoSwitch })} label="Auto-switch scenes" />
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
