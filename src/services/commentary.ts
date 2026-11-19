import { addDoc, collection, doc, getDoc, runTransaction, setDoc, updateDoc, type Unsubscribe } from 'firebase/firestore';
import type { CaptionLine, CaptionState, CommentaryLog, GameEvent, LiveState, ScriptEntry, ScriptLibrary } from '@/types';
import { COL, LIVE_DOC, db, subscribeCollection, subscribeDoc, whereEq } from './firebase';
import { CASTER_BY_ID, isCasterId, resolvePairVoices, speak, stopSpeaking, waitUntilQuiet } from './casters';
import { playClip, stopClip, synthesizeExchange, ttsUsageToday, unlockAudio } from './tts';
import { buildFacts, summarizeEvent } from './facts';
import { SCRIPT_KEYS, SCRIPT_PLACEHOLDERS, builtinExamples, templateLines, unknownPlaceholders } from './templates';
import { GeminiError, buildCommentaryPrompt, requestCommentary, requestLibrary } from './gemini';
import { normalizeLive } from './live';
import { EVENT_DEFS, STORAGE_KEYS } from '@/lib/constants';
import { safeLocalGet, safeLocalSet, sleep, uid } from '@/lib/utils';

/** Pause between speakers so each caster finishes before the next one starts. */
const HANDOFF_MS = 450;

// ─────────────────────────────────────────────────────────────────────────────
// Commentary engine — runs inside the Caster Booth page (one per broadcast).
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
  /** 'gemini' = realistic live-caster voices (Gemini TTS); 'browser' = free basic voices. */
  voiceEngine: 'gemini' | 'browser';
  /** Max realistic-voice clips per day on this computer (then browser voices take over). */
  ttsDailyCap: number;
  aiMinorEvents: boolean;
  aiBanter: boolean;
  cooldownSec: number;
  dailyCap: number;
  idleBanter: boolean;
  idleSec: number;
  volume: number;
  rate: number;
  maxQueue: number;
}

export const DEFAULT_ENGINE_SETTINGS: EngineSettings = {
  aiEnabled: true,
  aiOnlyPriority: true,
  aiMinorEvents: false,
  aiBanter: false,
  cooldownSec: 12,
  dailyCap: 200,
  idleBanter: true,
  idleSec: 55,
  volume: 1,
  rate: 1,
  maxQueue: 4,
  voiceEngine: 'gemini',
  ttsDailyCap: 300,
};

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

interface Callbacks {
  onLog: (entry: EngineLogEntry) => void;
  onStatus: (status: EngineStatus) => void;
}

const PRIORITY = new Set(['INSTANT_REPLAY', 'SERIES_VICTORY', 'GAME_RESULT', 'GAME_INTRO']);

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

  constructor(private cb: Callbacks) {}

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
    );
    this.beat();
    this.timers.push(
      window.setInterval(() => this.beat(), 15_000),
      window.setInterval(() => this.idleCheck(), 5_000),
      window.setInterval(() => this.emit(), 1_000),
    );
    this.emit();
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    this.timers.forEach((t) => clearInterval(t));
    this.timers = [];
    this.queue = [];
    stopSpeaking(); // operator pressed Stop — the only time speech is cut
    stopClip();
    this.speaking = null;
    void setDoc(doc(db, COL.live, LIVE_DOC.booth), { online: false, lastBeat: Date.now(), engineId: this.engineId }, { merge: true }).catch(() => {});
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

  private enqueue(ev: GameEvent) {
    if (PRIORITY.has(ev.type)) {
      // Replays/results jump the queue. Minor chatter in progress is never cut
      // mid-sentence: the current caster finishes their line, then the desk
      // moves on to the bigger moment.
      this.queue.unshift(ev);
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
    if (!live || (ev.matchId && live.matchId && ev.matchId !== live.matchId)) {
      void this.markEvent(ev.id, 'skipped');
      this.log(ev, 'skipped', [], 0, 'Event is not for the live match');
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
        const res = await requestCommentary(buildCommentaryPrompt(ev.type, facts, pair, this.recent.map((r) => r.text)));
        lines = res.lines.map((l) => ({ casterId: l.caster, text: l.text }));
        source = 'ai';
        latency = res.latencyMs;
        this.lastError = null;
      } catch (e) {
        const err = e as GeminiError;
        note = `AI fallback: ${err.message}`;
        this.lastError = err.message;
        if (err.status === 429) this.backoffUntil = Date.now() + (err.retryAfterSec ?? 60) * 1000;
      }
    }
    if (!lines.length) {
      // Pre-shoutcast library (built-in + pre-generated), avoiding recent repeats.
      const pick = templateLines(ev, facts, pair, this.library, new Set(this.usedScripts));
      lines = pick.lines;
      this.usedScripts = [...this.usedScripts, ...pick.ids].slice(-160);
    }
    lines = lines
      .map((l, i) => ({ casterId: pair.includes(l.casterId) ? l.casterId : pair[i % 2], text: l.text.trim() }))
      .filter((l) => l.text);

    void this.markEvent(ev.id, 'done');
    if (!lines.length) return;
    this.log(ev, source, lines, latency, note);
    void this.archive(ev, pair, lines, source, latency);

    // One voice at a time: wait for complete silence, leave a short handoff
    // gap, then the next caster speaks. Nobody talks over anybody.
    this.pair = pair;
    await waitUntilQuiet();
    if (await this.speakRealistic(lines, ev.type, source, EVENT_DEFS[ev.type].tier === 'minor')) {
      this.lastSpokeAt = Date.now();
      window.setTimeout(() => {
        if (!this.busy) void this.writeCaption(null);
      }, 1800);
      return;
    }
    for (const [i, line] of lines.entries()) {
      if (!this.running) break;
      if (i > 0 && this.yieldRequested && EVENT_DEFS[ev.type].tier === 'minor') break;
      await waitUntilQuiet();
      if (i > 0) await sleep(HANDOFF_MS);
      await this.say(line, source);
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
    try {
      const clip = await synthesizeExchange(lines, type, this.geminiVoices);
      // Operator pressed Stop while the clip was being generated: stay silent.
      if (!this.running && !isTest) return true;
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
        // End the clip at a speaker hand-off (never mid-sentence) if a bigger moment is waiting.
        (i) => i > 0 && yieldable && this.yieldRequested,
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

  private async say(line: { casterId: string; text: string }, source: 'ai' | 'template') {
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
    });
    this.speaking = null;
    this.emit();
  }

  private idleCheck() {
    const s = this.settings;
    const live = this.live;
    if (!s.idleBanter || !live || live.phase !== 'ingame' || this.busy || this.queue.length) return;
    if (Date.now() - this.lastSpokeAt < s.idleSec * 1000) return;
    const id = uid('idle_');
    this.localIds.add(id);
    this.lastSpokeAt = Date.now();
    this.enqueue({
      id,
      matchId: live.matchId ?? '',
      gameNumber: live.gameNumber,
      type: 'IDLE_BANTER',
      side: null,
      playerId: null,
      playerIgn: null,
      hero: null,
      spell: null,
      note: '',
      data: {},
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
    this.cb.onLog({ id: uid('log_'), at: Date.now(), eventType: ev.type, summary: summarizeEvent(ev, this.live), source, lines, latencyMs, note });
  }

  private emit() {
    this.cb.onStatus({
      running: this.running,
      busy: this.busy,
      speaking: this.speaking,
      queue: this.queue.length,
      aiCallsToday: this.usageToday(),
      cooldownLeftMs: Math.max(0, this.settings.cooldownSec * 1000 - (Date.now() - this.lastAiAt), this.backoffUntil - Date.now()),
      lastError: this.lastError,
      ttsCallsToday: ttsUsageToday(),
      voiceNote: this.ttsNote,
    });
  }
}
