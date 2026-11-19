import { useEffect, useMemo, useState } from 'react';
import { Award, Crown, Save } from 'lucide-react';
import type { GameRecord, LiveState, Tournament } from '@/types';
import { useCollectionData, useTournaments } from '@/hooks/useFirestore';
import { COL, whereEq } from '@/services/firebase';
import { saveGameStats } from '@/services/live';
import { gameMvp, playerRating } from '@/services/stats';
import { formatClock } from '@/lib/clock';
import { kdaRatio } from '@/lib/utils';
import { Avatar } from '@/components/Brand';
import { Badge, Button, Card, Input, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

/**
 * Post-game stats for the series: KDA ratio and Lord/Turtle secures come from
 * the live controller automatically; type each player's Teamfight
 * Participation (TP%) from the game's result screen, then save. The post-match
 * MVP is picked from the winning team, and Grand Final games update the
 * Finals MVP.
 */
export function PostGameStats({ live }: { live: LiveState }) {
  const toast = useToast();
  const games = useCollectionData<GameRecord>(COL.games, [whereEq('matchId', live.matchId ?? '')], live.matchId ?? '');
  const tournaments = useTournaments();
  const sorted = useMemo(() => [...games.data].sort((a, b) => b.gameNumber - a.gameNumber), [games.data]);
  const [gameId, setGameId] = useState<string | null>(null);
  const game = sorted.find((g) => g.id === gameId) ?? sorted[0] ?? null;
  const [tp, setTp] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const tournament: Tournament | undefined = tournaments.data.find((t) => t.id === live.tournamentId);

  useEffect(() => {
    if (!game) return;
    setTp(Object.fromEntries(game.players.map((p) => [p.playerId, typeof p.tp === 'number' ? String(p.tp) : ''])));
  }, [game?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!game) return null;
  const parsed = (id: string) => {
    const v = tp[id];
    if (v === undefined || v.trim() === '') return null;
    const n = Math.round(Number(v));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : null;
  };
  const preview = { ...game, mvpPlayerId: null, players: game.players.map((p) => ({ ...p, tp: parsed(p.playerId) })) };
  const mvp = gameMvp(preview);
  const missing = game.players.filter((p) => parsed(p.playerId) === null).length;
  const teams = [game.winnerTeamId, ...new Set(game.players.map((p) => p.teamId).filter((id) => id !== game.winnerTeamId))];

  const save = async () => {
    setBusy(true);
    const res = await toast.run(() => saveGameStats(game, Object.fromEntries(game.players.map((p) => [p.playerId, parsed(p.playerId)])), { isFinal: live.isFinal, tournamentId: live.tournamentId }));
    setBusy(false);
    if (res) {
      const name = game.players.find((p) => p.playerId === res.mvpPlayerId)?.ign;
      toast.success(`Stats saved — Game ${game.gameNumber} MVP: ${name ?? '—'}${live.isFinal ? ' · Finals MVP updated' : ''}`);
    }
  };

  return (
    <Card
      title={
        <span className="flex items-center gap-2">
          <Award className="h-5 w-5 text-brand" /> Post-game stats
        </span>
      }
      subtitle="KDA and Lord/Turtle secures are recorded automatically. Type each player's TP% (Teamfight Participation) from the game's result screen → Save. The MVP is the best performer on the winning team."
      actions={
        <Select className="h-8 w-36 py-0 text-xs" value={game.id} onChange={(e) => setGameId(e.target.value)}>
          {sorted.map((g) => (
            <option key={g.id} value={g.id}>
              Game {g.gameNumber}
              {g.mvpPlayerId ? ' ✓' : ''}
            </option>
          ))}
        </Select>
      }
    >
      <p className="mb-2 text-xs text-muted">Duration {formatClock(game.durationSec * 1000)} · {game.mvpPlayerId ? 'stats saved' : 'TP% not saved yet'}</p>
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead>
            <tr className="table-head">
              <th className="pb-2 text-left">Player</th>
              <th className="pb-2 text-center">K/D/A</th>
              <th className="pb-2 text-center">KDA</th>
              <th className="pb-2 text-center" title="Lords / Turtles secured">Lord / Turtle</th>
              <th className="pb-2 text-center">TP%</th>
              <th className="pb-2 text-center">Rating</th>
            </tr>
          </thead>
          <tbody>
            {teams.flatMap((teamId) =>
              preview.players
                .filter((p) => p.teamId === teamId)
                .map((p) => (
                  <tr key={p.playerId} className={cn('border-t border-line/70', p.playerId === mvp && 'bg-brand/10')}>
                    <td className="py-1.5 pr-2">
                      <div className="flex items-center gap-2">
                        <Avatar url={null} name={p.ign} size={26} />
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5 truncate font-semibold">
                            {p.ign} {p.playerId === mvp && <Badge tone="brand">MVP</Badge>}
                          </span>
                          <span className="block text-[11px] text-muted">
                            {p.hero || '—'} · {teamId === game.winnerTeamId ? 'won' : 'lost'}
                          </span>
                        </span>
                      </div>
                    </td>
                    <td className="py-1.5 text-center tabular">
                      {p.k}/{p.d}/{p.a}
                    </td>
                    <td className="py-1.5 text-center tabular">{kdaRatio(p.k, p.d, p.a).toFixed(2)}</td>
                    <td className="py-1.5 text-center tabular">
                      {p.lords} / {p.turtles}
                    </td>
                    <td className="py-1.5 text-center">
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        className="mx-auto h-8 w-20 px-2 py-0 text-center"
                        placeholder="—"
                        value={tp[p.playerId] ?? ''}
                        onChange={(e) => setTp((m) => ({ ...m, [p.playerId]: e.target.value }))}
                      />
                    </td>
                    <td className="py-1.5 text-center font-display text-lg tabular">{playerRating(p, teamId === game.winnerTeamId).toFixed(1)}</td>
                  </tr>
                )),
            )}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button loading={busy} icon={<Save className="h-4 w-4" />} onClick={save}>
          Save stats{missing ? ` (${missing} TP% empty)` : ''}
        </Button>
        {live.isFinal && tournament?.finalsMvp && (
          <span className="flex items-center gap-2 rounded-xl border border-amber-400/50 bg-amber-400/10 px-3 py-1.5 text-sm">
            <Crown className="h-4 w-4 text-amber-500" /> Finals MVP: <strong>{tournament.finalsMvp.ign}</strong> · {tournament.finalsMvp.gameMvps} game MVP
            {tournament.finalsMvp.gameMvps === 1 ? '' : 's'}
          </span>
        )}
      </div>
    </Card>
  );
}
