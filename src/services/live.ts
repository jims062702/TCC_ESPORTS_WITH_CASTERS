import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type UpdateData,
} from 'firebase/firestore';
import type {
  Banner,
  GameRecord,
  BuffColor,
  Coach,
  DraftState,
  HeroPoolEntry,
  MetaHero,
  Role,
  SeriesGameSummary,
  EventType,
  GameEvent,
  GamePlayerStat,
  LivePlayer,
  LiveSide,
  LiveState,
  LiveTeam,
  LevelRecord,
  Match,
  Player,
  Side,
  Team,
  Tournament,
  MapEffect,
} from '@/types';
import { COL, LIVE_DOC, db } from './firebase';
import { pickCasterPair } from './casters';
import { applySeriesResult } from './bracket';
import { sideTeam } from './facts';
import {
  BANS_PER_SIDE,
  DRAFT_SEQUENCE,
  NO_BAN,
  isNoBan,
  isPairStart,
  picksComplete,
  EVENT_DEFS,
  LINEUP_SIZE,
  PICKS_PER_SIDE,
  ROLES,
  SPELL_COOLDOWN,
  winsNeeded,
  MAP_EFFECTS,
} from '@/lib/constants';
import { formatGold, uid } from '@/lib/utils';
import { canonicalHero, heroInfo } from '@/lib/heroData';
import { gameElapsedMs } from '@/lib/clock';
import { computeFinalsMvp, gameMvp, playerRating } from './stats';

/** Who plays this game for one team, in which position, and the coach (null = "No coach"). */
export interface TeamLineup {
  players: { playerId: string; role: Role }[];
  coach: Coach | null;
}

/** Everything chosen in the lineup dialog before a game's draft. */
export interface GameSetup {
  /** By team id. */
  lineups: Record<string, TeamLineup>;
  /** Player id → signature heroes (from recorded games + Teams & Rosters). */
  pools?: Record<string, HeroPoolEntry[]>;
  meta?: MetaHero[];
  history?: SeriesGameSummary[];
  /** The system-picked caster pair shown in the dialog (locked for the game). */
  casters?: string[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Live broadcast state machine. The admin controller calls these functions;
// overlays and the caster booth only *read* live/current via onSnapshot.
// ─────────────────────────────────────────────────────────────────────────────

const liveRef = () => doc(db, COL.live, LIVE_DOC.current);

export const emptyDraft = (timerDuration = 30): DraftState => ({
  step: 0,
  blueBans: Array(BANS_PER_SIDE).fill(''),
  redBans: Array(BANS_PER_SIDE).fill(''),
  bluePicks: Array(PICKS_PER_SIDE).fill(''),
  redPicks: Array(PICKS_PER_SIDE).fill(''),
  timerDuration,
  timerEndsAt: null,
  timerPausedLeft: null,
});

export const emptySide = (): LiveSide => ({ turtles: 0, lords: 0, players: [] });

export const defaultLive = (): LiveState => ({
  matchId: null,
  tournamentId: null,
  tournamentName: '',
  matchLabel: '',
  isFinal: false,
  format: 'BO3',
  scoreA: 0,
  scoreB: 0,
  gameNumber: 1,
  teamA: null,
  teamB: null,
  blueIsA: true,
  phase: 'idle',
  draft: emptyDraft(),
  blue: emptySide(),
  red: emptySide(),
  goldDiff: 0,
  gameStartedAt: null,
  casters: [],
  replay: { active: false, startedAt: 0, endsAt: 0, title: '', description: '', side: null, eventId: null },
  banner: null,
  breakEndsAt: null,
  breakPause: false,
  breakMessage: '',
  history: [],
  meta: [],
  mapEffect: null,
  updatedAt: Date.now(),
});

/** Merge a possibly-partial Firestore doc with defaults so the UI never crashes on missing fields. */
export const normalizeLive = (raw: Partial<LiveState> | null): LiveState => {
  const base = defaultLive();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    draft: { ...base.draft, ...(raw.draft ?? {}), slots: raw.draft?.slots ?? [] },
    blue: { ...base.blue, ...(raw.blue ?? {}) },
    red: { ...base.red, ...(raw.red ?? {}) },
    replay: { ...base.replay, ...(raw.replay ?? {}) },
  };
};

const toLiveTeam = (t: Team | undefined): LiveTeam | null =>
  t ? { id: t.id, name: t.name, tag: t.tag, logoUrl: t.logoUrl } : null;

const ROLE_ORDER = (r: string) => {
  const i = ROLES.indexOf(r as (typeof ROLES)[number]);
  return i === -1 ? 99 : i;
};

/** Default five: starters first, by position. */
export function defaultLineup(teamId: string, players: Player[], coach: Coach | null = null): TeamLineup {
  const chosen = players
    .filter((p) => p.teamId === teamId)
    .sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || ROLE_ORDER(a.role) - ROLE_ORDER(b.role) || a.order - b.order)
    .slice(0, LINEUP_SIZE);
  const free = ROLES.filter((r) => r !== 'Sub' && !chosen.some((p) => p.role === r));
  return { players: chosen.map((p) => ({ playerId: p.id, role: p.role === 'Sub' ? (free.shift() ?? 'EXP') : p.role })), coach };
}

/** The lineup currently on air for a side (to carry it into the next game). */
const currentLineup = (side: LiveSide): TeamLineup => ({ players: side.players.map((p) => ({ playerId: p.playerId, role: p.role })), coach: side.coach ?? null });

export function lineupFor(teamId: string | null | undefined, players: Player[], lineup?: TeamLineup, pools: Record<string, HeroPoolEntry[]> = {}): LivePlayer[] {
  if (!teamId) return [];
  const chosen = (lineup?.players.length ? lineup : defaultLineup(teamId, players)).players
    .map((s) => ({ p: players.find((x) => x.id === s.playerId && x.teamId === teamId), role: s.role }))
    .filter((c): c is { p: Player; role: Role } => Boolean(c.p))
    .sort((a, b) => ROLE_ORDER(a.role) - ROLE_ORDER(b.role))
    .slice(0, LINEUP_SIZE);
  return chosen.map(({ p, role }) => ({
      playerId: p.id,
      teamId: p.teamId,
      ign: p.ign,
      photoUrl: p.photoUrl,
      role,
      pool: pools[p.id] ?? [],
      hero: '',
      // Battle spells are picked for each game in the Drafting phase.
      spell: null,
      spellReadyAt: null,
      level: 1,
      maxLevelSec: null,
      k: 0,
      d: 0,
      a: 0,
      fb: 0,
      dk: 0,
      tk: 0,
      maniac: 0,
      savage: 0,
      lords: 0,
      turtles: 0,
    }));
}

const write = (patch: Record<string, unknown>) => updateDoc(liveRef(), { ...patch, updatedAt: Date.now() });

export const patchLive = (patch: Partial<LiveState>) => write(patch as Record<string, unknown>);

/** A pending caster event (no player attached). */
function eventDoc(live: Pick<LiveState, 'matchId' | 'gameNumber'>, type: EventType, data: GameEvent['data'], gameNumber = live.gameNumber): Omit<GameEvent, 'id'> {
  return {
    matchId: live.matchId ?? '',
    gameNumber,
    type,
    side: null,
    playerId: null,
    playerIgn: null,
    hero: null,
    spell: null,
    note: '',
    data,
    status: 'pending',
    claimedBy: null,
    createdAt: Date.now(),
  };
}

const versus = (live: Pick<LiveState, 'teamA' | 'teamB'>) => `${live.teamA?.name ?? 'TBD'} vs ${live.teamB?.name ?? 'TBD'}`;

/** On-screen graphic for the automatic phase announcements. */
function phaseBanner(live: Pick<LiveState, 'teamA' | 'teamB'>, type: 'DRAFT_START' | 'GAME_START', id: string, gameNumber: number): Banner {
  return type === 'DRAFT_START'
    ? { id, type, at: Date.now(), side: null, title: 'DRAFT PHASE', subtitle: `Game ${gameNumber} · ${versus(live)}` }
    : { id, type, at: Date.now(), side: null, title: `GAME ${gameNumber}`, subtitle: `Let the battle begin! · ${versus(live)}` };
}

/** True once the current game has a recorded result (scores already include it). */
const currentGameDone = (live: LiveState) => live.scoreA + live.scoreB >= live.gameNumber;

// ── Series lifecycle ────────────────────────────────────────────────────────

export async function goLive(opts: {
  match: Match;
  tournament: Tournament | null;
  teams: Team[];
  players: Player[];
  previousCasters?: string[];
  setup?: GameSetup;
}) {
  const { match, tournament, teams, players, setup } = opts;
  const teamA = teams.find((t) => t.id === match.teamAId);
  const teamB = teams.find((t) => t.id === match.teamBId);
  const sideFor = (team: Team | undefined): LiveSide => ({
    ...emptySide(),
    players: lineupFor(team?.id, players, team ? setup?.lineups[team.id] : undefined, setup?.pools),
    coach: team ? (setup?.lineups[team.id] ? setup.lineups[team.id].coach : (team.coach ?? null)) : null,
  });
  const state: LiveState = {
    ...defaultLive(),
    matchId: match.id,
    tournamentId: match.tournamentId,
    tournamentName: tournament?.name ?? '',
    matchLabel: match.label,
    isFinal: match.isFinal,
    format: match.format,
    scoreA: match.scoreA,
    scoreB: match.scoreB,
    gameNumber: match.scoreA + match.scoreB + 1,
    teamA: toLiveTeam(teamA),
    teamB: toLiveTeam(teamB),
    blueIsA: true,
    phase: 'draft',
    blue: sideFor(teamA),
    red: sideFor(teamB),
    // The system picks the pair once; it can't be changed during the game.
    casters: setup?.casters?.length === 2 ? setup.casters : pickCasterPair(opts.previousCasters),
    history: setup?.history ?? [],
    meta: setup?.meta ?? [],
  };
  // The casters open the show: "Welcome sa drafting phase natin, partner …!"
  const eventId = uid('ev_');
  state.banner = phaseBanner(state, 'DRAFT_START', eventId, state.gameNumber);
  const batch = writeBatch(db);
  batch.set(liveRef(), state);
  batch.set(doc(db, COL.events, eventId), eventDoc(state, 'DRAFT_START', {}));
  batch.update(doc(db, COL.matches, match.id), { status: 'live', updatedAt: Date.now() });
  await batch.commit();
}

/**
 * Prepare the next game in the same series: fresh draft & stats, the lineups
 * chosen for this game (default: same five and coach as last game) and a new
 * system-picked caster pair.
 */
export async function nextGame(live: LiveState, players: Player[], setup?: GameSetup) {
  const blueTeam = sideTeam(live, 'blue');
  const redTeam = sideTeam(live, 'red');
  const gameNumber = live.scoreA + live.scoreB + 1;
  const previousPools = Object.fromEntries([...live.blue.players, ...live.red.players].map((p) => [p.playerId, p.pool ?? []]));
  const pools = { ...previousPools, ...(setup?.pools ?? {}) };
  const sideFor = (side: Side, team: LiveTeam | null): LiveSide => {
    const lineup = (team && setup?.lineups[team.id]) || currentLineup(live[side]);
    return { ...emptySide(), players: lineupFor(team?.id, players, lineup, pools), coach: lineup.coach };
  };
  const eventId = uid('ev_');
  const batch = writeBatch(db);
  batch.update(liveRef(), {
    gameNumber,
    phase: 'draft',
    draft: emptyDraft(live.draft.timerDuration),
    blue: sideFor('blue', blueTeam),
    red: sideFor('red', redTeam),
    goldDiff: 0,
    gameStartedAt: null,
    clockPausedAt: null,
    mapEffect: null,
    levelPop: null,
    levelBest: null,
    casters: setup?.casters?.length === 2 ? setup.casters : pickCasterPair(live.casters),
    ...(setup?.meta ? { meta: setup.meta } : {}),
    banner: phaseBanner(live, 'DRAFT_START', eventId, gameNumber),
    replay: defaultLive().replay,
    breakEndsAt: null,
    breakPause: false,
    updatedAt: Date.now(),
  });
  // The new caster pair welcomes each other to the draft of this game.
  batch.set(doc(db, COL.events, eventId), eventDoc(live, 'DRAFT_START', {}, gameNumber));
  await batch.commit();
}

/** The lineups on air now, by team id (to pre-fill the lineup dialog). */
export function lineupsOf(live: LiveState): Record<string, TeamLineup> {
  const out: Record<string, TeamLineup> = {};
  for (const side of ['blue', 'red'] as const) {
    const team = sideTeam(live, side);
    if (team && live[side].players.length) out[team.id] = currentLineup(live[side]);
  }
  return out;
}

/** Change who plays the current game (before it starts) — players, positions, coach. */
export function applyLineups(live: LiveState, players: Player[], setup: GameSetup) {
  const previousPools = Object.fromEntries([...live.blue.players, ...live.red.players].map((p) => [p.playerId, p.pool ?? []]));
  const pools = { ...previousPools, ...(setup.pools ?? {}) };
  const patch: Record<string, unknown> = {};
  for (const side of ['blue', 'red'] as const) {
    const team = sideTeam(live, side);
    const lineup = team ? setup.lineups[team.id] : undefined;
    if (!team || !lineup) continue;
    patch[`${side}.players`] = lineupFor(team.id, players, lineup, pools);
    patch[`${side}.coach`] = lineup.coach;
  }
  if (setup.meta) patch.meta = setup.meta;
  return write(patch);
}

export async function endBroadcast(live: LiveState) {
  const batch = writeBatch(db);
  batch.set(liveRef(), { ...defaultLive(), casters: live.casters });
  if (live.matchId) {
    // A series taken off-air before it finished goes back to "ready".
    const snap = await getDoc(doc(db, COL.matches, live.matchId));
    if (snap.exists() && snap.data().status === 'live') {
      batch.update(snap.ref, { status: 'ready', updatedAt: Date.now() });
    }
  }
  await batch.commit();
}

/** Swap which team plays on blue side (also swaps lineups, draft and objective counters). */
export const swapSides = (live: LiveState) =>
  write({
    blueIsA: !live.blueIsA,
    blue: live.red,
    red: live.blue,
    goldDiff: -live.goldDiff,
    draft: {
      ...live.draft,
      blueBans: live.draft.redBans,
      redBans: live.draft.blueBans,
      bluePicks: live.draft.redPicks,
      redPicks: live.draft.bluePicks,
    },
  });

export const setPhase = (phase: LiveState['phase']) => write({ phase });

// ── Draft ───────────────────────────────────────────────────────────────────

const timerFresh = (d: DraftState) => ({ timerEndsAt: Date.now() + d.timerDuration * 1000, timerPausedLeft: null });

/**
 * Which player gets a picked hero: the one whose signature heroes include it,
 * else the one playing the hero's lane, else the first player without a hero.
 * (Fix any slot with the swap buttons — heroes are exchanged between players.)
 */
export function pickSlotFor(picks: string[], players: LivePlayer[], hero: string, fallback: number): number {
  const empty = picks.map((h, i) => (h ? -1 : i)).filter((i) => i >= 0);
  if (!empty.length) return fallback;
  const key = hero.toLowerCase();
  const bySignature = empty.find((i) => players[i]?.pool?.some((e) => e.hero.toLowerCase() === key));
  if (bySignature !== undefined) return bySignature;
  for (const lane of heroInfo(hero)?.lanes ?? []) {
    const byLane = empty.find((i) => players[i]?.role === lane);
    if (byLane !== undefined) return byLane;
  }
  return empty[0];
}

type DraftKey = 'blueBans' | 'redBans' | 'bluePicks' | 'redPicks';

export async function draftLock(live: LiveState, heroInput: string) {
  const d = live.draft;
  const step = DRAFT_SEQUENCE[d.step];
  // A team may skip a ban: the operator types "none".
  const none = isNoBan(heroInput);
  if (none && step?.kind === 'pick') throw new Error('Every pick needs a hero — "none" is only for bans.');
  const hero = none ? NO_BAN : canonicalHero(heroInput);
  if (!step || !hero) return;
  const key = `${step.side}${step.kind === 'ban' ? 'Bans' : 'Picks'}` as DraftKey;
  const arr = [...d[key]];
  const slot =
    step.kind === 'pick'
      ? pickSlotFor(arr, live[step.side].players, hero, step.index)
      : !arr[step.index]
        ? step.index
        : Math.max(0, arr.findIndex((h) => !h));
  arr[slot] = hero;
  const nextStep = d.step + 1;
  const done = nextStep >= DRAFT_SEQUENCE.length;
  const now = Date.now();
  const slots = [...(d.slots ?? []).slice(0, d.step), slot];
  const player = step.kind === 'pick' ? (live[step.side].players[slot] ?? null) : null;
  // Two picks by the same side happen together: the timer keeps running for the second hero.
  const timer = done ? { timerEndsAt: null, timerPausedLeft: null } : isPairStart(d.step) ? {} : timerFresh(d);
  const batch = writeBatch(db);
  batch.update(liveRef(), {
    draft: { ...d, [key]: arr, step: nextStep, slots, ...timer },
    updatedAt: now,
  });
  // The casters call every ban and pick ("Binan ng … ang Freya — para hindi mahirapan ang backline").
  batch.set(doc(db, COL.events, uid('ev_')), {
    ...eventDoc(live, step.kind === 'ban' ? 'DRAFT_BAN' : 'DRAFT_PICK', { hero, slot, step: d.step, order: step.index + 1, phase: step.phase, none }),
    side: step.side,
    playerId: player?.playerId ?? null,
    playerIgn: player?.ign ?? null,
    hero,
  });
  if (done) batch.set(doc(db, COL.events, uid('ev_')), { ...eventDoc(live, 'DRAFT_COMPLETE', {}), createdAt: now + 1 });
  await batch.commit();
}

export async function draftUndo(live: LiveState) {
  const d = live.draft;
  if (d.step === 0) return;
  const step = DRAFT_SEQUENCE[d.step - 1];
  const key = `${step.side}${step.kind === 'ban' ? 'Bans' : 'Picks'}` as DraftKey;
  const arr = [...d[key]];
  arr[d.slots?.[d.step - 1] ?? step.index] = '';
  await write({ draft: { ...d, [key]: arr, step: d.step - 1, slots: (d.slots ?? []).slice(0, d.step - 1), ...timerFresh(d) } });
}

export const draftSetSlot = (live: LiveState, key: DraftKey, index: number, hero: string) => {
  const arr = [...live.draft[key]];
  arr[index] = hero ? canonicalHero(hero) : '';
  return write({ draft: { ...live.draft, [key]: arr } });
};

/**
 * Hero trade between two players of the same team: player i gets player j's
 * hero and vice versa (also after the game has started).
 */
export const draftSwapPicks = (live: LiveState, side: Side, i: number, j: number) => {
  if (i === j) return Promise.resolve();
  const key = `${side}Picks` as DraftKey;
  const picks = [...live.draft[key]];
  [picks[i], picks[j]] = [picks[j] ?? '', picks[i] ?? ''];
  // Keep Undo pointing at the slot where each hero now sits.
  const slots = (live.draft.slots ?? []).map((s, n) => {
    const st = DRAFT_SEQUENCE[n];
    if (!st || st.side !== side || st.kind !== 'pick') return s;
    return s === i ? j : s === j ? i : s;
  });
  const patch: Record<string, unknown> = { draft: { ...live.draft, [key]: picks, slots } };
  const players = [...live[side].players];
  if (players[i] && players[j] && (players[i].hero || players[j].hero)) {
    const hi = players[i].hero;
    players[i] = { ...players[i], hero: players[j].hero };
    players[j] = { ...players[j], hero: hi };
    patch[`${side}.players`] = players;
  }
  return write(patch);
};

export const draftReset = (live: LiveState) => write({ draft: emptyDraft(live.draft.timerDuration) });

export const timerStart = (live: LiveState) => {
  const left = live.draft.timerPausedLeft ?? live.draft.timerDuration;
  return write({ draft: { ...live.draft, timerEndsAt: Date.now() + left * 1000, timerPausedLeft: null } });
};

export const timerPause = (live: LiveState) => {
  const left = live.draft.timerEndsAt ? Math.max(0, Math.round((live.draft.timerEndsAt - Date.now()) / 1000)) : live.draft.timerDuration;
  return write({ draft: { ...live.draft, timerEndsAt: null, timerPausedLeft: left } });
};

export const timerReset = (live: LiveState) => write({ draft: { ...live.draft, ...timerFresh(live.draft) } });

export const timerSetDuration = (live: LiveState, seconds: number) =>
  write({ draft: { ...live.draft, timerDuration: seconds } });

// ── In-game ─────────────────────────────────────────────────────────────────

/** Start the game: copy draft picks onto players (pick order → lineup order) if not set. */
export async function startGame(live: LiveState) {
  if (live.phase !== 'ingame' && !picksComplete(live.draft)) throw new Error('Pick all 10 heroes first (bans can be "none").');
  const assign = (players: LivePlayer[], picks: string[]) =>
    players.map((p, i) => ({ ...p, hero: p.hero || picks[i] || '' }));
  const announce = live.phase !== 'ingame'; // pressing Start twice doesn't re-announce
  const eventId = uid('ev_');
  const batch = writeBatch(db);
  batch.update(liveRef(), {
    phase: 'ingame',
    // The game clock starts now (pressing Start again on a running game keeps the time).
    ...(announce ? { gameStartedAt: Date.now(), clockPausedAt: null } : {}),
    blue: { ...live.blue, players: assign(live.blue.players, live.draft.bluePicks) },
    red: { ...live.red, players: assign(live.red.players, live.draft.redPicks) },
    draft: { ...live.draft, timerEndsAt: null, timerPausedLeft: null },
    ...(announce ? { banner: phaseBanner(live, 'GAME_START', eventId, live.gameNumber) } : {}),
    updatedAt: Date.now(),
  });
  // "At magsisimula na ang laro! Welcome sa Game N…"
  if (announce) batch.set(doc(db, COL.events, eventId), eventDoc(live, 'GAME_START', {}));
  await batch.commit();
}

export const MAX_LEVEL = 15;

/** The record a Level 15 has to beat: this game's fastest so far, else the tournament's. */
export async function levelRecordToBeat(live: LiveState): Promise<LevelRecord | null> {
  let saved: LevelRecord | null = null;
  if (live.tournamentId) {
    const snap = await getDoc(doc(db, COL.tournaments, live.tournamentId));
    saved = (snap.exists() ? (snap.data().levelRecord as LevelRecord | null | undefined) : null) ?? null;
  }
  const game = live.levelBest ?? null;
  if (game && (!saved || game.sec < saved.sec)) return game;
  return saved;
}

/**
 * + / − Level. Reaching Level 15 records the game time: a new best time pops up
 * on the HUD (the old record slashed) and the casters call it.
 */
export async function changeLevel(live: LiveState, side: Side, index: number, delta: 1 | -1) {
  const p = live[side].players[index];
  if (!p) return;
  const from = p.level ?? 1;
  const to = Math.min(MAX_LEVEL, Math.max(1, from + delta));
  if (to === from) return;
  if (to < MAX_LEVEL) return updatePlayer(live, side, index, { level: to, ...(from === MAX_LEVEL ? { maxLevelSec: null } : {}) });
  const sec = Math.max(0, Math.round(gameElapsedMs(live, Date.now()) / 1000));
  const prev = await levelRecordToBeat(live);
  const best = !prev || sec < prev.sec;
  await triggerEvent(live, 'LEVEL_MAX', { side, playerIndex: index, data: { sec, best, prev: prev ? JSON.stringify(prev) : null, prevSec: prev?.sec ?? null, prevIgn: prev?.ign ?? null, prevTeam: prev?.team ?? null } });
}

type StatKey = 'k' | 'd' | 'a';

export const adjustPlayerStat = (live: LiveState, side: Side, index: number, key: StatKey, delta: number) => {
  const players = live[side].players.map((p, i) => (i === index ? { ...p, [key]: Math.max(0, p[key] + delta) } : p));
  return write({ [`${side}.players`]: players });
};

export const updatePlayer = (live: LiveState, side: Side, index: number, patch: Partial<LivePlayer>) => {
  const players = live[side].players.map((p, i) => (i === index ? { ...p, ...patch } : p));
  return write({ [`${side}.players`]: players });
};

export const replaceLineupPlayer = (live: LiveState, side: Side, index: number, player: Player) =>
  updatePlayer(live, side, index, {
    playerId: player.id,
    teamId: player.teamId,
    ign: player.ign,
    photoUrl: player.photoUrl,
    role: player.role,
    spell: null,
    spellReadyAt: null,
    spellUsedAt: null,
  });

export const adjustObjective = (live: LiveState, side: Side, key: 'turtles' | 'lords', delta: number) =>
  write({ [`${side}.${key}`]: Math.max(0, live[side][key] + delta) });

export const setGoldDiff = (goldDiff: number) => write({ goldDiff: Math.round(goldDiff) });

export const clearReplay = () => write({ replay: defaultLive().replay });

/** OBS started the clip: the frame, sounds and zooms line up with the real playback. */
export const replayPlaying = (playingAt: number, endsAt: number) => write({ 'replay.playingAt': playingAt, 'replay.endsAt': endsAt });

/** OBS couldn't play it: fall back to a plain timed replay frame. */
export const replayWithoutObs = (seconds: number) => write({ 'replay.obs': false, 'replay.playingAt': Date.now(), 'replay.endsAt': Date.now() + seconds * 1000 });

/** Break loop on air + the casters send the show to break. */
/**
 * Go to break. `pause: true` = "Pause the game" from the In-game screen: the
 * game clock stops, the controller stays on In-game, and the game resumes by
 * itself when the countdown ends (or with End pause).
 */
export async function setBreak(live: LiveState, minutes: number | null, message: string, opts: { pause?: boolean } = {}) {
  const seriesOver = Math.max(live.scoreA, live.scoreB) >= winsNeeded(live.format);
  const done = currentGameDone(live);
  const midGame = live.phase === 'ingame' && !done;
  // Which game comes after the break (null when the series is over or a game is paused mid-way).
  const upcoming = seriesOver || midGame ? null : done ? live.scoreA + live.scoreB + 1 : live.gameNumber;
  const batch = writeBatch(db);
  batch.update(liveRef(), {
    phase: 'break',
    breakEndsAt: minutes && minutes > 0 ? Date.now() + minutes * 60_000 : null,
    breakPause: Boolean(opts.pause) && midGame,
    breakMessage: message,
    // A pause in the middle of a game stops the game clock.
    ...(midGame && live.gameStartedAt && !live.clockPausedAt ? { clockPausedAt: Date.now() } : {}),
    updatedAt: Date.now(),
  });
  batch.set(doc(db, COL.events, uid('ev_')), eventDoc(live, 'BREAK_START', { minutes: minutes ?? 0, message: message.trim(), nextGame: upcoming ?? 0, midGame, seriesOver }));
  await batch.commit();
}

/** Leave the break: next game's draft (if the last game finished), back to the paused game, or post-game. */
export async function endBreak(live: LiveState, players: Player[], setup?: GameSetup) {
  if (Math.max(live.scoreA, live.scoreB) >= winsNeeded(live.format)) return write({ phase: 'postgame', breakEndsAt: null, breakPause: false });
  if (currentGameDone(live)) return nextGame(live, players, setup);
  if (live.gameStartedAt) return write({ phase: 'ingame', breakEndsAt: null, breakPause: false, ...resumePatch(live) });
  return write({ phase: 'draft', breakEndsAt: null, breakPause: false });
}

/** Add time to the break / pause countdown (starts one if there was none). */
export const extendBreak = (live: LiveState, seconds: number) => write({ breakEndsAt: Math.max(live.breakEndsAt ?? 0, Date.now()) + seconds * 1000 });

/** Turn a "Pause the game" into a full break (the controller moves to the Break tab; no auto-resume). */
export const pauseToBreak = () => write({ breakPause: false });

// ── Game clock ──────────────────────────────────────────────────────────────

const resumePatch = (live: LiveState) =>
  live.gameStartedAt && live.clockPausedAt ? { gameStartedAt: live.gameStartedAt + (Date.now() - live.clockPausedAt), clockPausedAt: null } : {};

export const clockPause = (live: LiveState) => (live.gameStartedAt && !live.clockPausedAt ? write({ clockPausedAt: Date.now() }) : Promise.resolve());
export const clockResume = (live: LiveState) => write(resumePatch(live));
/** Add (or remove, with a negative number) seconds to match the in-game timer. */
export const clockAdjust = (live: LiveState, seconds: number) =>
  live.gameStartedAt ? write({ gameStartedAt: Math.min(live.clockPausedAt ?? Date.now(), live.gameStartedAt - seconds * 1000) }) : Promise.resolve();
/** Set the clock to exactly mm:ss. */
export const clockSet = (live: LiveState, seconds: number) => {
  const base = live.clockPausedAt ?? Date.now();
  return write({ gameStartedAt: base - Math.max(0, seconds) * 1000, ...(live.gameStartedAt ? {} : { clockPausedAt: null }) });
};

// ── Events (+ their side effects on the live state) ─────────────────────────

export interface TriggerOptions {
  side?: Side | null;
  playerIndex?: number | null;
  note?: string;
  steal?: boolean;
  replaySeconds?: number;
  replayTitle?: string;
  /** OBS will play the clip — the overlay waits until it really starts (see replayPlaying). */
  replayObs?: boolean;
  data?: GameEvent['data'];
}

/**
 * Trigger a broadcast event: applies the stat side-effects (kills, objectives,
 * multi-kill counters), shows a HUD banner, and queues the event for the
 * caster booth — all in one atomic batch.
 */
/** Set this game's battlefield effect — the overlays show it and the casters explain it. */
export function setMapEffect(live: LiveState, effect: MapEffect | null) {
  if (!effect) return write({ mapEffect: null });
  return triggerEvent(live, 'MAP_EFFECT', { side: null, data: { effect } });
}

/** Total kills on the scoreboard. */
const totalKills = (live: LiveState) => [...live.blue.players, ...live.red.players].reduce((n, p) => n + p.k, 0);

export async function triggerEvent(live: LiveState, type: EventType, opts: TriggerOptions = {}) {
  // The first kill of the game (0 - 0 on the scoreboard) is First Blood.
  if (type === 'KILL' && totalKills(live) === 0 && ![...live.blue.players, ...live.red.players].some((p) => p.fb > 0)) type = 'FIRST_BLOOD';
  // Battlefield effects change what Turtles and turrets mean (banner + caster lines).
  if (type === 'TURTLE' && live.mapEffect === 'healingTurtle') opts = { ...opts, data: { ...(opts.data ?? {}), healing: true } };
  if (type === 'TURRET' && live.mapEffect === 'goldenTurret') opts = { ...opts, data: { ...(opts.data ?? {}), golden: true } };
  const now = Date.now();
  const side = opts.side ?? null;
  const eventId = uid('ev_');
  const patch: Record<string, unknown> = { updatedAt: now };
  let player: LivePlayer | null = null;

  if (side && opts.playerIndex != null) {
    const players = [...live[side].players];
    const p = players[opts.playerIndex];
    if (p) {
      const next = { ...p };
      // One kill per player killed (the victims picked in the controller); without
      // victims: Double +2, Triple +3, Maniac +4, Savage +5. A Savage continuation
      // (more kills within 10 s) adds only its victims and no second Savage.
      const victimCount = parseVictims(opts.data?.victims).length;
      const add = (fallback: number) => (victimCount || fallback);
      const cont = Boolean(opts.data?.continuation);
      if (type === 'KILL') next.k = p.k + 1;
      if (type === 'FIRST_BLOOD') Object.assign(next, { k: p.k + add(1), fb: 1 });
      if (type === 'DOUBLE_KILL') Object.assign(next, { k: p.k + add(2), dk: p.dk + 1 });
      if (type === 'TRIPLE_KILL') Object.assign(next, { k: p.k + add(3), tk: p.tk + 1 });
      if (type === 'MANIAC') Object.assign(next, { k: p.k + add(4), maniac: p.maniac + 1 });
      if (type === 'SAVAGE') Object.assign(next, { k: p.k + add(5), savage: p.savage + (cont ? 0 : 1) });
      if (type === 'TURTLE') next.turtles = p.turtles + 1;
      if (type === 'LORD') next.lords = p.lords + 1;
      if (type === 'SPELL_USED' && p.spell) {
        next.spellUsedAt = now;
        next.spellReadyAt = now + (SPELL_COOLDOWN[p.spell] ?? 90) * 1000;
      }
      if (type === 'LEVEL_MAX') {
        next.level = MAX_LEVEL;
        next.maxLevelSec = Number(opts.data?.sec) || 0;
      }
      players[opts.playerIndex] = next;
      patch[`${side}.players`] = players;
      player = next;
    }
  }
  // Players who died (+1 death each): the single victim of +1 Kill, or the victims of a kill streak.
  const victimRefs: { side: Side; index: number }[] = parseVictims(opts.data?.victims).length
    ? parseVictims(opts.data?.victims)
    : opts.data?.victimSide
      ? [{ side: opts.data.victimSide as Side, index: Number(opts.data.victimIndex ?? -1) }]
      : [];
  const victims: LivePlayer[] = [];
  for (const ref of victimRefs) {
    const current = (patch[`${ref.side}.players`] as LivePlayer[] | undefined) ?? live[ref.side].players;
    if (!current[ref.index]) continue;
    const list = [...current];
    list[ref.index] = { ...list[ref.index], d: list[ref.index].d + 1 };
    victims.push(list[ref.index]);
    patch[`${ref.side}.players`] = list;
  }
  const victim = victims[0] ?? null;
  if (side && type === 'TURTLE') patch[`${side}.turtles`] = live[side].turtles + 1;
  if (side && type === 'TURRET') patch[`${side}.turrets`] = (live[side].turrets ?? 0) + 1;
  if (type === 'MAP_EFFECT') patch.mapEffect = (opts.data?.effect as MapEffect) ?? null;
  if (type === 'LEVEL_MAX' && side && player) {
    const sec = Number(opts.data?.sec) || 0;
    const prev = (opts.data?.prev ? JSON.parse(String(opts.data.prev)) : null) as LevelRecord | null;
    const best = Boolean(opts.data?.best);
    const t = sideTeam(live, side);
    patch.levelPop = { id: eventId, at: now, side, ign: player.ign, team: t?.name ?? '', hero: player.hero || '', photoUrl: player.photoUrl || '', sec, best, prev };
    if (best) {
      patch.levelBest = { sec, playerId: player.playerId, ign: player.ign, team: t?.name ?? '', hero: player.hero || '', gameNumber: live.gameNumber, matchLabel: live.matchLabel, at: now } satisfies LevelRecord;
    }
  }
  if (side && type === 'LORD') patch[`${side}.lords`] = live[side].lords + 1;

  const team = side ? sideTeam(live, side) : null;
  const def = EVENT_DEFS[type];

  if (type === 'INSTANT_REPLAY') {
    const seconds = opts.replaySeconds ?? 10;
    patch.replay = {
      active: true,
      obs: Boolean(opts.replayObs),
      playingAt: opts.replayObs ? null : now,
      startedAt: now,
      // With OBS the real end comes from the clip (replayPlaying); this is a safety net.
      endsAt: now + (seconds + (opts.replayObs ? 6 : 0)) * 1000,
      title: opts.replayTitle || 'Instant Replay',
      description: opts.note ?? '',
      side,
      eventId,
    };
  }

  const banner = buildBanner(live, type, eventId, side, player, team, opts);
  if (banner) patch.banner = banner;

  const event: Omit<GameEvent, 'id'> = {
    matchId: live.matchId ?? '',
    gameNumber: live.gameNumber,
    type,
    side,
    playerId: player?.playerId ?? null,
    playerIgn: player?.ign ?? null,
    hero: player?.hero || null,
    spell: player?.spell ?? null,
    note: opts.note ?? '',
    data: {
      steal: opts.steal ?? false,
      goldDiff: live.goldDiff,
      title: opts.replayTitle ?? def.label,
      ...(opts.data ?? {}),
      ...(victim ? { victimIgn: victim.ign, victimHero: victim.hero || '', victimIgns: victims.map((v) => v.ign).join('|') } : {}),
    },
    status: 'pending',
    claimedBy: null,
    createdAt: now,
  };

  const batch = writeBatch(db);
  batch.update(liveRef(), patch as UpdateData<DocumentData>);
  batch.set(doc(db, COL.events, eventId), event);
  await batch.commit();
  return eventId;
}

/** Victims picked in the controller, stored compactly in event data: "red:2,red:3". */
export const encodeVictims = (list: { side: Side; index: number }[]) => list.map((v) => `${v.side}:${v.index}`).join(',');
export function parseVictims(raw: unknown): { side: Side; index: number }[] {
  if (typeof raw !== 'string' || !raw) return [];
  return raw
    .split(',')
    .map((x) => x.split(':'))
    .filter(([s, i]) => (s === 'blue' || s === 'red') && /^\d+$/.test(i ?? ''))
    .map(([s, i]) => ({ side: s as Side, index: Number(i) }));
}

/** Queue an event for the casters without touching stats (e.g. draft complete). */
export async function pushEvent(live: LiveState, type: EventType, data: GameEvent['data'], side: Side | null = null) {
  const id = uid('ev_');
  await setDoc(doc(db, COL.events, id), { ...eventDoc(live, type, data), side });
  return id;
}

function buildBanner(
  live: LiveState,
  type: EventType,
  id: string,
  side: Side | null,
  player: LivePlayer | null,
  team: LiveTeam | null,
  opts: TriggerOptions,
): Banner | null {
  const at = Date.now();
  const def = EVENT_DEFS[type];
  if (type === 'GAME_INTRO') {
    return {
      id,
      type,
      at,
      side: null,
      title: `GAME ${live.gameNumber}`,
      subtitle: `${live.teamA?.name ?? 'TBD'} vs ${live.teamB?.name ?? 'TBD'} · ${live.format.replace('BO', 'Best of ')} · ${live.scoreA}-${live.scoreB}`,
    };
  }
  if (type === 'GOLD_UPDATE') {
    const leader = live.goldDiff === 0 ? null : sideTeam(live, live.goldDiff > 0 ? 'blue' : 'red');
    return {
      id,
      type,
      at,
      side: live.goldDiff === 0 ? null : live.goldDiff > 0 ? 'blue' : 'red',
      title: leader ? `+${formatGold(live.goldDiff)} GOLD` : 'GOLD EVEN',
      subtitle: leader ? `${leader.name} leads the economy` : 'Dead-even economy',
    };
  }
  if (type === 'MAP_EFFECT') {
    const e = MAP_EFFECTS[opts.data?.effect as MapEffect];
    return { id, type, at, side: null, title: (e?.label ?? 'Battlefield').toUpperCase(), subtitle: `Battlefield effect · ${e?.short ?? ''}` };
  }
  if (type === 'INVADE') {
    const enemy = side ? sideTeam(live, side === 'blue' ? 'red' : 'blue') : null;
    const buff = opts.data?.target === 'buff';
    return {
      id,
      type,
      at,
      side,
      title: buff ? 'BUFF INVADE!' : 'INVADE!',
      subtitle: `${team?.name ?? 'A team'} is invading ${enemy?.name ?? 'the enemy'}'s jungle${buff ? ' — eyeing the buff' : ''}`,
      teamName: team?.name ?? null,
      teamLogo: team?.logoUrl ?? null,
    };
  }
  if (type === 'TURRET') {
    const tier = String(opts.data?.tier ?? '');
    const golden = Boolean(opts.data?.golden);
    return {
      id,
      type,
      at,
      side,
      title: golden ? 'GOLDEN TURRET' : 'TURRET DESTROYED',
      subtitle: [tier ? `${tier} turret` : null, team?.name, golden ? 'bonus gold for the whole team' : null].filter(Boolean).join(' — '),
      teamName: team?.name ?? null,
      teamLogo: team?.logoUrl ?? null,
    };
  }
  // Level 15 has its own pop-up on the HUD (new best time, old record slashed).
  if (type === 'LEVEL_MAX') return null;
  if (type === 'OBJECTIVE_CONTEST') {
    const objective = String(opts.data?.objective ?? 'Lord');
    return {
      id,
      type,
      at,
      side,
      title: `${objective.toUpperCase()} CONTEST`,
      subtitle: `Sino kaya ang makakakuha ng ${objective}?`,
      teamName: team?.name ?? null,
      teamLogo: team?.logoUrl ?? null,
    };
  }
  if (!def.banner) return null;
  const isObjective = type === 'LORD' || type === 'TURTLE' || type === 'BUFF';
  const buff = opts.data?.buff as BuffColor | undefined;
  const objectiveName = type === 'LORD' ? 'LORD' : type === 'TURTLE' ? (opts.data?.healing ? 'HEALING TURTLE' : 'TURTLE') : buff ? `${buff.toUpperCase()} BUFF` : 'BUFF';
  const playerLabel = player ? `${player.ign}${player.hero ? ` · ${player.hero}` : ''}` : null;
  return {
    id,
    type,
    at,
    side,
    // Objectives: "TURTLE SLAIN" / "LORD STEAL!" + "Slain by IGN" (any hero can steal — no spell is implied).
    title: isObjective && opts.steal ? `${objectiveName} STEAL!` : isObjective ? `${objectiveName} SLAIN` : def.banner,
    subtitle: isObjective
      ? [player ? `Slain by ${player.ign}` : null, team?.name].filter(Boolean).join(' — ')
      : [playerLabel, team?.name].filter(Boolean).join(' — '),
    photoUrl: player?.photoUrl ?? null,
    ign: player?.ign ?? null,
    hero: player?.hero || null,
    teamName: team?.name ?? null,
    teamLogo: team?.logoUrl ?? null,
  };
}

// ── End of game / series ────────────────────────────────────────────────────

export interface EndGameResult {
  seriesOver: boolean;
  winnerTeamId: string;
  isChampionship: boolean;
}

export async function endGame(live: LiveState, winnerSide: Side, durationSec?: number): Promise<EndGameResult> {
  if (!live.matchId) throw new Error('No live match.');
  const blueTeam = sideTeam(live, 'blue');
  const redTeam = sideTeam(live, 'red');
  const winnerTeam = winnerSide === 'blue' ? blueTeam : redTeam;
  if (!winnerTeam || !blueTeam || !redTeam) throw new Error('Both teams must be set.');

  const winnerIsA = winnerTeam.id === live.teamA?.id;
  const scoreA = live.scoreA + (winnerIsA ? 1 : 0);
  const scoreB = live.scoreB + (winnerIsA ? 0 : 1);
  const seriesOver = Math.max(scoreA, scoreB) >= winsNeeded(live.format);
  const now = Date.now();

  const statOf = (p: LivePlayer): GamePlayerStat => ({
    playerId: p.playerId,
    teamId: p.teamId,
    ign: p.ign,
    hero: p.hero,
    spell: p.spell ?? null,
    level: p.level ?? 1,
    maxLevelSec: p.maxLevelSec ?? null,
    k: p.k,
    d: p.d,
    a: p.a,
    fb: p.fb,
    dk: p.dk,
    tk: p.tk,
    maniac: p.maniac,
    savage: p.savage,
    lords: p.lords,
    turtles: p.turtles,
  });
  const kills = (s: LiveSide) => s.players.reduce((n, p) => n + p.k, 0);
  const gameId = `${live.matchId}__g${live.gameNumber}`;

  const batch = writeBatch(db);
  batch.set(doc(db, COL.games, gameId), {
    tournamentId: live.tournamentId,
    matchId: live.matchId,
    gameNumber: live.gameNumber,
    blueTeamId: blueTeam.id,
    redTeamId: redTeam.id,
    winnerTeamId: winnerTeam.id,
    winnerSide,
    durationSec: durationSec ?? Math.round(gameElapsedMs(live, now) / 1000),
    blue: { kills: kills(live.blue), turtles: live.blue.turtles, lords: live.blue.lords, bans: live.draft.blueBans, picks: live.draft.bluePicks },
    red: { kills: kills(live.red), turtles: live.red.turtles, lords: live.red.lords, bans: live.draft.redBans, picks: live.draft.redPicks },
    players: [...live.blue.players, ...live.red.players].map(statOf),
    mapEffect: live.mapEffect ?? null,
    createdAt: now,
  });
  // Fastest Level 15 of this game → the tournament record (only now, once the winner is declared).
  if (live.levelBest && live.tournamentId) {
    const tSnap = await getDoc(doc(db, COL.tournaments, live.tournamentId));
    const current = (tSnap.exists() ? (tSnap.data().levelRecord as LevelRecord | null | undefined) : null) ?? null;
    if (tSnap.exists() && (!current || live.levelBest.sec < current.sec)) batch.update(tSnap.ref, { levelRecord: live.levelBest });
  }

  let isChampionship = false;
  if (seriesOver) {
    // Propagate through the bracket (winner → next match, loser → lower bracket).
    const snap = await getDocs(query(collection(db, COL.matches), where('tournamentId', '==', live.tournamentId)));
    const matches = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match);
    const current = matches.find((m) => m.id === live.matchId);
    const changed = current ? applySeriesResult(matches, live.matchId, winnerTeam.id, scoreA, scoreB) : [];
    for (const m of changed) {
      const { id, ...rest } = m;
      batch.set(doc(db, COL.matches, id), rest);
    }
    if (!current) batch.update(doc(db, COL.matches, live.matchId), { scoreA, scoreB, status: 'completed', winnerId: winnerTeam.id, updatedAt: now });
    isChampionship = Boolean(current?.isFinal);
    if (isChampionship && live.tournamentId) {
      batch.update(doc(db, COL.tournaments, live.tournamentId), { championTeamId: winnerTeam.id, status: 'completed' });
    }
  } else {
    batch.update(doc(db, COL.matches, live.matchId), { scoreA, scoreB, status: 'live', updatedAt: now });
  }

  const eventId = uid('ev_');
  const eventType: EventType = seriesOver ? 'SERIES_VICTORY' : 'GAME_RESULT';
  const winsW = winnerIsA ? scoreA : scoreB;
  const winsL = winnerIsA ? scoreB : scoreA;
  const winnerPicks = live.draft[`${winnerSide}Picks`].filter(Boolean);
  const loserPicks = live.draft[`${winnerSide === 'blue' ? 'red' : 'blue'}Picks`].filter(Boolean);
  const loserTeam = winnerSide === 'blue' ? redTeam : blueTeam;
  batch.update(liveRef(), {
    scoreA,
    scoreB,
    phase: 'postgame',
    // Freeze the game clock at the final time.
    ...(live.gameStartedAt && !live.clockPausedAt ? { clockPausedAt: now } : {}),
    history: [...(live.history ?? []).filter((h) => h.game !== live.gameNumber), { game: live.gameNumber, winner: winnerTeam.name, loser: loserTeam.name, winnerPicks, loserPicks }],
    updatedAt: now,
    banner: {
      id: eventId,
      type: eventType,
      at: now,
      side: winnerSide,
      title: seriesOver ? (isChampionship ? `${winnerTeam.name} — CHAMPIONS!` : `${winnerTeam.name} WINS THE SERIES`) : `${winnerTeam.name} WINS GAME ${live.gameNumber}`,
      subtitle: `${winsW}-${winsL} · ${live.format.replace('BO', 'Best of ')}`,
    } satisfies Banner,
  });
  batch.set(doc(db, COL.events, eventId), {
    matchId: live.matchId,
    gameNumber: live.gameNumber,
    type: eventType,
    side: winnerSide,
    playerId: null,
    playerIgn: null,
    hero: null,
    spell: null,
    note: '',
    data: { winnerIsA, seriesOver, isChampionship, winnerSide },
    status: 'pending',
    claimedBy: null,
    createdAt: now,
  } satisfies Omit<GameEvent, 'id'>);
  await batch.commit();
  // Grand Final won → crown the Finals MVP straight away (updated again when TP% is entered).
  if (isChampionship && live.tournamentId) await refreshFinalsMvp(live.tournamentId, live.matchId).catch(() => {});
  return { seriesOver, winnerTeamId: winnerTeam.id, isChampionship };
}

/** Recompute and store the Finals MVP from the Grand Final games. */
export async function refreshFinalsMvp(tournamentId: string, finalMatchId: string) {
  const snap = await getDocs(query(collection(db, COL.games), where('matchId', '==', finalMatchId)));
  const games = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as GameRecord);
  const mvp = computeFinalsMvp(games);
  if (mvp) {
    const player = await getDoc(doc(db, COL.players, mvp.playerId)).catch(() => null);
    mvp.photoUrl = (player?.exists() ? (player.data() as Player).photoUrl : '') || '';
  }
  await updateDoc(doc(db, COL.tournaments, tournamentId), { finalsMvp: mvp ?? null });
  return mvp;
}

/**
 * Post-game stats: save each player's teamfight participation (TP%), then pick
 * the post-match MVP (best rating on the winning team). Grand Final games also
 * refresh the Finals MVP.
 */
export async function saveGameStats(game: GameRecord, tp: Record<string, number | null>, opts: { isFinal: boolean; tournamentId: string | null }) {
  const players = game.players.map((p) => ({ ...p, tp: tp[p.playerId] ?? p.tp ?? null }));
  const scored = { ...game, players, mvpPlayerId: null };
  const mvpPlayerId = gameMvp(scored);
  await updateDoc(doc(db, COL.games, game.id), { players, mvpPlayerId });
  if (opts.isFinal && opts.tournamentId) await refreshFinalsMvp(opts.tournamentId, game.matchId);
  return { mvpPlayerId, ratings: Object.fromEntries(players.map((p) => [p.playerId, playerRating(p, p.teamId === game.winnerTeamId)])) };
}
