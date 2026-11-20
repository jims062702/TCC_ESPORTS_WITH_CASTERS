import { useState } from 'react';
import { ChevronDown, Clapperboard, X } from 'lucide-react';
import type { LiveState, Side } from '@/types';
import { clearReplay, replayPlaying, replayWithoutObs, triggerEvent } from '@/services/live';
import { obsBridge, useObsSettings } from '@/services/obs';
import { useNow } from '@/hooks/useFirestore';
import { Button, Field, Input, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { useObsConnected } from './ObsPanel';

/**
 * Instant replay button for the Event triggers card. One click: the INSTANT
 * REPLAY frame + casters, and (with OBS connected — set up in the OBS card) the
 * clip plays with zoom transitions and cuts back to the In-game HUD.
 * Optional details make the narration match the footage.
 */
export function ReplayTrigger({ live }: { live: LiveState }) {
  const toast = useToast();
  const now = useNow(500);
  const [obs] = useObsSettings();
  const { connected } = useObsConnected();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [side, setSide] = useState<Side | ''>('');
  const [busy, setBusy] = useState(false);

  // Suggest a title from the latest HUD banner (e.g. "SAVAGE — Kairi").
  const recentBanner = live.banner && now - live.banner.at < 60_000 ? live.banner : null;
  const suggestion = recentBanner ? [recentBanner.title, recentBanner.ign].filter(Boolean).join(' — ') : '';
  const active = live.replay.active && live.replay.endsAt > now;

  const trigger = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await roll();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      // Never stuck on "Rolling…": the button is ready again whatever OBS / the network did.
      setBusy(false);
    }
  };

  const roll = async () => {
    const finalTitle = title.trim() || suggestion || 'Instant Replay';
    const finalSide = side || recentBanner?.side || null;
    const playInObs = connected && obs.autoSwitch;
    const eventP = triggerEvent(live, 'INSTANT_REPLAY', {
      side: finalSide,
      note: note.trim(),
      replayTitle: finalTitle,
      replaySeconds: obs.replaySeconds,
      replayObs: playInObs,
      data: { linkedSummary: recentBanner ? `${recentBanner.title} ${recentBanner.subtitle}` : '' },
    });
    // The overlay, whooshes and zooms follow the clip's real start and end in OBS.
    // The replay stays in OBS's replay folder; upload the good ones in Media & Replays (they then play on the break screen).
    const onSaved = () => undefined;
    const clipP = connected ? obsBridge.playInstantReplay(obs, (t) => void eventP.then(() => replayPlaying(t.playingAt, t.endsAt)).catch(() => {}), onSaved) : Promise.resolve(null);
    const settled = await Promise.race([Promise.allSettled([eventP, clipP]), new Promise<null>((r) => setTimeout(() => r(null), 20_000))]);
    if (!settled) {
      toast.error('OBS / the network is taking too long — the replay button is ready again.');
      return;
    }
    const results = settled;
    results.forEach((r) => r.status === 'rejected' && toast.error((r.reason as Error).message));
    if (results[1].status === 'rejected' && playInObs) void eventP.then(() => replayWithoutObs(obs.replaySeconds)).catch(() => {});
    if (results[0].status === 'fulfilled') {
      toast.success(
        connected
          ? obs.autoSwitch
            ? `Replay rolling — back to "${obs.hudScene || 'previous scene'}" when the clip ends`
            : 'Replay saved in OBS'
          : 'Replay frame on air — press your OBS Replay Buffer hotkey (OBS not connected)',
      );
      setTitle('');
      setNote('');
      setSide('');
    }
  };

  return (
    <div className="mt-2" data-testid="replay-trigger">
      <div className="flex gap-2">
        <button
          onClick={() => void trigger()}
          disabled={busy}
          className="flex h-14 flex-1 items-center justify-center gap-2 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-700 font-display text-2xl uppercase leading-none text-white shadow transition hover:brightness-110 active:scale-[0.99] disabled:opacity-60"
        >
          <Clapperboard className="h-5 w-5" /> {busy ? 'Rolling…' : `Instant replay (${obs.replaySeconds}s)`}
          <span className="font-cond text-xs font-semibold normal-case tracking-wide text-white/80">{connected ? (obs.replayZoom ? 'OBS · zoom' : 'OBS') : 'OBS not connected'}</span>
        </button>
        {active && (
          <Button size="lg" variant="secondary" className="h-14" icon={<X className="h-5 w-5" />} onClick={() => toast.run(() => Promise.all([clearReplay(), connected ? obsBridge.endReplay(true) : null]))}>
            End ({Math.ceil((live.replay.endsAt - now) / 1000)}s)
          </Button>
        )}
        <Button size="lg" variant="ghost" className="h-14 px-3" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Headline, what the replay shows, team (optional)">
          <ChevronDown className={cn('h-5 w-5 transition', open && 'rotate-180')} />
        </Button>
      </div>
      {open && (
        <div className="mt-2 grid gap-2 rounded-xl border border-line p-3 md:grid-cols-[1fr_1.4fr_auto]">
          <Field label="Headline">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={suggestion || 'e.g. LORD STEAL — Kairi'} />
          </Field>
          <Field label="What the replay shows (casters narrate it)">
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
      )}
    </div>
  );
}
