import type { Team, Tournament } from '@/types';

/** Teams made before seasons existed (no `season` field) belong to the first season. */
export const DEFAULT_SEASON = 'Season 1';

/** "Season 2" → 2 (for ordering); no number → null. */
export const seasonNumber = (label: string) => {
  const m = /(\d+)/.exec(label);
  return m ? Number(m[1]) : null;
};

/** Trim and collapse spaces: "  Season   2 " → "Season 2". */
export const cleanSeason = (s?: string | null) => (s ?? '').trim().replace(/\s+/g, ' ');

/** "season 2" and "Season 2" are the same season. */
export const seasonKey = (s?: string | null) => cleanSeason(s).toLowerCase();
export const sameSeason = (a?: string | null, b?: string | null) => seasonKey(a) === seasonKey(b);

/** Oldest → newest (numbered seasons by number, others alphabetically after them). */
export function sortSeasons(labels: string[]): string[] {
  return [...labels].sort((a, b) => {
    const na = seasonNumber(a);
    const nb = seasonNumber(b);
    if (na !== null && nb !== null && na !== nb) return na - nb;
    if (na !== null && nb === null) return -1;
    if (na === null && nb !== null) return 1;
    return a.localeCompare(b);
  });
}

/**
 * Every season the organizer has used — from Tournaments → Season, from the
 * teams, plus any just-made season (`extra`). Oldest first. Teams and
 * tournaments without a season count as the first season.
 */
export function knownSeasons(tournaments: Pick<Tournament, 'season'>[], teams: Pick<Team, 'season'>[], extra: string[] = []): { seasons: string[]; legacy: string } {
  const byKey = new Map<string, string>();
  for (const label of [...tournaments.map((t) => t.season), ...teams.map((t) => t.season), ...extra]) {
    const c = cleanSeason(label);
    if (c && !byKey.has(c.toLowerCase())) byKey.set(c.toLowerCase(), c);
  }
  const sorted = sortSeasons([...byKey.values()]);
  const first = sorted[0];
  const firstNum = first ? seasonNumber(first) : null;
  // "Season 2" is the oldest label but older, unlabeled teams exist → they are Season 1.
  const legacy = !first || (firstNum !== null && firstNum > 1 && firstNum < 100) ? DEFAULT_SEASON : first;
  const unlabeled = [...tournaments, ...teams].some((x) => !cleanSeason(x.season));
  const seasons = !byKey.has(legacy.toLowerCase()) && (unlabeled || !sorted.length) ? sortSeasons([legacy, ...sorted]) : sorted;
  return { seasons, legacy };
}

/** The season a team plays in. */
export const teamSeason = (t: Pick<Team, 'season'>, legacy: string) => cleanSeason(t.season) || legacy;

/** The season a tournament belongs to. */
export const tournamentSeason = (t: Pick<Tournament, 'season'>, legacy: string) => cleanSeason(t.season) || legacy;

/** After "Season 2" comes "Season 3". */
export function nextSeasonLabel(seasons: string[]): string {
  const nums = seasons.map(seasonNumber).filter((n): n is number => n !== null && n < 100);
  return `Season ${(nums.length ? Math.max(...nums) : 0) + 1}`;
}
