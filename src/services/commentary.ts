import { addDoc, collection, doc, getDoc, runTransaction, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore';
import type { BoothState, CaptionLine, CaptionState, CommentaryLog, GameEvent, LiveState, ScriptEntry, ScriptLibrary } from '@/types';
import { COL, LIVE_DOC, db, subscribeCollection, subscribeDoc, whereEq } from './firebase';
import { CASTER_BY_ID, isCasterId, resolvePairVoices, speak, stopSpeaking, waitUntilQuiet } from './casters';
import { playClip, stopClip, synthesizeExchange, ttsUsageToday, unlockAudio } from './tts';
import { buildFacts, summarizeEvent } from './facts';
import { intensityOf } from './delivery';
import { REPLAY_LEAD, SCRIPT_KEYS, SCRIPT_PLACEHOLDERS, builtinExamples, templateLines, unknownPlaceholders } from './templates';
import { GeminiError, buildCommentaryPrompt, requestCommentary, requestLibrary } from './gemini';
import { normalizeLive } from './live';
import { EVENT_DEFS, STORAGE_KEYS } from '@/lib/constants';
import { safeLocalGet, safeLocalSet, sleep, uid } from '@/lib/utils';

/** Pause between speakers so each caster finishes before the next one starts. */
/** Breath between two casters (the next one answers right away). */
const HANDOFF_MS = 120;

/** "Instant response": how long a live AI line / realistic voice may take before the instant library line / voice is used. */
const AI_FAST_MS = 1600;
const TTS_FAST_MS = 2200;

// ─────────────────────────────────────────────────────────────────────────────
// Commentary engine — ONE global engine for the whole admin app (boothEngine
// below). Started in the Caster Booth, it keeps running while you move to the
// Live Controller or any other admin page in the same tab.
//
//  • every click in the Live Controller takes over as soon as the current
//    line is finished (the rest of that exchange is dropped)
//  • between clicks the casters keep talking about the game (draft talk,
//    in-game banter, post-game recap, break chat) — one voice at a time
//
//  admin trigger ─► events/{id} (pending) ─► claim (transaction, no duplicates)
//    ─► queue (priority: replays & results first, minor events dropped on overflow)
//    ─► pre-shoutcast library (built-in + Gemini pre-generated, no repeats)
//       or a live Gemini call for the few moments that need it (cooldown + cap)
//    ─► live/caption (overlay subtitles) + speechSynthesis (stream audio)
// ─────────────────────────────────────────────────────────────────────────────

export const SCRIPT_DOC = 'library';

/** Live AI is reserved for these when "priority only" is on (the default). */
const AI_PRIORITY_TYPES = new Set<GameEvent['type']>(['INSTANT_REPLAY', 'SERIES_VICTORY', 'DRAFT_COMPLETE']);

export interface EngineSettings {
  aiEnabled: boolean;
  /** Use live Gemini only for replays (with a description), series wins and draft breakdowns. */
  aiOnlyPriority: boolean;
  /** 'browser' = free natural voices (default); 'gemini' = optional Gemini TTS voices (needs a key, small free quota). */
  voiceEngine: 'gemini' | 'browser';
  /** Settings version (2 = free by default — Gemini only when switched on). */
  v?: number;
  /** Max realistic-voice clips per day on this computer (then browser voices take over). */
  ttsDailyCap: number;
  aiMinorEvents: boolean;
  aiBanter: boolean;
  cooldownSec: number;
  dailyCap: number;
  /** Keep the casters talking between events (draft talk, banter, recap). */
  idleBanter: boolean;
  /** Legacy (pre-continuous) silence before banter — unused. */
  idleSec: number;
  /** Seconds of silence before the casters keep talking about the game. */
  talkGapSec: number;
  /** Never make the desk wait: fall back to the library line / instant voice when AI or realistic voice is slow. */
  instant: boolean;
  volume: number;
  rate: number;
  maxQueue: number;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  aiEnabled: false,
  aiOnlyPriority: true,
  aiMinorEvents: false,
  aiBanter: false,
  cooldownSec: 12,
  dailyCap: 200,
  idleBanter: true,
  idleSec: 55,
  talkGapSec: 0.5,
  instant: true,
  volume: 1,
  rate: 1,
  maxQueue: 4,
  voiceEngine: 'browser',
  ttsDailyCap: 300,
  v: 3,
};

/** This computer's booth settings. Older saves move to the free setup once (Gemini becomes opt-in). */
export function loadEngineSettings(): EngineSettings {
  const saved = safeLocalGet<Partial<EngineSettings>>(STORAGE_KEYS.boothSettings, {});
  const merged: EngineSettings = { ...DEFAULT_ENGINE_SETTINGS, ...saved };
  if ((saved.v ?? 1) < 2) {
    merged.voiceEngine = 'browser';
    merged.aiEnabled = false;
  }
  // v3: continuous talk — the old 3 s pause between exchanges becomes half a second.
  if ((saved.v ?? 1) < 3) merged.talkGapSec = Math.min(merged.talkGapSec ?? 0.5, 0.5);
  merged.v = 3;
  return merged;
}

export interface EngineLogEntry {
  id: string;
  at: number;
  eventType: GameEvent['type'];
  summary: string;
  source: 'ai' | 'template' | 'skipped' | 'error';
  lines: { casterId: string; text: string }[];
  latencyMs: number;
  note?: string;
}

// ── Shared AI usage counter (per booth machine, resets daily) ───────────────
const today = () => new Date().toISOString().slice(0, 10);
export const aiUsageToday = (): number => {
  const u = safeLocalGet(STORAGE_KEYS.aiUsage, { date: today(), count: 0 });
  return u.date === today() ? u.count : 0;
};
const bumpAiUsage = (n = 1) => safeLocalSet(STORAGE_KEYS.aiUsage, { date: today(), count: aiUsageToday() + n });

/**
 * Pre-generate the shoutcast library with Gemini: a handful of batched calls
 * (5 keys per call) instead of one call per in-game event. Lines use
 * {placeholders}, so they are reusable for every team and match.
 */
export async function pregenerateLibrary(perKey: number, onProgress?: (done: number, total: number) => void): Promise<number> {
  const batches: string[][] = [];
  for (let i = 0; i < SCRIPT_KEYS.length; i += 5) batches.push(SCRIPT_KEYS.slice(i, i + 5) as unknown as string[]);
  const ref = doc(db, COL.scripts, SCRIPT_DOC);
  const existing = ((await getDoc(ref)).data() as ScriptLibrary | undefined)?.entries ?? [];
  const seen = new Set(existing.map((e) => e.lead.toLowerCase()));
  const added: ScriptEntry[] = [];
  let model = '';
  for (let i = 0; i < batches.length; i++) {
    onProgress?.(i, batches.length);
    const examples = Object.fromEntries(batches[i].map((k) => [k, builtinExamples(k as (typeof SCRIPT_KEYS)[number]).slice(0, 1)]));
    const res = await requestLibrary(batches[i], perKey, SCRIPT_PLACEHOLDERS, examples);
    bumpAiUsage();
    model = res.model;
    for (const e of res.entries) {
      if (unknownPlaceholders(e.lead).length || unknownPlaceholders(e.follow).length) continue;
      if (/retribution/i.test(e.lead + e.follow)) continue;
      const k = e.lead.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      added.push({ key: e.key, lead: e.lead, follow: e.follow, source: 'ai' });
    }
  }
  onProgress?.(batches.length, batches.length);
  const entries = [...existing, ...added].slice(-1500);
  await setDoc(ref, { entries, model, updatedAt: Date.now() } satisfies ScriptLibrary);
  return added.length;
}

export const clearLibrary = () => setDoc(doc(db, COL.scripts, SCRIPT_DOC), { entries: [], model: '', updatedAt: Date.now() } satisfies ScriptLibrary);

export interface EngineStatus {
  running: boolean;
  busy: boolean;
  speaking: CaptionLine | null;
  queue: number;
  aiCallsToday: number;
  cooldownLeftMs: number;
  lastError: string | null;
  ttsCallsToday: number;
  voiceNote: string | null;
}

type StatusListener = (status: EngineStatus) => void;
type LogListener = (log: EngineLogEntry[]) => void;

const PRIORITY = new Set(['INSTANT_REPLAY', 'SERIES_VICTORY', 'GAME_RESULT', 'GAME_INTRO', 'DRAFT_START', 'GAME_START', 'BREAK_START']);
/**
 * Automatic phase announcements (draft welcome, game start, break) always use
 * the hand-written library: the greetings must name the partner exactly, and
 * they cost no AI quota.
 */
const PHASE_EVENTS = new Set<GameEvent['type']>(['DRAFT_START', 'GAME_START', 'BREAK_START', 'DRAFT_BAN', 'DRAFT_PICK', 'DRAFT_TALK']);

export class CommentaryEngine {
  readonly engineId = uid('booth_');
  private settings: EngineSettings = { ...DEFAULT_ENGINE_SETTINGS };
  private voices: SpeechSynthesisVoice[] = [];
  private voiceMap: Record<string, string | null> = {};
  private live: LiveState | null = null;
  private queue: GameEvent[] = [];
  private seen = new Set<string>();
  private localIds = new Set<string>();
  private current: GameEvent | null = null;
  /** Set when a priority event is waiting: the current exchange ends after the active line finishes (nobody is cut off). */
  private yieldRequested = false;
  private pair: string[] = [];
  private geminiVoices: Record<string, string> = {};
  /** On-air names from Settings → Casters (used for "partner {name}"). */
  private casterNames: Record<string, string> = {};
  private ttsBackoffUntil = 0;
  private ttsNote: string | null = null;
  private busy = false;
  private running = false;
  private startedAt = 0;
  private lastSpokeAt = Date.now();
  private lastAiAt = 0;
  private backoffUntil = 0;
  private lastError: string | null = null;
  private speaking: CaptionLine | null = null;
  private recent: CaptionLine[] = [];
  private library: ScriptEntry[] = [];
  private usedScripts: string[] = [];
  private unsubs: Unsubscribe[] = [];
  private timers: number[] = [];
  /** Bumped whenever the current exchange is cut off by a new click. */
  private epoch = 0;
  /** Another booth (other tab/computer) is running → claim events with a transaction. */
  private otherBooth = false;
  /** Consecutive filler exchanges without a click (the gap grows so talk never feels spammy). */
  private fillerStreak = 0;
  private lastTalkStep = -1;
  private logs: EngineLogEntry[] = [];
  private statusListeners = new Set<StatusListener>();
  private logListeners = new Set<LogListener>();

  /** Booth UI / admin layout subscribe here; returns an unsubscribe function. */
  subscribe(onStatus: StatusListener, onLog?: LogListener) {
    this.statusListeners.add(onStatus);
    if (onLog) this.logListeners.add(onLog);
    onStatus(this.status());
    onLog?.(this.logs);
    return () => {
      this.statusListeners.delete(onStatus);
      if (onLog) this.logListeners.delete(onLog);
    };
  }

  get settingsNow() {
    return this.settings;
  }

  get libraryCount() {
    return this.library.length;
  }

  // ── configuration ─────────────────────────────────────────────────────────
  setSettings(s: EngineSettings) {
    this.settings = s;
    this.emit();
  }

  setGeminiVoices(map: Record<string, string>) {
    this.geminiVoices = map;
  }

  setCasterNames(map: Record<string, string>) {
    this.casterNames = map;
  }

  setVoices(voices: SpeechSynthesisVoice[], map: Record<string, string | null>) {
    this.voices = voices;
    this.voiceMap = map;
  }

  get isRunning() {
    return this.running;
  }

  // ── lifecycle ─────────────────────────────────────────────────────────────
  start() {
    if (this.running) return;
    this.running = true;
    this.yieldRequested = false;
    unlockAudio();
    this.startedAt = Date.now();
    this.lastSpokeAt = Date.now();

    this.unsubs.push(
      subscribeDoc<LiveState>(COL.live, LIVE_DOC.current, (d) => {
        this.live = d ? normalizeLive(d) : null;
      }),
      subscribeCollection<GameEvent>(COL.events, [whereEq('status', 'pending')], (rows) => void this.onPending(rows)),
      subscribeDoc<ScriptLibrary>(COL.scripts, SCRIPT_DOC, (d) => {
        this.library = d?.entries ?? [];
      }),
      subscribeDoc<BoothState>(COL.live, LIVE_DOC.booth, (d) => {
        // Another tab pressed Start (or Stop for us): only one booth talks at a time.
        if (d?.stopRequested === this.engineId && this.running) return this.stop('takeover');
        this.otherBooth = Boolean(d && d.engineId && d.engineId !== this.engineId && d.online && Date.now() - d.lastBeat < 40_000);
      }),
    );
    // Taking over: ask any booth running in another tab/window to stop, so voices never double up.
    void getDoc(doc(db, COL.live, LIVE_DOC.booth))
      .then((snap) => {
        const d = snap.data() as BoothState | undefined;
        if (d?.engineId && d.engineId !== this.engineId && d.online && Date.now() - d.lastBeat < 40_000) return requestBoothStop(d.engineId);
      })
      .catch(() => {});
    this.beat();
    this.timers.push(
      window.setInterval(() => this.beat(), 15_000),
      window.setInterval(() => this.idleCheck(), 250),
      window.setInterval(() => this.emit(), 1_000),
    );
    this.emit();
  }

  /** `takeover`: another tab started casting — leave the booth status to it. */
  stop(reason?: 'takeover') {
    if (!this.running) return;
    this.running = false;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    this.queue = [];
    this.epoch++;
    stopSpeaking();
    stopClip();
    this.speaking = null;
    if (reason !== 'takeover') void setDoc(doc(db, COL.live, LIVE_DOC.booth), { online: false, lastBeat: Date.now(), engineId: this.engineId }, { merge: true }).catch(() => {});
    void this.writeCaption(null);
    this.emit();
  }

  /** Manually trigger a line for testing voices from the booth UI. */
  async testVoice(casterId: string, text: string) {
    await waitUntilQuiet();
    unlockAudio();
    const line = { casterId, text };
    if (!(await this.speakRealistic([line], 'IDLE_BANTER', 'template', false, true))) await this.say(line, 'template');
    void this.writeCaption(null);
  }

  // ── event intake ──────────────────────────────────────────────────────────
  private async onPending(rows: GameEvent[]) {
    const sorted = [...rows].sort((a, b) => a.createdAt - b.createdAt);
    for (const ev of sorted) {
      if (this.seen.has(ev.id)) continue;
      this.seen.add(ev.id);
      const tooOld = Date.now() - ev.createdAt > 90_000 || ev.createdAt < this.startedAt - 20_000;
      if (tooOld) {
        void this.markEvent(ev.id, 'skipped');
        continue;
      }
      if (await this.claim(ev.id)) this.enqueue(ev);
    }
  }

  /** Transactionally claim an event so two open booths never voice the same line. */
  private async claim(id: string): Promise<boolean> {
    // Only booth on air (the usual case): claim without waiting for a server round-trip.
    if (!this.otherBooth) {
      void updateDoc(doc(db, COL.events, id), { status: 'claimed', claimedBy: this.engineId }).catch(() => {});
      return true;
    }
    try {
      return await runTransaction(db, async (tx) => {
        const ref = doc(db, COL.events, id);
        const snap = await tx.get(ref);
        if (!snap.exists() || snap.data().status !== 'pending') return false;
        tx.update(ref, { status: 'claimed', claimedBy: this.engineId });
        return true;
      });
    } catch (e) {
      this.lastError = `Claim failed: ${(e as Error).message}`;
      return false;
    }
  }

  /** Hand-off pause that ends at once if a new click takes over. */
  private async pauseOrCut(ms: number, epoch: number) {
    const end = Date.now() + ms;
    while (Date.now() < end && epoch === this.epoch) await sleep(20);
  }

  /** Wait for silence (or a new click). */
  private async quietOrCut(epoch: number) {
    const started = Date.now();
    const synth = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;
    while (synth && (synth.speaking || synth.pending) && epoch === this.epoch && Date.now() - started < 20_000) await sleep(20);
  }

  /**
   * A new click takes over: the caster finishes the line they are saying (never
   * cut mid-sentence), the rest of that exchange is dropped, and the new call
   * (e.g. "Turtle slain by …") comes right after.
   */
  private interrupt() {
    this.epoch++;
    this.yieldRequested = false;
  }

  private enqueue(ev: GameEvent) {
    const fromController = !this.localIds.has(ev.id);
    if (fromController) {
      this.fillerStreak = 0;
      // Queued filler talk is dropped — the click is what matters now.
      this.queue = this.queue.filter((e) => !this.localIds.has(e.id));
      // Replace what the casters are saying: filler is cut at once; a previous
      // click's call is cut once it has actually started talking (events from
      // the same click — e.g. last pick + draft complete — still play in order).
      const cur = this.current;
      // Events written by the same click (created within ~1 s) play in order; a later click takes over.
      const sameClick = cur && !this.localIds.has(cur.id) && Math.abs(ev.createdAt - cur.createdAt) < 1200;
      if (cur && !sameClick) this.interrupt();
    }
    if (PRIORITY.has(ev.type)) {
      // Replays/results/phase calls jump ahead of minor chatter (but keep their
      // own order: a result is voiced before the "going to break" that follows
      // it). Minor chatter in progress is never cut mid-sentence: the current
      // caster finishes their line, then the desk moves on to the bigger moment.
      const firstMinor = this.queue.findIndex((e) => !PRIORITY.has(e.type));
      if (firstMinor === -1) this.queue.push(ev);
      else this.queue.splice(firstMinor, 0, ev);
      if (this.current && EVENT_DEFS[this.current.type].tier === 'minor') this.yieldRequested = true;
    } else {
      this.queue.push(ev);
    }
    // Overflow protection: drop the oldest minor events first.
    while (this.queue.length > this.settings.maxQueue) {
      const idx = this.queue.findIndex((e) => EVENT_DEFS[e.type].tier === 'minor');
      if (idx === -1) break;
      const [dropped] = this.queue.splice(idx, 1);
      void this.markEvent(dropped.id, 'skipped');
      this.log(dropped, 'skipped', [], 0, 'Dropped: queue overflow');
    }
    this.emit();
    void this.pump();
  }

  private async pump() {
    if (this.busy || !this.running) return;
    const ev = this.queue.shift();
    if (!ev) return;
    this.busy = true;
    this.current = ev;
    this.emit();
    try {
      await this.handle(ev);
    } catch (e) {
      this.lastError = (e as Error).message;
      this.log(ev, 'error', [], 0, this.lastError);
    } finally {
      this.busy = false;
      this.current = null;
      this.yieldRequested = false;
      this.emit();
      void this.pump();
    }
  }

  // ── the core: facts → AI or template → captions + speech ─────────────────
  private async handle(ev: GameEvent) {
    const live = this.live;
    const epoch = this.epoch;
    if (!live || (ev.matchId && live.matchId && ev.matchId !== live.matchId)) {
      void this.markEvent(ev.id, 'skipped');
      this.log(ev, 'skipped', [], 0, 'Event is not for the live match');
      return;
    }
    // Draft calls only make sense while the draft is on screen and fresh.
    const staleDraftCall = (ev.type === 'DRAFT_BAN' || ev.type === 'DRAFT_PICK') && (live.phase !== 'draft' || Date.now() - ev.createdAt > 45_000);
    const staleTalk = ev.type === 'DRAFT_TALK' && (live.phase !== 'draft' || Number(ev.data?.step ?? -1) !== live.draft.step);
    if (staleDraftCall || staleTalk) {
      void this.markEvent(ev.id, 'skipped');
      if (staleDraftCall) this.log(ev, 'skipped', [], 0, 'Draft moved on');
      return;
    }
    let pair: string[] = live.casters.filter(isCasterId).slice(0, 2);
    if (pair.length < 2) pair = ['marco', 'ken'];

    const facts = buildFacts(ev, live);
    let lines: { casterId: string; text: string }[] = [];
    let source: 'ai' | 'template' = 'template';
    let latency = 0;
    let note: string | undefined;

    if (this.shouldUseAi(ev)) {
      this.lastAiAt = Date.now();
      this.bumpUsage();
      try {
        const request = requestCommentary(buildCommentaryPrompt(ev.type, facts, pair, this.recent.map((r) => r.text)));
        // Instant response: if the AI is slow, the library line goes out now.
        const res = this.settings.instant ? await Promise.race([request, sleep(AI_FAST_MS).then(() => null)]) : await request;
        if (res) {
          lines = res.lines.map((l) => ({ casterId: l.caster, text: l.text }));
          source = 'ai';
          latency = res.latencyMs;
          this.lastError = null;
        } else {
          request.catch(() => {});
          note = 'AI was slow — used the instant library line';
        }
      } catch (e) {
        const err = e as GeminiError;
        note = `AI fallback: ${err.message}`;
        this.lastError = err.message;
        if (err.status === 429) this.backoffUntil = Date.now() + (err.retryAfterSec ?? 60) * 1000;
      }
    }
    if (!lines.length) {
      // Pre-shoutcast library (built-in + pre-generated), avoiding recent repeats.
      // Filler talk continues the conversation: the caster who did NOT just speak opens, picking up from the partner.
      const filler = this.localIds.has(ev.id) && (ev.type === 'IDLE_BANTER' || ev.type === 'DRAFT_TALK');
      const lastLine = this.recent[this.recent.length - 1];
      const lastSpeaker = lastLine?.casterId;
      const recentlySpoke = Boolean(lastLine && Date.now() - lastLine.at < 15_000);
      const flow = filler && lastSpeaker && pair.includes(lastSpeaker) ? { lead: pair.find((p) => p !== lastSpeaker), bridge: recentlySpoke } : {};
      const pick = templateLines(ev, facts, pair, this.library, new Set(this.usedScripts), this.casterNames, flow);
      lines = pick.lines;
      this.usedScripts = [...this.usedScripts, ...pick.ids].slice(-160);
    }
    lines = lines
      .map((l, i) => ({ casterId: pair.includes(l.casterId) ? l.casterId : pair[i % 2], text: l.text.trim() }))
      .filter((l) => l.text);
    // Every replay opens with "Tingnan muna natin ang instant replay" — even live AI lines.
    if (ev.type === 'INSTANT_REPLAY' && lines.length && !REPLAY_LEAD.test(lines[0].text)) {
      lines[0] = { ...lines[0], text: `Tingnan muna natin ang instant replay! ${lines[0].text}` };
    }

    void this.markEvent(ev.id, 'done');
    if (!lines.length || epoch !== this.epoch) return;
    this.log(ev, source, lines, latency, note);
    void this.archive(ev, pair, lines, source, latency);

    // One voice at a time: wait for complete silence, leave a short handoff
    // gap, then the next caster speaks. Nobody talks over anybody.
    this.pair = pair;
    await this.quietOrCut(epoch);
    if (epoch !== this.epoch) return;
    if (await this.speakRealistic(lines, ev.type, source, EVENT_DEFS[ev.type].tier === 'minor')) {
      this.lastSpokeAt = Date.now();
      window.setTimeout(() => {
        if (!this.busy) void this.writeCaption(null);
      }, 1800);
      return;
    }
    for (const [i, line] of lines.entries()) {
      if (!this.running || epoch !== this.epoch) break;
      if (i > 0 && this.yieldRequested && EVENT_DEFS[ev.type].tier === 'minor') break;
      await this.quietOrCut(epoch);
      if (i > 0) await this.pauseOrCut(HANDOFF_MS, epoch);
      if (epoch !== this.epoch) break;
      await this.say(line, source, intensityOf(ev.type, Boolean(ev.data?.steal)));
    }
    this.lastSpokeAt = Date.now();
    window.setTimeout(() => {
      if (!this.busy) void this.writeCaption(null);
    }, 1800);
  }

  private shouldUseAi(ev: GameEvent): boolean {
    const s = this.settings;
    const now = Date.now();
    if (!s.aiEnabled || now < this.backoffUntil) return false;
    if (PHASE_EVENTS.has(ev.type)) return false;
    if (this.usageToday() >= s.dailyCap) return false;
    const sinceAi = now - this.lastAiAt;
    if (ev.type === 'IDLE_BANTER') return s.aiBanter && sinceAi >= s.cooldownSec * 3000;
    if (s.aiOnlyPriority) {
      if (!AI_PRIORITY_TYPES.has(ev.type)) return false;
      // A replay without a description is covered well by the library.
      if (ev.type === 'INSTANT_REPLAY' && !ev.note.trim()) return false;
    }
    if (EVENT_DEFS[ev.type].tier === 'minor' && !s.aiMinorEvents) return false;
    // Results and replays may bypass most of the cooldown — they matter most on stream.
    const cooldown = PRIORITY.has(ev.type) ? Math.min(5, s.cooldownSec) : s.cooldownSec;
    return sinceAi >= cooldown * 1000;
  }

  /**
   * Realistic live-caster voices: the whole exchange is voiced in ONE Gemini
   * text-to-speech clip (both casters, taking turns). Captions switch as each
   * line begins. Returns false (→ browser voices) when disabled, over the daily
   * cap, rate-limited or on any error — the casters never go silent.
   */
  private async speakRealistic(
    lines: { casterId: string; text: string }[],
    type: GameEvent['type'],
    source: 'ai' | 'template',
    yieldable = false,
    isTest = false,
  ): Promise<boolean> {
    const s = this.settings;
    if (s.voiceEngine !== 'gemini' || Date.now() < this.ttsBackoffUntil || ttsUsageToday() >= s.ttsDailyCap) return false;
    const epoch = this.epoch;
    try {
      const pending = synthesizeExchange(lines, type, this.geminiVoices);
      const clip = s.instant && !isTest ? await Promise.race([pending, sleep(TTS_FAST_MS).then(() => null)]) : await pending;
      if (!clip) {
        pending.catch(() => {});
        this.ttsNote = 'Realistic voice was slow — used the instant voice so the casters respond right away.';
        return false;
      }
      // Stopped, or a new click took over while the clip was being generated: stay silent.
      if ((!this.running && !isTest) || epoch !== this.epoch) return true;
      this.ttsNote = null;
      await playClip(
        clip,
        s.volume,
        (i) => {
          const line = lines[i];
          if (!line) return;
          const caption: CaptionLine = { casterId: line.casterId, text: line.text, at: Date.now(), source };
          this.speaking = caption;
          this.recent = [...this.recent, caption].slice(-10);
          void this.writeCaption(caption);
          this.emit();
        },
        // End the clip at a speaker hand-off (never mid-sentence) when a click or bigger moment is waiting.
        (i) => i > 0 && ((yieldable && this.yieldRequested) || epoch !== this.epoch),
      );
      this.speaking = null;
      this.emit();
      return true;
    } catch (e) {
      const err = e as GeminiError;
      this.ttsNote = err.status === 503 ? 'Realistic voices need GEMINI_API_KEY on the server — using browser voices.' : `Realistic voice unavailable (${err.message}) — using browser voices.`;
      this.lastError = this.ttsNote;
      // Quota/rate limit: rest the realistic voice for a while; other errors: retry next event.
      if (err.status === 429) this.ttsBackoffUntil = Date.now() + Math.max(60, err.retryAfterSec ?? 300) * 1000;
      if (err.status === 503 || err.status === 401 || err.status === 403) this.ttsBackoffUntil = Date.now() + 10 * 60_000;
      return false;
    }
  }

  private async say(line: { casterId: string; text: string }, source: 'ai' | 'template', intensity = 0.3) {
    const persona = CASTER_BY_ID[line.casterId];
    // Seated pair never shares a voice (resolved per exchange).
    const seated = this.pair.includes(line.casterId) ? this.pair : [line.casterId];
    const uri = resolvePairVoices(seated, this.voiceMap, this.voices)[line.casterId] ?? this.voiceMap[line.casterId];
    const voice = this.voices.find((v) => v.voiceURI === uri) ?? null;
    const caption: CaptionLine = { casterId: line.casterId, text: line.text, at: Date.now(), source };
    this.speaking = caption;
    this.recent = [...this.recent, caption].slice(-10);
    void this.writeCaption(caption);
    this.emit();
    await speak(line.text, {
      voice,
      pitch: persona?.voice.pitch ?? 1,
      rate: (persona?.voice.rate ?? 1) * this.settings.rate,
      volume: this.settings.volume,
      intensity,
    });
    this.speaking = null;
    this.emit();
  }

  /**
   * Keep the desk talking between clicks, about whatever is on screen:
   * draft speculation & storytelling, in-game banter (players, matchups, gold,
   * objectives), post-game recap, and an occasional word during the break.
   */
  private idleCheck() {
    const s = this.settings;
    const live = this.live;
    if (!s.idleBanter || !live?.matchId || this.busy || this.queue.length || live.phase === 'idle') return;
    const base = Math.max(0.3, s.talkGapSec ?? 1);
    const gapSec = live.phase === 'break' ? 45 : live.phase === 'postgame' ? base + 5 : base;
    // After a long run of filler without clicks the gap widens a little (never silent for long).
    // Continuous desk talk in the draft and in-game; only a long run without any click slows it a little.
    const fatigue = live.phase === 'break' ? 0 : Math.min(2, Math.floor(this.fillerStreak / 20));
    if (Date.now() - this.lastSpokeAt < (gapSec + fatigue) * 1000) return;
    const draftDone = live.draft.step >= 20;
    // One speculation per draft step (then plain draft talk), so they don't loop on the same pick.
    if (live.phase === 'draft' && !draftDone && this.lastTalkStep === live.draft.step && this.fillerStreak > 2 && Math.random() < 0.5) return;
    const type: GameEvent['type'] = live.phase === 'draft' ? 'DRAFT_TALK' : 'IDLE_BANTER';
    if (live.phase === 'draft') this.lastTalkStep = live.draft.step;
    const id = uid('idle_');
    this.localIds.add(id);
    this.lastSpokeAt = Date.now();
    this.fillerStreak++;
    this.enqueue({
      id,
      matchId: live.matchId ?? '',
      gameNumber: live.gameNumber,
      type,
      side: null,
      playerId: null,
      playerIgn: null,
      hero: null,
      spell: null,
      note: '',
      data: { mode: live.phase, step: live.draft.step },
      status: 'claimed',
      claimedBy: this.engineId,
      createdAt: Date.now(),
    });
  }

  // ── persistence helpers ───────────────────────────────────────────────────
  private async writeCaption(current: CaptionLine | null) {
    const state: CaptionState = { current, recent: this.recent, updatedAt: Date.now() };
    try {
      await setDoc(doc(db, COL.live, LIVE_DOC.caption), state);
    } catch {
      /* offline — overlays will catch up */
    }
  }

  private async markEvent(id: string, status: GameEvent['status']) {
    if (this.localIds.has(id)) return;
    try {
      await updateDoc(doc(db, COL.events, id), { status });
    } catch {
      /* ignore */
    }
  }

  private async archive(ev: GameEvent, pair: string[], lines: { casterId: string; text: string }[], source: 'ai' | 'template', latencyMs: number) {
    if (this.localIds.has(ev.id)) return;
    const log: Omit<CommentaryLog, 'id'> = {
      eventId: ev.id,
      eventType: ev.type,
      matchId: ev.matchId,
      gameNumber: ev.gameNumber,
      casters: pair,
      lines,
      source,
      latencyMs,
      createdAt: Date.now(),
    };
    try {
      await addDoc(collection(db, COL.commentary), log);
    } catch {
      /* archive is best-effort */
    }
  }

  private beat() {
    void setDoc(
      doc(db, COL.live, LIVE_DOC.booth),
      { online: this.running, lastBeat: Date.now(), aiCallsToday: this.usageToday(), queue: this.queue.length, engineId: this.engineId },
      { merge: true },
    ).catch(() => {});
  }

  private usageToday(): number {
    return aiUsageToday();
  }

  private bumpUsage() {
    bumpAiUsage();
  }

  private log(ev: GameEvent, source: EngineLogEntry['source'], lines: EngineLogEntry['lines'], latencyMs: number, note?: string) {
    this.logs = [{ id: uid('log_'), at: Date.now(), eventType: ev.type, summary: summarizeEvent(ev, this.live), source, lines, latencyMs, note }, ...this.logs].slice(0, 40);
    this.logListeners.forEach((l) => l(this.logs));
  }

  private emit() {
    const st = this.status();
    this.statusListeners.forEach((l) => l(st));
  }

  status(): EngineStatus {
    return {
      running: this.running,
      busy: this.busy,
      speaking: this.speaking,
      queue: this.queue.length,
      aiCallsToday: this.usageToday(),
      cooldownLeftMs: Math.max(0, this.settings.cooldownSec * 1000 - (Date.now() - this.lastAiAt), this.backoffUntil - Date.now()),
      lastError: this.lastError,
      ttsCallsToday: ttsUsageToday(),
      voiceNote: this.ttsNote,
    };
  }
}

/** Ask the casting engine running in another tab/window (by id) to stop. */
export const requestBoothStop = (engineId: string) =>
  setDoc(doc(db, COL.live, LIVE_DOC.booth), { stopRequested: engineId }, { merge: true });

/** The one casting engine for the whole admin app (survives page changes in the same tab). */
export const boothEngine = new CommentaryEngine();
// Dev hot-reload creates a fresh engine — stop the old one so it can't keep talking unseen.
if (import.meta.hot) import.meta.hot.dispose(() => boothEngine.stop());
