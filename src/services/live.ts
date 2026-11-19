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
  DraftState,
  EventType,
  GameEvent,
  GamePlayerStat,
  LivePlayer,
  LiveSide,
  LiveState,
  LiveTeam,
  Match,
  Player,
  Side,
  Team,
  Tournament,
} from '@/types';
import { COL, LIVE_DOC, db } from './firebase';
import { pickCasterPair } from './casters';
import { applySeriesResult } from './bracket';
import { sideTeam } from './facts';
import {
  BANS_PER_SIDE,
  DRAFT_SEQUENCE,
  EVENT_DEFS,
  PICKS_PER_SIDE,
  ROLES,
  SPELL_COOLDOWN,
  winsNeeded,
} from '@/lib/constants';
import { formatGold, uid } from '@/lib/utils';

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
  breakMessage: '',
  updatedAt: Date.now(),
});

/** Merge a possibly-partial Firestore doc with defaults so the UI never crashes on missing fields. */
export const normalizeLive = (raw: Partial<LiveState> | null): LiveState => {
  const base = defaultLive();
  if (!raw) return base;
  return {
    ...base,
    ...raw,
    draft: { ...base.draft, ...(raw.draft ?? {}) },
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

export function lineupFor(teamId: string | null | undefined, players: Player[]): LivePlayer[] {
  if (!teamId) return [];
  return players
    .filter((p) => p.teamId === teamId)
    .sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || ROLE_ORDER(a.role) - ROLE_ORDER(b.role) || a.order - b.order)
    .slice(0, 5)
    .map((p) => ({
      playerId: p.id,
      teamId: p.teamId,
      ign: p.ign,
      photoUrl: p.photoUrl,
      role: p.role,
      hero: '',
      spell: p.spell,
      spellReadyAt: null,
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

// ── Series lifecycle ────────────────────────────────────────────────────────

export async function goLive(opts: {
  match: Match;
  tournament: Tournament | null;
  teams: Team[];
  players: Player[];
  previousCasters?: string[];
}) {
  const { match, tournament, teams, players } = opts;
  const teamA = teams.find((t) => t.id === match.teamAId);
  const teamB = teams.find((t) => t.id === match.teamBId);
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
    blue: { ...emptySide(), players: lineupFor(teamA?.id, players) },
    red: { ...emptySide(), players: lineupFor(teamB?.id, players) },
    casters: pickCasterPair(opts.previousCasters),
  };
  const batch = writeBatch(db);
  batch.set(liveRef(), state);
  batch.update(doc(db, COL.matches, match.id), { status: 'live', updatedAt: Date.now() });
  await batch.commit();
}

/** Prepare the next game in the same series: fresh draft & stats, new random caster pair. */
export async function nextGame(live: LiveState, players: Player[]) {
  const blueTeam = sideTeam(live, 'blue');
  const redTeam = sideTeam(live, 'red');
  await write({
    gameNumber: live.scoreA + live.scoreB + 1,
    phase: 'draft',
    draft: emptyDraft(live.draft.timerDuration),
    blue: { ...emptySide(), players: lineupFor(blueTeam?.id, players) },
    red: { ...emptySide(), players: lineupFor(redTeam?.id, players) },
    goldDiff: 0,
    gameStartedAt: null,
    casters: pickCasterPair(live.casters),
    banner: null,
    replay: defaultLive().replay,
  });
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

export const rerollCasters = (live: LiveState) => write({ casters: pickCasterPair(live.casters) });

export const setCasters = (ids: string[]) => write({ casters: ids.slice(0, 2) });

export const setPhase = (phase: LiveState['phase']) => write({ phase });

// ── Draft ───────────────────────────────────────────────────────────────────

const timerFresh = (d: DraftState) => ({ timerEndsAt: Date.now() + d.timerDuration * 1000, timerPausedLeft: null });

export async function draftLock(live: LiveState, hero: string) {
  const d = live.draft;
  const step = DRAFT_SEQUENCE[d.step];
  if (!step || !hero.trim()) return;
  const key = `${step.side}${step.kind === 'ban' ? 'Bans' : 'Picks'}` as 'blueBans' | 'redBans' | 'bluePicks' | 'redPicks';
  const arr = [...d[key]];
  arr[step.index] = hero.trim();
  const nextStep = d.step + 1;
  const done = nextStep >= DRAFT_SEQUENCE.length;
  await write({
    draft: { ...d, [key]: arr, step: nextStep, ...(done ? { timerEndsAt: null, timerPausedLeft: null } : timerFresh(d)) },
  });
  if (done) await pushEvent(live, 'DRAFT_COMPLETE', {});
}

export async function draftUndo(live: LiveState) {
  const d = live.draft;
  if (d.step === 0) return;
  const step = DRAFT_SEQUENCE[d.step - 1];
  const key = `${step.side}${step.kind === 'ban' ? 'Bans' : 'Picks'}` as 'blueBans' | 'redBans' | 'bluePicks' | 'redPicks';
  const arr = [...d[key]];
  arr[step.index] = '';
  await write({ draft: { ...d, [key]: arr, step: d.step - 1, ...timerFresh(d) } });
}

export const draftSetSlot = (live: LiveState, key: 'blueBans' | 'redBans' | 'bluePicks' | 'redPicks', index: number, hero: string) => {
  const arr = [...live.draft[key]];
  arr[index] = hero;
  return write({ draft: { ...live.draft, [key]: arr } });
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
  const assign = (players: LivePlayer[], picks: string[]) =>
    players.map((p, i) => ({ ...p, hero: p.hero || picks[i] || '' }));
  await write({
    phase: 'ingame',
    gameStartedAt: Date.now(),
    blue: { ...live.blue, players: assign(live.blue.players, live.draft.bluePicks) },
    red: { ...live.red, players: assign(live.red.players, live.draft.redPicks) },
    draft: { ...live.draft, timerEndsAt: null, timerPausedLeft: null },
  });
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
    spell: player.spell,
    spellReadyAt: null,
  });

export const adjustObjective = (live: LiveState, side: Side, key: 'turtles' | 'lords', delta: number) =>
  write({ [`${side}.${key}`]: Math.max(0, live[side][key] + delta) });

export const setGoldDiff = (goldDiff: number) => write({ goldDiff: Math.round(goldDiff) });

export const clearReplay = () => write({ replay: defaultLive().replay });

export const setBreak = (minutes: number | null, message: string) =>
  write({ phase: 'break', breakEndsAt: minutes ? Date.now() + minutes * 60_000 : null, breakMessage: message });

// ── Events (+ their side effects on the live state) ─────────────────────────

export interface TriggerOptions {
  side?: Side | null;
  playerIndex?: number | null;
  note?: string;
  steal?: boolean;
  replaySeconds?: number;
  replayTitle?: string;
  data?: GameEvent['data'];
}

/**
 * Trigger a broadcast event: applies the stat side-effects (kills, objectives,
 * multi-kill counters), shows a HUD banner, and queues the event for the
 * caster booth — all in one atomic batch.
 */
export async function triggerEvent(live: LiveState, type: EventType, opts: TriggerOptions = {}) {
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
      // Each MLBB kill-streak announcement corresponds to one kill.
      if (type === 'FIRST_BLOOD') Object.assign(next, { k: p.k + 1, fb: 1 });
      if (type === 'DOUBLE_KILL') Object.assign(next, { k: p.k + 1, dk: p.dk + 1 });
      if (type === 'TRIPLE_KILL') Object.assign(next, { k: p.k + 1, tk: p.tk + 1 });
      if (type === 'MANIAC') Object.assign(next, { k: p.k + 1, maniac: p.maniac + 1 });
      if (type === 'SAVAGE') Object.assign(next, { k: p.k + 1, savage: p.savage + 1 });
      if (type === 'TURTLE') next.turtles = p.turtles + 1;
      if (type === 'LORD') next.lords = p.lords + 1;
      if (type === 'SPELL_USED') next.spellReadyAt = now + (SPELL_COOLDOWN[p.spell] ?? 90) * 1000;
      players[opts.playerIndex] = next;
      patch[`${side}.players`] = players;
      player = next;
    }
  }
  if (side && type === 'TURTLE') patch[`${side}.turtles`] = live[side].turtles + 1;
  if (side && type === 'LORD') patch[`${side}.lords`] = live[side].lords + 1;

  const team = side ? sideTeam(live, side) : null;
  const def = EVENT_DEFS[type];

  if (type === 'INSTANT_REPLAY') {
    const seconds = opts.replaySeconds ?? 10;
    patch.replay = {
      active: true,
      startedAt: now,
      endsAt: now + seconds * 1000,
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

/** Queue an event for the casters without touching stats (e.g. draft complete). */
export async function pushEvent(live: LiveState, type: EventType, data: GameEvent['data'], side: Side | null = null) {
  const id = uid('ev_');
  await setDoc(doc(db, COL.events, id), {
    matchId: live.matchId ?? '',
    gameNumber: live.gameNumber,
    type,
    side,
    playerId: null,
    playerIgn: null,
    hero: null,
    spell: null,
    note: '',
    data,
    status: 'pending',
    claimedBy: null,
    createdAt: Date.now(),
  } satisfies Omit<GameEvent, 'id'>);
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
  const objectiveName = type === 'LORD' ? 'LORD' : type === 'TURTLE' ? 'TURTLE' : 'BUFF';
  const playerLabel = player ? `${player.ign}${player.hero ? ` · ${player.hero}` : ''}` : null;
  return {
    id,
    type,
    at,
    side,
    // Objectives: "TURTLE SLAIN" / "LORD STEAL!" + "Slain by IGN" (any hero can steal — no spell is implied).
    title: isObjective && opts.steal ? `${objectiveName} STEAL!` : def.banner,
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
    spell: p.spell,
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
    durationSec: durationSec ?? (live.gameStartedAt ? Math.round((now - live.gameStartedAt) / 1000) : 0),
    blue: { kills: kills(live.blue), turtles: live.blue.turtles, lords: live.blue.lords, bans: live.draft.blueBans, picks: live.draft.bluePicks },
    red: { kills: kills(live.red), turtles: live.red.turtles, lords: live.red.lords, bans: live.draft.redBans, picks: live.draft.redPicks },
    players: [...live.blue.players, ...live.red.players].map(statOf),
    createdAt: now,
  });

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
  batch.update(liveRef(), {
    scoreA,
    scoreB,
    phase: 'postgame',
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
  return { seriesOver, winnerTeamId: winnerTeam.id, isChampionship };
}
