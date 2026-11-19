// ─────────────────────────────────────────────────────────────────────────────
// Domain types shared by the landing page, admin panel, overlays and casters.
// Firestore documents store plain numbers (epoch ms) for times so overlays can
// compute countdowns locally without extra reads.
// ─────────────────────────────────────────────────────────────────────────────

export type SeriesFormat = 'BO1' | 'BO3' | 'BO5' | 'BO7';
export type Role = 'EXP' | 'Jungle' | 'Mid' | 'Gold' | 'Roam' | 'Sub';
export type BattleSpell =
  | 'Execute'
  | 'Retribution'
  | 'Inspire'
  | 'Sprint'
  | 'Revitalize'
  | 'Aegis'
  | 'Petrify'
  | 'Purify'
  | 'Flameshot'
  | 'Flicker'
  | 'Arrival'
  | 'Vengeance';

export type Side = 'blue' | 'red';
export type Slot = 'A' | 'B';

export interface Team {
  id: string;
  name: string;
  tag: string;
  logoUrl: string;
  color?: string;
  createdAt: number;
}

export interface Player {
  id: string;
  teamId: string;
  ign: string;
  realName?: string;
  role: Role;
  photoUrl: string;
  spell: BattleSpell;
  isStarter: boolean;
  order: number;
  createdAt: number;
}

export type TournamentType = 'single' | 'double';
export type TournamentStatus = 'upcoming' | 'ongoing' | 'completed';

export interface Tournament {
  id: string;
  name: string;
  season?: string;
  type: TournamentType;
  defaultFormat: SeriesFormat;
  finalFormat: SeriesFormat;
  teamIds: string[];
  status: TournamentStatus;
  championTeamId: string | null;
  prizePool?: string;
  startDate?: string;
  bracketGenerated: boolean;
  createdAt: number;
}

export type BracketKind = 'UB' | 'LB' | 'GF';

export interface SlotSource {
  kind: 'seed' | 'winner' | 'loser';
  matchId?: string;
}

export interface MatchLink {
  matchId: string;
  slot: Slot;
}

export type MatchStatus = 'pending' | 'ready' | 'live' | 'completed' | 'void';

/** A series (Bo1/Bo3/Bo5/Bo7) between two teams inside a bracket. */
export interface Match {
  id: string;
  tournamentId: string;
  bracket: BracketKind;
  round: number;
  index: number;
  order: number;
  label: string;
  teamAId: string | null;
  teamBId: string | null;
  sourceA: SlotSource;
  sourceB: SlotSource;
  deadA: boolean;
  deadB: boolean;
  format: SeriesFormat;
  scoreA: number;
  scoreB: number;
  status: MatchStatus;
  winnerId: string | null;
  loserId: string | null;
  winnerTo: MatchLink | null;
  loserTo: MatchLink | null;
  isFinal: boolean;
  scheduledAt: number | null;
  updatedAt: number;
}

export interface GamePlayerStat {
  playerId: string;
  teamId: string;
  ign: string;
  hero: string;
  spell: BattleSpell;
  k: number;
  d: number;
  a: number;
  fb: number;
  dk: number;
  tk: number;
  maniac: number;
  savage: number;
  lords: number;
  turtles: number;
}

/** One finished game inside a series — the source of truth for leaderboards. */
export interface GameRecord {
  id: string;
  tournamentId: string;
  matchId: string;
  gameNumber: number;
  blueTeamId: string;
  redTeamId: string;
  winnerTeamId: string;
  winnerSide: Side;
  durationSec: number;
  blue: { kills: number; turtles: number; lords: number; bans: string[]; picks: string[] };
  red: { kills: number; turtles: number; lords: number; bans: string[]; picks: string[] };
  players: GamePlayerStat[];
  createdAt: number;
}

// ── Live broadcast state (live/current) ─────────────────────────────────────

export interface LiveTeam {
  id: string;
  name: string;
  tag: string;
  logoUrl: string;
}

export interface LivePlayer {
  playerId: string;
  teamId: string;
  ign: string;
  photoUrl: string;
  role: Role;
  hero: string;
  spell: BattleSpell;
  spellReadyAt: number | null;
  k: number;
  d: number;
  a: number;
  fb: number;
  dk: number;
  tk: number;
  maniac: number;
  savage: number;
  lords: number;
  turtles: number;
}

export interface LiveSide {
  turtles: number;
  lords: number;
  players: LivePlayer[];
}

export interface DraftState {
  step: number;
  blueBans: string[];
  redBans: string[];
  bluePicks: string[];
  redPicks: string[];
  timerDuration: number;
  timerEndsAt: number | null;
  timerPausedLeft: number | null;
}

export type LivePhase = 'idle' | 'draft' | 'ingame' | 'postgame' | 'break';

export type ObjectiveKind = 'Turtle' | 'Lord' | 'Buff';

export interface Banner {
  id: string;
  type: EventType;
  title: string;
  subtitle: string;
  side: Side | null;
  at: number;
  /** Player shown on kill-streak / objective banners. */
  photoUrl?: string | null;
  ign?: string | null;
  hero?: string | null;
  teamName?: string | null;
  teamLogo?: string | null;
}

export interface ReplayState {
  active: boolean;
  startedAt: number;
  endsAt: number;
  title: string;
  description: string;
  side: Side | null;
  eventId: string | null;
}

export interface LiveState {
  matchId: string | null;
  tournamentId: string | null;
  tournamentName: string;
  matchLabel: string;
  /** Grand Final / final series — a win crowns the champion. */
  isFinal: boolean;
  format: SeriesFormat;
  scoreA: number;
  scoreB: number;
  gameNumber: number;
  teamA: LiveTeam | null;
  teamB: LiveTeam | null;
  blueIsA: boolean;
  phase: LivePhase;
  draft: DraftState;
  blue: LiveSide;
  red: LiveSide;
  goldDiff: number;
  gameStartedAt: number | null;
  casters: string[];
  replay: ReplayState;
  banner: Banner | null;
  breakEndsAt: number | null;
  breakMessage: string;
  updatedAt: number;
}

/** live/caption — what the casters are saying right now (written by the Caster Booth). */
export interface CaptionLine {
  casterId: string;
  text: string;
  at: number;
  source: 'ai' | 'template';
}

export interface CaptionState {
  current: CaptionLine | null;
  recent: CaptionLine[];
  updatedAt: number;
}

/** live/booth — heartbeat so the controller knows the voice engine is running. */
export interface BoothState {
  online: boolean;
  lastBeat: number;
  aiCallsToday: number;
  queue: number;
  engineId: string;
}

// ── Events (admin triggers → caster booth) ──────────────────────────────────

export type EventType =
  | 'GAME_INTRO'
  | 'DRAFT_COMPLETE'
  | 'FIRST_BLOOD'
  | 'DOUBLE_KILL'
  | 'TRIPLE_KILL'
  | 'MANIAC'
  | 'SAVAGE'
  | 'TURTLE'
  | 'LORD'
  | 'BUFF'
  | 'OBJECTIVE_CONTEST'
  | 'GOLD_UPDATE'
  | 'SPELL_USED'
  | 'INSTANT_REPLAY'
  | 'GAME_RESULT'
  | 'SERIES_VICTORY'
  | 'IDLE_BANTER';

export type EventStatus = 'pending' | 'claimed' | 'done' | 'skipped';

export interface GameEvent {
  id: string;
  matchId: string;
  gameNumber: number;
  type: EventType;
  side: Side | null;
  playerId: string | null;
  playerIgn: string | null;
  hero: string | null;
  spell: BattleSpell | null;
  note: string;
  /** Snapshot of extra facts at trigger time (scores, gold, steals, etc). */
  data: Record<string, string | number | boolean | null>;
  status: EventStatus;
  claimedBy: string | null;
  createdAt: number;
}

/** One pre-written shoutcast pair (built-in or pre-generated by Gemini). */
export interface ScriptEntry {
  key: string;
  lead: string;
  follow: string;
  source: 'builtin' | 'ai';
}

/** scripts/library — Gemini pre-generated lines, reused all tournament (zero live calls). */
export interface ScriptLibrary {
  entries: ScriptEntry[];
  model: string;
  updatedAt: number;
}

export interface CommentaryLog {
  id: string;
  eventId: string;
  eventType: EventType;
  matchId: string;
  gameNumber: number;
  casters: string[];
  lines: { casterId: string; text: string }[];
  source: 'ai' | 'template';
  latencyMs: number;
  createdAt: number;
}

// ── Media ──────────────────────────────────────────────────────────────────

export interface Highlight {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string;
  matchId: string | null;
  inPlaylist: boolean;
  /** Shown in the public Highlights section (default true). */
  showOnSite?: boolean;
  durationSec?: number;
  order: number;
  createdAt: number;
}

export interface HeroPortrait {
  id: string; // slug of the hero name
  name: string;
  imageUrl: string;
}

export interface CasterProfile {
  avatarUrl: string;
  displayName: string;
}

/** Home section carousel image (managed in Admin → Settings). */
export interface HeroSlide {
  id: string;
  url: string;
  caption: string;
}

export interface SiteSettings {
  featuredTournamentId: string | null;
  heroSlides: HeroSlide[];
  streamUrl: string;
  facebookUrl: string;
  discordUrl: string;
  tagline: string;
  announcement: string;
  casterProfiles: Record<string, CasterProfile>;
  updatedAt: number;
}
