import type { GameRecord, Match, Tournament, FinalsMvp, GamePlayerStat } from '@/types';
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
    // A seeding-round loss never eliminates — it only sets the bracket seed.
    const eliminating = m.bracket !== 'SEED' && (t.type === 'single' || m.bracket === 'LB' || m.bracket === 'GF' || !m.loserTo);
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

/**
 * Performance rating for one game (used for the post-match MVP):
 * KDA ratio, kills/assists, teamfight participation (TP%), Lord/Turtle secures, and the win.
 */
export function playerRating(p: GamePlayerStat, won: boolean): number {
  const kda = kdaRatio(p.k, p.d, p.a);
  const tp = p.tp ?? 50;
  return Math.round((kda * 1.5 + p.k * 0.35 + p.a * 0.2 - p.d * 0.25 + tp / 20 + (p.lords ?? 0) * 1.2 + (p.turtles ?? 0) * 0.6 + (won ? 2 : 0)) * 10) / 10;
}

/** Post-match MVP: best rating on the winning team (the stored pick when stats were saved). */
export function gameMvp(g: GameRecord): string | null {
  if (g.mvpPlayerId) return g.mvpPlayerId;
  const winners = (g.players ?? []).filter((p) => p.teamId === g.winnerTeamId);
  const best = winners.map((p) => ({ p, r: playerRating(p, true) })).sort((a, b) => b.r - a.r)[0];
  return best?.p.playerId ?? null;
}

/**
 * Finals MVP from the Grand Final games: most post-match MVPs; ties go to the
 * best total rating. Returns KDA, average TP% and Lord/Turtle secures too.
 */
export function computeFinalsMvp(gfGames: GameRecord[]): FinalsMvp | null {
  if (!gfGames.length) return null;
  const rows = new Map<string, { playerId: string; ign: string; teamId: string; mvps: number; games: number; rating: number; k: number; d: number; a: number; tp: number[]; lords: number; turtles: number }>();
  for (const g of gfGames) {
    const mvp = gameMvp(g);
    for (const p of g.players ?? []) {
      if (!p.playerId) continue;
      const r = rows.get(p.playerId) ?? { playerId: p.playerId, ign: p.ign, teamId: p.teamId, mvps: 0, games: 0, rating: 0, k: 0, d: 0, a: 0, tp: [], lords: 0, turtles: 0 };
      r.games++;
      r.rating += playerRating(p, p.teamId === g.winnerTeamId);
      r.k += p.k;
      r.d += p.d;
      r.a += p.a;
      if (typeof p.tp === 'number') r.tp.push(p.tp);
      r.lords += p.lords ?? 0;
      r.turtles += p.turtles ?? 0;
      if (mvp === p.playerId) r.mvps++;
      rows.set(p.playerId, r);
    }
  }
  // The Finals MVP comes from the series winner (team with the most game wins).
  const wins: Record<string, number> = {};
  for (const g of gfGames) wins[g.winnerTeamId] = (wins[g.winnerTeamId] ?? 0) + 1;
  const champion = Object.entries(wins).sort((a, b) => b[1] - a[1])[0]?.[0];
  const best = [...rows.values()].filter((r) => !champion || r.teamId === champion).sort((a, b) => b.mvps - a.mvps || b.rating - a.rating)[0];
  if (!best) return null;
  return {
    playerId: best.playerId,
    ign: best.ign,
    teamId: best.teamId,
    gameMvps: best.mvps,
    games: best.games,
    kda: Math.round(kdaRatio(best.k, best.d, best.a) * 100) / 100,
    tp: best.tp.length ? Math.round(best.tp.reduce((s, x) => s + x, 0) / best.tp.length) : null,
    lords: best.lords,
    turtles: best.turtles,
  };
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
  /** Average teamfight participation % (games where it was entered), -1 = none yet. */
  tp: number;
  /** Post-match MVPs. */
  mvps: number;
  topHero: string | null;
}

export function computeLeaderboard(games: GameRecord[]): PlayerAggregate[] {
  const map = new Map<string, PlayerAggregate & { heroes: Record<string, number>; tpSum: number; tpN: number }>();
  for (const g of games) {
    const mvp = gameMvp(g);
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
          tp: -1,
          mvps: 0,
          topHero: null,
          heroes: {},
          tpSum: 0,
          tpN: 0,
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
      if (typeof p.tp === 'number') {
        row.tpSum += p.tp;
        row.tpN++;
      }
      if (mvp === p.playerId) row.mvps++;
      if (p.hero) row.heroes[p.hero] = (row.heroes[p.hero] ?? 0) + 1;
    }
  }
  return [...map.values()].map(({ heroes, tpSum, tpN, ...r }) => ({
    ...r,
    tp: tpN ? Math.round(tpSum / tpN) : -1,
    kda: kdaRatio(r.k, r.d, r.a),
    topHero: Object.entries(heroes).sort((x, y) => y[1] - x[1])[0]?.[0] ?? null,
  }));
}

export type LeaderboardKey = keyof Pick<
  PlayerAggregate,
  'kda' | 'k' | 'd' | 'a' | 'gp' | 'fb' | 'dk' | 'tk' | 'maniac' | 'savage' | 'lords' | 'turtles' | 'wins' | 'tp' | 'mvps'
>;

export function rankBy(rows: PlayerAggregate[], key: LeaderboardKey, dir: 'desc' | 'asc' = 'desc'): PlayerAggregate[] {
  return [...rows].sort((a, b) => (dir === 'desc' ? b[key] - a[key] : a[key] - b[key]) || b.kda - a.kda);
}

// ── Hero statistics (Leaderboard → Heroes) ──────────────────────────────────

export interface HeroAggregate {
  hero: string;
  picks: number;
  bans: number;
  wins: number;
  losses: number;
  /** Percentages of all games (0–100). */
  pickRate: number;
  banRate: number;
  /** Picked or banned, % of games. */
  contention: number;
  /** null until the hero has finished a game. */
  winRate: number | null;
  /** Average kills / deaths / assists per game on this hero. */
  avgK: number;
  avgD: number;
  avgA: number;
  kda: number;
  /** Player with the most games on it. */
  topPlayer: { playerId: string; ign: string; games: number } | null;
}

export type HeroKey = 'picks' | 'bans' | 'contention' | 'pickRate' | 'banRate' | 'winRate' | 'wins' | 'losses' | 'kda';

/** Pick / ban / win numbers per hero across the given games. */
export function computeHeroStats(games: GameRecord[]): HeroAggregate[] {
  const total = games.length;
  const map = new Map<string, { hero: string; picks: number; bans: number; wins: number; k: number; d: number; a: number; n: number; players: Record<string, { ign: string; games: number }> }>();
  const row = (name: string) => {
    const hero = name.trim();
    const key = hero.toLowerCase();
    let r = map.get(key);
    if (!r) map.set(key, (r = { hero, picks: 0, bans: 0, wins: 0, k: 0, d: 0, a: 0, n: 0, players: {} }));
    return r;
  };
  const real = (h: string | undefined) => Boolean(h && h.trim() && h.trim().toLowerCase() !== 'none');
  for (const g of games) {
    for (const side of ['blue', 'red'] as const) {
      for (const h of g[side]?.picks ?? []) {
        if (!real(h)) continue;
        const r = row(h);
        r.picks++;
        if (g.winnerSide === side) r.wins++;
      }
      for (const h of g[side]?.bans ?? []) if (real(h)) row(h).bans++;
    }
    for (const p of g.players ?? []) {
      if (!real(p.hero)) continue;
      const r = row(p.hero);
      r.k += p.k;
      r.d += p.d;
      r.a += p.a;
      r.n++;
      if (p.playerId) {
        const pl = (r.players[p.playerId] ??= { ign: p.ign, games: 0 });
        pl.games++;
      }
    }
  }
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return [...map.values()]
    .filter((r) => r.picks || r.bans)
    .map((r) => {
      const top = Object.entries(r.players).sort((x, y) => y[1].games - x[1].games)[0];
      return {
        hero: r.hero,
        picks: r.picks,
        bans: r.bans,
        wins: r.wins,
        losses: r.picks - r.wins,
        pickRate: pct(r.picks),
        banRate: pct(r.bans),
        contention: Math.min(100, pct(r.picks + r.bans)),
        winRate: r.picks ? Math.round((r.wins / r.picks) * 100) : null,
        avgK: r.n ? +(r.k / r.n).toFixed(1) : 0,
        avgD: r.n ? +(r.d / r.n).toFixed(1) : 0,
        avgA: r.n ? +(r.a / r.n).toFixed(1) : 0,
        kda: r.n ? kdaRatio(r.k, r.d, r.a) : 0,
        topPlayer: top ? { playerId: top[0], ign: top[1].ign, games: top[1].games } : null,
      };
    });
}

export function rankHeroes(rows: HeroAggregate[], key: HeroKey, dir: 'desc' | 'asc' = 'desc'): HeroAggregate[] {
  const v = (r: HeroAggregate) => (key === 'winRate' ? (r.winRate ?? -1) : r[key]);
  return [...rows].sort((a, b) => (dir === 'desc' ? v(b) - v(a) : v(a) - v(b)) || b.contention - a.contention || a.hero.localeCompare(b.hero));
}

// ── Final placements (Teams section) ────────────────────────────────────────

export type PlacementLabel = 'Champion' | '1st runner-up' | '2nd runner-up' | '3rd runner-up';
export interface Placement {
  place: 1 | 2 | 3 | 4;
  label: PlacementLabel;
}

const LABELS: Record<number, PlacementLabel> = { 1: 'Champion', 2: '1st runner-up', 3: '2nd runner-up', 4: '3rd runner-up' };

/**
 * Champion and runner-ups once the tournament has a champion.
 * Double elimination: Grand Final loser = 1st runner-up, Lower Final loser = 2nd,
 * the loser of the lower round before it = 3rd. Single elimination: Final loser = 1st;
 * the two semifinal losers are ranked by the games they won in their semifinal.
 */
export function computePlacements(t: Tournament | null, matches: Match[]): Record<string, Placement> {
  if (!t?.championTeamId) return {};
  const out: Record<string, Placement> = {};
  const put = (teamId: string | null | undefined, place: 1 | 2 | 3 | 4) => {
    if (teamId && !out[teamId]) out[teamId] = { place, label: LABELS[place] };
  };
  put(t.championTeamId, 1);
  const done = matches.filter((m) => m.status === 'completed' && m.winnerId && m.bracket !== 'SEED');
  const loserOf = (m: Match) => m.loserId ?? (m.winnerId === m.teamAId ? m.teamBId : m.teamAId);
  const loserGames = (m: Match) => (m.winnerId === m.teamAId ? m.scoreB : m.scoreA);
  const final = [...done].filter((m) => m.isFinal || m.bracket === 'GF').sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (final) put(loserOf(final), 2);
  if (t.type === 'double') {
    const lbRounds = matches.filter((m) => m.bracket === 'LB').map((m) => m.round);
    const lastLb = lbRounds.length ? Math.max(...lbRounds) : 0;
    const lbFinal = done.find((m) => m.bracket === 'LB' && m.round === lastLb);
    if (lbFinal) put(loserOf(lbFinal), 3);
    const before = done.filter((m) => m.bracket === 'LB' && m.round === lastLb - 1).sort((a, b) => loserGames(b) - loserGames(a));
    if (before[0]) put(loserOf(before[0]), 4);
  } else {
    const ubRounds = matches.filter((m) => m.bracket === 'UB').map((m) => m.round);
    const lastUb = ubRounds.length ? Math.max(...ubRounds) : 0;
    const semis = done.filter((m) => m.bracket === 'UB' && m.round === lastUb - 1).sort((a, b) => loserGames(b) - loserGames(a));
    if (semis[0]) put(loserOf(semis[0]), 3);
    if (semis[1]) put(loserOf(semis[1]), 4);
  }
  return out;
}
