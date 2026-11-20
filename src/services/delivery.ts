import type { EventType } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// Natural caster delivery for the free browser voices.
//
// Text-to-speech sounds robotic when it reads every sentence at one speed and
// pitch, spells ALL-CAPS hype words letter by letter, and guesses at hero names.
// This layer prepares each line the way a real caster would say it:
//   1. pronunciation — hero names respelled, acronyms spaced out, hype words
//      in normal case ("SAVAGEEE" → "Savage!"), scores / gold said naturally
//   2. performance — the line is split into phrases and each phrase gets its
//      own speed and pitch: hype calls faster and higher, analysis and
//      storytelling slower and warmer, questions lifted at the end, tiny
//      human variation so no two calls sound identical.
// Captions on the overlays keep the original text.
// ─────────────────────────────────────────────────────────────────────────────

/** How each hero is said on a Filipino broadcast (respelled for TTS). Unlisted heroes are read as written. */
const HERO_SAY: Record<string, string> = {
  Aamon: 'Amon',
  Arlott: 'Arlot',
  Aulus: 'Awlus',
  Baxia: 'Bashya',
  Cecilion: 'Sesilyon',
  "Chang'e": 'Chang-eh',
  Chou: 'Chow',
  Cici: 'Sisi',
  Fredrinn: 'Fredrin',
  Gatotkaca: 'Gatot-kacha',
  Gusion: 'Gusyon',
  Hylos: 'Hailos',
  Irithel: 'Iritel',
  Ixia: 'Iksya',
  Kalea: 'Kaleya',
  Khaleed: 'Kaleed',
  Khufra: 'Kufra',
  'Lapu-Lapu': 'Lapu Lapu',
  'Luo Yi': 'Lwo Yi',
  Lylia: 'Lilya',
  Minsitthar: 'Minsitar',
  Paquito: 'Pakito',
  Phoveus: 'Foveus',
  Suyou: 'Suyo',
  Thamuz: 'Tamuz',
  Uranus: 'Yuranus',
  Valir: 'Valeer',
  Wanwan: 'Wan Wan',
  'X.Borg': 'Ex Borg',
  Xavier: 'Zeyvyer',
  'Yi Sun-shin': 'Yi Sun Shin',
  'Yu Zhong': 'Yu Jong',
  Yve: 'Iv',
  Zetian: 'Zetyan',
  Zhask: 'Jask',
  Zhuxin: 'Ju-shin',
};

/** Said letter by letter. */
const ACRONYMS = ['TCC', 'PH', 'MVP', 'KDA', 'MPL', 'MSC', 'EXP', 'GG', 'HP', 'AI', 'OBS', 'TP', 'MLBB', 'FB'];

/** Hype words that must never be spelled out, whatever the case. */
const HYPE_WORDS = /\b(SAVAGE|MANIAC|TRIPLE|DOUBLE|KILL|KILLS|FIRST|BLOOD|LORD|TURTLE|STEAL|STOLEN|SLAIN|SECURED|GRABE|PATAY|ITO|NA|ANO|BA|YAN|LINIS|WALA|NANG|TAKAS|HINDI|PA|TAPOS|AYAN|AYUN|NAKUHA|NAAGAW|LIMA|TATLO|APAT|DALAWA|GAME|OVER|CHAMPION|CHAMPIONS|VICTORY|WIPE|ACE|TURRET|DOWN|GOLDEN|HEALING|WISP|REVEAL|BUFF)\b/g;

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const HERO_RE = new RegExp(`(?<![\\w])(${Object.keys(HERO_SAY).map(escapeRe).join('|')})(?![\\w])`, 'g');

const titleCase = (w: string) => w.charAt(0) + w.slice(1).toLowerCase();

/** The text the voice should actually read (captions keep the original). Pure function — unit tested. */
/** 1 kill / 2 kills, 1 death / 2 deaths, 1 assist / 2 assists. */
const counted = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const kdaSpoken = (k: number, d: number, a: number) => `${counted(k, 'kill', 'kills')}, ${counted(d, 'death', 'deaths')}, ${counted(a, 'assist', 'assists')}`;

export function spokenForm(text: string): string {
  let s = text;
  // Symbols that voices read aloud or stumble on.
  s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '');
  s = s.replace(/\s*[—–]\s*/g, ', ').replace(/\s*·\s*/g, ', ').replace(/[*_#|"“”]/g, ' ');
  s = s.replace(/\bka-TCC\b/gi, 'ka T C C');
  // Hero names said the way casters say them.
  s = s.replace(HERO_RE, (h) => HERO_SAY[h] ?? h);
  s = s.replace(/([A-Za-z]+)\.(?=[A-Za-z])/g, '$1 '); // "ECHO.Kairi" → "ECHO Kairi"
  // Stretched hype: "GRABEEE" / "SAVAGEEEE" → "GRABE" / "SAVAGE".
  s = s.replace(/([A-Za-z])\1{2,}/g, '$1');
  // Series format and numbers.
  s = s.replace(/\bBo(\d)\b/gi, 'Best of $1');
  s = s.replace(/\b(\d+(?:\.\d+)?)k\b/gi, '$1 K');
  // K/D/A said the way casters say it: 1/2/3 → "1 kill, 2 deaths, 3 assists".
  s = s.replace(/\b(\d+)\/(\d+)\/(\d+)\b/g, (_m, k: string, d: string, a: string) => kdaSpoken(Number(k), Number(d), Number(a)));
  // Game time: "8:13" → "8 minutes 13 seconds" (Level 15 best times).
  s = s.replace(/\b(\d{1,2}):([0-5]\d)\b/g, (_m, m: string, sec: string) => {
    const mins = Number(m);
    const secs = Number(sec);
    const minPart = `${mins} ${mins === 1 ? 'minute' : 'minutes'}`;
    return secs ? `${minPart} ${secs} ${secs === 1 ? 'second' : 'seconds'}` : minPart;
  });
  s = s.replace(/\b(\d)\s*-\s*(\d)\b/g, '$1 $2');
  s = s.replace(/(\d)\s*%/g, '$1 percent');
  s = s.replace(/#(\d)/g, 'number $1');
  // ALL-CAPS hype → normal case so it's shouted, not spelled ("ANO BA YAN" → "Ano ba yan").
  s = s.replace(HYPE_WORDS, (w) => w.toLowerCase());
  s = s.replace(/\b[A-Z]{2,}(?:\s+[A-Z]{2,})+\b/g, (run) =>
    run
      .split(/\s+/)
      .map((w) => (ACRONYMS.includes(w) ? w : w.toLowerCase()))
      .join(' '),
  );
  s = s.replace(/\b[A-Z]{5,}\b/g, (w) => (ACRONYMS.includes(w) ? w : titleCase(w)));
  // Sentence case again after lower-casing the shouted words.
  s = s.replace(/(^|[.!?]\s+)([a-z])/g, (_m, pre: string, c: string) => pre + c.toUpperCase());
  // Acronyms letter by letter.
  s = s.replace(new RegExp(`\\b(${ACRONYMS.join('|')})\\b`, 'g'), (a) => a.split('').join(' '));
  return s.replace(/\s{2,}/g, ' ').replace(/\s+([,.!?])/g, '$1').replace(/,\s*,/g, ',').trim();
}

/** How big the moment is: 1 = scream, 0 = relaxed desk talk. */
const INTENSITY: Partial<Record<EventType, number>> = {
  SAVAGE: 1,
  MANIAC: 0.9,
  SERIES_VICTORY: 0.95,
  TRIPLE_KILL: 0.85,
  LORD: 0.8,
  GAME_RESULT: 0.75,
  FIRST_BLOOD: 0.7,
  DOUBLE_KILL: 0.65,
  GAME_START: 0.7,
  INSTANT_REPLAY: 0.7,
  TURTLE: 0.55,
  TURRET: 0.5,
  WISP_REVEAL: 0.5,
  INVADE: 0.55,
  DRAFT_PICK: 0.5,
  OBJECTIVE_CONTEST: 0.6,
  KILL: 0.5,
  BUFF: 0.4,
  MAP_EFFECT: 0.5,
  DRAFT_START: 0.5,
  GAME_INTRO: 0.55,
  DRAFT_BAN: 0.35,
  SPELL_USED: 0.35,
  GOLD_UPDATE: 0.3,
  DRAFT_COMPLETE: 0.25,
  DRAFT_TALK: 0.2,
  BREAK_START: 0.3,
  IDLE_BANTER: 0.15,
};
export const intensityOf = (type: EventType | null | undefined, steal = false) => Math.min(1, (type ? (INTENSITY[type] ?? 0.4) : 0.4) + (steal ? 0.2 : 0));

export interface Phrase {
  text: string;
  rate: number;
  pitch: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/**
 * Split a line into phrases and give each one its own speed and pitch.
 * `original` is the caption text (its "!" and CAPS show where the caster shouts).
 */
export function performLine(original: string, intensity: number, base: { rate: number; pitch: number }, rand: () => number = Math.random): Phrase[] {
  const split = original.match(/[^.!?]+[.!?]*/g)?.map((p) => p.trim()).filter(Boolean) ?? [original];
  // Neighbouring sentences of the same kind are said in one go — every extra utterance is a tiny gap.
  const kind = (raw: string) => {
    const words = raw.split(/\s+/).filter(Boolean);
    const capsShare = words.filter((w) => /[A-Z]{3,}/.test(w)).length / Math.max(1, words.length);
    return raw.endsWith('!') || capsShare > 0.4 ? 'shout' : raw.endsWith('?') ? 'question' : 'plain';
  };
  const pieces: string[] = [];
  for (const p of split) {
    const last = pieces[pieces.length - 1];
    if (last !== undefined && kind(last) === kind(p)) pieces[pieces.length - 1] = `${last} ${p}`;
    else pieces.push(p);
  }
  return pieces.map((raw, i) => {
    const text = spokenForm(raw);
    const words = raw.split(/\s+/).filter(Boolean);
    const capsShare = words.filter((w) => /[A-Z]{3,}/.test(w)).length / Math.max(1, words.length);
    const shout = raw.endsWith('!') || capsShare > 0.4;
    const question = raw.endsWith('?');
    const long = words.length >= 11;
    let rate = base.rate;
    let pitch = base.pitch;
    if (shout) {
      // Hype: quicker and higher, strongest on the opening call.
      rate *= 1 + 0.06 + 0.1 * intensity + (i === 0 ? 0.03 : 0);
      pitch *= 1 + 0.04 + 0.1 * intensity;
    } else if (question) {
      rate *= 1 + 0.02 * intensity;
      pitch *= 1.05;
    } else if (long) {
      // Analysis / storytelling: unhurried, a touch lower — let it breathe.
      rate *= 0.95 - 0.02 * (1 - intensity);
      pitch *= 0.97;
    } else {
      rate *= 1 + 0.04 * intensity;
      pitch *= 1 + 0.02 * intensity;
    }
    // Human variation: no two phrases at exactly the same speed/pitch.
    rate *= 1 + (rand() - 0.5) * 0.05;
    pitch *= 1 + (rand() - 0.5) * 0.04;
    return { text, rate: clamp(rate, 0.75, 1.6), pitch: clamp(pitch, 0.7, 1.45) };
  });
}

/** Pronunciation notes for the realistic (Gemini) voice, for the heroes named in these lines. */
export function pronunciationGuide(lines: string[]): string {
  const joined = lines.join(' ');
  const notes = Object.entries(HERO_SAY)
    .filter(([hero]) => new RegExp(`(?<![\\w])${escapeRe(hero)}(?![\\w])`).test(joined))
    .map(([hero, say]) => `${hero} = "${say}"`);
  return notes.length ? `Pronounce hero names like Filipino casters do: ${notes.join(', ')}.` : '';
}
