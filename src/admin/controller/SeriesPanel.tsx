import { useState } from 'react';
import { Coffee, Crown, Megaphone, Play, SkipForward, Trophy, X } from 'lucide-react';
import type { LiveState, Player, Team } from '@/types';
import { FORMAT_LABEL, winsNeeded } from '@/lib/constants';
import { nextGame, patchLive, setBreak, setPhase, triggerEvent } from '@/services/live';
import { Button, Card, Field, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';

/** Series-level announcements, post-game flow and break mode. */
export function SeriesPanel({ live, players }: { live: LiveState; players: Player[]; teams: Team[] }) {
  const toast = useToast();
  const [breakMin, setBreakMin] = useState(5);
  const [breakMsg, setBreakMsg] = useState('');
  const need = winsNeeded(live.format);
  const seriesOver = Math.max(live.scoreA, live.scoreB) >= need;
  const leaderIsA = live.scoreA > live.scoreB;
  const leader = leaderIsA ? live.teamA : live.teamB;

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

      <Card title={live.phase === 'postgame' ? 'Post-game' : 'Between games'} subtitle={seriesOver ? `${leader?.name} won the series.` : `First to ${need} wins. Next up: Game ${live.scoreA + live.scoreB + 1}.`}>
        <div className="space-y-3">
          {!seriesOver ? (
            <Button
              className="w-full"
              icon={<SkipForward className="h-4 w-4" />}
              disabled={live.phase === 'draft' || live.phase === 'ingame'}
              onClick={() => toast.run(() => nextGame(live, players), `Game ${live.scoreA + live.scoreB + 1} draft ready — new caster pair seated`)}
            >
              Start Game {live.scoreA + live.scoreB + 1} draft
            </Button>
          ) : (
            <p className="rounded-xl border border-brand/40 bg-brand/10 px-3 py-2 text-sm">
              Series complete — the bracket has advanced. Use <strong>End broadcast</strong> above when you&apos;re done, or play the break loop.
            </p>
          )}
          <div className="grid gap-2 sm:grid-cols-[110px_1fr_auto] sm:items-end">
            <Field label="Break (min)">
              <Input type="number" min={0} max={60} value={breakMin} onChange={(e) => setBreakMin(Number(e.target.value))} />
            </Field>
            <Field label="Break message">
              <Input value={breakMsg} onChange={(e) => setBreakMsg(e.target.value)} placeholder="Game 2 starts soon!" />
            </Field>
            {live.phase === 'break' ? (
              <Button variant="secondary" icon={<Play className="h-4 w-4" />} onClick={() => toast.run(() => setPhase(seriesOver ? 'postgame' : 'draft'))}>
                End break
              </Button>
            ) : (
              <Button variant="secondary" icon={<Coffee className="h-4 w-4" />} onClick={() => toast.run(() => setBreak(breakMin || null, breakMsg), 'Break loop on air')}>
                Go to break
              </Button>
            )}
          </div>
          <p className="text-xs text-muted">The break overlay loops your highlight playlist (Media page) with a countdown and the series score.</p>
        </div>
      </Card>
    </div>
  );
}
