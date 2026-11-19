import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic2, Power } from 'lucide-react';
import { DEFAULT_ENGINE_SETTINGS, boothEngine, requestBoothStop, type EngineSettings, type EngineStatus } from '@/services/commentary';
import { CASTER_BY_ID, autoAssignVoices, loadVoices, speechSupported } from '@/services/casters';
import { loadGeminiVoices } from '@/services/tts';
import { useBooth, useLive, useNow, useSettings } from '@/hooks/useFirestore';
import { STORAGE_KEYS } from '@/lib/constants';
import { cn, safeLocalGet } from '@/lib/utils';
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
    boothEngine.setSettings({ ...DEFAULT_ENGINE_SETTINGS, ...safeLocalGet<EngineSettings>(STORAGE_KEYS.boothSettings, DEFAULT_ENGINE_SETTINGS) });
    boothEngine.setGeminiVoices(loadGeminiVoices());
    void loadVoices().then((vs) => {
      const saved = safeLocalGet<Record<string, string | null>>(STORAGE_KEYS.boothVoices, {});
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

/** Floating on-air pill (every admin page except the booth itself): who is talking + Start/Stop. */
function BoothFloat({ profiles }: { profiles: Record<string, { avatarUrl: string; displayName: string }> }) {
  const status = useBoothStatus();
  const live = useLive();
  const other = useOtherBooth();
  const { pathname } = useLocation();
  if (pathname.startsWith('/admin/booth') || !speechSupported()) return null;
  if (!status.running && !live.data.matchId && !other) return null;
  const sp = status.speaking;
  if (!status.running && other) {
    return (
      <div className="fixed bottom-4 right-4 z-50 flex max-w-[min(92vw,460px)] items-center gap-3 rounded-2xl border border-amber-500/50 bg-surface/95 p-2 pl-3 shadow-xl backdrop-blur">
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
    <div className="fixed bottom-4 right-4 z-50 flex max-w-[min(92vw,420px)] items-center gap-3 rounded-2xl border border-line bg-surface/95 p-2 pl-3 shadow-xl backdrop-blur">
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
