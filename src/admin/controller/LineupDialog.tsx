import { useEffect, useMemo, useState } from 'react';
import { Check, Lock, Mic2, UserRound } from 'lucide-react';
import type { Player, Role, Team } from '@/types';
import { useGames, useSettings } from '@/hooks/useFirestore';
import { defaultLineup, type GameSetup, type TeamLineup } from '@/services/live';
import { heroPools, metaHeroes, seriesHistory } from '@/services/heroStats';
import { CASTER_BY_ID } from '@/services/casters';
import { LINEUP_SIZE, POSITIONS, POSITION_LABEL } from '@/lib/constants';
import { Avatar, CasterAvatar, TeamLogo } from '@/components/Brand';
import { Badge, Button, Modal, Select } from '@/components/ui';
import { cn } from '@/lib/utils';

/**
 * Choose who plays this game: 5 players (from a roster of up to 7) with their
 * positions, and the coach (or "No coach"). Opens on Go live and before every
 * next game, so lineups can change Game 1, Game 2, … The system-picked caster
 * pair is shown here and is locked for the game.
 */
export function LineupDialog({
  open,
  onClose,
  title,
  confirmLabel,
  teams,
  players,
  tournamentId,
  matchId,
  initial,
  casters,
  withHistory,
  busy,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  confirmLabel: string;
  /** Team A, Team B. */
  teams: [Team | undefined, Team | undefined];
  players: Player[];
  tournamentId: string | null;
  matchId: string | null;
  /** Current lineups (by team id) to start from — e.g. last game's. */
  initial?: Record<string, TeamLineup>;
  casters: string[];
  /** Load the story of earlier games of this series (Go live on a series already in progress). */
  withHistory?: boolean;
  busy?: boolean;
  onConfirm: (setup: GameSetup) => void;
}) {
  const games = useGames(open ? 'all' : null);
  const settings = useSettings();
  const profiles = settings.data.casterProfiles;
  const [lineups, setLineups] = useState<Record<string, TeamLineup>>({});

  // Fresh selection every time the dialog opens.
  useEffect(() => {
    if (!open) return;
    const next: Record<string, TeamLineup> = {};
    for (const t of teams) if (t) next[t.id] = initial?.[t.id] ?? defaultLineup(t.id, players, t.coach?.name ? t.coach : null);
    setLineups(next);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const pools = useMemo(() => heroPools(games.data, players), [games.data, players]);

  const problems = teams.map((t) => {
    if (!t) return 'Team missing';
    const roster = players.filter((p) => p.teamId === t.id);
    const need = Math.min(LINEUP_SIZE, roster.length);
    const l = lineups[t.id];
    const n = l?.players.length ?? 0;
    if (!roster.length) return 'No players in this roster yet (Teams & Rosters).';
    if (n !== need) return `Choose ${need} player${need === 1 ? '' : 's'} (${n} selected).`;
    const roles = l!.players.map((p) => p.role);
    if (new Set(roles).size !== roles.length) return 'Two players have the same position.';
    return null;
  });

  const toggle = (teamId: string, player: Player) =>
    setLineups((all) => {
      const l = all[teamId] ?? { players: [], coach: null };
      const on = l.players.some((p) => p.playerId === player.id);
      if (on) return { ...all, [teamId]: { ...l, players: l.players.filter((p) => p.playerId !== player.id) } };
      if (l.players.length >= LINEUP_SIZE) return all;
      const free = POSITIONS.filter((r) => !l.players.some((p) => p.role === r));
      const role: Role = player.role !== 'Sub' && free.includes(player.role) ? player.role : (free[0] ?? 'EXP');
      return { ...all, [teamId]: { ...l, players: [...l.players, { playerId: player.id, role }] } };
    });

  const setRole = (teamId: string, playerId: string, role: Role) =>
    setLineups((all) => {
      const l = all[teamId];
      if (!l) return all;
      // Picking a position someone else holds swaps the two players' positions.
      const mine = l.players.find((p) => p.playerId === playerId)?.role;
      return {
        ...all,
        [teamId]: { ...l, players: l.players.map((p) => (p.playerId === playerId ? { ...p, role } : p.role === role && mine ? { ...p, role: mine } : p)) },
      };
    });

  const confirm = () => {
    const chosen = new Set(Object.values(lineups).flatMap((l) => l.players.map((p) => p.playerId)));
    onConfirm({
      lineups,
      pools: Object.fromEntries(Object.entries(pools).filter(([id]) => chosen.has(id))),
      meta: metaHeroes(games.data, tournamentId),
      history: withHistory && matchId ? seriesHistory(games.data, matchId, teams.filter(Boolean) as Team[]) : undefined,
      casters,
    });
  };

  return (
    <Modal open={open} onClose={onClose} title={title} wide>
      <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface2 px-3 py-2">
        <Mic2 className="h-4 w-4 text-brand" />
        <span className="text-sm font-semibold">Casters for this game:</span>
        {casters.map((id) => (
          <span key={id} className="flex items-center gap-1.5 text-sm">
            <CasterAvatar casterId={id} url={profiles[id]?.avatarUrl} size={24} /> {profiles[id]?.displayName || CASTER_BY_ID[id]?.name}
          </span>
        ))}
        <Badge tone="muted" className="ml-auto">
          <Lock className="mr-1 inline h-3 w-3" /> picked by the system · locked
        </Badge>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {teams.map((team, ti) => {
          if (!team) return <p key={ti} className="text-sm text-muted">Team not set.</p>;
          const roster = players.filter((p) => p.teamId === team.id).sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || a.order - b.order);
          const l = lineups[team.id] ?? { players: [], coach: null };
          return (
            <div key={team.id} className="rounded-2xl border border-line p-3">
              <div className="mb-2 flex items-center gap-2">
                <TeamLogo url={team.logoUrl} name={team.name} size={32} />
                <p className="min-w-0 flex-1 truncate font-display text-xl uppercase leading-none">{team.name}</p>
                <Badge tone={l.players.length === Math.min(LINEUP_SIZE, roster.length) ? 'success' : 'brand'}>
                  {l.players.length}/{Math.min(LINEUP_SIZE, roster.length)}
                </Badge>
              </div>
              <ul className="space-y-1.5">
                {roster.map((p) => {
                  const slot = l.players.find((x) => x.playerId === p.id);
                  const pool = pools[p.id] ?? [];
                  return (
                    <li key={p.id} className={cn('flex items-center gap-2 rounded-xl border px-2 py-1.5 transition', slot ? 'border-brand/60 bg-brand/5' : 'border-line')}>
                      <button
                        type="button"
                        onClick={() => toggle(team.id, p)}
                        aria-label={slot ? `Bench ${p.ign}` : `Play ${p.ign}`}
                        className={cn('flex h-6 w-6 shrink-0 items-center justify-center rounded-md border', slot ? 'border-brand bg-brand text-white' : 'border-line text-transparent hover:border-brand')}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                      <Avatar url={p.photoUrl} name={p.ign} size={30} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{p.ign}</p>
                        <p className="truncate text-[11px] text-muted">{pool.length ? pool.slice(0, 3).map((e) => (e.games ? `${e.hero} (${e.games})` : e.hero)).join(' · ') : `Roster: ${p.role}`}</p>
                      </div>
                      {slot ? (
                        <Select className="h-8 w-[112px] px-2 py-0 text-xs" value={slot.role} onChange={(e) => setRole(team.id, p.id, e.target.value as Role)}>
                          {POSITIONS.map((r) => (
                            <option key={r} value={r}>
                              {POSITION_LABEL[r]}
                            </option>
                          ))}
                        </Select>
                      ) : (
                        <span className="w-[112px] text-right text-xs text-muted">Bench</span>
                      )}
                    </li>
                  );
                })}
              </ul>
              <label className="mt-3 flex items-center gap-2 text-sm">
                <UserRound className="h-4 w-4 text-muted" />
                <span className="font-semibold">Coach</span>
                {team.coach?.name ? (
                  <Select
                    className="h-8 flex-1 py-0 text-xs"
                    value={l.coach ? 'coach' : 'none'}
                    onChange={(e) => setLineups((all) => ({ ...all, [team.id]: { ...l, coach: e.target.value === 'coach' ? (team.coach ?? null) : null } }))}
                  >
                    <option value="coach">{team.coach.name}</option>
                    <option value="none">No coach</option>
                  </Select>
                ) : (
                  <span className="text-muted">No coach (add one in Teams &amp; Rosters)</span>
                )}
              </label>
              {problems[ti] && <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">{problems[ti]}</p>}
            </div>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-muted">
        Hero names under each player are their signature heroes (games played in this system + any you typed in Teams &amp; Rosters) — the casters use them during the draft.
      </p>
      <Button size="lg" className="mt-4 w-full" loading={busy} disabled={problems.some(Boolean)} onClick={confirm}>
        {confirmLabel}
      </Button>
    </Modal>
  );
}
