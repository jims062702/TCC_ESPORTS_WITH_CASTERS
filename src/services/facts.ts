import type { GameEvent, LivePlayer, LiveState, LiveTeam, ObjectiveKind, Side } from '@/types';
import { FORMAT_LABEL, winsNeeded } from '@/lib/constants';
import { formatGold } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Builds the verified fact sheet for one event. Both the Gemini prompt and the
// fallback templates read ONLY from this object, which is what keeps the
// casters from inventing scores, players or gold numbers.
// ─────────────────────────────────────────────────────────────────────────────

export interface ActorFacts {
  ign: string;
  hero: string | null;
  team: string;
  side: Side;
  role: string;
  spell: string;
  kills: number;
  deaths: number;
  assists: number;
}

export interface CommentaryFacts {
  tournament: string;
  stage: string;
  format: string;
  winsNeeded: number;
  gameNumber: number;
  teamA: string;
  teamB: string;
  scoreA: number;
  scoreB: number;
  seriesScore: string;
  blueTeam: string;
  redTeam: string;
  kills: { blue: number; red: number };
  turtles: { blue: number; red: number };
  lords: { blue: number; red: number };
  gold: { diff: number; leader: string | null; text: string };
  actor?: ActorFacts;
  actorTeam?: string;
  enemyTeam?: string;
  /** Turtle / Lord / Buff for objective events. Steals are NOT tied to Retribution. */
  objective?: ObjectiveKind;
  steal?: boolean;
  note?: string;
  spellCooldowns?: string[];
  draft?: { blueBans: string[]; redBans: string[]; bluePicks: string[]; redPicks: string[] };
  result?: {
    winner: string;
    loser: string;
    winnerScore: number;
    loserScore: number;
    seriesOver: boolean;
    isChampionship: boolean;
  };
  replay?: { title: string; description: string };
}

export const sideTeam = (live: LiveState, side: Side): LiveTeam | null =>
  side === 'blue' ? (live.blueIsA ? live.teamA : live.teamB) : live.blueIsA ? live.teamB : live.teamA;

export const sideOfTeam = (live: LiveState, teamId: string): Side | null => {
  if (sideTeam(live, 'blue')?.id === teamId) return 'blue';
  if (sideTeam(live, 'red')?.id === teamId) return 'red';
  return null;
};

const teamName = (t: LiveTeam | null) => t?.name ?? 'TBD';
const sum = (players: LivePlayer[], key: 'k' | 'd' | 'a') => players.reduce((s, p) => s + (p[key] ?? 0), 0);

export function buildFacts(event: GameEvent, live: LiveState): CommentaryFacts {
  const blue = teamName(sideTeam(live, 'blue'));
  const red = teamName(sideTeam(live, 'red'));
  const a = teamName(live.teamA);
  const b = teamName(live.teamB);
  const leaderSide: Side | null = live.goldDiff > 0 ? 'blue' : live.goldDiff < 0 ? 'red' : null;
  const leader = leaderSide ? (leaderSide === 'blue' ? blue : red) : null;

  const facts: CommentaryFacts = {
    tournament: live.tournamentName || 'TCC Esports Tournament',
    stage: live.matchLabel,
    format: FORMAT_LABEL[live.format] ?? live.format,
    winsNeeded: winsNeeded(live.format),
    gameNumber: live.gameNumber,
    teamA: a,
    teamB: b,
    scoreA: live.scoreA,
    scoreB: live.scoreB,
    seriesScore: `${a} ${live.scoreA} - ${live.scoreB} ${b}`,
    blueTeam: blue,
    redTeam: red,
    kills: { blue: sum(live.blue.players, 'k'), red: sum(live.red.players, 'k') },
    turtles: { blue: live.blue.turtles, red: live.red.turtles },
    lords: { blue: live.blue.lords, red: live.red.lords },
    gold: {
      diff: Math.abs(live.goldDiff),
      leader,
      text: leader ? `${leader} leads by ${formatGold(live.goldDiff)} gold` : 'Gold is dead even',
    },
  };

  if (event.side) {
    facts.actorTeam = event.side === 'blue' ? blue : red;
    facts.enemyTeam = event.side === 'blue' ? red : blue;
    const roster = live[event.side].players;
    const p = roster.find((x) => x.playerId === event.playerId) ?? null;
    if (p) {
      facts.actor = {
        ign: p.ign,
        hero: p.hero || event.hero || null,
        team: facts.actorTeam,
        side: event.side,
        role: p.role,
        spell: event.spell ?? p.spell,
        kills: p.k,
        deaths: p.d,
        assists: p.a,
      };
    }
  }

  if (event.data?.steal) facts.steal = true;
  const objective: ObjectiveKind | null =
    event.type === 'TURTLE' ? 'Turtle' : event.type === 'LORD' ? 'Lord' : event.type === 'BUFF' ? 'Buff' : event.type === 'OBJECTIVE_CONTEST' ? ((event.data?.objective as ObjectiveKind) ?? 'Lord') : null;
  if (objective) facts.objective = objective;
  if (event.note) facts.note = event.note.slice(0, 280);

  // Battle spells currently on cooldown (Trixie's specialty).
  const now = Date.now();
  const cds: string[] = [];
  for (const side of ['blue', 'red'] as const) {
    for (const p of live[side].players) {
      if (p.spellReadyAt && p.spellReadyAt > now) {
        cds.push(`${p.ign} (${side === 'blue' ? blue : red}) — ${p.spell} on cooldown, ${Math.ceil((p.spellReadyAt - now) / 1000)}s left`);
      }
    }
  }
  if (cds.length) facts.spellCooldowns = cds.slice(0, 6);

  if (event.type === 'DRAFT_COMPLETE' || event.type === 'GAME_INTRO') {
    const clean = (arr: string[]) => arr.filter(Boolean);
    facts.draft = {
      blueBans: clean(live.draft.blueBans),
      redBans: clean(live.draft.redBans),
      bluePicks: clean(live.draft.bluePicks),
      redPicks: clean(live.draft.redPicks),
    };
  }

  if (event.type === 'GAME_RESULT' || event.type === 'SERIES_VICTORY') {
    const winnerSide = (event.side ?? (event.data?.winnerSide as Side | undefined)) || null;
    const winnerIsA =
      typeof event.data?.winnerIsA === 'boolean'
        ? (event.data.winnerIsA as boolean)
        : winnerSide
          ? (winnerSide === 'blue') === live.blueIsA
          : live.scoreA >= live.scoreB;
    facts.result = {
      winner: winnerIsA ? a : b,
      loser: winnerIsA ? b : a,
      winnerScore: winnerIsA ? live.scoreA : live.scoreB,
      loserScore: winnerIsA ? live.scoreB : live.scoreA,
      seriesOver: event.type === 'SERIES_VICTORY' || Boolean(event.data?.seriesOver),
      isChampionship: Boolean(event.data?.isChampionship),
    };
  }

  if (event.type === 'INSTANT_REPLAY') {
    facts.replay = {
      title: String(event.data?.title ?? 'Instant Replay'),
      description: event.note || String(event.data?.linkedSummary ?? ''),
    };
  }
  return facts;
}

/** One-line summary of an event for "recent events" context and logs. */
export function summarizeEvent(e: GameEvent, live: LiveState | null): string {
  const team = e.side && live ? teamName(sideTeam(live, e.side)) : '';
  const who = e.playerIgn ? `${e.playerIgn}${e.hero ? ` (${e.hero})` : ''}` : '';
  const steal = e.data?.steal ? ' — STEAL' : '';
  const objective = e.type === 'OBJECTIVE_CONTEST' ? String(e.data?.objective ?? '') : '';
  return [e.type.replace(/_/g, ' '), objective, who, team && `for ${team}`, steal].filter(Boolean).join(' ');
}
