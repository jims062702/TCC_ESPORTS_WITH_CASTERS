import type { EventType } from '@/types';
import type { CasterId } from './casters';
import { CASTER_BY_ID } from './casters';
import { callGeminiProxy, GeminiError } from './gemini';
import { STORAGE_KEYS } from '@/lib/constants';
import { safeLocalGet, safeLocalSet } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Realistic caster voices (Gemini text-to-speech).
//
// These are ORIGINAL voices (Gemini's prebuilt voices) directed to perform like
// live Filipino pro-league casters — they do not imitate any real person.
// One request voices a whole exchange with up to two speakers, so the casters
// take turns naturally inside a single clip. The booth falls back to browser
// voices automatically when the daily quota is used up or anything fails.
// ─────────────────────────────────────────────────────────────────────────────

export interface GeminiVoice {
  name: string;
  gender: 'male' | 'female';
  character: string;
}

/** Gemini prebuilt voices (name → character), used for the per-caster picker. */
export const GEMINI_VOICES: GeminiVoice[] = [
  { name: 'Fenrir', gender: 'male', character: 'Excitable' },
  { name: 'Puck', gender: 'male', character: 'Upbeat' },
  { name: 'Charon', gender: 'male', character: 'Informative' },
  { name: 'Orus', gender: 'male', character: 'Firm' },
  { name: 'Iapetus', gender: 'male', character: 'Clear' },
  { name: 'Algenib', gender: 'male', character: 'Gravelly' },
  { name: 'Alnilam', gender: 'male', character: 'Firm' },
  { name: 'Rasalgethi', gender: 'male', character: 'Informative' },
  { name: 'Sadachbia', gender: 'male', character: 'Lively' },
  { name: 'Sadaltager', gender: 'male', character: 'Knowledgeable' },
  { name: 'Zubenelgenubi', gender: 'male', character: 'Casual' },
  { name: 'Achird', gender: 'male', character: 'Friendly' },
  { name: 'Enceladus', gender: 'male', character: 'Breathy' },
  { name: 'Umbriel', gender: 'male', character: 'Easy-going' },
  { name: 'Algieba', gender: 'male', character: 'Smooth' },
  { name: 'Schedar', gender: 'male', character: 'Even' },
  { name: 'Kore', gender: 'female', character: 'Firm' },
  { name: 'Zephyr', gender: 'female', character: 'Bright' },
  { name: 'Leda', gender: 'female', character: 'Youthful' },
  { name: 'Laomedeia', gender: 'female', character: 'Upbeat' },
  { name: 'Pulcherrima', gender: 'female', character: 'Forward' },
  { name: 'Aoede', gender: 'female', character: 'Breezy' },
  { name: 'Autonoe', gender: 'female', character: 'Bright' },
  { name: 'Callirrhoe', gender: 'female', character: 'Easy-going' },
  { name: 'Despina', gender: 'female', character: 'Smooth' },
  { name: 'Erinome', gender: 'female', character: 'Clear' },
  { name: 'Gacrux', gender: 'female', character: 'Mature' },
  { name: 'Sulafat', gender: 'female', character: 'Warm' },
  { name: 'Vindemiatrix', gender: 'female', character: 'Gentle' },
  { name: 'Achernar', gender: 'female', character: 'Soft' },
];

/** Speaker tag (one word, used inside the TTS script), default voice and live-delivery direction per caster. */
export const TTS_PROFILE: Record<CasterId, { speaker: string; voice: string; delivery: string }> = {
  marco: { speaker: 'Marco', voice: 'Charon', delivery: 'calm, warm older-brother analyst; measured pace, explains clearly, confident emphasis on key words, never shouts' },
  ken: { speaker: 'Ken', voice: 'Fenrir', delivery: 'explosive hype play-by-play; fast, loud, voice rising and cracking with excitement on big moments, stretches words like GRABEEE, shouts calls like a packed arena is screaming with him' },
  lyka: { speaker: 'Lyka', voice: 'Kore', delivery: 'sharp, confident stats caster; quick and crisp, slightly playful, punches the numbers' },
  trixie: { speaker: 'Trixie', voice: 'Laomedeia', delivery: 'playful, witty, bubbly; reacts with little gasps and laughs, teasing but friendly, gets excited on clutch plays' },
  rafa: { speaker: 'Rafa', voice: 'Iapetus', delivery: 'focused former coach; clear, deliberate, persuasive, a little intense when the plan works' },
  jun: { speaker: 'Jun', voice: 'Algenib', delivery: 'veteran storyteller; deep, gravelly, slower and dramatic, savours big moments like a legend telling the story' },
  bea: { speaker: 'Bea', voice: 'Zephyr', delivery: 'bright, focused objective caller; builds suspense before objectives, then bursts with energy on the last hit' },
  mika: { speaker: 'Mika', voice: 'Pulcherrima', delivery: 'bright, welcoming show host; big smile in the voice, hypes the crowd and chat, warm and energetic' },
};

/** How intense each moment should sound. */
const INTENSITY: Partial<Record<EventType, string>> = {
  SAVAGE: 'MAXIMUM hype — screaming with joy, out of breath, like the crowd just exploded.',
  MANIAC: 'Huge hype, almost screaming, building toward a possible Savage.',
  TRIPLE_KILL: 'Big hype, loud and fast.',
  LORD: 'Big energy; if it is a steal, scream it in disbelief.',
  TURTLE: 'Energetic call, then quick reaction.',
  BUFF: 'Upbeat, quick.',
  FIRST_BLOOD: 'Sharp, excited call to open the game.',
  DOUBLE_KILL: 'Excited and quick.',
  OBJECTIVE_CONTEST: 'Tense suspense — hushed, then rising as the fight starts.',
  INSTANT_REPLAY: 'Open by inviting everyone to watch the instant replay, then re-live the play with fresh excitement, like seeing it again in slow motion.',
  SERIES_VICTORY: 'Emotional, celebratory, goosebumps — like the final moment of a grand final.',
  GAME_RESULT: 'Excited, celebratory, then reflective.',
  GAME_INTRO: 'Big welcoming opener, building anticipation.',
  DRAFT_START: 'Warm, welcoming show opener — greeting your partner on the desk like an old friend, then curious about the draft.',
  GAME_START: 'Big, energetic "here we go" opener as the game begins — welcoming everyone, building anticipation.',
  BREAK_START: 'Relaxed and friendly, like a host sending the show to a short break; warm and inviting.',
  DRAFT_COMPLETE: 'Thoughtful, analytical, conversational.',
  DRAFT_BAN: 'Quick, knowing call of a ban — a touch of drama.',
  DRAFT_PICK: 'Energetic lock-in call; extra hype when it is the signature hero of a star player.',
  DRAFT_TALK: 'Curious, storytelling desk talk building anticipation for the next pick.',
  GOLD_UPDATE: 'Conversational and confident.',
  SPELL_USED: 'Quick, observant, slightly cheeky.',
  IDLE_BANTER: 'Relaxed, natural desk conversation between friends.',
};

export function buildDirection(pair: string[], type: EventType): string {
  const who = pair
    .map((id) => {
      const p = TTS_PROFILE[id as CasterId];
      return p ? `${p.speaker} (${CASTER_BY_ID[id]?.role ?? 'caster'}): ${p.delivery}.` : '';
    })
    .filter(Boolean)
    .join('\n');
  return [
    'You are performing LIVE commentary for a Filipino pro-league Mobile Legends: Bang Bang esports broadcast. This is not a narration — it is two real casters talking on a live mic in front of a cheering crowd.',
    'Speak natural Taglish exactly like Filipino shoutcasters: Tagalog words with natural Filipino pronunciation and rhythm, English game terms in a natural Filipino-English accent. Player names and team names are said confidently.',
    'Sound human: natural breaths, emphasis, quick reactions, overlapping energy (but each line still finishes before the next speaker starts). Never read punctuation, symbols or speaker tags aloud.',
    `Moment: ${INTENSITY[type] ?? 'Natural live energy.'}`,
    'Speakers:',
    who,
  ].join('\n');
}

// ── Voice settings & usage (per booth computer) ─────────────────────────────

export const loadGeminiVoices = (): Record<string, string> =>
  safeLocalGet(STORAGE_KEYS.boothGeminiVoices, Object.fromEntries(Object.entries(TTS_PROFILE).map(([id, p]) => [id, p.voice])) as Record<string, string>);

export const saveGeminiVoices = (v: Record<string, string>) => safeLocalSet(STORAGE_KEYS.boothGeminiVoices, v);

const today = () => new Date().toISOString().slice(0, 10);
export const ttsUsageToday = (): number => {
  const u = safeLocalGet(STORAGE_KEYS.ttsUsage, { date: today(), count: 0 });
  return u.date === today() ? u.count : 0;
};
const bumpTtsUsage = () => safeLocalSet(STORAGE_KEYS.ttsUsage, { date: today(), count: ttsUsageToday() + 1 });

// ── Synthesis ───────────────────────────────────────────────────────────────

export interface SpokenClip {
  pcm: Int16Array;
  sampleRate: number;
  /** Start time (seconds) of each line inside the clip, for caption sync. */
  lineStarts: number[];
}

export async function synthesizeExchange(
  lines: { casterId: string; text: string }[],
  type: EventType,
  voiceMap: Record<string, string>,
  timeoutMs = 20_000,
): Promise<SpokenClip> {
  const pair = [...new Set(lines.map((l) => l.casterId))].slice(0, 2);
  const voices: Record<string, string> = {};
  for (const id of pair) {
    const p = TTS_PROFILE[id as CasterId];
    if (!p) throw new GeminiError(`No voice profile for ${id}`, 400);
    voices[p.speaker] = voiceMap[id] || p.voice;
  }
  bumpTtsUsage();
  const res = await callGeminiProxy<{ audio?: string; sampleRate?: number }>(
    {
      mode: 'tts',
      lines: lines.map((l) => ({ speaker: TTS_PROFILE[l.casterId as CasterId].speaker, text: l.text })),
      voices,
      direction: buildDirection(pair, type),
    },
    timeoutMs,
  );
  if (!res.audio) throw new GeminiError('No audio returned', 502);
  const bytes = Uint8Array.from(atob(res.audio), (c) => c.charCodeAt(0));
  const pcm = new Int16Array(bytes.buffer, 0, Math.floor(bytes.byteLength / 2));
  const sampleRate = res.sampleRate ?? 24000;
  return { pcm, sampleRate, lineStarts: findLineStarts(pcm, sampleRate, lines.map((l) => l.text)) };
}

/**
 * Estimate where each line starts inside the clip: expected positions come from
 * each line's share of the text, then snap to the nearest real pause (speaker
 * hand-offs leave a short silence). Pure function — unit tested.
 */
export function findLineStarts(pcm: Int16Array, sampleRate: number, texts: string[]): number[] {
  const duration = pcm.length / sampleRate;
  if (texts.length < 2 || duration <= 0) return [0];
  // RMS energy per 20 ms window
  const win = Math.max(1, Math.round(sampleRate * 0.02));
  const energy: number[] = [];
  for (let i = 0; i < pcm.length; i += win) {
    let sum = 0;
    const end = Math.min(pcm.length, i + win);
    for (let j = i; j < end; j++) sum += pcm[j] * pcm[j];
    energy.push(Math.sqrt(sum / (end - i)));
  }
  const loud = [...energy].sort((a, b) => a - b)[Math.floor(energy.length * 0.9)] || 1;
  const quiet = loud * 0.06;
  // Pauses ≥ 160 ms → candidate hand-off points (centre of the pause)
  const pauses: number[] = [];
  let runStart = -1;
  energy.forEach((e, i) => {
    if (e < quiet) {
      if (runStart < 0) runStart = i;
    } else if (runStart >= 0) {
      if ((i - runStart) * 0.02 >= 0.16) pauses.push(((runStart + i) / 2) * 0.02);
      runStart = -1;
    }
  });
  const total = texts.reduce((n, t) => n + t.length, 0) || 1;
  const starts = [0];
  let acc = 0;
  for (let k = 0; k < texts.length - 1; k++) {
    acc += texts[k].length;
    const expected = (acc / total) * duration;
    const prev = starts[starts.length - 1];
    const near = pauses.filter((p) => p > prev + 0.3 && Math.abs(p - expected) < Math.max(1.2, duration * 0.18));
    const best = near.sort((a, b) => Math.abs(a - expected) - Math.abs(b - expected))[0];
    starts.push(best ?? expected);
  }
  return starts;
}

// ── Playback (Web Audio) ────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let current: AudioBufferSourceNode | null = null;

/** Create/resume the audio context — must be called from a click (the booth's Start button). */
export function unlockAudio() {
  ctx ??= new AudioContext();
  if (ctx.state === 'suspended') void ctx.resume();
}

export function stopClip() {
  try {
    current?.stop();
  } catch {
    /* already stopped */
  }
  current = null;
}

/**
 * Play a clip. `onLine(i)` fires as each caster's line begins (caption sync).
 * `shouldStopAtLine(i)` lets the engine end the clip cleanly at a speaker
 * hand-off (between lines — nobody is cut off mid-sentence).
 */
export function playClip(clip: SpokenClip, volume: number, onLine: (i: number) => void, shouldStopAtLine?: (i: number) => boolean): Promise<void> {
  unlockAudio();
  const audio = ctx!;
  const buffer = audio.createBuffer(1, clip.pcm.length, clip.sampleRate);
  const ch = buffer.getChannelData(0);
  for (let i = 0; i < clip.pcm.length; i++) ch[i] = clip.pcm[i] / 32768;
  const src = audio.createBufferSource();
  const gain = audio.createGain();
  gain.gain.value = volume;
  src.buffer = buffer;
  src.connect(gain).connect(audio.destination);
  current = src;
  return new Promise((resolve) => {
    const timers: number[] = [];
    const done = () => {
      timers.forEach((t) => clearTimeout(t));
      if (current === src) current = null;
      resolve();
    };
    src.onended = done;
    onLine(0);
    clip.lineStarts.slice(1).forEach((t, k) => {
      timers.push(
        window.setTimeout(() => {
          if (shouldStopAtLine?.(k + 1)) {
            try {
              src.stop();
            } catch {
              /* ignore */
            }
            return;
          }
          onLine(k + 1);
        }, t * 1000),
      );
    });
    src.start();
  });
}

export const clipDuration = (clip: SpokenClip) => clip.pcm.length / clip.sampleRate;
