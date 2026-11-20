import { useRef, useState } from 'react';
import { Crown, Footprints, Droplet, Flame, HelpCircle, Leaf, Minus, Plus, Shell, Skull, Swords, Target, Trophy } from 'lucide-react';
import type { BuffColor, EventType, GameEvent, LiveState, Player, Side } from '@/types';
import { BATTLE_SPELLS, EVENT_DEFS, SPELL_COOLDOWN } from '@/lib/constants';
import {
  MAX_LEVEL,
  adjustObjective,
  adjustPlayerStat,
  changeLevel,
  endGame,
  replaceLineupPlayer,
  triggerEvent,
  updatePlayer,
} from '@/services/live';
import { sideTeam } from '@/services/facts';
import { useNow } from '@/hooks/useFirestore';
import { Avatar } from '@/components/Brand';
import { HeroInput, SpellBadge } from '@/components/game';
import { Button, Card, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { BattlefieldControls } from './BattlefieldControls';
import { useConfirm } from '@/components/Confirm';
import { cn } from '@/lib/utils';
import { formatClock, gameElapsedMs } from '@/lib/clock';
import { encodeVictims } from '@/services/live';
import { ReplayTrigger } from './ReplayTrigger';
import { PlayerPicker, type PickRequest } from './PlayerPicker';
import { AnnouncementsCard, PauseCard } from './BreakControls';

interface Actor {
  side: Side;
  index: number;
}

/** Kill-streak calls and how many kills each adds to the player. */
const KILL_EVENTS: { type: EventType; icon: typeof Swords; tone: string; kills: number }[] = [
  { type: 'FIRST_BLOOD', icon: Droplet, tone: 'from-rose-500 to-crimson-700', kills: 1 },
  { type: 'DOUBLE_KILL', icon: Swords, tone: 'from-orange-500 to-crimson-600', kills: 2 },
  { type: 'TRIPLE_KILL', icon: Swords, tone: 'from-amber-500 to-orange-600', kills: 3 },
  { type: 'MANIAC', icon: Skull, tone: 'from-fuchsia-500 to-crimson-700', kills: 4 },
  { type: 'SAVAGE', icon: Flame, tone: 'from-crimson-500 to-crimson-900', kills: 5 },
];

const BUFFS: { color: BuffColor; label: string; className: string }[] = [
  { color: 'purple', label: 'Purple Buff', className: 'border-violet-500/60 text-violet-600 hover:bg-violet-500/10 dark:text-violet-300' },
  { color: 'orange', label: 'Orange Buff', className: 'border-orange-500/60 text-orange-600 hover:bg-orange-500/10 dark:text-orange-300' },
];

export function GamePanel({ live, players }: { live: LiveState; players: Player[] }) {
  const toast = useToast();
  const ask = useConfirm();
  const now = useNow(500);
  const [actor, setActor] = useState<Actor | null>(null);
  /** "Who got it?" picker for kill streaks and objectives. */
  const [pick, setPick] = useState<(PickRequest & { type: EventType; data?: GameEvent['data']; killer?: { side: Side; index: number }; continuation?: boolean }) | null>(null);
  /** After a Savage: 10 seconds to add more kills for that player (+1 per extra victim, no second Savage). */
  const [savageCont, setSavageCont] = useState<{ side: Side; index: number; until: number } | null>(null);
  const contLeft = savageCont ? Math.max(0, Math.ceil((savageCont.until - now) / 1000)) : 0;
  const contActive = Boolean(savageCont && contLeft > 0);
  const totalKills = [...live.blue.players, ...live.red.players].reduce((n, p) => n + p.k, 0);
  const firstBloodDone = totalKills > 0 || [...live.blue.players, ...live.red.players].some((p) => p.fb > 0);
  const liveRef = useRef(live);
  liveRef.current = live;
  const STREAK_MAX: Partial<Record<EventType, number>> = { FIRST_BLOOD: 1, DOUBLE_KILL: 2, TRIPLE_KILL: 3, MANIAC: 4, SAVAGE: 5 };
  const blue = sideTeam(live, 'blue');
  const red = sideTeam(live, 'red');

  const actorPlayer = actor ? live[actor.side].players[actor.index] : null;

  const fire = async (type: EventType, side: Side | null, data?: GameEvent['data'], playerIndex: number | null = null, steal = false) => {
    const isObjective = type === 'TURTLE' || type === 'LORD' || type === 'BUFF';
    await toast.run(() => triggerEvent(live, type, { side, playerIndex, steal: isObjective && steal, data }));
  };

  /** Click an event → choose who got it (kill streaks: any player; objectives: that side's players). */
  const askKill = (type: EventType) => {
    // Savage within the 10-second window: just add the extra victims for that player.
    if (type === 'SAVAGE' && contActive && savageCont) {
      const victimSide: Side = savageCont.side === 'blue' ? 'red' : 'blue';
      return setPick({ type, killer: { side: savageCont.side, index: savageCont.index }, continuation: true, sides: [victimSide], multi: { max: 5 }, title: `Savage continues — ${live[savageCont.side].players[savageCont.index]?.ign} killed who?` });
    }
    setPick({ type, title: `${EVENT_DEFS[type].label} — who got it?`, sides: ['blue', 'red'] });
  };
  /** +1 Kill: first the killer, then who they killed (killer +1 kill, victim +1 death). */
  const askSingleKill = () => setPick({ type: 'KILL', title: firstBloodDone ? '+1 Kill — who got the kill?' : 'First Blood (first kill of the game) — who got it?', sides: ['blue', 'red'] });
  const askObjective = (type: EventType, side: Side, label: string, data?: GameEvent['data']) =>
    setPick({ type, data, title: `${label} — slain by? (${(side === 'blue' ? blue : red)?.name ?? side})`, sides: [side], objective: true });

  /** One click on a spell: starts its cooldown timer and the casters call it. Click again to reset the timer. */
  const spellClick = (side: Side, i: number) => {
    const p = live[side].players[i];
    if (!p) return;
    if (!p.spell) return toast.error(`Set ${p.ign}'s battle spell first (Drafting phase, or the spell menu here).`);
    if (p.spellReadyAt && p.spellReadyAt > Date.now()) return toast.run(() => updatePlayer(live, side, i, { spellReadyAt: null, spellUsedAt: null }));
    return toast.run(() => triggerEvent(live, 'SPELL_USED', { side, playerIndex: i }));
  };

  /** + Level asks first (Level 15 records the best time); − fixes a mistake. */
  const levelClick = async (side: Side, i: number, delta: 1 | -1) => {
    const p = liveRef.current[side].players[i];
    if (!p) return;
    const lv = p.level ?? 1;
    if (delta > 0) {
      if (lv >= MAX_LEVEL) return toast.error(`${p.ign} is already Level ${MAX_LEVEL} (max).`);
      const to = lv + 1;
      const at = formatClock(gameElapsedMs(liveRef.current, Date.now()));
      const ok = await ask({
        title: `Level up ${p.ign}?`,
        message: to === MAX_LEVEL ? `${p.ign} reaches Level 15 (max) at ${at}. The HUD shows the time — a new best time slashes the old record — and the casters call it.` : `Level ${lv} → Level ${to}.`,
        confirmLabel: `Level ${to}`,
      });
      if (!ok) return;
    }
    // The latest live state (the dialog may have stayed open a while).
    void toast.run(() => changeLevel(liveRef.current, side, i, delta));
  };

  const contest = async (objective: 'Turtle' | 'Lord' | 'Purple Buff' | 'Orange Buff') => {
    if (!(await ask({ title: `${objective} fight?`, message: `The casters call it — "Sino kaya ang makakakuha ng ${objective}?" — and the banner shows on stream.`, confirmLabel: 'Call it' }))) return;
    void toast.run(() => triggerEvent(live, 'OBJECTIVE_CONTEST', { side: null, data: { objective } }));
  };
  const turret = async (side: Side, tier: string) => {
    const team = side === 'blue' ? blue : red;
    if (!(await ask({ title: `${tier} turret destroyed?`, message: `${team?.name ?? side} destroyed the ${tier.toLowerCase()} turret${live.mapEffect === 'goldenTurret' ? ' — Golden Turret bonus gold for the whole team' : ''}.`, confirmLabel: 'Confirm' }))) return;
    void fire('TURRET', side, { tier });
  };
  const invade = async (side: Side, target: 'jungle' | 'buff') => {
    const team = side === 'blue' ? blue : red;
    if (!(await ask({ title: target === 'buff' ? 'Buff invade?' : 'Invade?', message: `${team?.name ?? side} ${target === 'buff' ? 'is going for the enemy buff' : 'is invading the enemy jungle (creeps)'} — the casters call it.`, confirmLabel: 'Call it' }))) return;
    void fire('INVADE', side, { target });
  };

  const finish = async (side: Side) => {
    const team = side === 'blue' ? blue : red;
    if (!(await ask({ title: `${team?.name ?? side} wins?`, message: `Records ${team?.name ?? side} as the winner of Game ${live.gameNumber}.`, confirmLabel: 'Confirm winner' }))) return;
    const res = await toast.run(() => endGame(live, side));
    if (res) toast.success(res.seriesOver ? (res.isChampionship ? 'Champions crowned! 🏆' : 'Series complete — bracket updated') : 'Game recorded');
  };

  const teamKills = (side: Side) => live[side].players.reduce((n, p) => n + p.k, 0);

  return (
    <div className="space-y-5">
      <PlayerPicker
        live={live}
        request={pick}
        onClose={() => setPick(null)}
        onPickMany={(victimSide, indexes) => {
          const p = pick;
          setPick(null);
          if (!p?.killer) return;
          const victims = encodeVictims(indexes.map((index) => ({ side: victimSide, index })));
          void fire(p.type, p.killer.side, { victims, ...(p.continuation ? { continuation: true } : {}) }, p.killer.index);
          if (p.type === 'SAVAGE') setSavageCont({ ...p.killer, until: Date.now() + 10_000 });
        }}
        onPick={(side, index, steal) => {
          const p = pick;
          // Kill streaks: after the killer, choose who died (First Blood: one player).
          const max = p ? STREAK_MAX[p.type] : undefined;
          if (p && max && !p.killer && index !== null) {
            const victimSide: Side = side === 'blue' ? 'red' : 'blue';
            const ign = live[side].players[index]?.ign ?? 'Killer';
            return setPick({
              ...p,
              killer: { side, index },
              sides: [victimSide],
              title: max === 1 ? `First Blood — ${ign} killed who?` : `${EVENT_DEFS[p.type].label} — ${ign} killed who? (up to ${max})`,
              multi: max > 1 ? { max, preselectAll: p.type === 'SAVAGE' } : undefined,
            });
          }
          if (p && max === 1 && p.killer && index !== null) {
            setPick(null);
            return void fire(p.type, p.killer.side, { victims: encodeVictims([{ side, index }]) }, p.killer.index);
          }
          if (p?.type === 'KILL' && !p.killer && index !== null) {
            const victimSide: Side = side === 'blue' ? 'red' : 'blue';
            return setPick({ ...p, killer: { side, index }, sides: [victimSide], title: `${live[side].players[index]?.ign ?? 'Killer'} killed… who?` });
          }
          setPick(null);
          // 0 - 0 on the scoreboard: the first kill is First Blood.
          if (p?.type === 'KILL' && p.killer && index !== null && !firstBloodDone) return void fire('FIRST_BLOOD', p.killer.side, { victims: encodeVictims([{ side, index }]) }, p.killer.index);
          if (p?.type === 'KILL' && p.killer && index !== null) return void fire('KILL', p.killer.side, { victimSide: side, victimIndex: index }, p.killer.index);
          if (p) void fire(p.type, side, p.data, index, steal);
        }}
      />
      <div className="grid gap-5 2xl:grid-cols-2">
        {(['blue', 'red'] as const).map((side) => {
          const team = side === 'blue' ? blue : red;
          const roster = players.filter((p) => p.teamId === team?.id);
          return (
            <Card
              key={side}
              className={side === 'blue' ? 'border-sky-500/40' : 'border-brand/40'}
              title={
                <span className={side === 'blue' ? 'text-sky-500' : 'text-brand'}>
                  {team?.name ?? side} <span className="text-fg">· {teamKills(side)}</span>
                </span>
              }
              actions={
                <div className="flex items-center gap-3 text-sm">
                  <Counter icon={<Shell className="h-4 w-4" />} label="Turtle" value={live[side].turtles} onChange={(d) => toast.run(() => adjustObjective(live, side, 'turtles', d))} />
                  <Counter icon={<Crown className="h-4 w-4" />} label="Lord" value={live[side].lords} onChange={(d) => toast.run(() => adjustObjective(live, side, 'lords', d))} />
                </div>
              }
            >
              {/* Phones: one block per player — name + hero, then spell and K / D / A */}
              <div className="space-y-2 md:hidden" data-testid={`mobile-players-${side}`}>
                {live[side].players.map((p, i) => {
                  const selected = actor?.side === side && actor.index === i;
                  return (
                    <div key={`m-${p.playerId}-${i}`} className={cn('rounded-xl border border-line p-2', selected && 'border-brand bg-brand/10')}>
                      <div className="flex items-center gap-2">
                        <button onClick={() => setActor(selected ? null : { side, index: i })} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                          <Avatar url={p.photoUrl} name={p.ign} size={32} />
                          <span className="min-w-0">
                            <span className="block truncate font-semibold">{p.ign}</span>
                            <span className="block text-[11px] text-muted">{p.role}</span>
                          </span>
                        </button>
                        <div className="w-[46%] shrink-0">
                          <HeroCell value={p.hero} picks={live.draft[`${side}Picks`]} onSave={(hero) => toast.run(() => updatePlayer(live, side, i, { hero }))} />
                        </div>
                      </div>
                      <div className="mt-2 grid grid-cols-[auto_1fr_1fr_1fr] items-center gap-1">
                        <button
                          title={!p.spell ? 'Battle spell not set' : p.spellReadyAt && p.spellReadyAt > now ? 'On cooldown — tap to reset the timer' : `${p.spell} used: start the countdown + casters call it`}
                          onClick={() => spellClick(side, i)}
                          className="shrink-0"
                        >
                          <SpellBadge spell={p.spell} readyAt={p.spellReadyAt} usedAt={p.spellUsedAt} now={now} size={34} />
                        </button>
                        {(['k', 'd', 'a'] as const).map((key) => (
                          <div key={key} className="flex min-w-0 items-center justify-between rounded-lg border border-line">
                            <button className="flex h-9 w-7 shrink-0 items-center justify-center text-muted active:bg-surface2" onClick={() => toast.run(() => adjustPlayerStat(live, side, i, key, -1))} aria-label={`- ${key}`}>
                              <Minus className="h-4 w-4" />
                            </button>
                            <span className="min-w-0 text-center leading-none">
                              <span className="block font-display text-xl tabular">{p[key]}</span>
                              <span className="block font-cond text-[9px] font-bold uppercase text-muted">{key}</span>
                            </span>
                            <button className="flex h-9 w-7 shrink-0 items-center justify-center text-muted active:bg-surface2 active:text-brand" onClick={() => toast.run(() => adjustPlayerStat(live, side, i, key, 1))} aria-label={`+ ${key}`}>
                              <Plus className="h-4 w-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                      <LevelControl level={p.level ?? 1} onChange={(d) => void levelClick(side, i, d)} className="mt-2" />
                      {roster.length > 5 && (
                        <Select
                          className="mt-2 h-8 py-0 text-xs"
                          value={p.playerId}
                          onChange={(e) => {
                            const np = roster.find((r) => r.id === e.target.value);
                            if (np) void toast.run(() => replaceLineupPlayer(live, side, i, np));
                          }}
                        >
                          {roster.map((r) => (
                            <option key={r.id} value={r.id}>
                              {r.ign}
                            </option>
                          ))}
                        </Select>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="scrollbar-thin hidden overflow-x-auto md:block">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="table-head">
                      <th className="pb-2 text-left">Player</th>
                      <th className="pb-2 text-left">Hero</th>
                      <th className="pb-2 text-center">Spell</th>
                      <th className="pb-2 text-center">K</th>
                      <th className="pb-2 text-center">D</th>
                      <th className="pb-2 text-center">A</th>
                      <th className="pb-2 text-center">Lv</th>
                    </tr>
                  </thead>
                  <tbody>
                    {live[side].players.map((p, i) => {
                      const selected = actor?.side === side && actor.index === i;
                      return (
                        <tr key={`${p.playerId}-${i}`} className={cn('border-t border-line/70', selected && 'bg-brand/10')}>
                          <td className="py-1.5 pr-2">
                            <button onClick={() => setActor(selected ? null : { side, index: i })} className={cn('flex w-full items-center gap-2 rounded-lg px-1.5 py-1 text-left transition hover:bg-surface2', selected && 'ring-2 ring-brand')}>
                              <Avatar url={p.photoUrl} name={p.ign} size={28} />
                              <span className="min-w-0">
                                <span className="block truncate font-semibold">{p.ign}</span>
                                <span className="block text-[11px] text-muted">{p.role}</span>
                              </span>
                            </button>
                            {roster.length > 5 && (
                              <Select
                                className="mt-1 h-7 py-0 text-xs"
                                value={p.playerId}
                                onChange={(e) => {
                                  const np = roster.find((r) => r.id === e.target.value);
                                  if (np) void toast.run(() => replaceLineupPlayer(live, side, i, np));
                                }}
                              >
                                {roster.map((r) => (
                                  <option key={r.id} value={r.id}>
                                    {r.ign}
                                  </option>
                                ))}
                              </Select>
                            )}
                          </td>
                          <td className="py-1.5 pr-2">
                            <HeroCell value={p.hero} picks={live.draft[`${side}Picks`]} onSave={(hero) => toast.run(() => updatePlayer(live, side, i, { hero }))} />
                          </td>
                          <td className="py-1.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                title={!p.spell ? 'Battle spell not set — pick it here or in the Drafting phase' : p.spellReadyAt && p.spellReadyAt > now ? 'On cooldown — click to reset the timer' : `${p.spell} used: start the ${spellCd(p.spell)}s countdown + casters call it`}
                                onClick={() => spellClick(side, i)}
                              >
                                <SpellBadge spell={p.spell} readyAt={p.spellReadyAt} usedAt={p.spellUsedAt} now={now} size={30} />
                              </button>
                              <Select className="h-7 w-[92px] px-1 py-0 text-xs" value={p.spell ?? ''} onChange={(e) => toast.run(() => updatePlayer(live, side, i, { spell: (e.target.value || null) as typeof p.spell, spellReadyAt: null, spellUsedAt: null }))}>
                                <option value="">—</option>
                                {BATTLE_SPELLS.map((s) => (
                                  <option key={s}>{s}</option>
                                ))}
                              </Select>
                            </div>
                          </td>
                          {(['k', 'd', 'a'] as const).map((key) => (
                            <td key={key} className="py-1.5">
                              <div className="flex items-center justify-center gap-0.5">
                                <button className="rounded p-1 text-muted hover:bg-surface2 hover:text-fg" onClick={() => toast.run(() => adjustPlayerStat(live, side, i, key, -1))} aria-label={`- ${key}`}>
                                  <Minus className="h-3.5 w-3.5" />
                                </button>
                                <span className="w-6 text-center font-display text-xl leading-none tabular">{p[key]}</span>
                                <button className="rounded p-1 text-muted hover:bg-surface2 hover:text-brand" onClick={() => toast.run(() => adjustPlayerStat(live, side, i, key, 1))} aria-label={`+ ${key}`}>
                                  <Plus className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            </td>
                          ))}
                          <td className="py-1.5">
                            <LevelControl level={p.level ?? 1} onChange={(d) => void levelClick(side, i, d)} compact />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card
          title="Event triggers"
          subtitle={
            actorPlayer
              ? `Highlighted: ${actorPlayer.ign} · click an event, then pick the player`
              : 'Click an event → pick who got it → pick who died (Double up to 2, Triple 3, Maniac 4, Savage 5 — only the ones not counted yet). One kill + one death each. Savage keeps a 10 s window for more kills.'
          }
        >
          <button
            onClick={askSingleKill}
            className="mb-2 flex h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-brand/60 font-display text-2xl uppercase leading-none text-brand transition hover:bg-brand/10 active:scale-[0.99]"
          >
            <Swords className="h-5 w-5" /> +1 Kill <span className="font-cond text-xs font-semibold normal-case tracking-wide text-muted">{firstBloodDone ? 'pick the killer, then who died' : '0 - 0: the first kill counts as First Blood'}</span>
          </button>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {KILL_EVENTS.map(({ type, icon: Icon, tone, kills }) => (
              <button
                key={type}
                onClick={() => askKill(type)}
                disabled={type === 'FIRST_BLOOD' && firstBloodDone}
                title={type === 'FIRST_BLOOD' && firstBloodDone ? 'First Blood is already on the scoreboard for this game' : undefined}
                className={cn('flex h-20 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br font-display text-xl uppercase leading-none text-white shadow transition hover:brightness-110 active:scale-95 disabled:opacity-40', tone)}
              >
                <Icon className="h-5 w-5" />
                {type === 'SAVAGE' && contActive ? 'Savage +' : EVENT_DEFS[type].label}
                <span className="font-cond text-xs font-semibold tracking-wider text-white/80">
                  {type === 'FIRST_BLOOD' && firstBloodDone
                    ? 'done'
                    : type === 'SAVAGE' && contActive
                      ? `more kills · ${contLeft}s`
                      : kills === 1
                        ? '+1 kill'
                        : `up to ${kills} kills`}
                </span>
              </button>
            ))}
          </div>

          <ReplayTrigger live={live} />

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(['blue', 'red'] as const).map((side) => (
              <div key={side} className={cn('rounded-xl border p-3', side === 'blue' ? 'border-sky-500/40' : 'border-brand/40')}>
                <p className={cn('mb-2 font-cond text-xs font-semibold uppercase tracking-wider', side === 'blue' ? 'text-sky-500' : 'text-brand')}>{(side === 'blue' ? blue : red)?.name}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button size="sm" variant="secondary" icon={<Shell className="h-4 w-4" />} onClick={() => askObjective('TURTLE', side, 'Turtle')}>
                    Turtle
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Crown className="h-4 w-4" />} onClick={() => askObjective('LORD', side, 'Lord')}>
                    Lord
                  </Button>
                  {BUFFS.map((b) => (
                    <Button key={b.color} size="sm" variant="outline" className={b.className} icon={<Leaf className="h-4 w-4" />} onClick={() => askObjective('BUFF', side, b.label, { buff: b.color })}>
                      {b.label}
                    </Button>
                  ))}
                  <Button size="sm" variant="ghost" className="border border-dashed border-line" icon={<Footprints className="h-4 w-4" />} onClick={() => void invade(side, 'jungle')}>
                    Invade jungle
                  </Button>
                  <Button size="sm" variant="ghost" className="border border-dashed border-line" icon={<Footprints className="h-4 w-4" />} onClick={() => void invade(side, 'buff')}>
                    Invade buff
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Press the side that took it, then pick the player (&ldquo;slain by&rdquo;) — tick <strong>steal</strong> in the same window if it was stolen. The banner shows their photo.
          </p>
          <div className="mt-3 rounded-xl border border-dashed border-line p-3">
            <p className="mb-2 flex items-center gap-1.5 font-cond text-xs font-semibold uppercase tracking-wider text-muted">
              <HelpCircle className="h-3.5 w-3.5" /> Pre-call a contest — &ldquo;Sino kaya ang makakakuha ng…?&rdquo;
            </p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(['Turtle', 'Lord', 'Purple Buff', 'Orange Buff'] as const).map((o) => (
                <Button key={o} size="sm" variant="outline" onClick={() => contest(o)}>
                  {o} fight
                </Button>
              ))}
            </div>
          </div>
          <BattlefieldControls live={live} onTurret={(side, tier) => void turret(side, tier)} onWisp={(side) => void fire('WISP_REVEAL', side)} />
          <p className="mt-3 text-xs text-muted">Battle spells (picked in the Drafting phase): with the spell reader on (Settings → Battle spell cooldowns) used spells start by themselves; otherwise click the spell icon — the countdown starts and the casters call it. Level: + asks first; Level 15 records the best time.</p>

        </Card>

        <div className="space-y-5">
        <AnnouncementsCard live={live} />
        <PauseCard live={live} players={players} />
        <Card title="End game" subtitle="Who won this game — records stats, updates the series and the bracket.">
          <div data-testid="end-game">
            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="lg" className="bg-sky-600 hover:bg-sky-700" icon={<Trophy className="h-5 w-5" />} onClick={() => finish('blue')}>
                {blue?.name ?? 'Blue'} wins
              </Button>
              <Button size="lg" icon={<Trophy className="h-5 w-5" />} onClick={() => finish('red')}>
                {red?.name ?? 'Red'} wins
              </Button>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs text-muted">
              <Target className="h-3.5 w-3.5" /> Double-check K/D/A before ending — they feed the public leaderboard.
            </p>
          </div>
        </Card>
        </div>
      </div>
    </div>
  );
}

const spellCd = (spell: keyof typeof SPELL_COOLDOWN | null) => (spell ? (SPELL_COOLDOWN[spell] ?? 90) : 0);

/** Hero level: − / Lv N / + (the + asks first). Level 15 is the max. */
function LevelControl({ level, onChange, compact, className }: { level: number; onChange: (d: 1 | -1) => void; compact?: boolean; className?: string }) {
  const max = level >= MAX_LEVEL;
  return (
    <div className={cn('flex items-center justify-center gap-0.5', !compact && 'justify-between rounded-lg border border-line px-1', className)} data-testid="level-control">
      {!compact && <span className="font-cond text-[10px] font-bold uppercase tracking-wider text-muted">Level</span>}
      <button className="rounded p-1 text-muted hover:bg-surface2 hover:text-fg disabled:opacity-30" disabled={level <= 1} onClick={() => onChange(-1)} aria-label="- level">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className={cn('min-w-[2.2rem] rounded px-1 text-center font-display text-lg leading-none tabular', max && 'bg-amber-400 text-ink-950')} title={max ? 'Max level' : undefined}>
        {level}
      </span>
      <button className="rounded p-1 text-muted hover:bg-surface2 hover:text-brand disabled:opacity-30" disabled={max} onClick={() => onChange(1)} aria-label="+ level" title={max ? 'Max level' : 'Level up (asks first)'}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

function Counter({ icon, label, value, onChange }: { icon: React.ReactNode; label: string; value: number; onChange: (d: number) => void }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-lg border border-line px-1.5 py-1" title={label}>
      {icon}
      <button onClick={() => onChange(-1)} className="text-muted hover:text-fg" aria-label={`- ${label}`}>
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-5 text-center font-display text-xl leading-none tabular">{value}</span>
      <button onClick={() => onChange(1)} className="text-muted hover:text-fg" aria-label={`+ ${label}`}>
        <Plus className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

function HeroCell({ value, picks, onSave }: { value: string; picks: string[]; onSave: (hero: string) => void }) {
  const options = [...new Set([...picks.filter(Boolean), value].filter(Boolean))];
  const [custom, setCustom] = useState(false);
  const [text, setText] = useState(value);
  if (custom) {
    return (
      <div className="flex gap-1">
        <HeroInput value={text} onChange={setText} onEnter={() => { onSave(text.trim()); setCustom(false); }} className="h-8 py-1 text-xs" id="mlbb-heroes-cell" />
        <Button size="xs" onClick={() => { onSave(text.trim()); setCustom(false); }}>OK</Button>
      </div>
    );
  }
  return (
    <Select
      className="h-8 py-0 text-xs"
      value={value}
      onChange={(e) => {
        if (e.target.value === '__custom') {
          setText(value);
          setCustom(true);
        } else onSave(e.target.value);
      }}
    >
      <option value="">—</option>
      {options.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
      <option value="__custom">Other…</option>
    </Select>
  );
}
