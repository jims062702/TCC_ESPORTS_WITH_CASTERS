// ─────────────────────────────────────────────────────────────────────────────
// Broadcast sound — 100% generated in the browser with WebAudio (original,
// royalty-free, no files to host). Played by the OBS browser sources, so it
// lands in the stream through OBS ("Control audio via OBS" on the source).
//
//  • stingers: draft start, game start, into instant replay, back to the game
//  • break music: an intense 140 BPM gaming track, exactly 5:00 long, that
//    loops seamlessly for breaks of 10 minutes or more
//
// OBS allows audio without a click. In a normal browser tab, click once to
// enable sound (browser autoplay rule).
// ─────────────────────────────────────────────────────────────────────────────

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let noise: AudioBuffer | null = null;

function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    comp.attack.value = 0.004;
    comp.release.value = 0.2;
    master = ctx.createGain();
    master.gain.value = 0.9;
    master.connect(comp).connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // Browsers keep audio suspended until a click; OBS doesn't.
    const resume = () => void ctx?.resume();
    window.addEventListener('pointerdown', resume, { once: false });
    window.addEventListener('keydown', resume, { once: false });
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export const audioBlocked = () => Boolean(ctx && ctx.state !== 'running');

// ── tiny synth helpers ──────────────────────────────────────────────────────

function env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function osc(type: OscillatorType, freq: number, t: number, dur: number, peak: number, out: AudioNode, attack = 0.005, detune = 0) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  o.detune.value = detune;
  env(g, t, peak, attack, dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
  return o;
}

function noiseHit(t: number, dur: number, peak: number, out: AudioNode, filter: BiquadFilterType, freq: number, q = 0.8) {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noise;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  env(g, t, peak, 0.002, dur);
  s.connect(f).connect(g).connect(out);
  s.start(t, Math.random());
  s.stop(t + dur + 0.05);
  return f;
}

function kick(t: number, out: AudioNode, peak = 1) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.frequency.setValueAtTime(160, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
  env(g, t, peak, 0.002, 0.38);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + 0.45);
  noiseHit(t, 0.02, 0.25 * peak, out, 'highpass', 3000);
}

function clap(t: number, out: AudioNode, peak = 0.55) {
  for (const dt of [0, 0.011, 0.022]) noiseHit(t + dt, 0.16, peak, out, 'bandpass', 1500, 1.2);
  osc('triangle', 190, t, 0.08, peak * 0.4, out);
}

function hat(t: number, out: AudioNode, open = false, peak = 0.16) {
  noiseHit(t, open ? 0.18 : 0.035, peak, out, 'highpass', open ? 7000 : 9000, 0.5);
}

function crash(t: number, out: AudioNode, peak = 0.35) {
  noiseHit(t, 1.8, peak, out, 'highpass', 4500, 0.4);
}

/** Noise + tone sweep up (or down) — risers and whooshes. */
function sweep(t: number, dur: number, from: number, to: number, peak: number, out: AudioNode) {
  const c = ctx!;
  const s = c.createBufferSource();
  s.buffer = noise;
  s.loop = true;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 3;
  f.frequency.setValueAtTime(from, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.85);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out);
  s.start(t);
  s.stop(t + dur + 0.05);
  const o = c.createOscillator();
  const og = c.createGain();
  o.type = 'sawtooth';
  o.frequency.setValueAtTime(from / 8, t);
  o.frequency.exponentialRampToValueAtTime(to / 8, t + dur);
  og.gain.setValueAtTime(0.0001, t);
  og.gain.exponentialRampToValueAtTime(peak * 0.25, t + dur * 0.9);
  og.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(og).connect(out);
  o.start(t);
  o.stop(t + dur + 0.05);
}

const midi = (n: number) => 440 * 2 ** ((n - 69) / 12);

/** Fat detuned chord stab through a low-pass filter. */
function stab(t: number, notes: number[], dur: number, peak: number, out: AudioNode, cutoff = 2400) {
  const c = ctx!;
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(cutoff, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff / 4), t + dur);
  f.connect(out);
  for (const n of notes) for (const d of [-9, 9]) osc('sawtooth', midi(n), t, dur, peak / notes.length, f, 0.01, d);
}

// ── stingers ────────────────────────────────────────────────────────────────

export type Stinger = 'draft' | 'game' | 'replayIn' | 'replayOut';

export function playStinger(kind: Stinger, volume = 0.8) {
  const c = audio();
  if (!c || !master) return;
  const out = c.createGain();
  out.gain.value = volume;
  out.connect(master);
  const t = c.currentTime + 0.03;
  if (kind === 'draft') {
    // "The draft is on": riser → impact → minor chord hit with an echo.
    sweep(t, 1.1, 400, 5000, 0.35, out);
    kick(t + 1.1, out, 1);
    crash(t + 1.1, out, 0.3);
    stab(t + 1.1, [57, 60, 64, 69], 1.4, 0.5, out, 3200);
    stab(t + 1.5, [57, 60, 64], 0.9, 0.18, out, 1800);
    osc('sine', 55, t + 1.1, 1.2, 0.5, out);
  } else if (kind === 'game') {
    // "Game on": three accelerating hits, big impact, power chord + crash.
    [0, 0.32, 0.56, 0.72].forEach((dt, i) => kick(t + dt, out, 0.6 + i * 0.12));
    [0, 0.32, 0.56].forEach((dt) => clap(t + dt + 0.16, out, 0.25));
    sweep(t, 0.95, 300, 6000, 0.3, out);
    const hit = t + 0.95;
    kick(hit, out, 1.1);
    crash(hit, out, 0.45);
    stab(hit, [45, 52, 57, 64, 69], 2.2, 0.7, out, 4200);
    osc('sine', 55, hit, 1.8, 0.6, out);
    stab(hit + 0.55, [48, 55, 60, 67], 0.5, 0.25, out, 2600);
    stab(hit + 0.85, [50, 57, 62, 69], 1.2, 0.3, out, 2600);
  } else if (kind === 'replayIn') {
    // Tape-rewind whoosh into the replay.
    sweep(t, 0.7, 6000, 250, 0.35, out);
    osc('sawtooth', 880, t, 0.55, 0.12, out).frequency.exponentialRampToValueAtTime(110, t + 0.55);
    kick(t + 0.62, out, 0.8);
    stab(t + 0.62, [57, 64, 69], 0.7, 0.3, out, 2000);
  } else {
    // Whoosh back to the live game.
    sweep(t, 0.6, 250, 7000, 0.35, out);
    kick(t + 0.6, out, 0.9);
    crash(t + 0.6, out, 0.25);
    stab(t + 0.6, [57, 60, 64, 69], 0.8, 0.35, out, 3000);
  }
}

// ── break music: 140 BPM, 175 bars = exactly 5:00, then loops ──────────────

const BPM = 140;
const STEP = 60 / BPM / 4; // 16th note
const BARS = 175;
export const BREAK_TRACK_SECONDS = (BARS * 16 * STEP) | 0; // 300

type Section = 'intro' | 'build' | 'dropA' | 'dropB' | 'breakdown' | 'bridge' | 'outro';
const PLAN: [Section, number][] = [
  ['intro', 8], ['build', 8], ['dropA', 16], ['breakdown', 8], ['build', 8], ['dropB', 16],
  ['bridge', 16], ['build', 8], ['dropA', 16], ['breakdown', 8], ['build', 8], ['dropB', 16],
  ['bridge', 16], ['build', 4], ['dropA', 16], ['outro', 3],
];
const SECTION_AT: { section: Section; barInSection: number; length: number }[] = PLAN.flatMap(([section, n]) =>
  Array.from({ length: n }, (_, i) => ({ section, barInSection: i, length: n })),
);

// i – VI – III – VII in A minor; the bridge darkens to iv – i – VI – V.
const MAIN = [
  { root: 45, chord: [57, 60, 64] }, // Am
  { root: 41, chord: [53, 57, 60] }, // F
  { root: 48, chord: [55, 60, 64] }, // C
  { root: 43, chord: [55, 59, 62] }, // G
];
const BRIDGE = [
  { root: 50, chord: [53, 57, 62] }, // Dm
  { root: 45, chord: [57, 60, 64] }, // Am
  { root: 41, chord: [53, 57, 60] }, // F
  { root: 40, chord: [56, 59, 64] }, // E
];
// Lead motifs (scale degrees as MIDI offsets from the chord's top note), one per bar of a 4-bar phrase.
const LEAD_A = [[0, null, 3, null, 5, 3, 0, null, 7, null, 5, null, 3, null, 0, null], [0, null, 2, null, 3, 2, 0, null, -2, null, 0, null, 2, null, null, null]];
const LEAD_B = [[7, 5, 7, null, 10, null, 7, 5, 3, null, 5, null, 7, null, null, null], [3, null, 5, 3, 0, null, -2, null, 0, null, 3, null, 5, null, 7, null]];

export class BreakMusic {
  private out: GainNode | null = null;
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;
  private filter: BiquadFilterNode | null = null;
  playing = false;

  start(volume = 0.6) {
    const c = audio();
    if (!c || !master || this.playing) return;
    this.playing = true;
    this.out = c.createGain();
    this.out.gain.setValueAtTime(0.0001, c.currentTime);
    this.out.gain.exponentialRampToValueAtTime(volume, c.currentTime + 1.5);
    this.out.connect(master);
    this.filter = c.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 1200;
    this.filter.connect(this.out);
    this.step = 0;
    this.nextTime = c.currentTime + 0.1;
    // Look-ahead scheduler: steady timing even if the page is busy.
    this.timer = window.setInterval(() => this.schedule(), 25);
  }

  stop(fade = 1.5) {
    if (!this.playing || !ctx || !this.out) return;
    this.playing = false;
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
    const out = this.out;
    out.gain.cancelScheduledValues(ctx.currentTime);
    out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), ctx.currentTime);
    out.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + fade);
    setTimeout(() => out.disconnect(), fade * 1000 + 200);
    this.out = null;
  }

  private schedule() {
    const c = ctx!;
    while (this.nextTime < c.currentTime + 0.12) {
      this.playStep(this.step, this.nextTime);
      this.step = (this.step + 1) % (BARS * 16); // seamless loop after 5:00
      this.nextTime += STEP;
    }
  }

  private playStep(step: number, t: number) {
    const out = this.out;
    const lp = this.filter;
    if (!out || !lp) return;
    const bar = Math.floor(step / 16);
    const s = step % 16;
    const { section, barInSection, length } = SECTION_AT[bar];
    const prog = section === 'bridge' ? BRIDGE : MAIN;
    const ch = prog[bar % 4];
    const drop = section === 'dropA' || section === 'dropB';
    const building = section === 'build';
    const lastBars = length - barInSection;

    // Filter: closed in intro/breakdown, opening through builds, wide open on drops.
    if (s === 0) {
      const target = drop ? 9000 : section === 'bridge' ? 4200 : building ? 1200 + (barInSection / length) * 6000 : section === 'outro' ? 900 : 1400;
      lp.frequency.setTargetAtTime(target, t, building ? 0.6 : 0.15);
    }

    // Drums
    if (drop) {
      if (s % 4 === 0) kick(t, out, 0.95);
      if (s === 4 || s === 12) clap(t, out);
      hat(t, out, s % 4 === 2, s % 2 ? 0.08 : 0.14);
      if (s === 0 && barInSection === 0) crash(t, out);
    } else if (section === 'bridge') {
      if (s === 0 || s === 6 || s === 10) kick(t, out, 0.85);
      if (s === 8) clap(t, out, 0.6);
      if (s % 2 === 0) hat(t, out, false, 0.09);
    } else if (building) {
      const fourOnFloor = barInSection >= length / 2;
      if (fourOnFloor && s % 4 === 0) kick(t, out, 0.8);
      if (s % 2 === 0) hat(t, out, false, 0.07 + (barInSection / length) * 0.07);
      // Snare roll speeds up in the last 2 bars.
      if (lastBars <= 2) {
        const every = lastBars === 1 ? 1 : 2;
        if (s % every === 0) clap(t, out, 0.15 + (s / 16) * 0.3);
      } else if (s === 4 || s === 12) clap(t, out, 0.3);
      if (barInSection === length - 4 && s === 0) sweep(t, STEP * 16 * 4, 300, 7000, 0.22, out);
    } else if (section === 'intro' || section === 'breakdown') {
      if (s % 4 === 2) hat(t, out, false, 0.06);
      if (section === 'intro' && barInSection >= 4 && s === 0) kick(t, out, 0.5);
    } else if (section === 'outro' && s % 4 === 0) {
      kick(t, out, 0.5);
    }

    // Bass: off-beat pump on drop A, rolling 16ths on drop B / bridge.
    const bassNote = midi(ch.root - 12);
    if (section === 'dropA' && s % 4 === 2) osc('sawtooth', bassNote, t, STEP * 1.6, 0.28, lp, 0.004);
    if ((section === 'dropB' || section === 'bridge') && s % 4 !== 0) osc('sawtooth', bassNote * (s % 8 === 6 ? 2 : 1), t, STEP * 0.8, 0.22, lp, 0.003);
    if (building && s % 2 === 0) osc('square', bassNote, t, STEP * 0.6, 0.08 + (barInSection / length) * 0.1, lp, 0.003);
    if ((drop || section === 'bridge') && s % 4 === 0) osc('sine', bassNote, t, STEP * 3, 0.35, out, 0.004);

    // Pad: every bar, softer on drops.
    if (s === 0 && section !== 'outro') stab(t, ch.chord, STEP * 15, drop ? 0.12 : 0.2, lp, drop ? 2400 : 1500);

    // Arp: 16ths across the chord (up two octaves), everywhere except the outro.
    if (section !== 'outro') {
      const tones = [...ch.chord, ...ch.chord.map((n) => n + 12)];
      const order = [0, 1, 2, 3, 4, 5, 4, 3, 2, 1, 2, 3, 4, 5, 4, 3];
      const n = tones[order[s] % tones.length] + 12;
      osc('square', midi(n), t, STEP * 0.7, drop ? 0.05 : 0.07, lp, 0.002);
    }

    // Lead melody on the drops.
    if (drop) {
      const motif = (section === 'dropA' ? LEAD_A : LEAD_B)[Math.floor(barInSection / 2) % 2];
      const off = motif[s];
      if (off !== null && off !== undefined) {
        const top = ch.chord[2] + 12;
        osc('sawtooth', midi(top + off), t, STEP * 1.8, 0.09, out, 0.006, -7);
        osc('sawtooth', midi(top + off), t, STEP * 1.8, 0.09, out, 0.006, 7);
      }
    }
  }
}

/** Shared player for overlays and the admin sound check. */
export const breakMusic = new BreakMusic();
