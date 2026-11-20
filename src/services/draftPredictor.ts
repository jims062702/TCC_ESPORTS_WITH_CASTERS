import type { DraftState, GameRecord, LivePlayer, LiveState, Side } from '@/types';
import { allHeroes, canonicalHero, heroInfo } from '@/lib/heroData';
import { isNoBan } from '@/lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// AI Draft Predictor + hero draft stats (free, offline — no API).
//
// Prediction blends the tournament's own data with a small meta prior:
//   BAN  → deny the ENEMY: heroes the enemy players are known for (their hero
//          pools from recorded games + signature heroes), what the enemy won
//          with earlier in this series, the tournament's most banned/contested
//          heroes and high win rates.
//   PICK → help YOURSELF: your own players' pools for the positions still open,
//          heroes that fit those lanes, tournament pick rate / win rate, plus a
//          little "deny" weight for the enemy's comfort heroes.
// Different inputs → the ban % and the pick % for the same turn differ.
//
// Stats (Pick, Contention rate, Win rate, Ban count) are counted from the game
// records — what the players actually drafted and won with in this tournament.
// ─────────────────────────────────────────────────────────────────────────────

export interface Prediction {
  hero: string;
  /** 1–99, the share of the top candidates. */
  pct: number;
}

export interface HeroDraftStats {
  hero: string;
  /** Times picked in this tournament (this game included once it's locked). */
  picks: number;
  /** Times banned in this tournament (this game included once it's locked). */
  bans: number;
  /** Games counted (finished games + this game). */
  games: number;
  /** (picks + bans) / games, 0–100. */
  contention: number;
  /** Wins / finished games picked, 0–100 — null when it has never finished a game. */
  winRate: number | null;
  wins: number;
  /** Finished games where it was picked. */
  decided: number;
}

/**
 * Commonly contested heroes, used only as a light prior so the predictor has
 * something sensible before the tournament has data. Recorded games quickly
 * outweigh it. Edit freely when the meta shifts.
 */
const META_PRIOR: Record<string, number> = {
  Fredrinn: 5, Joy: 5, Lancelot: 4, Ling: 4, Hayabusa: 4, Chou: 4, Kalea: 4, Grock: 3, Valentina: 4,
  Pharsa: 3, Yve: 3, Claude: 3, Harith: 4, Karrie: 3, Granger: 3, Beatrix: 3, Mathilda: 4, Floryn: 3,
  Baxia: 3, Gatotkaca: 3, Khufra: 3, Franco: 3, Edith: 3, Terizla: 3, 'Yu Zhong': 3, Cici: 4, Arlott: 4,
  Lukas: 3, Phoveus: 3, Novaria: 3, Zhuxin: 4, Suyou: 4, Sora: 3, Obsidia: 3, Fanny: 3, Nolan: 4,
  Gloo: 3, Yin: 3, Hirara: 3, Zetian: 3, Lunox: 2, Xavier: 2, Kagura: 2, Tigreal: 2, Atlas: 2, Minsitthar: 2,
  Hylos: 2, Esmeralda: 2, 'X.Borg': 2, Paquito: 2, Martis: 2, Aamon: 2, Wanwan: 2, Brody: 2, Moskov: 2,
};

const key = (h: string) => h.trim().toLowerCase();
const real = (h: string | undefined | null): h is string => Boolean(h) && !isNoBan(h!);

/** Small, stable per-hero offset so equal scores don't look identical. */
const jitter = (hero: string, salt: number) => {
  let x = salt * 31;
  for (let i = 0; i < hero.length; i++) x = (x * 33 + hero.charCodeAt(i)) % 9973;
  return (x % 100) / 400; // 0 – 0.25
};

/** Games of this tournament, without the game currently on air (in case it was recorded and the draft redone). */
function pastGames(games: GameRecord[], live: Pick<LiveState, 'tournamentId' | 'matchId' | 'gameNumber'>) {
  return games.filter((g) => (!live.tournamentId || g.tournamentId === live.tournamentId) && !(g.matchId === live.matchId && g.gameNumber === live.gameNumber));
}

interface Tally {
  picks: number;
  bans: number;
  wins: number;
}

function tallyGames(games: GameRecord[]): { by: Record<string, Tally>; total: number } {
  const by: Record<string, Tally> = {};
  const row = (h: string) => (by[key(canonicalHero(h))] ??= { picks: 0, bans: 0, wins: 0 });
  for (const g of games) {
    for (const side of ['blue', 'red'] as const) {
      const s = g[side];
      for (const h of s?.picks ?? []) if (real(h)) {
        const r = row(h);
        r.picks++;
        if (g.winnerSide === side) r.wins++;
      }
      for (const h of s?.bans ?? []) if (real(h)) row(h).bans++;
    }
  }
  return { by, total: games.length };
}

const draftHeroes = (d: DraftState) => [...d.blueBans, ...d.redBans, ...d.bluePicks, ...d.redPicks].filter(real);

/** Pick / Contention / Win rate / Ban count for a hero — finished games of the tournament + the current draft. */
export function heroDraftStats(hero: string, games: GameRecord[], live: Pick<LiveState, 'tournamentId' | 'matchId' | 'gameNumber' | 'draft'>): HeroDraftStats {
  const past = pastGames(games, live);
  const t = tallyGames(past).by[key(canonicalHero(hero))] ?? { picks: 0, bans: 0, wins: 0 };
  const k = key(hero);
  const d = live.draft;
  const pickedNow = [...d.bluePicks, ...d.redPicks].some((h) => real(h) && key(h) === k) ? 1 : 0;
  const bannedNow = [...d.blueBans, ...d.redBans].some((h) => real(h) && key(h) === k) ? 1 : 0;
  const gamesCount = past.length + 1;
  const picks = t.picks + pickedNow;
  const bans = t.bans + bannedNow;
  return {
    hero: canonicalHero(hero),
    picks,
    bans,
    games: gamesCount,
    contention: Math.min(100, Math.round(((picks + bans) / gamesCount) * 100)),
    winRate: t.picks ? Math.round((t.wins / t.picks) * 100) : null,
    wins: t.wins,
    decided: t.picks,
  };
}

/** The player's own record on a hero (from their pool on the live document). */
export function playerHeroRecord(player: LivePlayer | null | undefined, hero: string) {
  const e = player?.pool?.find((x) => key(x.hero) === key(hero));
  return e && e.games > 0 ? { games: e.games, wins: e.wins } : null;
}

/** Players of a side who haven't got a hero yet (pick slot i belongs to player i). */
const openPlayers = (live: LiveState, side: Side) => live[side].players.filter((_, i) => !live.draft[`${side}Picks`][i]);
const pickedPlayers = (live: LiveState, side: Side) => live[side].players.filter((_, i) => Boolean(live.draft[`${side}Picks`][i]));

/** Weight of a pool entry: experience + wins, hand-picked signature heroes count as a solid base. */
const poolWeight = (games: number, wins: number) => 3 + Math.min(games, 6) * 1.6 + Math.min(wins, 6) * 2.2;

/**
 * Top candidates for the side on the clock. `kind` decides the logic:
 * ban = deny the enemy, pick = strengthen yourself.
 */
export function predictDraft(live: LiveState, games: GameRecord[], side: Side, kind: 'ban' | 'pick', limit = 10): Prediction[] {
  const enemy: Side = side === 'blue' ? 'red' : 'blue';
  const taken = new Set(draftHeroes(live.draft).map(key));
  const past = pastGames(games, live);
  const { by, total } = tallyGames(past);
  const score: Record<string, number> = {};
  const add = (hero: string, v: number) => {
    const h = canonicalHero(hero);
    if (!h || taken.has(key(h)) || isNoBan(h)) return;
    score[h] = (score[h] ?? 0) + v;
  };

  // Light meta prior (keeps the list sensible on day one).
  for (const [h, w] of Object.entries(META_PRIOR)) add(h, w * (kind === 'ban' ? 1.1 : 0.9));

  // Tournament trends.
  for (const h of allHeroes()) {
    const t = by[key(h)];
    if (!t || !total) continue;
    const contest = (t.picks + t.bans) / total; // 0 – 1
    const wr = t.picks ? t.wins / t.picks : 0.5;
    const confident = Math.min(1, t.picks / 3);
    if (kind === 'ban') add(h, contest * 10 + (t.bans / total) * 8 + (wr - 0.5) * 10 * confident);
    else add(h, contest * 6 + (t.picks / total) * 8 + (wr - 0.5) * 12 * confident);
  }

  // Series story: what each team drafted / won with in earlier games of this series.
  const teamOn = (sd: Side) => ((sd === 'blue') === live.blueIsA ? live.teamA?.id : live.teamB?.id);
  const enemyTeamId = teamOn(enemy);
  const ownTeamId = teamOn(side);
  for (const g of past.filter((x) => x.matchId === live.matchId)) {
    const sideOf = (teamId: string | undefined) => (teamId === g.blueTeamId ? 'blue' : teamId === g.redTeamId ? 'red' : null);
    const es = sideOf(enemyTeamId);
    const os = sideOf(ownTeamId);
    if (kind === 'ban' && es) for (const h of (g[es]?.picks ?? []).filter(real)) add(h, g.winnerSide === es ? 7 : 2.5);
    if (kind === 'pick' && os) for (const h of (g[os]?.picks ?? []).filter(real)) add(h, g.winnerSide === os ? 4 : 0.5);
  }

  if (kind === 'ban') {
    // Deny the enemy's comfort heroes — players still without a hero matter most.
    for (const p of openPlayers(live, enemy)) for (const e of p.pool ?? []) add(e.hero, poolWeight(e.games, e.wins) * 1.5);
    for (const p of pickedPlayers(live, enemy)) for (const e of p.pool ?? []) add(e.hero, poolWeight(e.games, e.wins) * 0.25);
    // Your own comfort heroes are worth protecting — don't ban them.
    for (const p of live[side].players) for (const e of p.pool ?? []) add(e.hero, -2);
  } else {
    const open = openPlayers(live, side);
    const lanes = new Set(open.map((p) => p.role));
    for (const p of open) for (const e of p.pool ?? []) add(e.hero, poolWeight(e.games, e.wins) * 1.6);
    // Fit the positions still open; heroes for filled positions drop.
    for (const h of Object.keys(score)) {
      const info = heroInfo(h);
      if (!info || !lanes.size) continue;
      if (info.lanes.some((l) => lanes.has(l))) score[h] += 3;
      else score[h] *= 0.35;
    }
    for (const h of allHeroes()) {
      const info = heroInfo(h);
      if (info?.lanes.some((l) => lanes.has(l)) && score[h] === undefined) add(h, 0.5);
    }
    // A bit of deny value: flex-picking the enemy's comfort heroes.
    for (const p of openPlayers(live, enemy)) for (const e of p.pool ?? []) add(e.hero, poolWeight(e.games, e.wins) * 0.3);
  }

  const salt = live.draft.step + (kind === 'ban' ? 7 : 13) + (side === 'blue' ? 1 : 2);
  const ranked = Object.entries(score)
    .map(([hero, s]) => ({ hero, s: Math.max(0.1, s) + jitter(hero, salt) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, limit);
  // Share of the top candidates (squared so the favourite stands out).
  const sum = ranked.reduce((a, r) => a + r.s * r.s, 0) || 1;
  return ranked.map((r) => ({ hero: r.hero, pct: Math.max(1, Math.min(99, Math.round(((r.s * r.s) / sum) * 100))) }));
}

export type DraftSlotKey = 'blueBans' | 'redBans' | 'bluePicks' | 'redPicks';

/** A hero that was just locked (empty slot → hero) between two draft states. */
export interface NewLock {
  side: Side;
  kind: 'ban' | 'pick';
  slot: number;
  hero: string;
}

export function newLocks(prev: DraftState | null, next: DraftState): NewLock[] {
  if (!prev) return [];
  const out: NewLock[] = [];
  for (const k of ['blueBans', 'redBans', 'bluePicks', 'redPicks'] as DraftSlotKey[]) {
    const side: Side = k.startsWith('blue') ? 'blue' : 'red';
    const kind = k.endsWith('Bans') ? 'ban' : 'pick';
    next[k].forEach((h, i) => {
      if (real(h) && !prev[k][i]) out.push({ side, kind, slot: i, hero: h });
    });
  }
  return out;
}
