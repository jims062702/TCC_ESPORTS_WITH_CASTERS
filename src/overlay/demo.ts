import { useMemo } from 'react';
import type { Banner, CaptionState, LivePlayer, LiveState, Role, BattleSpell } from '@/types';
import { useCaption, useLive, useNow } from '@/hooks/useFirestore';
import { DRAFT_SEQUENCE } from '@/lib/constants';
import { defaultLive } from '@/services/live';
import { flag, useQuery } from './query';

// ─────────────────────────────────────────────────────────────────────────────
// Overlay demo mode: add ?demo=1 to any overlay URL to see it with sample
// data (teams, draft, KDA, gold, rotating banners and caster captions) — for
// positioning sources in OBS before any series is on air. Without ?demo=1 the
// overlays stay transparent until the controller puts a series on air.
// ─────────────────────────────────────────────────────────────────────────────

export const useDemoFlag = () => flag(useQuery(), 'demo', false);

const BLUE: Array<[string, Role, string, BattleSpell]> = [
  ['Kidlat', 'EXP', 'Fredrinn', 'Vengeance'],
  ['Bagwis', 'Jungle', 'Ling', 'Retribution'],
  ['Sinag', 'Mid', 'Valentina', 'Flicker'],
  ['Halimaw', 'Gold', 'Claude', 'Inspire'],
  ['Tikbalang', 'Roam', 'Tigreal', 'Petrify'],
];
const RED: Array<[string, Role, string, BattleSpell]> = [
  ['Alon', 'EXP', 'Terizla', 'Vengeance'],
  ['Bagyo', 'Jungle', 'Lancelot', 'Retribution'],
  ['Dagat', 'Mid', 'Pharsa', 'Flicker'],
  ['Pating', 'Gold', 'Beatrix', 'Flicker'],
  ['Kugita', 'Roam', 'Khufra', 'Flicker'],
];
const BANS = { blue: ['Fanny', 'Joy', 'Chou', 'Nolan', 'Harith'], red: ['Arlott', 'Cici', 'Zhuxin', 'Yin', 'Gloo'] };
const KDA = { blue: [[3, 1, 6], [6, 0, 4], [2, 2, 7], [5, 1, 3], [0, 2, 11]], red: [[1, 4, 3], [3, 3, 2], [2, 4, 1], [3, 2, 2], [0, 3, 5]] };

const player = ([ign, role, hero, spell]: (typeof BLUE)[number], i: number, teamId: string, now: number, side: 'blue' | 'red'): LivePlayer => ({
  playerId: `${teamId}-${i}`,
  teamId,
  ign,
  photoUrl: '',
  role,
  hero,
  spell,
  // one spell per team cycling through its cooldown so the ring is visible
  spellReadyAt: i === 1 ? now + (30_000 - (now % 30_000)) : null,
  k: KDA[side][i][0],
  d: KDA[side][i][1],
  a: KDA[side][i][2],
  fb: i === 1 ? 1 : 0,
  dk: 0,
  tk: 0,
  maniac: 0,
  savage: 0,
  lords: 0,
  turtles: 0,
});

function demoBanner(now: number, blue: LivePlayer[]): Banner {
  const slot = Math.floor(now / 7000);
  const at = slot * 7000;
  const list: Omit<Banner, 'at' | 'id'>[] = [
    { type: 'FIRST_BLOOD', title: 'FIRST BLOOD', subtitle: 'Bagwis · Ling — Manila Mavericks', side: 'blue', ign: blue[1].ign, hero: 'Ling', teamName: 'Manila Mavericks', teamLogo: '' },
    { type: 'OBJECTIVE_CONTEST', title: 'LORD CONTEST', subtitle: 'Sino kaya ang makakakuha ng Lord?', side: null, teamName: null, teamLogo: null },
    { type: 'LORD', title: 'LORD STEAL!', subtitle: 'Slain by Bagyo — Cebu Krakens', side: 'red', ign: 'Bagyo', hero: 'Lancelot', teamName: 'Cebu Krakens', teamLogo: '' },
    { type: 'SAVAGE', title: 'SAVAGE', subtitle: 'Halimaw · Claude — Manila Mavericks', side: 'blue', ign: 'Halimaw', hero: 'Claude', teamName: 'Manila Mavericks', teamLogo: '' },
  ];
  return { ...list[slot % list.length], id: `demo-${slot}`, at };
}

export function demoLive(now: number): LiveState {
  const base = defaultLive();
  const blue = BLUE.map((p, i) => player(p, i, 'demo-a', now, 'blue'));
  const red = RED.map((p, i) => player(p, i, 'demo-b', now, 'red'));
  // Draft: first 13 steps locked, step 14 active, 30 s timer looping.
  const draft = { ...base.draft, step: 13, timerDuration: 30, timerEndsAt: (Math.floor(now / 30_000) + 1) * 30_000 };
  const counters = { blue: { ban: 0, pick: 0 }, red: { ban: 0, pick: 0 } };
  for (const s of DRAFT_SEQUENCE.slice(0, 13)) {
    const i = counters[s.side][s.kind]++;
    if (s.kind === 'ban') draft[`${s.side}Bans`][i] = BANS[s.side][i];
    else draft[`${s.side}Picks`][i] = (s.side === 'blue' ? BLUE : RED)[i][2];
  }
  const replayStart = now - (now % 10_000);
  return {
    ...base,
    matchId: 'demo',
    tournamentId: 'demo',
    tournamentName: 'TCC Invitational',
    matchLabel: 'Upper Final',
    isFinal: false,
    format: 'BO5',
    scoreA: 2,
    scoreB: 1,
    gameNumber: 4,
    teamA: { id: 'demo-a', name: 'Manila Mavericks', tag: 'MNL', logoUrl: '' },
    teamB: { id: 'demo-b', name: 'Cebu Krakens', tag: 'CBK', logoUrl: '' },
    blueIsA: true,
    phase: 'ingame',
    draft,
    blue: { turtles: 2, lords: 1, players: blue, coach: { name: 'Coach Duckey', photoUrl: '' } },
    red: { turtles: 0, lords: 1, players: red, coach: null },
    goldDiff: 2450,
    gameStartedAt: now - 9 * 60_000,
    casters: ['ken', 'lyka'],
    replay: { active: true, startedAt: replayStart, endsAt: replayStart + 10_000, title: 'LORD STEAL — Bagyo', description: 'Flickers over the wall and lands the last hit', side: 'red', eventId: 'demo-replay' },
    banner: demoBanner(now, blue),
    breakEndsAt: (Math.floor(now / 300_000) + 1) * 300_000,
    breakMessage: 'Game 4 starts soon',
    updatedAt: now,
  };
}

const DEMO_LINES: Array<[string, string]> = [
  ['ken', 'LORD STEAL! ANO BA YAN! Inagaw ng Cebu Krakens ang Lord!'],
  ['lyka', 'Lamang pa rin ang Manila Mavericks ng 2.5k gold. Numbers don’t lie.'],
  ['ken', 'Sino kaya ang makakakuha ng Turtle? Mainit na ang laban!'],
  ['lyka', 'Kills: Manila Mavericks 16, Cebu Krakens 9. Kontrolado nila ang tempo.'],
];

export function demoCaption(now: number): CaptionState {
  const slot = Math.floor(now / 4500);
  const [casterId, text] = DEMO_LINES[slot % DEMO_LINES.length];
  return { current: { casterId, text, at: slot * 4500, source: 'template' }, recent: [], updatedAt: now };
}

/** Live state for overlays: real data, or sample data with ?demo=1. */
export function useOverlayLive(): { live: LiveState; demo: boolean } {
  const demo = useDemoFlag();
  const real = useLive();
  const now = useNow(demo ? 1000 : 60_000);
  const live = useMemo(() => (demo ? demoLive(now) : real.data), [demo, now, real.data]);
  return { live, demo };
}

/** Caster captions for overlays: real (live/caption) or rotating sample lines with ?demo=1. */
export function useOverlayCaption(): CaptionState | null {
  const demo = useDemoFlag();
  const real = useCaption();
  const now = useNow(demo ? 1000 : 60_000);
  return demo ? demoCaption(now) : real.data;
}
