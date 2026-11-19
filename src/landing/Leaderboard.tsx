import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, BarChart3, Crown, Droplet, Flame, Shell, Skull, Swords, Target } from 'lucide-react';
import type { Player, Team } from '@/types';
import { rankBy, type LeaderboardKey, type PlayerAggregate } from '@/services/stats';
import { Avatar, TeamLogo } from '@/components/Brand';
import { EmptyState, Input } from '@/components/ui';
import { cn } from '@/lib/utils';

const COLUMNS: { key: LeaderboardKey; label: string; title: string }[] = [
  { key: 'gp', label: 'GP', title: 'Games played' },
  { key: 'k', label: 'K', title: 'Kills' },
  { key: 'd', label: 'D', title: 'Deaths' },
  { key: 'a', label: 'A', title: 'Assists' },
  { key: 'kda', label: 'KDA', title: '(Kills + Assists) / Deaths' },
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
  { key: 'k', label: 'Most kills', icon: Swords },
  { key: 'fb', label: 'First Blood king', icon: Droplet },
  { key: 'savage', label: 'Most Savages', icon: Flame },
  { key: 'maniac', label: 'Most Maniacs', icon: Skull },
  { key: 'lords', label: 'Lord slayer', icon: Target },
  { key: 'turtles', label: 'Turtle hunter', icon: Shell },
];

export function Leaderboard({ rows, players, teams }: { rows: PlayerAggregate[]; players: Record<string, Player>; teams: Record<string, Team> }) {
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
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
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
                  <tr key={r.playerId} className="border-t border-line/70 transition hover:bg-surface2/60">
                    <td className="px-3 py-2.5">
                      <span className={cn('flex h-7 w-7 items-center justify-center rounded-lg font-display text-lg leading-none', i === 0 ? 'bg-brand text-white' : i < 3 ? 'bg-brand/15 text-brand' : 'text-muted')}>{i + 1}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-3">
                        <Avatar url={p?.photoUrl} name={r.ign} size={36} />
                        <div className="min-w-0">
                          <p className="truncate font-semibold">{p?.ign ?? r.ign}</p>
                          <p className="flex items-center gap-1 text-xs text-muted">
                            <TeamLogo url={t?.logoUrl} name={t?.name} size={14} className="rounded" /> {t?.tag ?? '—'} · {p?.role ?? ''}
                            {r.topHero && <span className="hidden sm:inline">· {r.topHero}</span>}
                          </p>
                        </div>
                      </div>
                    </td>
                    {COLUMNS.map((c) => (
                      <td key={c.key} className={cn('px-2 py-2.5 text-center tabular', sort.key === c.key ? 'font-bold text-fg' : 'text-muted')}>
                        {c.key === 'kda' ? r.kda.toFixed(2) : r[c.key]}
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
