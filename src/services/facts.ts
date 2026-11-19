import type { GameEvent, HeroPoolEntry, LivePlayer, LiveState, LiveTeam, ObjectiveKind, Side } from '@/types';
import { DRAFT_SEQUENCE, FORMAT_LABEL, POSITION_LABEL, winsNeeded } from '@/lib/constants';
import { banReason, heroClassLabel, pickHype } from '@/lib/heroData';
import { formatGold, pickRandom } from '@/lib/utils';
import { poolRecord } from './heroStats';
import { gameElapsedMs } from '@/lib/clock';

/** A ban or pick being called right now. */
export interface DraftCallFacts {
  hero: string;
  kind: 'ban' | 'pick';
  heroClass: string;
  /** "para hindi mahirapan ang backline nila" */
  reason: string;
  /** "siguradong puntirya niya ang backline" */
  hype: string;
  /** Ban: the enemy player whose signature hero this is. */
  target?: { player: string; record: string };
  /** Ban: the enemy used this hero in an earlier game of the series. */
  prevGame?: number;
  /** Pick: who gets it and whether it is their signature hero. */
  player?: string;
  position?: string;
  signature?: { record: string };
}

/** Lane matchup (same position on both sides). */
export interface MatchupFacts {
  position: string;
  blueHero: string;
  redHero: string;
  bluePlayer: string;
  redPlayer: string;
}

/** Speculation while drafting: what the team on the clock might ban/pick. */
export interface DraftTalkFacts {
  kind: 'ban' | 'pick' | 'done';
  team: string;
  enemy: string;
  phase: string;
  candHero?: string;
  candPlayer?: string;
  candRecord?: string;
  metaHero?: string;
  metaCount?: number;
}

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
  draftCall?: DraftCallFacts;
  draftTalk?: DraftTalkFacts;
  matchup?: MatchupFacts;
  /** An earlier game of this series (storytelling). */
  story?: { prevGame: number; prevWinner: string; prevLoser: string; prevWinnerPicks: string };
  /** A player to talk about (banter / post-game MVP). */
  spotlight?: { player: string; hero: string; kda: string; team: string; position: string };
  gameMinute?: number;
  /** +1 Kill: who died. */
  victim?: { ign: string; hero: string };
  /** Kill streaks: everyone who died ("B1 at B2"). */
  victims?: string[];
  /** A Savage continuation (more kills inside the 10-second window). */
  continuation?: boolean;
  /** Filler mode: draft / ingame / postgame / break. */
  mode?: string;
  /** Next game of the series (null when the series is over). */
  nextGame?: number | null;
  /** Going to break: minutes (0 = no countdown), producer message, the game after the break, or a mid-game pause. */
  breakInfo?: { minutes: number; message: string; nextGame: number | null; midGame: boolean };
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
  const buff = event.data?.buff === 'purple' ? 'Purple Buff' : event.data?.buff === 'orange' ? 'Orange Buff' : 'Buff';
  const objective: ObjectiveKind | null =
    event.type === 'TURTLE' ? 'Turtle' : event.type === 'LORD' ? 'Lord' : event.type === 'BUFF' ? buff : event.type === 'OBJECTIVE_CONTEST' ? ((event.data?.objective as ObjectiveKind) ?? 'Lord') : null;
  if (objective) facts.objective = objective;
  if (event.note) facts.note = event.note.slice(0, 280);

  // Battle spells currently on cooldown (Trixie's specialty).
  const now = Date.now();
  const cds: string[] = [];
  for (const side of ['blue', 'red'] as const) {
    for (const p of live[side].players) {
      if (p.spellReadyAt && p.spellReadyAt > now) {
        cds.push(`wala pang ${p.spell} si ${p.ign} ng ${side === 'blue' ? blue : red}`);
      }
    }
  }
  if (cds.length) facts.spellCooldowns = cds.slice(0, 6);

  // Phase announcements speak about the game they were created for.
  if ((event.type === 'DRAFT_START' || event.type === 'GAME_START') && event.gameNumber) facts.gameNumber = event.gameNumber;

  if (event.type === 'BREAK_START') {
    const d = event.data ?? {};
    facts.breakInfo = {
      minutes: Math.max(0, Math.round(Number(d.minutes) || 0)),
      message: String(d.message ?? '').trim().slice(0, 160),
      nextGame: Number(d.nextGame) || null,
      midGame: Boolean(d.midGame),
    };
  }

  if (event.type === 'DRAFT_COMPLETE' || event.type === 'GAME_INTRO' || event.type === 'GAME_START') {
    const clean = (arr: string[]) => arr.filter((h) => h && h.toLowerCase() !== 'none');
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

  const need = winsNeeded(live.format);
  const seriesOver = Math.max(live.scoreA, live.scoreB) >= need;
  const done = live.scoreA + live.scoreB >= live.gameNumber;
  facts.nextGame = seriesOver ? null : done ? live.scoreA + live.scoreB + 1 : live.gameNumber;
  const history = live.history ?? [];
  if (history.length) {
    const h = pickRandom(history.slice(-2));
    facts.story = { prevGame: h.game, prevWinner: h.winner, prevLoser: h.loser, prevWinnerPicks: h.winnerPicks.slice(0, 2).join(' at ') || '' };
  }

  if (event.type === 'KILL' && event.data?.victimIgn) facts.victim = { ign: String(event.data.victimIgn), hero: String(event.data.victimHero ?? '') };
  if (typeof event.data?.victimIgns === 'string' && event.data.victimIgns) facts.victims = event.data.victimIgns.split('|').filter(Boolean);
  if (event.data?.continuation) facts.continuation = true;
  if (event.type === 'DRAFT_BAN' && event.data?.none) return facts;
  if (event.type === 'DRAFT_BAN' || event.type === 'DRAFT_PICK') addDraftCall(facts, event, live);
  if (event.type === 'DRAFT_TALK') addDraftTalk(facts, live, blue, red);
  if (event.type === 'IDLE_BANTER') addBanter(facts, event, live, blue, red, a, b);
  return facts;
}

const same = (hero: string) => (h: string | HeroPoolEntry) => (typeof h === 'string' ? h : h.hero).toLowerCase() === hero.toLowerCase();
const kdaOf = (p: LivePlayer) => `${p.k}/${p.d}/${p.a}`;

function addDraftCall(facts: CommentaryFacts, event: GameEvent, live: LiveState) {
  const hero = String(event.data?.hero ?? event.hero ?? '');
  const side = event.side;
  if (!hero || !side) return;
  const seed = Math.floor(Math.random() * 100);
  const call: DraftCallFacts = { hero, kind: event.type === 'DRAFT_BAN' ? 'ban' : 'pick', heroClass: heroClassLabel(hero), reason: banReason(hero, seed), hype: pickHype(hero, seed) };
  if (call.kind === 'ban') {
    // Whose signature hero did they just take away?
    const enemy = live[side === 'blue' ? 'red' : 'blue'].players;
    const owners = enemy.flatMap((p) => (p.pool ?? []).filter(same(hero)).map((e) => ({ p, e }))).sort((x, y) => y.e.games - x.e.games);
    if (owners[0]) call.target = { player: owners[0].p.ign, record: poolRecord(owners[0].e) };
    const enemyName = facts.enemyTeam;
    const prev = [...(live.history ?? [])].reverse().find((h) => (h.winner === enemyName && h.winnerPicks.some(same(hero))) || (h.loser === enemyName && h.loserPicks.some(same(hero))));
    if (prev) call.prevGame = prev.game;
  } else {
    const players = live[side].players;
    const p = players.find((x) => x.playerId === event.playerId) ?? players[Number(event.data?.slot ?? -1)];
    if (p) {
      call.player = p.ign;
      call.position = POSITION_LABEL[p.role] ?? p.role;
      const entry = p.pool?.find(same(hero));
      if (entry) call.signature = { record: poolRecord(entry) };
    }
  }
  facts.draftCall = call;
}

function addDraftTalk(facts: CommentaryFacts, live: LiveState, blue: string, red: string) {
  const d = live.draft;
  const step = DRAFT_SEQUENCE[d.step];
  const taken = new Set([...d.blueBans, ...d.redBans, ...d.bluePicks, ...d.redPicks].filter(Boolean).map((h) => h.toLowerCase()));
  if (!step) {
    facts.draftTalk = { kind: 'done', team: blue, enemy: red, phase: 'Draft complete' };
    facts.matchup = matchup(live, (s, i) => live.draft[`${s}Picks`][i]);
    return;
  }
  const team = step.side === 'blue' ? blue : red;
  const enemy = step.side === 'blue' ? red : blue;
  const talk: DraftTalkFacts = { kind: step.kind, team, enemy, phase: step.phase };
  // Ban talk = the enemy's signature heroes; pick talk = their own players' signature heroes.
  const from = step.kind === 'ban' ? (step.side === 'blue' ? 'red' : 'blue') : step.side;
  const cands = live[from].players.flatMap((p) => (p.pool ?? []).filter((e) => !taken.has(e.hero.toLowerCase())).map((e) => ({ p, e })));
  if (cands.length) {
    const top = cands.sort((x, y) => y.e.games - x.e.games).slice(0, 4);
    const c = pickRandom(top);
    talk.candHero = c.e.hero;
    talk.candPlayer = c.p.ign;
    talk.candRecord = poolRecord(c.e) || undefined;
  }
  const meta = (live.meta ?? []).filter((m) => !taken.has(m.hero.toLowerCase())).slice(0, 5);
  if (meta.length) {
    const m = pickRandom(meta);
    talk.metaHero = m.hero;
    talk.metaCount = m.count;
  }
  facts.draftTalk = talk;
}

/** Same position on both sides (by the players' positions for this game). */
function matchup(live: LiveState, heroAt: (side: Side, i: number) => string): MatchupFacts | undefined {
  const options = live.blue.players
    .map((bp, i) => {
      const j = live.red.players.findIndex((rp) => rp.role === bp.role);
      const blueHero = heroAt('blue', i);
      const redHero = j >= 0 ? heroAt('red', j) : '';
      return blueHero && redHero ? { position: POSITION_LABEL[bp.role] ?? bp.role, blueHero, redHero, bluePlayer: bp.ign, redPlayer: live.red.players[j].ign } : null;
    })
    .filter((m): m is MatchupFacts => Boolean(m));
  return options.length ? pickRandom(options) : undefined;
}

function addBanter(facts: CommentaryFacts, event: GameEvent, live: LiveState, blue: string, red: string, a: string, b: string) {
  const mode = String(event.data?.mode ?? 'ingame');
  facts.mode = mode;
  if (mode === 'ingame' && live.gameStartedAt) facts.gameMinute = Math.max(1, Math.floor(gameElapsedMs(live) / 60_000));
  if (mode === 'ingame') facts.matchup = matchup(live, (s, i) => live[s].players[i]?.hero ?? '');
  const all = (['blue', 'red'] as const).flatMap((s) => live[s].players.filter((p) => p.hero).map((p) => ({ p, team: s === 'blue' ? blue : red })));
  const last = (live.history ?? []).find((h) => h.game === live.gameNumber) ?? (live.history ?? []).slice(-1)[0];
  let spot: { p: LivePlayer; team: string } | undefined;
  if (mode === 'postgame' && last) {
    // MVP of the winning team: best (K+A)/D.
    const winners = all.filter((x) => x.team === last.winner);
    spot = winners.sort((x, y) => (y.p.k + y.p.a) / Math.max(1, y.p.d) - (x.p.k + x.p.a) / Math.max(1, x.p.d))[0];
  } else if (all.length) {
    spot = pickRandom(all);
  }
  if (spot) facts.spotlight = { player: spot.p.ign, hero: spot.p.hero, kda: kdaOf(spot.p), team: spot.team, position: POSITION_LABEL[spot.p.role] ?? spot.p.role };
  if (mode === 'postgame' && last) {
    const winnerIsA = last.winner === a;
    facts.result = {
      winner: last.winner,
      loser: last.loser,
      winnerScore: winnerIsA ? live.scoreA : live.scoreB,
      loserScore: winnerIsA ? live.scoreB : live.scoreA,
      seriesOver: Math.max(live.scoreA, live.scoreB) >= winsNeeded(live.format),
      isChampionship: live.isFinal && Math.max(live.scoreA, live.scoreB) >= winsNeeded(live.format),
    };
    void b;
  }
}

/** One-line summary of an event for "recent events" context and logs. */
export function summarizeEvent(e: GameEvent, live: LiveState | null): string {
  const team = e.side && live ? teamName(sideTeam(live, e.side)) : '';
  const who = e.playerIgn ? `${e.playerIgn}${e.hero ? ` (${e.hero})` : ''}` : '';
  const steal = e.data?.steal ? ' — STEAL' : '';
  const objective = e.type === 'OBJECTIVE_CONTEST' ? String(e.data?.objective ?? '') : '';
  return [e.type.replace(/_/g, ' '), objective, who, team && `for ${team}`, steal].filter(Boolean).join(' ');
}
