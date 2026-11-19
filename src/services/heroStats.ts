import type { GameRecord, HeroPoolEntry, MetaHero, Player, SeriesGameSummary, Team } from '@/types';
import { canonicalHero } from '@/lib/heroData';

// ─────────────────────────────────────────────────────────────────────────────
// Draft knowledge built from the tournament's own data (free, no API):
//   • each player's hero pool — heroes they played in recorded games (+ wins),
//     plus any signature heroes typed in Teams & Rosters
//   • the meta — most picked/banned heroes of the tournament
//   • the story so far — winner and heroes of earlier games in this series
// Stored on the live document when a game's lineup is confirmed, so the caster
// booth reads everything from one place.
// ─────────────────────────────────────────────────────────────────────────────

/** Player id → heroes they are known for, most played first (max 5). */
export function heroPools(games: GameRecord[], players: Player[]): Record<string, HeroPoolEntry[]> {
  const stats: Record<string, Record<string, HeroPoolEntry>> = {};
  for (const g of games) {
    for (const p of g.players ?? []) {
      if (!p.playerId || !p.hero) continue;
      const hero = canonicalHero(p.hero);
      const row = ((stats[p.playerId] ??= {})[hero.toLowerCase()] ??= { hero, games: 0, wins: 0 });
      row.games++;
      if (p.teamId && p.teamId === g.winnerTeamId) row.wins++;
    }
  }
  const out: Record<string, HeroPoolEntry[]> = {};
  for (const pl of players) {
    const played = Object.values(stats[pl.id] ?? {}).sort((a, b) => b.games - a.games || b.wins - a.wins);
    const manual = (pl.signatureHeroes ?? [])
      .map(canonicalHero)
      .filter((h) => h && !played.some((x) => x.hero.toLowerCase() === h.toLowerCase()))
      .map((hero) => ({ hero, games: 0, wins: 0 }));
    // Hand-picked signatures first only when the player has no recorded games on them yet.
    const pool = [...played.filter((x) => x.games >= 2), ...manual, ...played.filter((x) => x.games < 2)].slice(0, 5);
    if (pool.length) out[pl.id] = pool;
  }
  return out;
}

/** Most picked + banned heroes in this tournament (top 10). */
export function metaHeroes(games: GameRecord[], tournamentId: string | null): MetaHero[] {
  const count: Record<string, MetaHero> = {};
  for (const g of games) {
    if (tournamentId && g.tournamentId !== tournamentId) continue;
    for (const h of [...(g.blue?.picks ?? []), ...(g.red?.picks ?? []), ...(g.blue?.bans ?? []), ...(g.red?.bans ?? [])]) {
      if (!h || h.toLowerCase() === 'none') continue;
      const hero = canonicalHero(h);
      (count[hero.toLowerCase()] ??= { hero, count: 0 }).count++;
    }
  }
  return Object.values(count)
    .filter((m) => m.count >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

/** Earlier games of this series, oldest first. */
export function seriesHistory(games: GameRecord[], matchId: string, teams: Team[]): SeriesGameSummary[] {
  const name = (id: string) => teams.find((t) => t.id === id)?.name ?? 'TBD';
  return games
    .filter((g) => g.matchId === matchId)
    .sort((a, b) => a.gameNumber - b.gameNumber)
    .map((g) => {
      const loserId = g.winnerTeamId === g.blueTeamId ? g.redTeamId : g.blueTeamId;
      const winnerSide = g.winnerTeamId === g.blueTeamId ? g.blue : g.red;
      const loserSide = g.winnerTeamId === g.blueTeamId ? g.red : g.blue;
      return {
        game: g.gameNumber,
        winner: name(g.winnerTeamId),
        loser: name(loserId),
        winnerPicks: (winnerSide?.picks ?? []).filter(Boolean),
        loserPicks: (loserSide?.picks ?? []).filter(Boolean),
      };
    });
}

/** "3 laro na niyang ginamit ang Ling, 2 ang panalo." — or '' for hand-picked signatures. */
export function poolRecord(entry: HeroPoolEntry | undefined): string {
  if (!entry || entry.games < 1) return '';
  const games = entry.games === 1 ? 'Isang laro na niyang ginamit' : `${entry.games} laro na niyang ginamit`;
  const wins = entry.wins === 0 ? '' : entry.wins === entry.games ? `, at panalo sa ${entry.games === 1 ? 'larong iyon' : 'lahat ng iyon'}` : `, ${entry.wins} ang panalo`;
  return `${games} ang ${entry.hero}${wins}.`;
}
