import { useState } from 'react';
import { Coffee, Play, Plus, SkipForward } from 'lucide-react';
import type { LiveState, Player, Team } from '@/types';
import { winsNeeded } from '@/lib/constants';
import { endBreak, extendBreak, lineupsOf, nextGame, patchLive, setBreak, type GameSetup } from '@/services/live';
import { useNow } from '@/hooks/useFirestore';
import { AnnouncementsCard, MessagePicker, TimeLeft, breakMessages, breakMinutes, isPaused } from './BreakControls';
import { pickCasterPair } from '@/services/casters';
import { LineupDialog } from './LineupDialog';
import { PostGameStats } from './PostGameStats';
import { Button, Card, Field, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/Confirm';

/** Series-level announcements, post-game flow and break mode. */
export function SeriesPanel({
  live,
  players,
  teams,
  onEndBroadcast,
}: {
  live: LiveState;
  players: Player[];
  teams: Team[];
  onEndBroadcast?: () => void;
}) {
  const toast = useToast();
  const ask = useConfirm();
  /** Lineup dialog before the next game's draft (from "Start Game N draft" or "End break"). */
  const [nextSetup, setNextSetup] = useState<{ via: 'next' | 'break'; casters: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const upcoming = live.scoreA + live.scoreB + 1;
  const startNext = async (setup: GameSetup) => {
    if (!nextSetup) return;
    setBusy(true);
    const ok = await toast.run(async () => {
      await (nextSetup.via === 'break' ? endBreak(live, players, setup) : nextGame(live, players, setup));
      return true;
    }, `Game ${upcoming} draft ready — the casters are welcoming everyone`);
    setBusy(false);
    if (ok) setNextSetup(null);
  };
  const [breakMin, setBreakMin] = useState(5);
  const [breakMsg, setBreakMsg] = useState('');
  const now = useNow(500);
  const need = winsNeeded(live.format);
  const seriesOver = Math.max(live.scoreA, live.scoreB) >= need;
  const leader = live.scoreA > live.scoreB ? live.teamA : live.teamB;
  /** The last game has a result, so ending the break starts the next draft. */
  const gameDone = live.scoreA + live.scoreB >= live.gameNumber;
  const nextDraft = !seriesOver && gameDone;

  // In-game (and during a "Pause the game") the In-game screen has its own Announcements / Pause cards.
  if (live.phase === 'ingame' || isPaused(live)) return null;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <AnnouncementsCard live={live} />
      {/* No break / next-draft controls during the draft — only in-game and on break. */}
      {live.phase !== 'draft' && (
      <Card
        title={live.phase === 'break' ? 'Break' : gameDone ? `Game ${live.gameNumber} finished` : 'Pause the game'}
        subtitle={seriesOver ? `${leader?.name} won the series.` : gameDone ? `First to ${need} wins. Next up: Game ${upcoming}.` : 'A technical pause or break in the middle of the game (the game clock stops).'}
      >
        <div className="space-y-3">
          {seriesOver ? (
            <div className="space-y-3">
              <p className="rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
                Series complete — the bracket has advanced. Use <strong>End broadcast</strong> above when you&apos;re done, or start the inter-series break below.
              </p>
              {onEndBroadcast && (
                <Button
                  className="w-full"
                  variant="primary"
                  icon={<Coffee className="h-4 w-4" />}
                  onClick={onEndBroadcast}
                >
                  End series &amp; start break
                </Button>
              )}
            </div>
          ) : gameDone && live.phase !== 'break' ? (
            <Button className="w-full" icon={<SkipForward className="h-4 w-4" />} onClick={() => setNextSetup({ via: 'next', casters: pickCasterPair(live.casters) })}>
              Start Game {upcoming} draft
            </Button>
          ) : null}
          {live.phase === 'break' && (
            <div className="grid grid-cols-[1fr_auto] items-center gap-2">
              <TimeLeft endsAt={live.breakEndsAt} now={now} label="Break ends in" />
              <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => toast.run(() => extendBreak(live, 60), '+1 minute')}>
                1 min
              </Button>
            </div>
          )}
          {live.phase === 'break' ? (
            <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <Field label="Message on the break screen (changes it right away)">
                <MessagePicker live={live} kind="break" value={live.breakMessage} onChange={(breakMessage) => void patchLive({ breakMessage })} />
              </Field>
              <Button
                variant="secondary"
                icon={<Play className="h-4 w-4" />}
                onClick={() => (nextDraft ? setNextSetup({ via: 'break', casters: pickCasterPair(live.casters) }) : toast.run(() => endBreak(live, players), 'Break ended'))}
              >
                {nextDraft ? `End break → Game ${live.scoreA + live.scoreB + 1} draft` : 'End break'}
              </Button>
            </div>
          ) : (
          <div className="grid gap-2 sm:grid-cols-[110px_1fr_auto] sm:items-end">
            <Field label="Break (min)">
              <Input type="number" min={1} max={60} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} />
            </Field>
            <Field label="Break message">
              <MessagePicker live={live} kind="break" value={breakMsg || breakMessages(live, 'break')[0]} onChange={setBreakMsg} />
            </Field>
            <Button
              variant="secondary"
              icon={<Coffee className="h-4 w-4" />}
              onClick={() => {
                const message = breakMsg || breakMessages(live, 'break')[0];
                void ask({ title: 'Go to break?', message: `The break screen goes on air with "${message}" and a ${breakMinutes(breakMin)}:00 countdown.`, confirmLabel: 'Go to break' }).then((ok) => {
                  if (ok) void toast.run(() => setBreak(live, breakMinutes(breakMin), message), `Break on air — ${breakMinutes(breakMin)}:00 countdown`);
                });
              }}
            >
              Go to break
            </Button>
          </div>
          )}
          <p className="text-xs text-muted">The break overlay loops your highlight playlist (Media page) with a countdown, the series score and the break music.</p>
        </div>
      </Card>
      )}
      {gameDone && live.phase !== 'draft' && (
        <div className="xl:col-span-2">
          <PostGameStats live={live} />
        </div>
      )}
      {nextSetup && (
        <LineupDialog
          open
          onClose={() => setNextSetup(null)}
          title={`Lineups · Game ${upcoming}`}
          confirmLabel={`Start Game ${upcoming} draft`}
          teams={[teams.find((t) => t.id === live.teamA?.id), teams.find((t) => t.id === live.teamB?.id)]}
          players={players}
          tournamentId={live.tournamentId}
          matchId={live.matchId}
          initial={lineupsOf(live)}
          casters={nextSetup.casters}
          busy={busy}
          onConfirm={startNext}
        />
      )}
    </div>
  );
}
