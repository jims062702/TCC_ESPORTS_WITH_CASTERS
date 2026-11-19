import type { BracketKind, GameRecord, Match, MatchLink, SeriesFormat, Slot, SlotSource, Tournament } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Bracket engine (pure functions — no Firestore). Generates single / double
// elimination brackets with byes, and propagates series results to the next
// matches (winner → next round, loser → lower bracket).
// ─────────────────────────────────────────────────────────────────────────────

export const nextPow2 = (n: number) => 2 ** Math.ceil(Math.log2(Math.max(2, n)));

/** Standard tournament seeding positions: 8 → [1,8,4,5,2,7,3,6]. */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const next = order.length * 2;
    order = order.flatMap((s) => [s, next + 1 - s]);
  }
  return order;
}

export const matchId = (tournamentId: string, bracket: BracketKind, round: number, index: number) =>
  `${tournamentId}__${bracket}${round}-${index}`;

function roundLabelSingle(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semifinals';
  if (fromEnd === 2) return 'Quarterfinals';
  return `Round of ${2 ** (fromEnd + 1)}`;
}

export function roundTitle(bracket: BracketKind, round: number, totalRounds: number, type: Tournament['type']): string {
  if (bracket === 'GF') return 'Grand Final';
  if (bracket === 'SEED') return 'Seeding Round';
  if (type === 'single') return roundLabelSingle(round, totalRounds);
  if (bracket === 'UB') return round === totalRounds ? 'Upper Final' : round === totalRounds - 1 && totalRounds > 2 ? 'Upper Semifinals' : `Upper Round ${round}`;
  return round === totalRounds ? 'Lower Final' : `Lower Round ${round}`;
}

const blankMatch = (
  t: Tournament,
  bracket: BracketKind,
  round: number,
  index: number,
  format: SeriesFormat,
  label: string,
): Match => ({
  id: matchId(t.id, bracket, round, index),
  tournamentId: t.id,
  bracket,
  round,
  index,
  order: 0,
  label,
  teamAId: null,
  teamBId: null,
  sourceA: { kind: 'seed' },
  sourceB: { kind: 'seed' },
  deadA: false,
  deadB: false,
  format,
  scoreA: 0,
  scoreB: 0,
  status: 'pending',
  winnerId: null,
  loserId: null,
  winnerTo: null,
  loserTo: null,
  isFinal: false,
  scheduledAt: null,
  updatedAt: Date.now(),
});

/**
 * Generate the full bracket.
 * @param seededTeamIds team ids in seed order (index 0 = seed #1)
 */
export function generateBracket(t: Tournament, seededTeamIds: string[]): Match[] {
  const n = seededTeamIds.length;
  if (n < 2) throw new Error('At least 2 teams are required.');
  const isDouble = t.type === 'double' && n >= 3;
  const size = nextPow2(n);
  const k = Math.log2(size);
  const seeds = seedOrder(size);
  const all: Match[] = [];
  const byId = new Map<string, Match>();
  const add = (m: Match) => {
    m.order = all.length;
    all.push(m);
    byId.set(m.id, m);
  };
  const ub = (r: number, i: number) => matchId(t.id, 'UB', r, i);
  const lb = (r: number, i: number) => matchId(t.id, 'LB', r, i);
  const gf = matchId(t.id, 'GF', 1, 0);
  const L = isDouble ? 2 * (k - 1) : 0;
  const lbCount = (lr: number) => size / 2 ** (Math.ceil(lr / 2) + 1);
  const slotOf = (i: number): Slot => (i % 2 === 0 ? 'A' : 'B');

  // Upper bracket (or the whole single-elimination bracket)
  for (let r = 1; r <= k; r++) {
    const count = size / 2 ** r;
    for (let i = 0; i < count; i++) {
      const isLastUb = r === k;
      const format = isLastUb && !isDouble ? t.finalFormat : t.defaultFormat;
      const label = `${roundTitle('UB', r, k, isDouble ? 'double' : 'single')}${count > 1 ? ` · M${i + 1}` : ''}`;
      const m = blankMatch(t, 'UB', r, i, format, label);
      if (r === 1) {
        const sa = seeds[2 * i];
        const sb = seeds[2 * i + 1];
        m.teamAId = sa <= n ? seededTeamIds[sa - 1] : null;
        m.teamBId = sb <= n ? seededTeamIds[sb - 1] : null;
        m.sourceA = { kind: 'seed' };
        m.sourceB = { kind: 'seed' };
      } else {
        m.sourceA = { kind: 'winner', matchId: ub(r - 1, 2 * i) };
        m.sourceB = { kind: 'winner', matchId: ub(r - 1, 2 * i + 1) };
      }
      if (!isLastUb) m.winnerTo = { matchId: ub(r + 1, Math.floor(i / 2)), slot: slotOf(i) };
      else if (isDouble) m.winnerTo = { matchId: gf, slot: 'A' };
      else m.isFinal = true;

      if (isDouble) {
        if (r === 1) m.loserTo = { matchId: lb(1, Math.floor(i / 2)), slot: slotOf(i) };
        else m.loserTo = { matchId: lb(2 * (r - 1), count - 1 - i), slot: 'B' };
      }
      add(m);
    }
  }

  if (isDouble) {
    for (let lr = 1; lr <= L; lr++) {
      const count = lbCount(lr);
      for (let j = 0; j < count; j++) {
        const label = `${roundTitle('LB', lr, L, 'double')}${count > 1 ? ` · M${j + 1}` : ''}`;
        const m = blankMatch(t, 'LB', lr, j, t.defaultFormat, label);
        if (lr === 1) {
          m.sourceA = { kind: 'loser', matchId: ub(1, 2 * j) };
          m.sourceB = { kind: 'loser', matchId: ub(1, 2 * j + 1) };
        } else if (lr % 2 === 0) {
          const ubRound = lr / 2 + 1;
          m.sourceA = { kind: 'winner', matchId: lb(lr - 1, j) };
          m.sourceB = { kind: 'loser', matchId: ub(ubRound, count - 1 - j) };
        } else {
          m.sourceA = { kind: 'winner', matchId: lb(lr - 1, 2 * j) };
          m.sourceB = { kind: 'winner', matchId: lb(lr - 1, 2 * j + 1) };
        }
        if (lr === L) m.winnerTo = { matchId: gf, slot: 'B' };
        else if (lr % 2 === 1) m.winnerTo = { matchId: lb(lr + 1, j), slot: 'A' };
        else m.winnerTo = { matchId: lb(lr + 1, Math.floor(j / 2)), slot: slotOf(j) };
        add(m);
      }
    }
    const g = blankMatch(t, 'GF', 1, 0, t.finalFormat, 'Grand Final');
    g.sourceA = { kind: 'winner', matchId: ub(k, 0) };
    g.sourceB = { kind: 'winner', matchId: lb(L, 0) };
    g.isFinal = true;
    add(g);
  }

  // Dead-slot analysis: a slot is dead if it can never receive a team (byes).
  const isDeadSource = (src: SlotSource, hasTeam: boolean): boolean => {
    if (src.kind === 'seed') return !hasTeam;
    const from = byId.get(src.matchId!);
    if (!from) return true;
    if (src.kind === 'winner') return from.deadA && from.deadB;
    return from.deadA || from.deadB; // a bye match produces no loser
  };
  for (const m of all) {
    m.deadA = isDeadSource(m.sourceA, !!m.teamAId);
    m.deadB = isDeadSource(m.sourceB, !!m.teamBId);
    if (m.deadA && m.deadB) m.status = 'void';
  }

  // Auto-advance byes from round 1.
  for (const m of all) {
    if (m.bracket === 'UB' && m.round === 1) settleMatch(byId, m, new Set());
    else refreshStatus(m);
  }
  return all;
}

function refreshStatus(m: Match) {
  if (m.status === 'completed' || m.status === 'live' || m.status === 'void') return;
  m.status = m.teamAId && m.teamBId ? 'ready' : 'pending';
}

/** If one side of a match is a bye and the other has a team, that team advances automatically. */
function settleMatch(byId: Map<string, Match>, m: Match, changed: Set<string>) {
  if (m.status === 'completed' || m.status === 'void') return;
  const onlyA = m.teamAId && m.deadB;
  const onlyB = m.teamBId && m.deadA;
  if (onlyA || onlyB) {
    m.status = 'completed';
    m.winnerId = (onlyA ? m.teamAId : m.teamBId)!;
    m.loserId = null;
    m.updatedAt = Date.now();
    changed.add(m.id);
    if (m.winnerTo) placeTeam(byId, m.winnerTo, m.winnerId, changed);
    return;
  }
  refreshStatus(m);
}

function placeTeam(byId: Map<string, Match>, link: MatchLink, teamId: string, changed: Set<string>) {
  const target = byId.get(link.matchId);
  if (!target) return;
  if (link.slot === 'A') target.teamAId = teamId;
  else target.teamBId = teamId;
  target.updatedAt = Date.now();
  changed.add(target.id);
  settleMatch(byId, target, changed);
}

/**
 * Apply a finished series. Returns every match that changed (to batch-write).
 * The input array is not mutated.
 */
export function applySeriesResult(matches: Match[], id: string, winnerId: string, scoreA: number, scoreB: number): Match[] {
  const byId = new Map(matches.map((m) => [m.id, { ...m }]));
  const m = byId.get(id);
  if (!m) throw new Error('Match not found');
  const loserId = m.teamAId === winnerId ? m.teamBId : m.teamAId;
  const changed = new Set<string>([m.id]);
  m.status = 'completed';
  m.winnerId = winnerId;
  m.loserId = loserId;
  m.scoreA = scoreA;
  m.scoreB = scoreB;
  m.updatedAt = Date.now();
  if (m.winnerTo) placeTeam(byId, m.winnerTo, winnerId, changed);
  if (m.loserTo && loserId) placeTeam(byId, m.loserTo, loserId, changed);
  return [...changed].map((cid) => byId.get(cid)!);
}

/**
 * Undo a series result (for admin corrections). Only allowed while the
 * matches it fed into haven't started.
 */
export function revertSeriesResult(matches: Match[], id: string): Match[] {
  const byId = new Map(matches.map((m) => [m.id, { ...m }]));
  const m = byId.get(id);
  if (!m || m.status !== 'completed') throw new Error('Match is not completed.');
  const links = [m.winnerTo, m.loserTo].filter(Boolean) as MatchLink[];
  for (const link of links) {
    const next = byId.get(link.matchId);
    if (next && (next.status === 'completed' || next.status === 'live')) {
      throw new Error(`Cannot revert: "${next.label}" has already started. Revert that match first.`);
    }
  }
  const changed = new Set<string>([m.id]);
  for (const link of links) {
    const next = byId.get(link.matchId)!;
    if (link.slot === 'A') next.teamAId = null;
    else next.teamBId = null;
    next.status = 'pending';
    next.updatedAt = Date.now();
    changed.add(next.id);
  }
  m.status = m.teamAId && m.teamBId ? 'ready' : 'pending';
  m.winnerId = null;
  m.loserId = null;
  m.scoreA = 0;
  m.scoreB = 0;
  m.updatedAt = Date.now();
  return [...changed].map((cid) => byId.get(cid)!);
}

// ── Seeding round: every team plays ONE game (Bo1) before the bracket ──────

/**
 * Random draw: teams are paired for one Bo1 seeding game each. With an odd
 * number of teams, one team gets a seeding bye (counts as a win).
 */
export function generateSeedingRound(t: Tournament, teamIds: string[], rand: () => number = Math.random): Match[] {
  if (teamIds.length < 2) throw new Error('At least 2 teams are required.');
  const order = [...teamIds];
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [order[i], order[j]] = [order[j], order[i]];
  }
  const matches: Match[] = [];
  for (let i = 0; i < order.length; i += 2) {
    const idx = i / 2;
    const m = blankMatch(t, 'SEED', 1, idx, 'BO1', `Seeding · M${idx + 1}`);
    m.order = idx;
    m.teamAId = order[i];
    m.teamBId = order[i + 1] ?? null;
    if (!m.teamBId) {
      // Seeding bye
      m.deadB = true;
      m.status = 'completed';
      m.winnerId = m.teamAId;
      m.scoreA = 1;
    } else {
      m.status = 'ready';
    }
    matches.push(m);
  }
  return matches;
}

/**
 * Bracket seeds from the seeding round: winners first, then losers. Ties are
 * broken by kill difference in their seeding game, then by the quicker win
 * (or the longer loss). Seeding byes rank last among the winners.
 */
export function seedsFromSeeding(seedMatches: Match[], games: GameRecord[]): string[] {
  type Row = { teamId: string; won: boolean; bye: boolean; killDiff: number; duration: number };
  const rows: Row[] = [];
  for (const m of seedMatches.filter((x) => x.bracket === 'SEED')) {
    const g = games.find((x) => x.matchId === m.id);
    for (const [teamId, other] of [[m.teamAId, m.teamBId], [m.teamBId, m.teamAId]] as const) {
      if (!teamId) continue;
      let killDiff = 0;
      if (g) {
        const mine = g.blueTeamId === teamId ? g.blue : g.red;
        const theirs = g.blueTeamId === teamId ? g.red : g.blue;
        killDiff = (mine?.kills ?? 0) - (theirs?.kills ?? 0);
      }
      rows.push({ teamId, won: m.winnerId === teamId, bye: !other, killDiff, duration: g?.durationSec ?? 0 });
    }
  }
  const winners = rows.filter((r) => r.won).sort((a, b) => Number(a.bye) - Number(b.bye) || b.killDiff - a.killDiff || a.duration - b.duration);
  const losers = rows.filter((r) => !r.won).sort((a, b) => b.killDiff - a.killDiff || b.duration - a.duration);
  return [...winners, ...losers].map((r) => r.teamId);
}

/** First-round bracket match is still open (its draft hasn't started). */
const notStarted = (m: Match) => m.status === 'ready' || m.status === 'pending';

/** Seeding winners (teams that actually won their seeding game — byes excluded), in seed order. */
export function seedingWinners(matches: Match[], seedOrderIds: string[]): string[] {
  const won = new Set(matches.filter((m) => m.bracket === 'SEED' && m.status === 'completed' && m.teamAId && m.teamBId && m.winnerId).map((m) => m.winnerId!));
  return seedOrderIds.filter((id) => won.has(id));
}

/** Teams a seeding winner may still pick: first-round teams (not itself) whose match hasn't started and that aren't locked by an earlier pick. */
export function pickableOpponents(matches: Match[], winnerId: string, locked: Set<string>): string[] {
  const r1 = matches.filter((m) => m.bracket === 'UB' && m.round === 1 && m.status !== 'void');
  const own = r1.find((m) => m.teamAId === winnerId || m.teamBId === winnerId);
  if (!own || !notStarted(own)) return [];
  return r1
    .filter(notStarted)
    .flatMap((m) => [m.teamAId, m.teamBId])
    .filter((id): id is string => Boolean(id) && id !== winnerId && !locked.has(id!));
}

/**
 * A seeding winner picks its first-round opponent: the picked team moves into
 * the winner's match, and the winner's previous opponent takes the picked
 * team's old spot (a swap). Only allowed while both matches haven't started.
 */
export function pickOpponent(matches: Match[], winnerId: string, pickedId: string): Match[] {
  if (winnerId === pickedId) throw new Error('A team cannot pick itself.');
  const r1 = matches.filter((m) => m.bracket === 'UB' && m.round === 1 && m.status !== 'void').map((m) => ({ ...m }));
  const mw = r1.find((m) => m.teamAId === winnerId || m.teamBId === winnerId);
  const mp = r1.find((m) => m.teamAId === pickedId || m.teamBId === pickedId);
  if (!mw || !mp) throw new Error('Both teams must be in the first round of the bracket.');
  if (!notStarted(mw) || !notStarted(mp)) throw new Error('That match has already started its draft — the opponent can no longer change.');
  if (mw.id === mp.id) return [];
  const oppKey = mw.teamAId === winnerId ? 'teamBId' : 'teamAId';
  const pickedKey = mp.teamAId === pickedId ? 'teamAId' : 'teamBId';
  const previousOpponent = mw[oppKey];
  mw[oppKey] = pickedId;
  mp[pickedKey] = previousOpponent;
  const now = Date.now();
  for (const m of [mw, mp]) {
    m.status = m.teamAId && m.teamBId ? 'ready' : 'pending';
    m.updatedAt = now;
  }
  return [mw, mp];
}

/** Group matches into columns for rendering. */
export function bracketColumns(matches: Match[], bracket: BracketKind): Match[][] {
  const rows = matches.filter((m) => m.bracket === bracket);
  const rounds = [...new Set(rows.map((m) => m.round))].sort((a, b) => a - b);
  return rounds.map((r) => rows.filter((m) => m.round === r).sort((a, b) => a.index - b.index));
}
