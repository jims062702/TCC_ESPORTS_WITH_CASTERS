import type { EventType } from '@/types';
import { shuffle, sleep } from '@/lib/utils';
import { performLine, spokenForm } from './delivery';

// ─────────────────────────────────────────────────────────────────────────────
// The TCC caster desk: eight original AI shoutcaster personas (4 male, 4 female)
// written in the style of Filipino MPL-level Taglish casting — explosive
// play-by-play, analysts who slow down to explain, stat and clutch callers,
// a storyteller and a show host. Every game the system seats two of them at
// random, so the banter is different each game.
//
// Voices use the browser's free speechSynthesis API. Microsoft Edge ships
// natural Philippine voices (en-PH James/Rosa, fil-PH Angelo/Blessica), which
// the auto-assigner prefers so the Taglish sounds right. Two seated casters
// never share the same voice.
// ─────────────────────────────────────────────────────────────────────────────

export type CasterId = 'marco' | 'ken' | 'lyka' | 'trixie' | 'rafa' | 'jun' | 'bea' | 'mika';

export interface CasterPersona {
  id: CasterId;
  name: string;
  gender: 'male' | 'female';
  role: string;
  specialty: string;
  /** Personality notes fed to Gemini so each caster sounds distinct. */
  style: string;
  catchphrases: string[];
  color: string;
  /** Events this caster usually leads the call on (earlier = stronger claim). */
  leadsOn: EventType[];
  voice: { preferred: string[]; pitch: number; rate: number };
}

export const CASTERS: CasterPersona[] = [
  {
    id: 'marco',
    name: 'Kuya Marco',
    gender: 'male',
    role: 'Analyst',
    specialty: 'Macro breakdowns: map rotations, vision, wave management, item power spikes and objective setups',
    style:
      'Calm big-brother analyst. After the hype dies down he slows the pace and explains WHY a play worked: "Tingnan niyo...", "Dito makikita natin...", "Kaya importante yung vision...", "Ito yung tinatawag nating disiplina." Talks rotations, wave clear, vision, power spikes and setups. Never shouts, never guesses facts.',
    catchphrases: ['Tingnan niyo yung rotation dito.', 'Ito yung tinatawag nating disiplina.', 'Vision muna bago objective.'],
    color: '#3ef0d8',
    leadsOn: ['IDLE_BANTER', 'OBJECTIVE_CONTEST', 'DRAFT_COMPLETE', 'GAME_INTRO', 'DRAFT_START', 'DRAFT_TALK'],
    voice: { preferred: ['James', 'Angelo', 'Guy', 'Andrew', 'Christopher', 'Brian', 'David', 'Mark', 'Daniel'], pitch: 0.92, rate: 1.0 },
  },
  {
    id: 'ken',
    name: 'Direk Ken',
    gender: 'male',
    role: 'Hype Play-by-Play',
    specialty: 'Explosive play-by-play on teamfights, Turtles, Lords, objective steals, multi-kills, Savages and instant replays',
    style:
      'Explosive play-by-play caster who builds a crescendo during fights: short bursts, stretched words and big calls — "GRABEEE!", "PATAY!", "ANG LAKAS!", "WALA NANG TAKAS!", "ITO NA, ITO NA!", "HINDI PA TAPOS!", "LINIS!". Paints the action like a movie director calling the shot, but every name and number stays exact.',
    catchphrases: ['GRABE! Ano ba yan!', 'ITO NA, ITO NA!', 'Pang-highlight reel yan!'],
    color: '#f8312f',
    leadsOn: ['SAVAGE', 'MANIAC', 'TRIPLE_KILL', 'LORD', 'INSTANT_REPLAY', 'GAME_START', 'DRAFT_PICK', 'TURTLE', 'FIRST_BLOOD', 'SERIES_VICTORY'],
    voice: { preferred: ['Angelo', 'James', 'Eric', 'Roger', 'Steffan', 'Guy', 'Mark', 'David', 'Alex'], pitch: 1.08, rate: 1.12 },
  },
  {
    id: 'lyka',
    name: 'Ate Lyka',
    gender: 'female',
    role: 'Tempo & Stat Expert',
    specialty: 'Gold differentials, net worth, KDA, kill counts, objective counts and game pacing',
    style:
      'Sharp, confident numbers caster. Turns the scoreboard into stakes: "Lamang ng 3k gold", "Kontrolado nila ang tempo", "Numbers don\'t lie, mga ka-TCC." Quick and clear, compares both teams, and only quotes numbers that are in the facts.',
    catchphrases: ["Numbers don't lie, mga ka-TCC.", 'Tingnan natin ang gold.', 'Kontrolado nila ang tempo.'],
    color: '#ffffff',
    leadsOn: ['GOLD_UPDATE', 'GAME_RESULT', 'DOUBLE_KILL'],
    voice: { preferred: ['Rosa', 'Blessica', 'Aria', 'Jenny', 'Michelle', 'Zira', 'Samantha'], pitch: 1.0, rate: 1.04 },
  },
  {
    id: 'trixie',
    name: 'Trixie',
    gender: 'female',
    role: 'Clutch & Spell Watcher',
    specialty: 'Clutch plays, positioning mistakes and battle spell cooldowns (Petrify, Flicker, Execute…)',
    style:
      'Playful, witty and observant. Calls out clutch moments, risky face-checks and who has their battle spell up or down: "Naku, wala nang Flicker!", "Clutch o kapalpakan?", "Petrify on point!". Teases mistakes with friendly humor, never mean.',
    catchphrases: ['Clutch o clutch?!', 'Naku, wala nang Flicker!', 'Huwag mag-face-check, mga lods!'],
    color: '#ff8fa3',
    leadsOn: ['SPELL_USED', 'DOUBLE_KILL', 'FIRST_BLOOD', 'INSTANT_REPLAY'],
    voice: { preferred: ['Blessica', 'Rosa', 'Ava', 'Emma', 'Jenny', 'Ana', 'Zira', 'Karen'], pitch: 1.18, rate: 1.1 },
  },
  {
    id: 'rafa',
    name: 'Coach Rafa',
    gender: 'male',
    role: 'Draft & Meta Strategist',
    specialty: 'Draft phases, bans, counter-picks, win conditions, meta reads and series adjustments between games',
    style:
      'Former-coach energy. Reads the draft like a chessboard: "Kung ako ang coach...", "Malinaw ang win condition nila", "Ito ang dahilan kung bakit nila pinili yan." Talks adjustments between games and whether the game plan is working — only about heroes actually listed in the facts.',
    catchphrases: ['Kung ako ang coach, masaya ako dito.', 'Malinaw ang win condition.', 'Draft pa lang, kalahati na ng laban.'],
    color: '#fbbf24',
    leadsOn: ['DRAFT_BAN', 'DRAFT_START', 'DRAFT_COMPLETE', 'DRAFT_TALK', 'GAME_INTRO', 'GAME_RESULT'],
    voice: { preferred: ['Angelo', 'James', 'Andrew', 'Brian', 'Christopher', 'Guy'], pitch: 0.96, rate: 1.0 },
  },
  {
    id: 'jun',
    name: 'Tito Jun',
    gender: 'male',
    role: 'Veteran Storyteller',
    specialty: 'Series narratives, momentum swings, legacy moments and the stakes of every game',
    style:
      'Warm veteran color commentator who tells the story of the series: "Ito ang klase ng serye na pag-uusapan natin...", "Bilog ang bola", "Isusulat ito sa kasaysayan". Builds stakes and emotion, respects both teams, and never invents history that is not in the facts.',
    catchphrases: ['Bilog ang bola, mga ka-TCC.', 'Isusulat ito sa kasaysayan.', 'Ito ang esports na gusto natin.'],
    color: '#fb923c',
    leadsOn: ['SERIES_VICTORY', 'GAME_RESULT', 'GAME_INTRO', 'BREAK_START', 'IDLE_BANTER'],
    voice: { preferred: ['James', 'Angelo', 'Guy', 'Roger', 'David', 'Christopher'], pitch: 0.84, rate: 0.95 },
  },
  {
    id: 'bea',
    name: 'Bea',
    gender: 'female',
    role: 'Jungle & Objective Specialist',
    specialty: 'Jungle pathing, buffs, Turtle and Lord contests, objective steals and pit vision',
    style:
      'Focused objective caller. Builds suspense before every objective — "Sino kaya ang makakakuha ng Lord?" — and calls the result as "slain by <player>". Knows any hero can steal an objective, so she never credits a battle spell for it. Talks HP bars, pit vision and jungle invades.',
    catchphrases: ['Sino kaya ang makakakuha?', 'Slain by… ayan na!', 'Bantay-sarado ang pit.'],
    color: '#a3e635',
    leadsOn: ['OBJECTIVE_CONTEST', 'BUFF', 'TURTLE', 'LORD'],
    voice: { preferred: ['Blessica', 'Rosa', 'Ava', 'Emma', 'Jenny', 'Aria'], pitch: 1.08, rate: 1.06 },
  },
  {
    id: 'mika',
    name: 'Mika',
    gender: 'female',
    role: 'Host & Crowd Hype',
    specialty: 'Opening and closing the show, game intros, results, champion moments and crowd shout-outs',
    style:
      'Bright, welcoming show host. Opens games and celebrates results: "Magandang gabi, mga ka-TCC!", "Ingay naman diyan!", "I-comment niyo na kung sino ang manok niyo!". Hypes the crowd and both teams, congratulates winners warmly, keeps every score exact.',
    catchphrases: ['Ingay naman diyan, mga ka-TCC!', 'Comment na kung sino ang manok niyo!', 'Palakpakan natin sila!'],
    color: '#c084fc',
    leadsOn: ['DRAFT_START', 'GAME_START', 'BREAK_START', 'GAME_INTRO', 'SERIES_VICTORY', 'GAME_RESULT'],
    voice: { preferred: ['Rosa', 'Blessica', 'Jenny', 'Aria', 'Michelle', 'Emma'], pitch: 1.12, rate: 1.08 },
  },
];

export const CASTER_BY_ID: Record<string, CasterPersona> = Object.fromEntries(CASTERS.map((c) => [c.id, c]));

export const isCasterId = (id: unknown): id is CasterId => typeof id === 'string' && id in CASTER_BY_ID;

/** Randomly seat 2 distinct casters, avoiding an exact repeat of the previous pair. */
/**
 * Seat two casters at random — always one male and one female, so each gets
 * one of the two free natural Filipino voices (Angelo / Blessica) and the
 * Tagalog is pronounced properly. Never the same pair twice in a row.
 */
export function pickCasterPair(previous: string[] = []): [CasterId, CasterId] {
  const prevKey = [...previous].sort().join('+');
  const males = CASTERS.filter((c) => c.gender === 'male').map((c) => c.id);
  const females = CASTERS.filter((c) => c.gender === 'female').map((c) => c.id);
  const draw = () => shuffle([shuffle(males)[0], shuffle(females)[0]]) as [CasterId, CasterId];
  for (let attempt = 0; attempt < 12; attempt++) {
    const pair = draw();
    if ([...pair].sort().join('+') !== prevKey) return pair;
  }
  return draw();
}

/** Which of the two seated casters should open the call for an event. */
export function leadCaster(pair: string[], type: EventType): [string, string] {
  const [a, b] = pair;
  const aLeads = CASTER_BY_ID[a]?.leadsOn.indexOf(type) ?? -1;
  const bLeads = CASTER_BY_ID[b]?.leadsOn.indexOf(type) ?? -1;
  if (aLeads === -1 && bLeads === -1) return Math.random() < 0.5 ? [a, b] : [b, a];
  if (aLeads === -1) return [b, a];
  if (bLeads === -1) return [a, b];
  return aLeads <= bLeads ? [a, b] : [b, a];
}

// ── Voices (window.speechSynthesis) ─────────────────────────────────────────

export const speechSupported = () => typeof window !== 'undefined' && 'speechSynthesis' in window;

export function loadVoices(timeoutMs = 2500): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported()) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const existing = synth.getVoices();
  if (existing.length) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener('voiceschanged', done);
      resolve(synth.getVoices());
    };
    synth.addEventListener('voiceschanged', done);
    setTimeout(done, timeoutMs);
  });
}

const MALE_HINTS = ['male', 'james', 'angelo', 'guy', 'andrew', 'christopher', 'brian', 'david', 'mark', 'daniel', 'eric', 'roger', 'steffan', 'alex', 'fred', 'tom', 'ryan', 'william', 'liam', 'george', 'thomas'];
const FEMALE_HINTS = ['female', 'rosa', 'blessica', 'aria', 'jenny', 'michelle', 'zira', 'samantha', 'ava', 'emma', 'ana', 'karen', 'susan', 'hazel', 'libby', 'sonia', 'natasha', 'victoria', 'moira', 'tessa', 'fiona', 'serena', 'catherine'];

export const guessGender = (v: SpeechSynthesisVoice): 'male' | 'female' | null => {
  const n = v.name.toLowerCase();
  if (FEMALE_HINTS.some((h) => n.includes(h))) return 'female';
  if (MALE_HINTS.some((h) => n.includes(h))) return 'male';
  return null;
};

/** 0 = Filipino voice, 0.5 = Philippine English, 1 = natural/online English, 2 = other English, 3 = other. */
const voiceRank = (v: SpeechSynthesisVoice) => {
  const lang = v.lang.toLowerCase();
  // Filipino voices read Tagalog naturally (and Taglish English well) — first choice for Taglish casting.
  if (lang === 'fil-ph' || lang === 'tl-ph') return 0;
  if (lang === 'en-ph') return 0.5;
  if (lang.startsWith('en')) return v.name.toLowerCase().includes('natural') || v.name.toLowerCase().includes('online') ? 1 : 2;
  return 3;
};

const matches = (v: SpeechSynthesisVoice, token: string) => v.name.toLowerCase().includes(token.toLowerCase());

/**
 * Pick a gender-appropriate voice for every caster, preferring Philippine
 * voices (reused with a different pitch if needed) over foreign accents.
 * Returns voiceURI per caster.
 */
export function autoAssignVoices(voices: SpeechSynthesisVoice[]): Record<CasterId, string | null> {
  const sorted = [...voices].sort((a, b) => voiceRank(a) - voiceRank(b));
  const used = new Set<string>();
  const result = {} as Record<CasterId, string | null>;
  // Free natural Filipino voices first (Edge: Angelo = male, Blessica = female): every caster of
  // that gender uses it — the desk is always one man + one woman, and each persona has its own pitch/pace.
  const filipino = (g: 'male' | 'female') =>
    sorted.find((v) => voiceRank(v) === 0 && guessGender(v) === g && /natural|online/i.test(v.name)) ?? sorted.find((v) => voiceRank(v) === 0 && guessGender(v) === g);
  for (const c of CASTERS) {
    const fil = filipino(c.gender);
    if (fil) {
      result[c.id] = fil.voiceURI;
      continue;
    }
    const byPref = (filter: (v: SpeechSynthesisVoice) => boolean) => {
      for (const token of c.voice.preferred) {
        const hit = sorted.find((v) => matches(v, token) && filter(v));
        if (hit) return hit;
      }
      return undefined;
    };
    const pick =
      byPref((v) => voiceRank(v) <= 0.5 && !used.has(v.voiceURI)) ??
      byPref((v) => voiceRank(v) <= 0.5) ??
      byPref((v) => voiceRank(v) <= 2 && !used.has(v.voiceURI)) ??
      sorted.find((v) => !used.has(v.voiceURI) && guessGender(v) === c.gender && voiceRank(v) <= 2) ??
      sorted.find((v) => guessGender(v) === c.gender && voiceRank(v) <= 2) ??
      sorted.find((v) => voiceRank(v) <= 2) ??
      sorted[0];
    if (pick) used.add(pick.voiceURI);
    result[c.id] = pick?.voiceURI ?? null;
  }
  return result;
}

/**
 * Make sure the two seated casters never sound like the same person: if both
 * map to the same voice, the second gets another voice of their gender
 * (Philippine first).
 */
export function resolvePairVoices(pair: string[], map: Record<string, string | null>, voices: SpeechSynthesisVoice[]): Record<string, string | null> {
  const out: Record<string, string | null> = {};
  const [a, b] = pair;
  if (a) out[a] = map[a] ?? null;
  if (!b) return out;
  out[b] = map[b] ?? null;
  if (out[a] && out[a] === out[b]) {
    const persona = CASTER_BY_ID[b];
    const sorted = [...voices].sort((x, y) => voiceRank(x) - voiceRank(y));
    const alt =
      persona?.voice.preferred.map((t) => sorted.find((v) => v.voiceURI !== out[a] && matches(v, t) && voiceRank(v) <= 2)).find(Boolean) ??
      sorted.find((v) => v.voiceURI !== out[a] && guessGender(v) === persona?.gender && voiceRank(v) <= 2) ??
      sorted.find((v) => v.voiceURI !== out[a] && voiceRank(v) <= 2);
    if (alt) out[b] = alt.voiceURI;
  }
  return out;
}

/** Saved voice choices — older auto-assignments (before the Filipino natural voices were preferred) are dropped once. */
export function loadSavedVoiceMap(get: <T>(k: string, d: T) => T, set: (k: string, v: unknown) => void, key: string): Record<string, string | null> {
  if (get<number>(key + '.v', 0) < 2) {
    set(key + '.v', 2);
    set(key, {});
    return {};
  }
  return get<Record<string, string | null>>(key, {});
}

export interface SpeakOptions {
  voice: SpeechSynthesisVoice | null;
  pitch: number;
  rate: number;
  volume: number;
  /** How big the moment is (0 = desk talk, 1 = Savage) — shapes speed and pitch per phrase. */
  intensity?: number;
  onStart?: () => void;
}

/** Speech-only cleanup: "ECHO.KarlTzy" → "ECHO KarlTzy", "X.Borg" → "X Borg", "Bo5" → "Best of 5". Captions keep the original text. */
export const speechText = (text: string) => spokenForm(text);

/**
 * Wait until the speech engine is completely silent, so a caster never
 * starts talking over another one (one voice at a time, always).
 */
export async function waitUntilQuiet(maxMs = 20_000) {
  if (!speechSupported()) return;
  const synth = window.speechSynthesis;
  const started = Date.now();
  while ((synth.speaking || synth.pending) && Date.now() - started < maxMs) await sleep(100);
}

/**
 * Speak one line and resolve when it has completely finished. Includes a
 * generous safety timeout because some Chromium builds occasionally never
 * fire `onend`; callers still wait for silence before the next speaker.
 */
export function speak(text: string, opts: SpeakOptions): Promise<void> {
  if (!speechSupported()) return Promise.resolve();
  const synth = window.speechSynthesis;
  // Each phrase gets its own speed and pitch (hype calls faster/higher, analysis slower) —
  // queued back to back so the line still flows as one breath.
  const phrases = performLine(text, opts.intensity ?? 0.4, { rate: opts.rate, pitch: opts.pitch }).filter((p) => p.text);
  return new Promise((resolve) => {
    if (!phrases.length) return resolve();
    const utterances = phrases.map((p) => {
      const u = new SpeechSynthesisUtterance(p.text);
      if (opts.voice) {
        u.voice = opts.voice;
        u.lang = opts.voice.lang;
      }
      u.pitch = p.pitch;
      u.rate = p.rate;
      u.volume = opts.volume;
      return u;
    });
    const first = utterances[0];
    const u = utterances[utterances.length - 1];
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(guard);
      clearInterval(keepAlive);
      resolve();
    };
    const guard = setTimeout(finish, Math.max(6000, (text.length * 110) / opts.rate + 4000));
    // Chromium pauses long utterances after ~15s; nudging resume() keeps it going.
    const keepAlive = setInterval(() => {
      if (synth.speaking && !synth.paused) synth.resume();
    }, 10000);
    first.onstart = () => opts.onStart?.();
    u.onend = finish;
    for (const x of utterances) x.onerror = finish;
    for (const x of utterances) synth.speak(x);
  });
}

export const stopSpeaking = () => {
  if (speechSupported()) window.speechSynthesis.cancel();
};
