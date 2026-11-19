import type { BattleSpell, EventType, Role, SeriesFormat, Side } from '@/types';

export const SERIES_FORMATS: SeriesFormat[] = ['BO1', 'BO3', 'BO5', 'BO7'];

export const FORMAT_LABEL: Record<SeriesFormat, string> = {
  BO1: 'Best of 1',
  BO3: 'Best of 3',
  BO5: 'Best of 5',
  BO7: 'Best of 7',
};

/** Games needed to win the series. */
export const winsNeeded = (format: SeriesFormat): number =>
  ({ BO1: 1, BO3: 2, BO5: 3, BO7: 4 })[format];

export const maxGames = (format: SeriesFormat): number => winsNeeded(format) * 2 - 1;

export const ROLES: Role[] = ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam', 'Sub'];
/** The five in-game positions (lineup order on overlays). */
export const POSITIONS: Role[] = ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam'];
export const POSITION_LABEL: Record<Role, string> = { EXP: 'EXP Lane', Jungle: 'Jungler', Mid: 'Mid Lane', Gold: 'Gold Lane', Roam: 'Roamer', Sub: 'Sub' };
export const MAX_ROSTER = 7;
export const LINEUP_SIZE = 5;

export const BATTLE_SPELLS: BattleSpell[] = [
  'Retribution',
  'Flicker',
  'Petrify',
  'Execute',
  'Inspire',
  'Sprint',
  'Revitalize',
  'Aegis',
  'Purify',
  'Flameshot',
  'Arrival',
  'Vengeance',
];

/** Approximate base cooldowns (seconds). Tweak to match the current MLBB patch. */
export const SPELL_COOLDOWN: Record<BattleSpell, number> = {
  Execute: 90,
  Retribution: 35,
  Inspire: 75,
  Sprint: 100,
  Revitalize: 100,
  Aegis: 75,
  Petrify: 90,
  Purify: 90,
  Flameshot: 50,
  Flicker: 120,
  Arrival: 75,
  Vengeance: 75,
};

export const DEFAULT_SPELL_BY_ROLE: Record<Role, BattleSpell> = {
  EXP: 'Vengeance',
  Jungle: 'Retribution',
  Mid: 'Flicker',
  Gold: 'Inspire',
  Roam: 'Petrify',
  Sub: 'Flicker',
};

/**
 * MLBB tournament draft (10-ban) order.
 * Ban phase 1 → Pick phase 1 → Ban phase 2 → Pick phase 2.
 */
export interface DraftStep {
  side: Side;
  kind: 'ban' | 'pick';
  index: number; // slot index within that side's bans/picks
  phase: string;
}

const seq: Array<[Side, 'ban' | 'pick', string]> = [
  ['blue', 'ban', 'Ban Phase 1'],
  ['red', 'ban', 'Ban Phase 1'],
  ['blue', 'ban', 'Ban Phase 1'],
  ['red', 'ban', 'Ban Phase 1'],
  ['blue', 'ban', 'Ban Phase 1'],
  ['red', 'ban', 'Ban Phase 1'],
  ['blue', 'pick', 'Pick Phase 1'],
  ['red', 'pick', 'Pick Phase 1'],
  ['red', 'pick', 'Pick Phase 1'],
  ['blue', 'pick', 'Pick Phase 1'],
  ['blue', 'pick', 'Pick Phase 1'],
  ['red', 'pick', 'Pick Phase 1'],
  ['red', 'ban', 'Ban Phase 2'],
  ['blue', 'ban', 'Ban Phase 2'],
  ['red', 'ban', 'Ban Phase 2'],
  ['blue', 'ban', 'Ban Phase 2'],
  ['red', 'pick', 'Pick Phase 2'],
  ['blue', 'pick', 'Pick Phase 2'],
  ['blue', 'pick', 'Pick Phase 2'],
  ['red', 'pick', 'Pick Phase 2'],
];

export const DRAFT_SEQUENCE: DraftStep[] = (() => {
  const counters = { blue: { ban: 0, pick: 0 }, red: { ban: 0, pick: 0 } };
  return seq.map(([side, kind, phase]) => ({ side, kind, phase, index: counters[side][kind]++ }));
})();

/** True when this step and the next are the same side picking together (e.g. red picks 2 & 3) — one shared timer. */
export const isPairStart = (step: number) => {
  const a = DRAFT_SEQUENCE[step];
  const b = DRAFT_SEQUENCE[step + 1];
  return Boolean(a && b && a.kind === 'pick' && b.kind === 'pick' && a.side === b.side);
};
export const isPairSecond = (step: number) => step > 0 && isPairStart(step - 1);

/** Typed instead of a hero when a team skips a ban. */
export const NO_BAN = 'None';
export const isNoBan = (h: string) => h.trim().toLowerCase() === 'none';
/** Every pick slot of both teams filled (bans may be empty or "None"). */
export const picksComplete = (d: { bluePicks: string[]; redPicks: string[] }) => d.bluePicks.every(Boolean) && d.redPicks.every(Boolean);

export const BANS_PER_SIDE = 5;
export const PICKS_PER_SIDE = 5;

export const MLBB_HEROES: string[] = [
  'Aamon', 'Akai', 'Aldous', 'Alice', 'Alpha', 'Alucard', 'Angela', 'Argus', 'Arlott', 'Atlas',
  'Aulus', 'Aurora', 'Badang', 'Balmond', 'Bane', 'Barats', 'Baxia', 'Beatrix', 'Belerick',
  'Benedetta', 'Brody', 'Bruno', 'Carmilla', 'Cecilion', "Chang'e", 'Chip', 'Chou', 'Cici',
  'Claude', 'Clint', 'Cyclops', 'Diggie', 'Dyrroth', 'Edith', 'Esmeralda', 'Estes', 'Eudora',
  'Fanny', 'Faramis', 'Floryn', 'Franco', 'Fredrinn', 'Freya', 'Gatotkaca', 'Gloo', 'Gord',
  'Granger', 'Grock', 'Guinevere', 'Gusion', 'Hanabi', 'Hanzo', 'Harith', 'Harley', 'Hayabusa',
  'Helcurt', 'Hilda', 'Hirara', 'Hylos', 'Irithel', 'Ixia', 'Jawhead', 'Johnson', 'Joy', 'Julian',
  'Kadita', 'Kagura', 'Kaja', 'Kalea', 'Karina', 'Karrie', 'Khaleed', 'Khufra', 'Kimmy',
  'Lancelot', 'Lapu-Lapu', 'Layla', 'Leomord', 'Lesley', 'Ling', 'Lolita', 'Lukas', 'Lunox',
  'Luo Yi', 'Lylia', 'Marcel', 'Martis', 'Masha', 'Mathilda', 'Melissa', 'Minotaur', 'Minsitthar',
  'Miya', 'Moskov', 'Nana', 'Natalia', 'Natan', 'Nolan', 'Novaria', 'Obsidia', 'Odette',
  'Paquito', 'Pharsa', 'Phoveus', 'Popol and Kupa', 'Rafaela', 'Roger', 'Ruby', 'Saber',
  'Selena', 'Silvanna', 'Sora', 'Sun', 'Suyou', 'Terizla', 'Thamuz', 'Tigreal', 'Uranus',
  'Vale', 'Valentina', 'Valir', 'Vexana', 'Wanwan', 'X.Borg', 'Xavier', 'Yi Sun-shin', 'Yin',
  'Yu Zhong', 'Yve', 'Zetian', 'Zhask', 'Zhuxin', 'Zilong',
];

export const heroSlug = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// ── Event catalogue ─────────────────────────────────────────────────────────

export type EventTier = 'major' | 'minor';

export interface EventDef {
  label: string;
  short: string;
  tier: EventTier;
  needsSide: boolean;
  needsPlayer: boolean;
  /** Banner title shown on the HUD (null = no banner). */
  banner: string | null;
}

export const EVENT_DEFS: Record<EventType, EventDef> = {
  // Automatic phase announcements (Go live / next game → draft, Start game, Go to break).
  DRAFT_START: { label: 'Draft Phase Welcome', short: 'Draft', tier: 'major', needsSide: false, needsPlayer: false, banner: null },
  GAME_START: { label: 'Game Start', short: 'Start', tier: 'major', needsSide: false, needsPlayer: false, banner: null },
  BREAK_START: { label: 'Break', short: 'Break', tier: 'major', needsSide: false, needsPlayer: false, banner: null },
  // A single kill: pick the killer, then the player who died (+1 kill / +1 death).
  KILL: { label: 'Kill', short: '+1 Kill', tier: 'minor', needsSide: true, needsPlayer: true, banner: null },
  // Draft play-by-play (automatic on every lock) + engine-made speculation/storytelling while drafting.
  DRAFT_BAN: { label: 'Draft Ban', short: 'Ban', tier: 'minor', needsSide: true, needsPlayer: false, banner: null },
  DRAFT_PICK: { label: 'Draft Pick', short: 'Pick', tier: 'minor', needsSide: true, needsPlayer: false, banner: null },
  DRAFT_TALK: { label: 'Draft Talk', short: 'Talk', tier: 'minor', needsSide: false, needsPlayer: false, banner: null },
  GAME_INTRO: { label: 'Game Intro', short: 'Intro', tier: 'major', needsSide: false, needsPlayer: false, banner: null },
  DRAFT_COMPLETE: { label: 'Draft Breakdown', short: 'Draft', tier: 'major', needsSide: false, needsPlayer: false, banner: null },
  FIRST_BLOOD: { label: 'First Blood', short: 'FB', tier: 'minor', needsSide: true, needsPlayer: true, banner: 'FIRST BLOOD' },
  DOUBLE_KILL: { label: 'Double Kill', short: '2K', tier: 'minor', needsSide: true, needsPlayer: true, banner: 'DOUBLE KILL' },
  TRIPLE_KILL: { label: 'Triple Kill', short: '3K', tier: 'major', needsSide: true, needsPlayer: true, banner: 'TRIPLE KILL' },
  MANIAC: { label: 'Maniac', short: '4K', tier: 'major', needsSide: true, needsPlayer: true, banner: 'MANIAC' },
  SAVAGE: { label: 'Savage', short: '5K', tier: 'major', needsSide: true, needsPlayer: true, banner: 'SAVAGE' },
  TURTLE: { label: 'Turtle Slain', short: 'Turtle', tier: 'minor', needsSide: true, needsPlayer: false, banner: 'TURTLE SLAIN' },
  LORD: { label: 'Lord Slain', short: 'Lord', tier: 'major', needsSide: true, needsPlayer: false, banner: 'LORD SLAIN' },
  BUFF: { label: 'Buff Slain', short: 'Buff', tier: 'minor', needsSide: true, needsPlayer: false, banner: 'BUFF SLAIN' },
  OBJECTIVE_CONTEST: { label: 'Objective Contest', short: 'Contest', tier: 'minor', needsSide: false, needsPlayer: false, banner: null },
  GOLD_UPDATE: { label: 'Gold Update', short: 'Gold', tier: 'minor', needsSide: false, needsPlayer: false, banner: null },
  SPELL_USED: { label: 'Battle Spell', short: 'Spell', tier: 'minor', needsSide: true, needsPlayer: true, banner: null },
  INSTANT_REPLAY: { label: 'Instant Replay', short: 'Replay', tier: 'major', needsSide: false, needsPlayer: false, banner: null },
  GAME_RESULT: { label: 'Game Result', short: 'Result', tier: 'major', needsSide: true, needsPlayer: false, banner: 'VICTORY' },
  SERIES_VICTORY: { label: 'Series Victory', short: 'Series', tier: 'major', needsSide: false, needsPlayer: false, banner: 'SERIES WIN' },
  IDLE_BANTER: { label: 'Desk Banter', short: 'Banter', tier: 'minor', needsSide: false, needsPlayer: false, banner: null },
};

export const STORAGE_KEYS = {
  theme: 'tcc-theme',
  boothSettings: 'tcc-booth-settings',
  boothVoices: 'tcc-booth-voices',
  boothGeminiVoices: 'tcc-booth-gemini-voices',
  ttsUsage: 'tcc-tts-usage',
  aiUsage: 'tcc-ai-usage',
  obs: 'tcc-obs-settings',
} as const;
