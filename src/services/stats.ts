import type { GameRecord, Match, Tournament } from '@/types';
import { kdaRatio } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Standings & leaderboard aggregation — computed client-side from the
// `matches` and `games` collections (no Cloud Functions needed on the free plan).
// ─────────────────────────────────────────────────────────────────────────────

export interface StandingRow {
  teamId: string;
  seriesW: number;
  seriesL: number;
  gameW: number;
  gameL: number;
  diff: number;
  status: 'champion' | 'alive' | 'eliminated';
  form: ('W' | 'L')[];
}

export function computeStandings(t: Tournament | null, matches: Match[]): StandingRow[] {
  if (!t) return [];
  const rows = new Map<string, StandingRow>();
  for (const id of t.teamIds) {
    rows.set(id, { teamId: id, seriesW: 0, seriesL: 0, gameW: 0, gameL: 0, diff: 0, status: 'alive', form: [] });
  }
  const played = matches
    .filter((m) => m.status === 'completed' && m.teamAId && m.teamBId && m.winnerId)
    .sort((a, b) => a.updatedAt - b.updatedAt);

  for (const m of played) {
    const a = rows.get(m.teamAId!);
    const b = rows.get(m.teamBId!);
    if (!a || !b) continue;
    a.gameW += m.scoreA;
    a.gameL += m.scoreB;
    b.gameW += m.scoreB;
    b.gameL += m.scoreA;
    const [winner, loser] = m.winnerId === m.teamAId ? [a, b] : [b, a];
    winner.seriesW++;
    loser.seriesL++;
    winner.form.push('W');
    loser.form.push('L');
    const eliminating = t.type === 'single' || m.bracket === 'LB' || m.bracket === 'GF' || !m.loserTo;
    if (eliminating) loser.status = 'eliminated';
  }

  const championId = t.championTeamId ?? matches.find((m) => m.isFinal && m.status === 'completed')?.winnerId ?? null;
  if (championId && rows.has(championId)) rows.get(championId)!.status = 'champion';

  const statusRank = { champion: 0, alive: 1, eliminated: 2 } as const;
  return [...rows.values()]
    .map((r) => ({ ...r, diff: r.gameW - r.gameL, form: r.form.slice(-5) }))
    .sort(
      (x, y) =>
        statusRank[x.status] - statusRank[y.status] ||
        y.seriesW - x.seriesW ||
        x.seriesL - y.seriesL ||
        y.diff - x.diff ||
        y.gameW - x.gameW,
    );
}

export interface PlayerAggregate {
  playerId: string;
  ign: string;
  teamId: string;
  gp: number;
  wins: number;
  k: number;
  d: number;
  a: number;
  kda: number;
  fb: number;
  dk: number;
  tk: number;
  maniac: number;
  savage: number;
  lords: number;
  turtles: number;
  topHero: string | null;
}

export function computeLeaderboard(games: GameRecord[]): PlayerAggregate[] {
  const map = new Map<string, PlayerAggregate & { heroes: Record<string, number> }>();
  for (const g of games) {
    for (const p of g.players ?? []) {
      if (!p.playerId) continue;
      let row = map.get(p.playerId);
      if (!row) {
        row = {
          playerId: p.playerId,
          ign: p.ign,
          teamId: p.teamId,
          gp: 0,
          wins: 0,
          k: 0,
          d: 0,
          a: 0,
          kda: 0,
          fb: 0,
          dk: 0,
          tk: 0,
          maniac: 0,
          savage: 0,
          lords: 0,
          turtles: 0,
          topHero: null,
          heroes: {},
        };
        map.set(p.playerId, row);
      }
      row.gp++;
      if (g.winnerTeamId === p.teamId) row.wins++;
      row.k += p.k;
      row.d += p.d;
      row.a += p.a;
      row.fb += p.fb;
      row.dk += p.dk;
      row.tk += p.tk;
      row.maniac += p.maniac;
      row.savage += p.savage;
      row.lords += p.lords;
      row.turtles += p.turtles;
      if (p.hero) row.heroes[p.hero] = (row.heroes[p.hero] ?? 0) + 1;
    }
  }
  return [...map.values()].map(({ heroes, ...r }) => ({
    ...r,
    kda: kdaRatio(r.k, r.d, r.a),
    topHero: Object.entries(heroes).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
  }));
}

export type LeaderboardKey = keyof Pick<
  PlayerAggregate,
  'kda' | 'k' | 'd' | 'a' | 'gp' | 'fb' | 'dk' | 'tk' | 'maniac' | 'savage' | 'lords' | 'turtles' | 'wins'
>;

export function rankBy(rows: PlayerAggregate[], key: LeaderboardKey, dir: 'desc' | 'asc' = 'desc'): PlayerAggregate[] {
  return [...rows].sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key]) || b.kda - a.kda);
}
