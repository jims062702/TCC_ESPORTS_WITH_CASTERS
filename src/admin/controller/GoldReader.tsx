import { useEffect, useRef, useState } from 'react';
import { Camera, Crosshair, ScanText, Settings2 } from 'lucide-react';
import type { LiveState } from '@/types';
import { obsBridge, getObsSettings } from '@/services/obs';
import { setGoldDiff } from '@/services/live';
import {
  GoldFilter,
  goldReaderReady,
  loadGoldReader,
  loadImage,
  preparedCrop,
  readGold,
  saveGoldReader,
  type GoldReaderSettings,
  type GoldReading,
  type Rect,
} from '@/services/goldReader';
import { Button, Field, Modal, Select, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn, formatGold, timeAgo } from '@/lib/utils';

interface GoldStatus {
  at: number;
  reading?: GoldReading;
  error?: string;
}

/**
 * Keeps the gold difference in sync with the game: every few seconds it reads
 * the gold from the OBS game feed and updates the HUD — you only press
 * "Announce gold update".
 */
export function useAutoGold(live: LiveState) {
  const [settings, setSettings] = useState<GoldReaderSettings>(loadGoldReader);
  const [status, setStatus] = useState<GoldStatus | null>(null);
  const liveRef = useRef(live);
  liveRef.current = live;
  const filter = useRef(new GoldFilter());

  useEffect(() => {
    if (!settings.enabled || !goldReaderReady(settings)) return;
    let stopped = false;
    let busy = false;
    const tick = async () => {
      const L = liveRef.current;
      if (busy || L.phase !== 'ingame' || !obsBridge.connected) {
        if (!obsBridge.connected && !stopped) setStatus({ at: Date.now(), error: 'Connect OBS (Live Controller → OBS) to read the gold' });
        return;
      }
      busy = true;
      try {
        const frame = await obsBridge.screenshot(settings.source, 1280);
        const reading = await readGold(frame, settings);
        if (stopped) return;
        if (filter.current.accept(reading.diff)) {
          if (Math.abs(reading.diff - L.goldDiff) >= 100) await setGoldDiff(reading.diff);
          setStatus({ at: Date.now(), reading });
        } else {
          setStatus({ at: Date.now(), reading, error: 'Big jump — checking it on the next read' });
        }
      } catch (e) {
        if (!stopped) setStatus({ at: Date.now(), error: (e as Error).message });
      } finally {
        busy = false;
      }
    };
    void tick();
    const t = window.setInterval(() => void tick(), Math.max(2, settings.intervalSec) * 1000);
    return () => {
      stopped = true;
      clearInterval(t);
    };
  }, [settings]);

  const update = (patch: Partial<GoldReaderSettings>) => {
    const next = { ...settings, ...patch };
    saveGoldReader(next);
    setSettings(next);
    filter.current.reset();
  };
  return { settings, update, status };
}

/** Switch + status line shown in the Gold difference card. */
export function AutoGoldBar({ auto, live }: { auto: ReturnType<typeof useAutoGold>; live: LiveState }) {
  const [setupOpen, setSetupOpen] = useState(false);
  const { settings, update, status } = auto;
  const ready = goldReaderReady(settings);
  useNowTick(5000);
  return (
    <div className="mb-3 rounded-xl border border-line bg-surface2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Switch
          checked={settings.enabled && ready}
          disabled={!ready}
          onChange={(enabled) => update({ enabled })}
          label={<span className="text-sm font-semibold">Auto — read the gold from the game</span>}
        />
        <Button size="xs" variant="ghost" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => setSetupOpen(true)}>
          {ready ? 'Gold reader setup' : 'Set up (1 min)'}
        </Button>
      </div>
      <p className={cn('mt-1 text-xs', status?.error ? 'text-amber-600 dark:text-amber-400' : 'text-muted')}>
        {!ready
          ? 'Mark where the game shows the gold once — then the difference updates by itself and you just press Announce.'
          : !settings.enabled
            ? 'Off — the slider below is manual.'
            : status?.reading && !status.error
              ? `Read ${status.reading.blue !== undefined ? `${formatGold(status.reading.blue)} vs ${formatGold(status.reading.red ?? 0)} → ` : ''}${status.reading.diff === 0 ? 'even' : `${status.reading.diff > 0 ? 'blue' : 'red'} +${formatGold(status.reading.diff)}`} · ${timeAgo(status.at)}`
              : status?.error
                ? `${status.error} · ${timeAgo(status.at)}`
                : `Reading every ${settings.intervalSec}s while in-game…`}
      </p>
      <GoldReaderSetup open={setupOpen} onClose={() => setSetupOpen(false)} settings={settings} onSave={(s) => update(s)} live={live} />
    </div>
  );
}

function useNowTick(ms: number) {
  const [, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
}

type Target = 'blue' | 'red' | 'diff';
const TARGET_STYLE: Record<Target, { label: string; color: string }> = {
  blue: { label: 'Blue gold', color: '#0ea5e9' },
  red: { label: 'Red gold', color: '#f8312f' },
  diff: { label: 'Gold difference', color: '#fbbf24' },
};

function GoldReaderSetup({ open, onClose, settings, onSave, live }: { open: boolean; onClose: () => void; settings: GoldReaderSettings; onSave: (s: GoldReaderSettings) => void; live: LiveState }) {
  const toast = useToast();
  const [draft, setDraft] = useState(settings);
  const [frame, setFrame] = useState<string | null>(null);
  const [target, setTarget] = useState<Target>('blue');
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [test, setTest] = useState<{ text: string; crops: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(settings);
    setTest(null);
    setTarget(settings.mode === 'diff' ? 'diff' : 'blue');
    if (obsBridge.connected) void Promise.all([obsBridge.listScenes(), obsBridge.listInputs()]).then(([a, b]) => setSources([...new Set([...a, ...b])])).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = async () => {
    setBusy(true);
    const src = draft.source || getObsSettings().gameFeedScene;
    const img = await toast.run(() => obsBridge.screenshot(src, 1280));
    setBusy(false);
    if (img) setFrame(img);
  };

  const point = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const setRect = (t: Target, rect: Rect) => setDraft((d) => ({ ...d, [t]: rect }));

  const runTest = async () => {
    if (!frame) return;
    setBusy(true);
    try {
      const img = await loadImage(frame);
      const rects = (draft.mode === 'teams' ? [draft.blue, draft.red] : [draft.diff]).filter(Boolean) as Rect[];
      const crops = rects.map((r) => preparedCrop(img, r).toDataURL());
      const r = await readGold(frame, draft);
      setTest({ text: `Read "${r.text}" → ${r.diff === 0 ? 'even' : `${r.diff > 0 ? 'blue' : 'red'} ahead by ${formatGold(r.diff)}`} (confidence ${Math.round(r.confidence)}%)`, crops });
    } catch (e) {
      const img = await loadImage(frame).catch(() => null);
      const rects = (draft.mode === 'teams' ? [draft.blue, draft.red] : [draft.diff]).filter(Boolean) as Rect[];
      setTest({ text: (e as Error).message, crops: img ? rects.map((r) => preparedCrop(img, r).toDataURL()) : [] });
    }
    setBusy(false);
  };

  const targets: Target[] = draft.mode === 'teams' ? ['blue', 'red'] : ['diff'];

  return (
    <Modal open={open} onClose={onClose} title="Gold reader setup" wide>
      <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-sm text-muted">
        <li>Start a game (or spectate one) so the gold shows on screen, then <strong className="text-fg">Grab a frame from OBS</strong>.</li>
        <li>Choose what the game shows, pick a box below, and <strong className="text-fg">drag a rectangle tightly around the number</strong>.</li>
        <li>
          <strong className="text-fg">Test read</strong> — it should show the right numbers. Then <strong className="text-fg">Save</strong> and turn on Auto.
        </li>
      </ol>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Game feed (OBS scene/source)">
          <Select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}>
            {!sources.includes(draft.source) && <option value={draft.source}>{draft.source}</option>}
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field label="The game shows">
          <Select
            value={draft.mode}
            onChange={(e) => {
              const mode = e.target.value as GoldReaderSettings['mode'];
              setDraft({ ...draft, mode });
              setTarget(mode === 'diff' ? 'diff' : 'blue');
            }}
          >
            <option value="teams">Each team&apos;s gold (two numbers)</option>
            <option value="diff">The gold difference (one number, team colour)</option>
          </Select>
        </Field>
        <Field label="Read every">
          <Select value={draft.intervalSec} onChange={(e) => setDraft({ ...draft, intervalSec: Number(e.target.value) })}>
            {[3, 5, 10, 15].map((n) => (
              <option key={n} value={n}>
                {n} seconds
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" loading={busy && !frame} disabled={!obsBridge.connected} icon={<Camera className="h-4 w-4" />} onClick={capture}>
          {frame ? 'Grab a new frame' : 'Grab a frame from OBS'}
        </Button>
        {targets.map((t) => (
          <Button key={t} size="sm" variant={target === t ? 'primary' : 'secondary'} icon={<Crosshair className="h-4 w-4" />} onClick={() => setTarget(t)} style={target === t ? { background: TARGET_STYLE[t].color } : undefined}>
            {TARGET_STYLE[t].label} {draft[t] ? '✓' : ''}
          </Button>
        ))}
        <Switch checked={draft.flip} onChange={(flip) => setDraft({ ...draft, flip })} label={<span className="text-xs">Swap sides (game shows red on the left)</span>} />
      </div>
      {!obsBridge.connected && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Connect OBS first (Live Controller → OBS card).</p>}

      {frame && (
        <div
          ref={box}
          className="relative mt-3 cursor-crosshair select-none overflow-hidden rounded-lg border border-line"
          onPointerDown={(e) => {
            (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
            const p = point(e);
            setDrag(p);
            setRect(target, { x: p.x, y: p.y, w: 0.001, h: 0.001 });
          }}
          onPointerMove={(e) => {
            if (!drag) return;
            const p = point(e);
            setRect(target, { x: Math.min(drag.x, p.x), y: Math.min(drag.y, p.y), w: Math.abs(p.x - drag.x), h: Math.abs(p.y - drag.y) });
          }}
          onPointerUp={() => setDrag(null)}
        >
          <img src={frame} alt="OBS frame" className="block w-full" draggable={false} />
          {targets.map((t) => {
            const r = draft[t];
            if (!r) return null;
            return (
              <span
                key={t}
                className="pointer-events-none absolute border-2"
                style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, borderColor: TARGET_STYLE[t].color }}
              >
                <span className="absolute -top-5 left-0 whitespace-nowrap rounded px-1 text-[10px] font-bold text-white" style={{ background: TARGET_STYLE[t].color }}>
                  {TARGET_STYLE[t].label}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {test && (
        <div className="mt-3 rounded-lg border border-line bg-surface2 p-3 text-sm">
          <p>{test.text}</p>
          {test.crops.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-2">
              {test.crops.map((c, i) => (
                <img key={i} src={c} alt="What the reader sees" className="h-10 rounded border border-line bg-white" />
              ))}
              <span className="self-center text-xs text-muted">← what the reader sees (black digits on white is best)</span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="secondary" loading={busy && !!frame} disabled={!frame || !goldReaderReady(draft)} icon={<ScanText className="h-4 w-4" />} onClick={runTest}>
          Test read
        </Button>
        <Button
          className="ml-auto"
          disabled={!goldReaderReady(draft)}
          onClick={() => {
            onSave({ ...draft, enabled: true });
            toast.success(live.phase === 'ingame' ? 'Gold reader on — the difference now follows the game' : 'Gold reader saved — it runs during the game');
            onClose();
          }}
        >
          Save &amp; turn on
        </Button>
      </div>
    </Modal>
  );
}
