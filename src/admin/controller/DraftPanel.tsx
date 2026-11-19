import { useState } from 'react';
import { Lock, Pause, Play, RotateCcw, Timer, Undo2, Zap } from 'lucide-react';
import type { LiveState } from '@/types';
import { DRAFT_SEQUENCE } from '@/lib/constants';
import { draftLock, draftReset, draftSetSlot, draftUndo, startGame, timerPause, timerReset, timerSetDuration, timerStart } from '@/services/live';
import { sideTeam } from '@/services/facts';
import { useNow } from '@/hooks/useFirestore';
import { HeroInput } from '@/components/game';
import { Button, Card, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

type SlotKey = 'blueBans' | 'redBans' | 'bluePicks' | 'redPicks';

export function DraftPanel({ live }: { live: LiveState }) {
  const toast = useToast();
  const now = useNow(250);
  const [hero, setHero] = useState('');
  const [editing, setEditing] = useState<{ key: SlotKey; index: number; value: string } | null>(null);
  const d = live.draft;
  const step = DRAFT_SEQUENCE[d.step];
  const done = d.step >= DRAFT_SEQUENCE.length;
  const left = d.timerEndsAt ? Math.max(0, Math.ceil((d.timerEndsAt - now) / 1000)) : (d.timerPausedLeft ?? d.timerDuration);
  const used = new Set([...d.blueBans, ...d.redBans, ...d.bluePicks, ...d.redPicks].filter(Boolean).map((h) => h.toLowerCase()));

  const lock = async () => {
    const h = hero.trim();
    if (!h) return;
    if (used.has(h.toLowerCase())) return toast.error(`${h} is already banned or picked`);
    await toast.run(() => draftLock(live, h));
    setHero('');
  };

  const activeKey: SlotKey | null = step ? (`${step.side}${step.kind === 'ban' ? 'Bans' : 'Picks'}` as SlotKey) : null;

  const column = (side: 'blue' | 'red') => {
    const team = sideTeam(live, side);
    const bansKey = `${side}Bans` as SlotKey;
    const picksKey = `${side}Picks` as SlotKey;
    return (
      <div className={cn('rounded-2xl border p-3', side === 'blue' ? 'border-sky-500/40 bg-sky-500/5' : 'border-brand/40 bg-brand/5')}>
        <p className={cn('mb-2 font-display text-2xl uppercase leading-none', side === 'blue' ? 'text-sky-500' : 'text-brand')}>{team?.name ?? side}</p>
        <p className="label">Bans</p>
        <div className="mb-3 grid grid-cols-5 gap-1.5">
          {d[bansKey].map((h, i) => (
            <Slot key={i} hero={h} active={activeKey === bansKey && step?.index === i} ban onClick={() => setEditing({ key: bansKey, index: i, value: h })} />
          ))}
        </div>
        <p className="label">Picks</p>
        <div className="space-y-1.5">
          {d[picksKey].map((h, i) => (
            <Slot key={i} hero={h} label={live[side].players[i]?.ign} active={activeKey === picksKey && step?.index === i} onClick={() => setEditing({ key: picksKey, index: i, value: h })} />
          ))}
        </div>
      </div>
    );
  };

  return (
    <Card
      title="Drafting phase"
      subtitle="Type a hero and press Enter to lock the highlighted slot. Click any slot to correct it."
      actions={
        <>
          <Button size="sm" variant="secondary" icon={<Undo2 className="h-4 w-4" />} disabled={d.step === 0} onClick={() => toast.run(() => draftUndo(live))}>
            Undo
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              if (confirm('Clear the whole draft?')) void toast.run(() => draftReset(live));
            }}
          >
            Reset
          </Button>
        </>
      }
    >
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(260px,320px)_1fr]">
        {column('blue')}

        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface2 p-4">
          <div className="text-center">
            <p className="font-cond text-xs font-semibold uppercase tracking-wider text-muted">{done ? 'Draft complete' : step?.phase}</p>
            <p className={cn('font-display text-3xl uppercase leading-none', step?.side === 'blue' ? 'text-sky-500' : 'text-brand')}>
              {done ? 'Ready' : `${step.side} ${step.kind} ${step.index + 1}`}
            </p>
            <p className={cn('mt-2 font-display text-7xl leading-none tabular', left <= 5 && d.timerEndsAt ? 'text-brand' : '')}>{left}</p>
          </div>
          <div className="flex justify-center gap-1.5">
            {d.timerEndsAt ? (
              <Button size="sm" variant="secondary" icon={<Pause className="h-4 w-4" />} onClick={() => toast.run(() => timerPause(live))}>
                Pause
              </Button>
            ) : (
              <Button size="sm" variant="secondary" icon={<Play className="h-4 w-4" />} disabled={done} onClick={() => toast.run(() => timerStart(live))}>
                Start
              </Button>
            )}
            <Button size="sm" variant="secondary" icon={<RotateCcw className="h-4 w-4" />} disabled={done} onClick={() => toast.run(() => timerReset(live))}>
              Reset
            </Button>
            <span className="inline-flex items-center gap-1">
              <Timer className="h-4 w-4 text-muted" />
              <Input type="number" min={5} max={120} value={d.timerDuration} onChange={(e) => void timerSetDuration(live, Math.max(5, Number(e.target.value) || 30))} className="h-8 w-16 px-2 py-1" />
            </span>
          </div>
          {!done ? (
            <div className="space-y-2">
              <HeroInput value={hero} onChange={setHero} onEnter={lock} autoFocus placeholder={`${step.side === 'blue' ? 'Blue' : 'Red'} ${step.kind}…`} />
              <Button className="w-full" icon={<Lock className="h-4 w-4" />} onClick={lock} disabled={!hero.trim()}>
                Lock in
              </Button>
            </div>
          ) : (
            <Button size="lg" className="w-full" icon={<Zap className="h-5 w-5" />} onClick={() => toast.run(() => startGame(live), 'Game started — HUD is live')}>
              Start Game {live.gameNumber}
            </Button>
          )}
          <p className="text-center text-xs text-muted">
            Step {Math.min(d.step + 1, DRAFT_SEQUENCE.length)} / {DRAFT_SEQUENCE.length} · finishing the draft queues Kuya Marco&apos;s draft breakdown.
          </p>
          {!done && (
            <Button variant="ghost" size="sm" onClick={() => toast.run(() => startGame(live), 'Game started')}>
              Skip draft & start game
            </Button>
          )}
        </div>

        {column('red')}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit slot">
        {editing && (
          <div className="space-y-3">
            <HeroInput value={editing.value} onChange={(value) => setEditing({ ...editing, value })} autoFocus id="mlbb-heroes-edit" />
            <div className="flex gap-2">
              <Button
                className="flex-1"
                onClick={async () => {
                  await toast.run(() => draftSetSlot(live, editing.key, editing.index, editing.value.trim()));
                  setEditing(null);
                }}
              >
                Save
              </Button>
              <Button
                variant="secondary"
                onClick={async () => {
                  await toast.run(() => draftSetSlot(live, editing.key, editing.index, ''));
                  setEditing(null);
                }}
              >
                Clear
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </Card>
  );
}

function Slot({ hero, active, ban, label, onClick }: { hero: string; active: boolean; ban?: boolean; label?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center justify-between gap-2 rounded-lg border px-2 text-left text-sm transition',
        ban ? 'h-10 justify-center text-center text-[11px] leading-tight' : 'h-10',
        hero ? 'border-line bg-surface' : 'border-dashed border-line text-muted',
        ban && hero && 'line-through decoration-brand/70',
        active && 'border-brand ring-2 ring-brand/40 animate-pulse',
      )}
    >
      <span className="truncate font-semibold">{hero || (ban ? '—' : 'Pick')}</span>
      {!ban && label && <span className="truncate text-xs text-muted">{label}</span>}
    </button>
  );
}
