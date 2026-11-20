import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronDown, ChevronUp, Lock, Mic2, Power } from 'lucide-react';
import type { LiveState } from '@/types';
import { boothEngine, requestBoothStop, type EngineStatus, loadEngineSettings } from '@/services/commentary';
import { CASTER_BY_ID, autoAssignVoices, loadVoices, speechSupported, loadSavedVoiceMap } from '@/services/casters';
import { loadGeminiVoices } from '@/services/tts';
import { useBooth, useLive, useNow, useSettings } from '@/hooks/useFirestore';
import { STORAGE_KEYS } from '@/lib/constants';
import { cn, safeLocalGet, safeLocalSet } from '@/lib/utils';
import { CasterAvatar } from '@/components/Brand';

let configured = false;

/**
 * Keeps the ONE casting engine configured for the whole admin app, so the
 * casters keep talking while you work in the Live Controller (same tab — no
 * second window needed). Settings/voices come from this computer's Caster
 * Booth choices; on-air names from Settings → Casters.
 */
export function BoothKeeper() {
  const settings = useSettings();
  const profiles = settings.data.casterProfiles;

  useEffect(() => {
    if (configured) return;
    configured = true;
    boothEngine.setSettings(loadEngineSettings());
    boothEngine.setGeminiVoices(loadGeminiVoices());
    void loadVoices().then((vs) => {
      const saved = loadSavedVoiceMap(safeLocalGet, safeLocalSet, STORAGE_KEYS.boothVoices);
      const merged = { ...autoAssignVoices(vs) } as Record<string, string | null>;
      for (const [k, v] of Object.entries(saved)) if (v && vs.some((x) => x.voiceURI === v)) merged[k] = v;
      boothEngine.setVoices(vs, merged);
    });
  }, []);

  useEffect(() => {
    boothEngine.setCasterNames(Object.fromEntries(Object.entries(profiles).map(([id, p]) => [id, p.displayName ?? ''])));
  }, [profiles]);

  return <BoothFloat profiles={profiles} />;
}

export function useBoothStatus() {
  const [status, setStatus] = useState<EngineStatus>(() => boothEngine.status());
  useEffect(() => boothEngine.subscribe(setStatus), []);
  return status;
}

/** Casters running in ANOTHER tab/window (from the booth heartbeat). */
export function useOtherBooth() {
  const booth = useBooth();
  const now = useNow(5000);
  const d = booth.data;
  return d && d.online && d.engineId && d.engineId !== boothEngine.engineId && now - d.lastBeat < 40_000 ? d.engineId : null;
}

type Profiles = Record<string, { avatarUrl: string; displayName: string }>;

/**
 * Bottom-right corner of every admin page (except the booth): "On the mic"
 * (the caster pair for this game, hide/show) above the on-air pill.
 */
function BoothFloat({ profiles }: { profiles: Profiles }) {
  const live = useLive();
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin/booth')) return null;
  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {live.data.matchId && live.data.casters.length > 0 && <OnTheMic live={live.data} profiles={profiles} />}
      <BoothPill profiles={profiles} />
    </div>
  );
}

const MIC_KEY = 'tcc.onTheMicOpen';

/** The two casters seated for this game (picked by the system, locked for the game). */
export function OnTheMic({ live, profiles }: { live: LiveState; profiles: Profiles }) {
  const [open, setOpen] = useState(() => safeLocalGet<boolean>(MIC_KEY, true));
  const toggle = () =>
    setOpen((o) => {
      safeLocalSet(MIC_KEY, !o);
      return !o;
    });
  const name = (id: string) => profiles[id]?.displayName || CASTER_BY_ID[id]?.name || id;
  if (!open)
    return (
      <button onClick={toggle} className="flex items-center gap-2 rounded-full border border-line bg-surface/95 py-1 pl-1 pr-3 text-xs font-semibold shadow-lg backdrop-blur hover:border-brand" data-testid="on-the-mic-toggle" title="Show who is on the mic">
        <span className="flex -space-x-2">
          {live.casters.map((id) => (
            <CasterAvatar key={id} casterId={id} url={profiles[id]?.avatarUrl} size={24} />
          ))}
        </span>
        On the mic
        <ChevronUp className="h-3.5 w-3.5 text-muted" />
      </button>
    );
  return (
    <div className="w-[min(92vw,420px)] rounded-2xl border border-line bg-surface/95 p-3 shadow-xl backdrop-blur" data-testid="on-the-mic">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 font-cond text-xs font-semibold uppercase tracking-wider text-muted">
          <Mic2 className="h-3.5 w-3.5 text-brand" /> On the mic · Game {live.gameNumber}
          <Lock className="h-3 w-3" />
        </p>
        <button onClick={toggle} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface2 hover:text-fg" aria-label="Hide On the mic">
          Hide <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {live.casters.map((id) => (
          <div key={id} className="flex items-center gap-2 rounded-xl border border-brand/60 bg-brand/10 px-2.5 py-1.5">
            <CasterAvatar casterId={id} url={profiles[id]?.avatarUrl} size={28} />
            <span className="leading-tight">
              <span className="block text-sm font-semibold">{name(id)}</span>
              <span className="block text-[11px] text-muted">{CASTER_BY_ID[id]?.role}</span>
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted">
        A new random pair every game.{' '}
        <Link to="/admin/booth" className="text-brand underline">
          Voices &amp; settings
        </Link>
      </p>
    </div>
  );
}

/** On-air pill: who is talking + Start/Stop. */
function BoothPill({ profiles }: { profiles: Profiles }) {
  const status = useBoothStatus();
  const live = useLive();
  const other = useOtherBooth();
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin/booth') || !speechSupported()) return null;
  if (!status.running && !live.data.matchId && !other) return null;
  const sp = status.speaking;
  if (!status.running && other) {
    return (
      <div className="flex max-w-[min(92vw,460px)] items-center gap-3 rounded-2xl border border-amber-500/50 bg-surface/95 p-2 pl-3 shadow-xl backdrop-blur">
        <Mic2 className="h-5 w-5 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1 text-xs">
          <p className="font-cond font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Casters on air in another tab</p>
          <p className="truncate font-semibold">Run them here instead, or stop them.</p>
        </div>
        <button onClick={() => void requestBoothStop(other)} className="h-9 shrink-0 rounded-xl bg-ink-700 px-3 text-xs font-bold text-white hover:bg-ink-600">
          Stop them
        </button>
        <button onClick={() => boothEngine.start()} className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl bg-brand px-3 text-xs font-bold text-white hover:brightness-110">
          <Power className="h-4 w-4" /> Move here
        </button>
      </div>
    );
  }
  return (
    <div className="flex max-w-[min(92vw,420px)] items-center gap-3 rounded-2xl border border-line bg-surface/95 p-2 pl-3 shadow-xl backdrop-blur">
      {sp ? (
        <CasterAvatar casterId={sp.casterId} url={profiles[sp.casterId]?.avatarUrl} size={32} speaking />
      ) : (
        <Mic2 className={cn('h-5 w-5 shrink-0', status.running ? 'text-brand' : 'text-muted')} />
      )}
      <div className="min-w-0 flex-1 text-xs">
        <p className="font-cond font-semibold uppercase tracking-wider text-muted">{status.running ? 'Casters on air' : 'Casters are off'}</p>
        <p className="truncate font-semibold">
          {sp ? `${profiles[sp.casterId]?.displayName || CASTER_BY_ID[sp.casterId]?.name}: ${sp.text}` : status.running ? 'Listening to the controller…' : 'Start them here — no extra tab needed'}
        </p>
      </div>
      <button
        onClick={() => (status.running ? boothEngine.stop() : boothEngine.start())}
        className={cn('flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-bold text-white', status.running ? 'bg-ink-700 hover:bg-ink-600' : 'bg-brand hover:brightness-110')}
      >
        <Power className="h-4 w-4" /> {status.running ? 'Stop' : 'Start'}
      </button>
    </div>
  );
}
