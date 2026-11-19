import { useState } from 'react';
import { Coffee, Crown, Megaphone, Play, SkipForward, Trophy, X } from 'lucide-react';
import type { LiveState, Player, Team } from '@/types';
import { FORMAT_LABEL, winsNeeded } from '@/lib/constants';
import { endBreak, lineupsOf, nextGame, patchLive, setBreak, triggerEvent, type GameSetup } from '@/services/live';
import { pickCasterPair } from '@/services/casters';
import { LineupDialog } from './LineupDialog';
import { PostGameStats } from './PostGameStats';
import { Button, Card, Field, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';

/** Series-level announcements, post-game flow and break mode. */
export function SeriesPanel({ live, players, teams }: { live: LiveState; players: Player[]; teams: Team[] }) {
  const toast = useToast();
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
  const need = winsNeeded(live.format);
  const seriesOver = Math.max(live.scoreA, live.scoreB) >= need;
  const leaderIsA = live.scoreA > live.scoreB;
  const leader = leaderIsA ? live.teamA : live.teamB;
  /** The last game has a result, so ending the break starts the next draft. */
  const gameDone = live.scoreA + live.scoreB >= live.gameNumber;
  const nextDraft = !seriesOver && gameDone;

  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Card title="Announcements" subtitle="Quick triggers — each queues a call for the casters and a graphic on the overlays.">
        <div className="grid gap-2 sm:grid-cols-2">
          <Button
            variant="secondary"
            icon={<Megaphone className="h-4 w-4" />}
            onClick={() => toast.run(() => triggerEvent(live, 'GAME_INTRO'), 'Game intro queued')}
          >
            Game intro — Game {live.gameNumber} of {FORMAT_LABEL[live.format]}
          </Button>
          <Button
            variant="secondary"
            disabled={!seriesOver}
            title={seriesOver ? '' : 'Available once a team has won the series'}
            icon={live.isFinal ? <Crown className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
            onClick={() =>
              toast.run(
                () =>
                  triggerEvent(live, 'SERIES_VICTORY', {
                    side: null,
                    data: { winnerIsA: leaderIsA, seriesOver: true, isChampionship: live.isFinal },
                  }),
                'Victory announcement queued',
              )
            }
          >
            {live.isFinal ? 'Champion announcement' : 'Series victory announcement'}
            {seriesOver && leader ? ` — ${leader.tag} ${Math.max(live.scoreA, live.scoreB)}-${Math.min(live.scoreA, live.scoreB)}` : ''}
          </Button>
          {live.banner && (
            <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => toast.run(() => patchLive({ banner: null }))}>
              Clear on-screen banner
            </Button>
          )}
        </div>
      </Card>

      {/* No break / next-draft controls during the draft — only in-game and on break. */}
      {live.phase !== 'draft' && (
      <Card
        title={live.phase === 'break' ? 'Break' : gameDone ? `Game ${live.gameNumber} finished` : 'Pause the game'}
        subtitle={seriesOver ? `${leader?.name} won the series.` : gameDone ? `First to ${need} wins. Next up: Game ${upcoming}.` : 'A technical pause or break in the middle of the game (the game clock stops).'}
      >
        <div className="space-y-3">
          {seriesOver ? (
            <p className="rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
              Series complete — the bracket has advanced. Use <strong>End broadcast</strong> above when you&apos;re done, or play the break loop.
            </p>
          ) : gameDone && live.phase !== 'break' ? (
            <Button className="w-full" icon={<SkipForward className="h-4 w-4" />} onClick={() => setNextSetup({ via: 'next', casters: pickCasterPair(live.casters) })}>
              Start Game {upcoming} draft
            </Button>
          ) : null}
          <div className="grid gap-2 sm:grid-cols-[110px_1fr_auto] sm:items-end">
            <Field label="Break (min)">
              <Input type="number" min={0} max={60} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} />
            </Field>
            <Field label="Break message">
              <Input value={breakMsg} onChange={(e) => setBreakMsg(e.target.value)} placeholder="Game 2 starts soon!" />
            </Field>
            {live.phase === 'break' ? (
              <Button
                variant="secondary"
                icon={<Play className="h-4 w-4" />}
                onClick={() => (nextDraft ? setNextSetup({ via: 'break', casters: pickCasterPair(live.casters) }) : toast.run(() => endBreak(live, players), 'Break ended'))}
              >
                {nextDraft ? `End break → Game ${live.scoreA + live.scoreB + 1} draft` : 'End break'}
              </Button>
            ) : (
              <Button variant="secondary" icon={<Coffee className="h-4 w-4" />} onClick={() => toast.run(() => setBreak(live, breakMin || null, breakMsg), 'Break loop on air — casters are sending the show to break')}>
                Go to break
              </Button>
            )}
          </div>
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
