import { useEffect, useState } from 'react';
import { Pause, Play, Timer } from 'lucide-react';
import type { LiveState, Side } from '@/types';
import { POSITION_LABEL } from '@/lib/constants';
import { sideTeam } from '@/services/facts';
import { clockAdjust, clockPause, clockResume, clockSet } from '@/services/live';
import { formatClock, gameElapsedMs, parseClock } from '@/lib/clock';
import { Avatar } from '@/components/Brand';
import { Button, Card, Input, Modal, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

export interface PickRequest {
  title: string;
  /** Sides whose players can be picked (kills: both; objectives: the side that took it). */
  sides: Side[];
  /** Objectives: offer the "steal" toggle and a "no specific player" choice. */
  objective?: boolean;
  /** Kill streaks: choose the players who died — at least 1, at most `max` (Double 2, Triple 3, Maniac 4, Savage 5). */
  multi?: { max: number; preselectAll?: boolean };
}

/**
 * "Who got it?" — after clicking First Blood / Double Kill / Turtle / Purple
 * Buff… pick the player here (or press 1–5 for the first team, 6–0 for the second).
 */
export function PlayerPicker({
  live,
  request,
  onPick,
  onPickMany,
  onClose,
}: {
  live: LiveState;
  request: PickRequest | null;
  onPick: (side: Side, index: number | null, steal: boolean) => void;
  onPickMany?: (side: Side, indexes: number[]) => void;
  onClose: () => void;
}) {
  const [steal, setSteal] = useState(false);
  const [chosen, setChosen] = useState<number[]>([]);
  const multi = request?.multi;
  useEffect(() => {
    setSteal(false);
    const side = request?.sides[0];
    setChosen(request?.multi?.preselectAll && side ? live[side].players.map((_, i) => i).slice(0, request.multi.max) : []);
  }, [request]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = (index: number) =>
    setChosen((c) => (c.includes(index) ? c.filter((x) => x !== index) : c.length >= (multi?.max ?? 1) ? c : [...c, index]));
  const confirmMany = () => {
    if (request && multi && chosen.length) onPickMany?.(request.sides[0], [...chosen].sort());
  };

  useEffect(() => {
    if (!request) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key.toLowerCase() === 's' && request.objective) return setSteal((v) => !v);
      if (multi && e.key === 'Enter') return confirmMany();
      const n = '1234567890'.indexOf(e.key);
      if (n < 0) return;
      const side = request.sides[Math.floor(n / 5)];
      const index = n % 5;
      if (!side || !live[side].players[index]) return;
      if (multi) return toggle(index);
      onPick(side, index, steal);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [request, live, steal, onPick, multi, chosen]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Modal open={!!request} onClose={onClose} title={request?.title ?? ''} wide={(request?.sides.length ?? 1) > 1}>
      {request && (
        <>
          <div className={cn('grid gap-4', request.sides.length > 1 && 'md:grid-cols-2')}>
            {request.sides.map((side, si) => {
              const team = sideTeam(live, side);
              return (
                <div key={side}>
                  <p className={cn('mb-2 font-display text-xl uppercase leading-none', side === 'blue' ? 'text-sky-500' : 'text-brand')}>{team?.name ?? side}</p>
                  <div className="grid gap-2">
                    {live[side].players.map((p, i) => (
                      <button
                        key={`${p.playerId}-${i}`}
                        onClick={() => (multi ? toggle(i) : onPick(side, i, steal))}
                        className={cn(
                          'flex items-center gap-3 rounded-xl border px-3 py-2 text-left transition hover:-translate-y-0.5',
                          side === 'blue' ? 'border-sky-500/40 hover:bg-sky-500/10' : 'border-brand/40 hover:bg-brand/10',
                          multi && chosen.includes(i) && (side === 'blue' ? 'bg-sky-500/15 ring-2 ring-sky-500' : 'bg-brand/15 ring-2 ring-brand'),
                          multi && !chosen.includes(i) && chosen.length >= multi.max && 'opacity-40',
                        )}
                      >
                        <span className="w-5 text-center font-display text-lg text-muted">{(si * 5 + i + 1) % 10}</span>
                        <Avatar url={p.photoUrl} name={p.ign} size={40} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold">{p.ign}</span>
                          <span className="block truncate text-xs text-muted">
                            {POSITION_LABEL[p.role] ?? p.role}
                            {p.hero ? ` · ${p.hero}` : ''} · {p.k}/{p.d}/{p.a}
                          </span>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
          {multi && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <p className="text-sm text-muted">
                Pick up to <strong className="text-fg">{multi.max}</strong> — only the ones not already counted (e.g. 1 if you already pressed +1 Kill). Selected {chosen.length}/{multi.max}.
              </p>
              <Button disabled={!chosen.length} onClick={confirmMany}>
                Confirm {chosen.length} kill{chosen.length === 1 ? '' : 's'} (Enter)
              </Button>
            </div>
          )}
          {request.objective && (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
              <Switch checked={steal} onChange={setSteal} label={<span className="text-sm">It was a <strong>steal</strong> (key S)</span>} />
              <Button size="sm" variant="ghost" onClick={() => onPick(request.sides[0], null, steal)}>
                No specific player
              </Button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/** Game clock: counts the battle time (shown on the HUD), with pause and sync to the in-game timer. */
export function GameClockCard({ live, now }: { live: LiveState; now: number }) {
  const toast = useToast();
  const [text, setText] = useState('');
  const elapsed = gameElapsedMs(live, now);
  const paused = Boolean(live.clockPausedAt);
  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Timer className="h-5 w-5 text-brand" /> Game clock
        </span>
      }
      subtitle="Starts with Start Game, pauses on a mid-game break, stops when the game ends — the duration is saved with the result."
    >
      <div className="flex flex-wrap items-center gap-3">
        <span className={cn('font-display text-6xl leading-none tabular', paused && 'text-amber-500')}>{formatClock(elapsed)}</span>
        {paused ? (
          <Button icon={<Play className="h-4 w-4" />} onClick={() => toast.run(() => clockResume(live))}>
            Resume
          </Button>
        ) : (
          <Button variant="secondary" icon={<Pause className="h-4 w-4" />} disabled={!live.gameStartedAt} onClick={() => toast.run(() => clockPause(live))}>
            Pause
          </Button>
        )}
        {[-10, -1, 1, 10].map((d) => (
          <Button key={d} size="sm" variant="ghost" disabled={!live.gameStartedAt} onClick={() => toast.run(() => clockAdjust(live, d))}>
            {d > 0 ? `+${d}s` : `${d}s`}
          </Button>
        ))}
        <span className="flex items-center gap-1">
          <Input className="h-9 w-24" placeholder="mm:ss" value={text} onChange={(e) => setText(e.target.value)} />
          <Button
            size="sm"
            variant="secondary"
            onClick={() => {
              const s = parseClock(text);
              if (s === null) return toast.error('Type the in-game time like 12:34');
              void toast.run(() => clockSet(live, s), 'Clock synced');
              setText('');
            }}
          >
            Set
          </Button>
        </span>
      </div>
    </Card>
  );
}
