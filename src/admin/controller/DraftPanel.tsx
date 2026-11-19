import { useState } from 'react';
import { ArrowUpDown, Ban, Lock, Pause, Play, RotateCcw, Timer, Undo2, UserRound, Users, X, Zap } from 'lucide-react';
import type { LiveState, Player, Side, Team } from '@/types';
import { DRAFT_SEQUENCE, POSITION_LABEL, isNoBan, isPairSecond, isPairStart, picksComplete } from '@/lib/constants';
import { allHeroes, canonicalHero } from '@/lib/heroData';
import { applyLineups, draftLock, draftReset, draftSetSlot, draftSwapPicks, draftUndo, lineupsOf, startGame, timerPause, timerReset, timerSetDuration, timerStart } from '@/services/live';
import { sideTeam } from '@/services/facts';
import { useNow } from '@/hooks/useFirestore';
import { HeroCombo } from '@/components/game';
import { Button, Card, Input, Modal } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { LineupDialog } from './LineupDialog';

type SlotKey = 'blueBans' | 'redBans' | 'bluePicks' | 'redPicks';

/** Next empty pick slot for a side (where the overlay highlights the pick in progress). */
export const nextPickSlot = (picks: string[]) => picks.findIndex((h) => !h);

export function DraftPanel({ live, players, teams }: { live: LiveState; players: Player[]; teams: Team[] }) {
  const toast = useToast();
  const now = useNow(250);
  const [hero, setHero] = useState('');
  const [editing, setEditing] = useState<{ key: SlotKey; index: number; value: string } | null>(null);
  const [swapFrom, setSwapFrom] = useState<{ side: Side; index: number } | null>(null);
  const [lineupOpen, setLineupOpen] = useState(false);
  const d = live.draft;
  const step = DRAFT_SEQUENCE[d.step];
  const done = d.step >= DRAFT_SEQUENCE.length;
  const left = d.timerEndsAt ? Math.max(0, Math.ceil((d.timerEndsAt - now) / 1000)) : (d.timerPausedLeft ?? d.timerDuration);
  // "None" (a skipped ban) can be used any number of times.
  const used = new Set([...d.blueBans, ...d.redBans, ...d.bluePicks, ...d.redPicks].filter((h) => h && h.toLowerCase() !== 'none').map((h) => h.toLowerCase()));

  /** Lock a hero: the box empties at once, ready for the next one. */
  const lock = async (picked?: string) => {
    const typed = (picked ?? hero).trim();
    // A team can skip a ban: type "none" (or press No ban).
    if (isNoBan(typed)) {
      if (step?.kind !== 'ban') return toast.error('“none” is only for bans — every pick needs a hero.');
      setHero('');
      return void toast.run(() => draftLock(live, 'none'));
    }
    const h = canonicalHero(typed);
    if (!h) return;
    if (used.has(h.toLowerCase())) return toast.error(`${h} is already banned or picked`);
    if (!allHeroes().some((x) => x.toLowerCase() === h.toLowerCase())) return toast.error(`No hero named “${h}”. New heroes can be added in Settings → Heroes.`);
    setHero('');
    const ok = await toast.run(async () => {
      await draftLock(live, h);
      return true;
    });
    if (!ok) setHero(h);
  };
  const pair = step ? isPairStart(d.step) || isPairSecond(d.step) : false;
  /** The game can start only when all 10 picks are in (bans may be "none"). */
  const ready = picksComplete(d);
  const missingPicks = [...d.bluePicks, ...d.redPicks].filter((h) => !h).length;

  /** Click ⇅ on one player, then ⇅ on a teammate: their heroes are traded. */
  const swap = (side: Side, index: number) => {
    if (!swapFrom || swapFrom.side !== side) return setSwapFrom({ side, index });
    if (swapFrom.index === index) return setSwapFrom(null);
    const a = live[side].players[swapFrom.index]?.ign ?? `slot ${swapFrom.index + 1}`;
    const b = live[side].players[index]?.ign ?? `slot ${index + 1}`;
    void toast.run(() => draftSwapPicks(live, side, swapFrom.index, index), `Heroes swapped: ${a} ⇄ ${b}`);
    setSwapFrom(null);
  };

  const activeKey: SlotKey | null = step ? (`${step.side}${step.kind === 'ban' ? 'Bans' : 'Picks'}` as SlotKey) : null;

  const column = (side: Side) => {
    const team = sideTeam(live, side);
    const bansKey = `${side}Bans` as SlotKey;
    const picksKey = `${side}Picks` as SlotKey;
    const coach = live[side].coach;
    const nextPick = activeKey === picksKey ? nextPickSlot(d[picksKey]) : -1;
    return (
      <div className={cn('rounded-2xl border p-3', side === 'blue' ? 'border-sky-500/40 bg-sky-500/5' : 'border-brand/40 bg-brand/5')}>
        <p className={cn('font-display text-2xl uppercase leading-none', side === 'blue' ? 'text-sky-500' : 'text-brand')}>{team?.name ?? side}</p>
        <p className="mb-2 mt-1 flex items-center gap-1 text-xs text-muted">
          <UserRound className="h-3.5 w-3.5" /> Coach: <span className="font-semibold text-fg">{coach?.name || 'No coach'}</span>
        </p>
        <p className="label">Bans</p>
        <div className="mb-3 grid grid-cols-5 gap-1.5">
          {d[bansKey].map((h, i) => (
            <Slot key={i} hero={h} active={activeKey === bansKey && step?.index === i} ban onClick={() => setEditing({ key: bansKey, index: i, value: h })} />
          ))}
        </div>
        <p className="label">Picks · position · player</p>
        <div className="space-y-1.5">
          {d[picksKey].map((h, i) => {
            const player = live[side].players[i];
            const picking = swapFrom?.side === side && swapFrom.index === i;
            return (
              <div key={i} className="flex gap-1.5">
                <Slot
                  hero={h}
                  position={player ? POSITION_LABEL[player.role] : undefined}
                  label={player?.ign}
                  active={nextPick === i}
                  onClick={() => setEditing({ key: picksKey, index: i, value: h })}
                />
                <button
                  type="button"
                  title={swapFrom && swapFrom.side === side && !picking ? `Swap heroes with ${live[side].players[swapFrom.index]?.ign}` : 'Swap this hero with a teammate'}
                  onClick={() => swap(side, i)}
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition',
                    picking ? 'border-brand bg-brand text-white' : swapFrom?.side === side ? 'animate-pulse border-brand text-brand' : 'border-line text-muted hover:border-brand hover:text-brand',
                  )}
                >
                  <ArrowUpDown className="h-4 w-4" />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <Card
      title="Drafting phase"
      subtitle="Type a hero and press Enter to lock. Picks go to the player of that hero's position automatically — use ⇅ on two teammates to trade heroes. Click any slot to correct it."
      actions={
        <>
          <Button size="sm" variant="secondary" icon={<Users className="h-4 w-4" />} onClick={() => setLineupOpen(true)}>
            Edit lineup
          </Button>
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
      {swapFrom && (
        <div className="mb-3 flex items-center justify-between gap-2 rounded-xl border border-brand/50 bg-brand/10 px-3 py-2 text-sm">
          <span>
            Swapping <strong>{live[swapFrom.side].players[swapFrom.index]?.ign}</strong>&apos;s hero — press ⇅ on the teammate who takes it.
          </span>
          <button onClick={() => setSwapFrom(null)} className="text-muted hover:text-fg" aria-label="Cancel swap">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[1fr_minmax(260px,320px)_1fr]">
        {column('blue')}

        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface2 p-4">
          <div className="text-center">
            <p className="font-cond text-xs font-semibold uppercase tracking-wider text-muted">{done ? 'Draft complete' : step?.phase}</p>
            <p className={cn('font-display text-3xl uppercase leading-none', step?.side === 'blue' ? 'text-sky-500' : 'text-brand')}>
              {done ? 'Ready' : isPairStart(d.step) ? `${step.side} picks ${step.index + 1} & ${step.index + 2}` : `${step.side} ${step.kind} ${step.index + 1}`}
            </p>
            <p className={cn('mt-2 font-display text-7xl leading-none tabular', left <= 5 && d.timerEndsAt ? 'text-brand' : '')}>{left}</p>
            {pair && <p className="mt-1 text-xs text-muted">{isPairStart(d.step) ? 'Two picks together — one shared timer' : 'Second pick — same timer keeps running'}</p>}
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
          {!done && (
            <div className="space-y-2">
              <HeroCombo
                value={hero}
                onChange={setHero}
                onSubmit={(h) => void lock(h)}
                exclude={used}
                autoFocus
                placeholder={step.kind === 'ban' ? `${step.side === 'blue' ? 'Blue' : 'Red'} ban… (or type none)` : `${step.side === 'blue' ? 'Blue' : 'Red'} pick… (type, then Enter)`}
              />
              <div className="flex gap-2">
                <Button className="flex-1" icon={<Lock className="h-4 w-4" />} onClick={() => void lock()} disabled={!hero.trim()}>
                  Lock in
                </Button>
                {step.kind === 'ban' && (
                  <Button variant="secondary" icon={<Ban className="h-4 w-4" />} onClick={() => void lock('none')} title="The team did not ban a hero">
                    No ban
                  </Button>
                )}
              </div>
            </div>
          )}
          {ready ? (
            <Button size="lg" className="w-full" icon={<Zap className="h-5 w-5" />} onClick={() => toast.run(() => startGame(live), 'Game started — HUD is live')}>
              Start Game {live.gameNumber}
            </Button>
          ) : (
            <p className="rounded-lg border border-dashed border-line px-3 py-2 text-center text-xs text-muted">
              Start Game unlocks when all 10 heroes are picked ({missingPicks} pick{missingPicks === 1 ? '' : 's'} left). Bans can be &ldquo;none&rdquo;.
            </p>
          )}
          <p className="text-center text-xs text-muted">
            Step {Math.min(d.step + 1, DRAFT_SEQUENCE.length)} / {DRAFT_SEQUENCE.length} · the casters call every ban &amp; pick, talk about what may come next, and break down the final draft.
          </p>
        </div>

        {column('red')}
      </div>

      <Modal open={!!editing} onClose={() => setEditing(null)} title="Edit slot">
        {editing && (
          <div className="space-y-3">
            <HeroCombo
              value={editing.value}
              onChange={(value) => setEditing({ ...editing, value })}
              onSubmit={async (h) => {
                await toast.run(() => draftSetSlot(live, editing.key, editing.index, h));
                setEditing(null);
              }}
              autoFocus
            />
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

      <LineupDialog
        open={lineupOpen}
        onClose={() => setLineupOpen(false)}
        title={`Lineups · Game ${live.gameNumber}`}
        confirmLabel="Save lineup"
        teams={[teams.find((t) => t.id === live.teamA?.id), teams.find((t) => t.id === live.teamB?.id)]}
        players={players}
        tournamentId={live.tournamentId}
        matchId={live.matchId}
        initial={lineupsOf(live)}
        casters={live.casters}
        onConfirm={async (setup) => {
          await toast.run(() => applyLineups(live, players, setup), 'Lineup updated');
          setLineupOpen(false);
        }}
      />
    </Card>
  );
}

function Slot({ hero, active, ban, label, position, onClick }: { hero: string; active: boolean; ban?: boolean; label?: string; position?: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex min-w-0 items-center justify-between gap-2 rounded-lg border px-2 text-left text-sm transition',
        ban ? 'h-10 justify-center text-center text-[11px] leading-tight' : 'h-10 flex-1',
        hero ? 'border-line bg-surface' : 'border-dashed border-line text-muted',
        ban && hero && hero.toLowerCase() !== 'none' && 'line-through decoration-brand/70',
        active && 'border-brand ring-2 ring-brand/40 animate-pulse',
      )}
    >
      <span className="truncate font-semibold">{ban && hero.toLowerCase() === 'none' ? 'No ban' : hero || (ban ? '—' : 'Pick')}</span>
      {!ban && (label || position) && (
        <span className="flex min-w-0 items-center gap-1.5 text-xs text-muted">
          {position && <span className="shrink-0 rounded bg-surface2 px-1.5 py-0.5 font-cond text-[10px] font-semibold uppercase tracking-wider text-fg">{position}</span>}
          <span className="truncate">{label}</span>
        </span>
      )}
    </button>
  );
}
