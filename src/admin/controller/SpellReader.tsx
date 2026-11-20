import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Camera, Crosshair, Gauge, ScanEye, Settings2, Wand2 } from 'lucide-react';
import type { LiveState, Side } from '@/types';
import { obsBridge, getObsSettings } from '@/services/obs';
import { triggerEvent, updatePlayer } from '@/services/live';
import { sideTeam } from '@/services/facts';
import { loadImage, type Rect } from '@/services/goldReader';
import {
  SPELL_SLOTS,
  SpellTracker,
  boxBrightness,
  fillSlots,
  loadSpellReader,
  readSpells,
  readySlots,
  saveSpellReader,
  slotIndex,
  slotSide,
  spellReaderReady,
  type SlotReading,
  type SpellReaderSettings,
  type SpellSlot,
} from '@/services/spellReader';
import { SpellBadge } from '@/components/game';
import { Button, Card, Field, Modal, Select, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn, safeLocalGet, safeLocalSet, timeAgo } from '@/lib/utils';

// ── Shared state: settings (this computer), last status, screen order per game ──

interface SpellStatus {
  at: number;
  error?: string;
  /** Last spell the reader caught. */
  last?: string;
  readings?: SlotReading[];
}

let settings = loadSpellReader();
let status: SpellStatus | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => void listeners.delete(fn);
};
export function updateSpellReader(patch: Partial<SpellReaderSettings>) {
  settings = { ...settings, ...patch };
  saveSpellReader(settings);
  notify();
}
const setStatus = (s: SpellStatus) => {
  status = s;
  notify();
};
export function useSpellReader() {
  return { settings: useSyncExternalStore(subscribe, () => settings), status: useSyncExternalStore(subscribe, () => status), update: updateSpellReader };
}

/** Which lineup player sits in each screen slot (top to bottom) — the game's order can differ from the lineup. */
type ScreenOrder = Record<Side, number[]>;
const ORDER_KEY = 'tcc-spell-order';
const IDENTITY: ScreenOrder = { blue: [0, 1, 2, 3, 4], red: [0, 1, 2, 3, 4] };
const orderKey = (live: Pick<LiveState, 'matchId' | 'gameNumber'>) => `${live.matchId ?? 'none'}:${live.gameNumber}`;
export function screenOrder(live: Pick<LiveState, 'matchId' | 'gameNumber'>): ScreenOrder {
  const all = safeLocalGet<Record<string, ScreenOrder>>(ORDER_KEY, {});
  const o = all[orderKey(live)];
  return o && Array.isArray(o.blue) && Array.isArray(o.red) ? o : IDENTITY;
}
function saveScreenOrder(live: Pick<LiveState, 'matchId' | 'gameNumber'>, order: ScreenOrder) {
  const all = safeLocalGet<Record<string, ScreenOrder>>(ORDER_KEY, {});
  // Keep the last few games only.
  const entries = Object.entries({ ...all, [orderKey(live)]: order }).slice(-8);
  safeLocalSet(ORDER_KEY, Object.fromEntries(entries));
  notify();
}

/** Runs in the admin while a game is on: reads the spell icons ~once a second. */
export function SpellKeeper({ live }: { live: LiveState }) {
  const { settings: s } = useSpellReader();
  const liveRef = useRef(live);
  liveRef.current = live;
  useEffect(() => {
    if (!s.enabled || !spellReaderReady(s)) return;
    const tracker = new SpellTracker();
    let busy = false;
    let lastGame = '';
    const tick = async () => {
      const L = liveRef.current;
      if (busy || L.phase !== 'ingame' || !L.gameStartedAt || L.clockPausedAt) return;
      if (!obsBridge.connected) return setStatus({ at: Date.now(), error: 'Connect OBS (Settings → OBS) to read the battle spells' });
      const game = orderKey(L);
      if (game !== lastGame) {
        tracker.reset();
        lastGame = game;
      }
      busy = true;
      try {
        const frame = await obsBridge.screenshot(s.source || getObsSettings().gameFeedScene, 960);
        const img = await loadImage(frame);
        const readings = readSpells(img, s);
        const changes = tracker.update(readings);
        const order = screenOrder(L);
        let last: string | undefined;
        for (const c of changes) {
          const side = slotSide(c.slot);
          const index = order[side][slotIndex(c.slot)] ?? slotIndex(c.slot);
          const now = liveRef.current;
          const p = now[side].players[index];
          if (!p?.spell) continue;
          const onCd = Boolean(p.spellReadyAt && p.spellReadyAt > Date.now());
          if (c.state === 'cooldown' && !onCd) {
            // Used in the game → cooldown on the overlay + the casters call it.
            await triggerEvent(now, 'SPELL_USED', { side, playerIndex: index });
            last = `${p.ign} used ${p.spell}`;
          } else if (c.state === 'ready' && onCd) {
            // Back in the game → end the overlay timer right there (real cooldown).
            await updatePlayer(now, side, index, { spellReadyAt: null, spellUsedAt: null });
            last = `${p.ign}'s ${p.spell} is back`;
          }
        }
        setStatus({ at: Date.now(), readings, last: last ?? status?.last });
      } catch (e) {
        setStatus({ at: Date.now(), error: (e as Error).message });
      } finally {
        busy = false;
      }
    };
    const t = window.setInterval(() => void tick(), 1000);
    return () => clearInterval(t);
  }, [s]);
  return null;
}

/** Settings → Battle spells: auto reader switch, status, screen order and setup. */
export function SpellReaderCard({ live }: { live: LiveState }) {
  const { settings: s, status: st, update } = useSpellReader();
  const [setupOpen, setSetupOpen] = useState(false);
  const ready = spellReaderReady(s);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 3000);
    return () => clearInterval(t);
  }, []);
  const order = screenOrder(live);
  const onAir = Boolean(live.matchId && live.blue.players.length);

  return (
    <Card title="Battle spell cooldowns" subtitle="Read from the game feed — used spells start their cooldown on the overlay by themselves and the casters call them.">
      <div className="rounded-xl border border-line bg-surface2 p-3" data-testid="spell-reader">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Switch
            checked={s.enabled && ready}
            disabled={!ready}
            onChange={(enabled) => update({ enabled })}
            label={<span className="text-sm font-semibold">Auto — read the battle spells from the game</span>}
          />
          <Button size="xs" variant="ghost" icon={<Settings2 className="h-3.5 w-3.5" />} onClick={() => setSetupOpen(true)}>
            {ready ? 'Spell reader setup' : 'Set up (2 min)'}
          </Button>
        </div>
        <p className={cn('mt-1 text-xs', st?.error ? 'text-amber-600 dark:text-amber-400' : 'text-muted')}>
          {!ready
            ? 'Mark the 10 battle spell icons of the spectator screen once and calibrate with every spell ready. Until then, click a spell in the Live Controller when it is used.'
            : !s.enabled
              ? 'Off — click the spell in the Live Controller when a player uses it.'
              : st?.error
                ? `${st.error} · ${timeAgo(st.at)}`
                : st
                  ? `Reading ${readySlots(s).length} spell icons every second${st.last ? ` · last: ${st.last}` : ''} · ${timeAgo(st.at)}`
                  : 'Reads every second while a game is on (not during pauses).'}
        </p>
      </div>

      {onAir && ready && (
        <div className="mt-3">
          <p className="label">Screen order this game (top to bottom on the game&apos;s spectator screen)</p>
          <div className="grid gap-3 sm:grid-cols-2">
            {(['blue', 'red'] as const).map((side) => (
              <div key={side} className={cn('space-y-1 rounded-xl border p-2', side === 'blue' ? 'border-sky-500/40' : 'border-brand/40')}>
                <p className={cn('font-cond text-xs font-bold uppercase tracking-wider', side === 'blue' ? 'text-sky-500' : 'text-brand')}>{sideTeam(live, side)?.name ?? side}</p>
                {[0, 1, 2, 3, 4].map((slot) => {
                  const idx = order[side][slot] ?? slot;
                  const p = live[side].players[idx];
                  return (
                    <div key={slot} className="flex items-center gap-2 text-xs">
                      <span className="w-12 shrink-0 text-muted">Slot {slot + 1}</span>
                      <SpellBadge spell={p?.spell ?? null} readyAt={p?.spellReadyAt} usedAt={p?.spellUsedAt} now={Date.now()} size={22} />
                      <Select
                        className="h-7 py-0 text-xs"
                        value={idx}
                        onChange={(e) => {
                          const next = { ...order, [side]: [...order[side]] };
                          const v = Number(e.target.value);
                          const other = next[side].indexOf(v);
                          if (other >= 0) next[side][other] = next[side][slot];
                          next[side][slot] = v;
                          saveScreenOrder(live, next);
                        }}
                      >
                        {live[side].players.map((pl, i) => (
                          <option key={pl.playerId} value={i}>
                            {pl.ign}
                            {pl.spell ? ` · ${pl.spell}` : ' · no spell'}
                          </option>
                        ))}
                      </Select>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <p className="mt-1 text-[11px] text-muted">The game lists players in lobby order — match each slot to the right player once per game. Spells come from the Drafting phase.</p>
        </div>
      )}

      <SpellReaderSetup open={setupOpen} onClose={() => setSetupOpen(false)} live={live} />
    </Card>
  );
}

const SLOT_COLOR: Record<Side, string> = { blue: '#0ea5e9', red: '#f8312f' };

function SpellReaderSetup({ open, onClose, live }: { open: boolean; onClose: () => void; live: LiveState }) {
  const toast = useToast();
  const { settings: saved, update } = useSpellReader();
  const [draft, setDraft] = useState(saved);
  const [frame, setFrame] = useState<string | null>(null);
  const [target, setTarget] = useState<SpellSlot>('blue0');
  const [drag, setDrag] = useState<{ x: number; y: number } | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [test, setTest] = useState<SlotReading[] | null>(null);
  const [busy, setBusy] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(saved);
    setTest(null);
    if (obsBridge.connected) void Promise.all([obsBridge.listScenes(), obsBridge.listInputs()]).then(([a, b]) => setSources([...new Set([...a, ...b])])).catch(() => {});
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const grab = async () => {
    setBusy(true);
    const img = await toast.run(() => obsBridge.screenshot(draft.source || getObsSettings().gameFeedScene, 960));
    setBusy(false);
    if (img) setFrame(img);
    return img ?? null;
  };
  const point = (e: React.PointerEvent) => {
    const r = box.current!.getBoundingClientRect();
    return { x: Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)), y: Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)) };
  };
  const setRect = (k: SpellSlot, rect: Rect) => setDraft((d) => ({ ...d, slots: { ...d.slots, [k]: rect } }));

  /** Every spell is ready in this frame → remember how bright each icon is. */
  const calibrate = async () => {
    if (!frame) return;
    const img = await loadImage(frame);
    const baseline: SpellReaderSettings['baseline'] = {};
    for (const k of SPELL_SLOTS) if (draft.slots[k]) baseline[k] = boxBrightness(img, draft.slots[k]!);
    setDraft((d) => ({ ...d, baseline }));
    toast.success(`Calibrated ${Object.keys(baseline).length} spell icons`);
  };
  const runTest = async () => {
    const f = await grab();
    if (!f) return;
    const img = await loadImage(f);
    setTest(readSpells(img, draft));
  };

  const label = (k: SpellSlot) => {
    const side = slotSide(k);
    return `${side === 'blue' ? 'Blue' : 'Red'} ${slotIndex(k) + 1}`;
  };
  const marked = SPELL_SLOTS.filter((k) => draft.slots[k]).length;
  const calibrated = SPELL_SLOTS.filter((k) => draft.slots[k] && draft.baseline[k]).length;

  return (
    <Modal open={open} onClose={onClose} title="Battle spell reader setup" wide>
      <ol className="mb-3 list-decimal space-y-0.5 pl-5 text-sm text-muted">
        <li>
          Spectate a game where <strong className="text-fg">every battle spell is ready</strong> (e.g. right after the game starts), then <strong className="text-fg">Grab a frame</strong>.
        </li>
        <li>
          Pick a box below and <strong className="text-fg">drag a rectangle tightly around that player&apos;s battle spell icon</strong>. Mark slots 1 and 2 of a side, then <strong className="text-fg">Fill 3–5</strong>.
        </li>
        <li>
          <strong className="text-fg">Calibrate</strong> (spells ready in this frame) → <strong className="text-fg">Test</strong> while someone has a spell on cooldown → <strong className="text-fg">Save</strong>.
        </li>
      </ol>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Game feed (OBS scene/source)">
          <Select value={draft.source} onChange={(e) => setDraft({ ...draft, source: e.target.value })}>
            {!sources.includes(draft.source) && <option value={draft.source}>{draft.source}</option>}
            {sources.map((x) => (
              <option key={x}>{x}</option>
            ))}
          </Select>
        </Field>
        <Field label="Sensitivity (cooldown when darker than)">
          <Select value={draft.cooldownBelow} onChange={(e) => setDraft({ ...draft, cooldownBelow: Number(e.target.value), readyAbove: Math.min(0.92, Number(e.target.value) + 0.2) })}>
            {[0.5, 0.56, 0.62, 0.7, 0.76].map((v) => (
              <option key={v} value={v}>
                {Math.round(v * 100)}% of the ready brightness{v === 0.62 ? ' (default)' : ''}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button size="sm" loading={busy && !frame} disabled={!obsBridge.connected} icon={<Camera className="h-4 w-4" />} onClick={() => void grab()}>
          {frame ? 'Grab a new frame' : 'Grab a frame from OBS'}
        </Button>
        {(['blue', 'red'] as const).map((side) => (
          <Button key={side} size="sm" variant="ghost" icon={<Wand2 className="h-4 w-4" />} disabled={!draft.slots[`${side}0` as SpellSlot] || !draft.slots[`${side}1` as SpellSlot]} onClick={() => setDraft((d) => ({ ...d, slots: fillSlots(d.slots, side) }))}>
            Fill {side} 3–5
          </Button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {SPELL_SLOTS.map((k) => {
          const side = slotSide(k);
          const p = live[side].players[slotIndex(k)];
          return (
            <button
              key={k}
              onClick={() => setTarget(k)}
              className={cn('inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-semibold', target === k ? 'text-white' : 'border-line text-muted hover:text-fg')}
              style={target === k ? { background: SLOT_COLOR[side], borderColor: SLOT_COLOR[side] } : undefined}
            >
              <Crosshair className="h-3.5 w-3.5" />
              {label(k)}
              {p ? ` · ${p.ign}` : ''} {draft.slots[k] ? '✓' : ''}
            </button>
          );
        })}
      </div>
      {!obsBridge.connected && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">Connect OBS first (Settings → OBS).</p>}

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
          {SPELL_SLOTS.map((k) => {
            const r = draft.slots[k];
            if (!r) return null;
            const reading = test?.find((t) => t.slot === k);
            return (
              <span key={k} className="pointer-events-none absolute border-2" style={{ left: `${r.x * 100}%`, top: `${r.y * 100}%`, width: `${r.w * 100}%`, height: `${r.h * 100}%`, borderColor: SLOT_COLOR[slotSide(k)] }}>
                <span className="absolute -top-4 left-0 whitespace-nowrap rounded px-0.5 text-[9px] font-bold text-white" style={{ background: SLOT_COLOR[slotSide(k)] }}>
                  {slotIndex(k) + 1}
                  {reading ? ` ${reading.state === 'cooldown' ? 'CD' : reading.state === 'ready' ? 'OK' : '?'}` : ''}
                </span>
              </span>
            );
          })}
        </div>
      )}

      {test && (
        <div className="mt-3 grid grid-cols-2 gap-1 rounded-lg border border-line bg-surface2 p-2 text-xs sm:grid-cols-5" data-testid="spell-test">
          {test.map((t) => (
            <span key={t.slot} className={cn('rounded px-1.5 py-1', t.state === 'cooldown' ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300' : t.state === 'ready' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'text-muted')}>
              {label(t.slot)}: {t.state === 'cooldown' ? 'cooldown' : t.state === 'ready' ? 'ready' : 'unsure'} ({Math.round(t.ratio * 100)}%)
            </span>
          ))}
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" disabled={!frame || !marked} icon={<Gauge className="h-4 w-4" />} onClick={() => void calibrate()}>
          Calibrate — all spells ready here
        </Button>
        <Button variant="secondary" loading={busy && !!frame} disabled={!calibrated || !obsBridge.connected} icon={<ScanEye className="h-4 w-4" />} onClick={() => void runTest()}>
          Test now
        </Button>
        <span className="text-xs text-muted">
          {marked}/10 marked · {calibrated}/10 calibrated
        </span>
        <Button
          className="ml-auto"
          disabled={!spellReaderReady(draft)}
          onClick={() => {
            update({ ...draft, enabled: true });
            toast.success('Spell reader on — used spells start their cooldown by themselves');
            onClose();
          }}
        >
          Save &amp; turn on
        </Button>
      </div>
    </Modal>
  );
}
