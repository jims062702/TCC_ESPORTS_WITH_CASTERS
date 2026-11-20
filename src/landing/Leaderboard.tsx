import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Award, Ban, ChevronRight, BarChart3, Crown, Droplet, Flame, Percent, Shell, Skull, Swords, Target, Trophy, Users } from 'lucide-react';
import type { GameRecord, Player, Team } from '@/types';
import { computeHeroStats, rankBy, rankHeroes, type HeroAggregate, type HeroKey, type LeaderboardKey, type PlayerAggregate } from '@/services/stats';
import { useHeroPortraits } from '@/hooks/useFirestore';
import { Link, useNavigate } from 'react-router-dom';
import { HeroArt } from '@/components/game';
import { Avatar, TeamLogo } from '@/components/Brand';
import { EmptyState, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

const COLUMNS: { key: LeaderboardKey; label: string; title: string }[] = [
  { key: 'gp', label: 'GP', title: 'Games played' },
  { key: 'k', label: 'K', title: 'Kills' },
  { key: 'd', label: 'D', title: 'Deaths' },
  { key: 'a', label: 'A', title: 'Assists' },
  { key: 'kda', label: 'KDA', title: '(Kills + Assists) / Deaths' },
  { key: 'tp', label: 'TP%', title: 'Average teamfight participation' },
  { key: 'mvps', label: 'MVP', title: 'Post-match MVPs' },
  { key: 'fb', label: 'FB', title: 'First Bloods' },
  { key: 'dk', label: '2K', title: 'Double Kills' },
  { key: 'tk', label: '3K', title: 'Triple Kills' },
  { key: 'maniac', label: 'Maniac', title: 'Maniacs' },
  { key: 'savage', label: 'Savage', title: 'Savages' },
  { key: 'lords', label: 'Lords', title: 'Lords slain' },
  { key: 'turtles', label: 'Turtles', title: 'Turtles slain' },
];

const SPOTLIGHT: { key: LeaderboardKey; label: string; icon: typeof Crown }[] = [
  { key: 'kda', label: 'Best KDA', icon: BarChart3 },
  { key: 'mvps', label: 'Most MVPs', icon: Award },
  { key: 'k', label: 'Most kills', icon: Swords },
  { key: 'fb', label: 'First Blood king', icon: Droplet },
  { key: 'savage', label: 'Most Savages', icon: Flame },
  { key: 'maniac', label: 'Most Maniacs', icon: Skull },
  { key: 'lords', label: 'Lord slayer', icon: Target },
  { key: 'turtles', label: 'Turtle hunter', icon: Shell },
];

type Tab = 'players' | 'heroes';

/** Leaderboard with two views: Players (stats per player) and Heroes (picks, bans, win rate…). */
export function Leaderboard({
  rows,
  games,
  players,
  teams,
  finalsMvpId = null,
  tournamentId = null,
}: {
  rows: PlayerAggregate[];
  games: GameRecord[];
  players: Record<string, Player>;
  teams: Record<string, Team>;
  /** Set once the tournament has a champion. */
  finalsMvpId?: string | null;
  tournamentId?: string | null;
}) {
  const [tab, setTab] = useState<Tab>('players');
  return (
    <div className="space-y-5">
      <div className="flex justify-center">
        <div role="tablist" aria-label="Leaderboard" className="inline-flex rounded-xl border border-line bg-surface2 p-1">
          {(
            [
              ['players', 'Players', Users],
              ['heroes', 'Heroes', Swords],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={cn('inline-flex items-center gap-2 rounded-lg px-5 py-2 font-cond text-sm font-bold uppercase tracking-wider transition', tab === id ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'text-muted hover:text-fg')}
            >
              <Icon className="h-4 w-4" /> {label}
            </button>
          ))}
        </div>
      </div>
      {tab === 'players' ? <PlayerBoard rows={rows} players={players} teams={teams} finalsMvpId={finalsMvpId} tournamentId={tournamentId} /> : <HeroBoard games={games} />}
    </div>
  );
}

function PlayerBoard({ rows, players, teams, finalsMvpId, tournamentId }: { rows: PlayerAggregate[]; players: Record<string, Player>; teams: Record<string, Team>; finalsMvpId: string | null; tournamentId: string | null }) {
  const navigate = useNavigate();
  const detailsUrl = (playerId: string) => `/players/${playerId}${tournamentId ? `?t=${tournamentId}` : ''}`;
  const mvp = finalsMvpId ? rows.find((r) => r.playerId === finalsMvpId) : undefined;
  const [sort, setSort] = useState<{ key: LeaderboardKey; dir: 'asc' | 'desc' }>({ key: 'kda', dir: 'desc' });
  const [q, setQ] = useState('');

  const sorted = useMemo(() => {
    const filtered = rows.filter((r) => {
      if (!q) return true;
      const s = q.toLowerCase();
      return r.ign.toLowerCase().includes(s) || (teams[r.teamId]?.name ?? '').toLowerCase().includes(s);
    });
    return rankBy(filtered, sort.key, sort.dir);
  }, [rows, sort, q, teams]);

  if (!rows.length)
    return (
      <EmptyState icon={<BarChart3 className="h-8 w-8" />} title="No stats yet">
        Player stats appear after the first game is recorded from the live controller.
      </EmptyState>
    );

  const toggle = (key: LeaderboardKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: key === 'd' ? 'asc' : 'desc' }));

  return (
    <div className="space-y-6">
      {mvp && (
        <button
          onClick={() => navigate(detailsUrl(mvp.playerId))}
          className="card flex w-full items-center gap-4 border-amber-500/60 bg-gradient-to-r from-amber-500/15 to-transparent p-4 text-left transition hover:border-amber-500"
          data-testid="finals-mvp-banner"
        >
          <Avatar url={players[mvp.playerId]?.photoUrl} name={mvp.ign} size={52} />
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 font-cond text-xs font-bold uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400">
              <Crown className="h-4 w-4" /> Finals MVP
            </p>
            <p className="truncate font-display text-3xl uppercase leading-none">{players[mvp.playerId]?.ign ?? mvp.ign}</p>
            <p className="truncate text-xs text-muted">{teams[mvp.teamId]?.name ?? ''}</p>
          </div>
          <span className="hidden text-sm font-semibold text-amber-600 sm:inline dark:text-amber-400">View player →</span>
        </button>
      )}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {SPOTLIGHT.map((s) => {
          const top = rankBy(rows, s.key)[0];
          const value = top ? (s.key === 'kda' ? top.kda.toFixed(2) : top[s.key]) : 0;
          const p = top ? players[top.playerId] : undefined;
          const Icon = s.icon;
          return (
            <div key={s.key} className="card relative overflow-hidden p-3">
              <Icon className="absolute -right-2 -top-2 h-14 w-14 text-brand/10" />
              <p className="font-cond text-[11px] font-semibold uppercase tracking-wider text-brand">{s.label}</p>
              {top && Number(value) > 0 ? (
                <div className="mt-2 flex items-center gap-2">
                  <Avatar url={p?.photoUrl} name={top.ign} size={34} />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{top.ign}</p>
                    <p className="font-display text-2xl leading-none">{value}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">—</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
          <p className="font-cond text-sm font-semibold uppercase tracking-wider text-muted">{sorted.length} players · click a column to rank</p>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search player or team" className="max-w-xs" />
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-surface2">
              <tr className="table-head">
                <th className="w-12 px-3 py-3 text-left">Rank</th>
                <th className="px-3 py-3 text-left">Player</th>
                {COLUMNS.map((c) => (
                  <th key={c.key} title={c.title} className="px-2 py-3 text-center">
                    <button onClick={() => toggle(c.key)} className={cn('inline-flex items-center gap-0.5 uppercase hover:text-fg', sort.key === c.key && 'text-brand')}>
                      {c.label}
                      {sort.key === c.key && (sort.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => {
                const p = players[r.playerId];
                const t = teams[r.teamId];
                return (
                  <tr key={r.playerId} className="cursor-pointer border-t border-line/70 transition hover:bg-surface2/60" onClick={() => navigate(detailsUrl(r.playerId))} title="View player details">
                    <td className="px-3 py-2.5">
                      <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg font-display text-lg leading-none', i === 0 ? 'bg-brand text-white' : i < 3 ? 'bg-brand/15 text-brand' : 'text-muted')}>{i + 1}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar url={p?.photoUrl} name={r.ign} size={36} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 truncate font-semibold">
                            {p?.ign ?? r.ign}
                            {finalsMvpId === r.playerId && (
                              <span className="inline-flex shrink-0 items-center gap-1 rounded-md bg-amber-500 px-1.5 py-0.5 font-cond text-[10px] font-bold uppercase tracking-wider text-ink-950" data-testid="finals-mvp-badge">
                                <Crown className="h-3 w-3" /> Finals MVP
                              </span>
                            )}
                          </p>
                          <p className="flex items-center gap-1 text-xs text-muted">
                            <TeamLogo url={t?.logoUrl} name={t?.name} size={14} className="rounded" /> {t?.tag ?? '—'} · {p?.role ?? ''}
                          </p>
                          <Link
                            to={detailsUrl(r.playerId)}
                            onClick={(e) => e.stopPropagation()}
                            className="mt-1 inline-flex items-center gap-1 rounded-md border border-line px-2 py-0.5 text-[11px] font-semibold text-muted hover:border-brand hover:text-brand"
                          >
                            Details <ChevronRight className="h-3 w-3" />
                          </Link>
                        </div>
                      </div>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className={cn('px-2 py-2.5 text-center tabular', sort.key === c.key ? 'font-bold text-fg' : 'text-muted')}>
                        {c.key === 'kda' ? r.kda.toFixed(2) : c.key === 'tp' ? (r.tp < 0 ? '—' : `${r.tp}%`) : r[c.key]}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── Heroes ──────────────────────────────────────────────────────────────────

const HERO_COLUMNS: { key: HeroKey; label: string; title: string }[] = [
  { key: 'picks', label: 'Picks', title: 'Times picked' },
  { key: 'bans', label: 'Bans', title: 'Times banned' },
  { key: 'contention', label: 'Pick+Ban', title: 'Contention: picked or banned, % of games' },
  { key: 'pickRate', label: 'Pick %', title: 'Pick rate: % of games it was picked' },
  { key: 'banRate', label: 'Ban %', title: 'Ban rate: % of games it was banned' },
  { key: 'winRate', label: 'Win %', title: 'Win rate when picked' },
  { key: 'wins', label: 'W', title: 'Wins' },
  { key: 'losses', label: 'L', title: 'Losses' },
  { key: 'kda', label: 'KDA', title: 'KDA of players on this hero' },
];

const HERO_SPOTLIGHT: { label: string; icon: typeof Crown; pick: (rows: HeroAggregate[]) => HeroAggregate | undefined; value: (r: HeroAggregate) => string }[] = [
  { label: 'Most picked', icon: Swords, pick: (r) => rankHeroes(r, 'picks')[0], value: (r) => `${r.picks} picks` },
  { label: 'Most banned', icon: Ban, pick: (r) => rankHeroes(r, 'bans')[0], value: (r) => `${r.bans} bans` },
  { label: 'Most contested', icon: Percent, pick: (r) => rankHeroes(r, 'contention')[0], value: (r) => `${r.contention}% P+B` },
  { label: 'Best win rate', icon: Trophy, pick: (r) => rankHeroes(r.filter((x) => x.picks >= 3), 'winRate')[0], value: (r) => `${r.winRate}% · ${r.wins}-${r.losses}` },
  { label: 'Best KDA', icon: BarChart3, pick: (r) => rankHeroes(r.filter((x) => x.picks >= 2), 'kda')[0], value: (r) => `${r.kda.toFixed(2)} KDA` },
];

function HeroBoard({ games }: { games: GameRecord[] }) {
  const portraits = useHeroPortraits().map;
  const rows = useMemo(() => computeHeroStats(games), [games]);
  const [sort, setSort] = useState<{ key: HeroKey; dir: 'asc' | 'desc' }>({ key: 'contention', dir: 'desc' });
  const [q, setQ] = useState('');
  const sorted = useMemo(() => rankHeroes(rows.filter((r) => !q || r.hero.toLowerCase().includes(q.toLowerCase())), sort.key, sort.dir), [rows, sort, q]);

  if (!rows.length)
    return (
      <EmptyState icon={<Swords className="h-8 w-8" />} title="No hero stats yet">
        Picks, bans and win rates appear after the first game is recorded.
      </EmptyState>
    );

  const toggle = (key: HeroKey) => setSort((s) => (s.key === key ? { key, dir: s.dir === 'desc' ? 'asc' : 'desc' } : { key, dir: 'desc' }));

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {HERO_SPOTLIGHT.map((s) => {
          const top = s.pick(rows);
          const Icon = s.icon;
          return (
            <div key={s.label} className="card relative overflow-hidden p-3">
              <Icon className="absolute -right-2 -top-2 h-14 w-14 text-brand/10" />
              <p className="font-cond text-[11px] font-semibold uppercase tracking-wider text-brand">{s.label}</p>
              {top ? (
                <div className="mt-2 flex items-center gap-2">
                  <HeroArt name={top.hero} portraits={portraits} className="h-10 w-10 shrink-0 rounded-lg text-[9px]" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{top.hero}</p>
                    <p className="font-display text-xl leading-none">{s.value(top)}</p>
                  </div>
                </div>
              ) : (
                <p className="mt-3 text-sm text-muted">—</p>
              )}
            </div>
          );
        })}
      </div>

      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-3">
          <p className="font-cond text-sm font-semibold uppercase tracking-wider text-muted">
            {sorted.length} heroes · {games.length} game{games.length === 1 ? '' : 's'} · click a column to rank
          </p>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hero" className="max-w-xs" />
        </div>
        <div className="scrollbar-thin overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead className="bg-surface2">
              <tr className="table-head">
                <th className="w-12 px-3 py-3 text-left">Rank</th>
                <th className="px-3 py-3 text-left">Hero</th>
                {HERO_COLUMNS.map((c) => (
                  <th key={c.key} title={c.title} className="px-2 py-3 text-center">
                    <button onClick={() => toggle(c.key)} className={cn('inline-flex items-center gap-0.5 uppercase hover:text-fg', sort.key === c.key && 'text-brand')}>
                      {c.label}
                      {sort.key === c.key && (sort.dir === 'desc' ? <ArrowDown className="h-3 w-3" /> : <ArrowUp className="h-3 w-3" />)}
                    </button>
                  </th>
                ))}
                <th className="px-3 py-3 text-left" title="Average kills / deaths / assists per game">
                  Avg K/D/A
                </th>
                <th className="px-3 py-3 text-left">Most played by</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r, i) => (
                <tr key={r.hero} className="border-t border-line/70 transition hover:bg-surface2/60">
                  <td className="px-3 py-2.5">
                    <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg font-display text-lg leading-none', i === 0 ? 'bg-brand text-white' : i < 3 ? 'bg-brand/15 text-brand' : 'text-muted')}>{i + 1}</span>
                  </td>
                  <td className="px-3 py-2.5">
                    <div className="flex items-center gap-3">
                      <HeroArt name={r.hero} portraits={portraits} className="h-9 w-9 shrink-0 rounded-lg text-[8px]" />
                      <span className="font-semibold">{r.hero}</span>
                    </div>
                  </td>
                  {HERO_COLUMNS.map((c) => {
                    const v = c.key === 'winRate' ? (r.winRate === null ? '—' : `${r.winRate}%`) : c.key === 'kda' ? (r.picks ? r.kda.toFixed(2) : '—') : ['contention', 'pickRate', 'banRate'].includes(c.key) ? `${r[c.key]}%` : r[c.key];
                    return (
                      <td key={c.key} className={cn('px-2 py-2.5 text-center tabular', sort.key === c.key ? 'font-bold text-fg' : 'text-muted')}>
                        {v}
                      </td>
                    );
                  })}
                  <td className="px-3 py-2.5 tabular text-muted">{r.picks ? `${r.avgK} / ${r.avgD} / ${r.avgA}` : '—'}</td>
                  <td className="px-3 py-2.5 text-muted">{r.topPlayer ? `${r.topPlayer.ign} (${r.topPlayer.games})` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
