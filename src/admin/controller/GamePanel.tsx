import { useState } from 'react';
import { Coins, Crown, Droplet, Flame, HelpCircle, Leaf, Minus, Plus, Shell, Skull, Sparkles, Swords, Target, Trophy } from 'lucide-react';
import type { EventType, LiveState, Player, Side } from '@/types';
import { BATTLE_SPELLS, EVENT_DEFS, SPELL_COOLDOWN } from '@/lib/constants';
import {
  adjustObjective,
  adjustPlayerStat,
  endGame,
  replaceLineupPlayer,
  setGoldDiff,
  triggerEvent,
  updatePlayer,
} from '@/services/live';
import { sideTeam } from '@/services/facts';
import { useNow } from '@/hooks/useFirestore';
import { Avatar } from '@/components/Brand';
import { HeroInput, SpellBadge } from '@/components/game';
import { Button, Card, Select, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn, formatGold } from '@/lib/utils';
import { ReplayPanel } from './ReplayPanel';

interface Actor {
  side: Side;
  index: number;
}

const KILL_EVENTS: { type: EventType; icon: typeof Swords; tone: string }[] = [
  { type: 'FIRST_BLOOD', icon: Droplet, tone: 'from-rose-500 to-crimson-700' },
  { type: 'DOUBLE_KILL', icon: Swords, tone: 'from-orange-500 to-crimson-600' },
  { type: 'TRIPLE_KILL', icon: Swords, tone: 'from-amber-500 to-orange-600' },
  { type: 'MANIAC', icon: Skull, tone: 'from-fuchsia-500 to-crimson-700' },
  { type: 'SAVAGE', icon: Flame, tone: 'from-crimson-500 to-crimson-900' },
];

export function GamePanel({ live, players }: { live: LiveState; players: Player[] }) {
  const toast = useToast();
  const now = useNow(500);
  const [actor, setActor] = useState<Actor | null>(null);
  const [steal, setSteal] = useState(false);
  const [goldInput, setGoldInput] = useState('');
  const blue = sideTeam(live, 'blue');
  const red = sideTeam(live, 'red');

  const actorPlayer = actor ? live[actor.side].players[actor.index] : null;

  const fire = async (type: EventType, side?: Side | null) => {
    const def = EVENT_DEFS[type];
    if (def.needsPlayer && !actor) return toast.error('Select the player first (click their name).');
    const s = side ?? actor?.side ?? null;
    if (def.needsSide && !s) return toast.error('Select a player or side first.');
    // Objectives are "slain by" the selected player on that side; if none is selected we
    // fall back to that side's jungler. Any hero can take or steal an objective.
    const isObjective = type === 'TURTLE' || type === 'LORD' || type === 'BUFF';
    let playerIndex: number | null = actor && actor.side === s ? actor.index : null;
    if (isObjective && playerIndex === null && s) {
      const idx = live[s].players.findIndex((p) => p.role === 'Jungle');
      playerIndex = idx >= 0 ? idx : null;
    }
    await toast.run(() =>
      triggerEvent(live, type, {
        side: s,
        playerIndex,
        steal: isObjective && steal,
      }),
    );
    if (isObjective) setSteal(false);
  };

  const contest = (objective: 'Turtle' | 'Lord' | 'Buff') =>
    toast.run(() => triggerEvent(live, 'OBJECTIVE_CONTEST', { side: null, data: { objective } }));

  const finish = async (side: Side) => {
    const team = side === 'blue' ? blue : red;
    if (!confirm(`Confirm: ${team?.name ?? side} wins Game ${live.gameNumber}?`)) return;
    const res = await toast.run(() => endGame(live, side));
    if (res) toast.success(res.seriesOver ? (res.isChampionship ? 'Champions crowned! 🏆' : 'Series complete — bracket updated') : 'Game recorded');
  };

  const teamKills = (side: Side) => live[side].players.reduce((n, p) => n + p.k, 0);

  return (
    <div className="space-y-5">
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
              <div className="scrollbar-thin overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="table-head">
                      <th className="pb-2 text-left">Player</th>
                      <th className="pb-2 text-left">Hero</th>
                      <th className="pb-2 text-center">Spell</th>
                      <th className="pb-2 text-center">K</th>
                      <th className="pb-2 text-center">D</th>
                      <th className="pb-2 text-center">A</th>
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
                                title="Mark spell used (starts cooldown, no commentary)"
                                onClick={() => toast.run(() => updatePlayer(live, side, i, { spellReadyAt: p.spellReadyAt && p.spellReadyAt > Date.now() ? null : Date.now() + 1000 * spellCd(p.spell) }))}
                              >
                                <SpellBadge spell={p.spell} readyAt={p.spellReadyAt} now={now} size={30} />
                              </button>
                              <Select className="h-7 w-[92px] px-1 py-0 text-xs" value={p.spell} onChange={(e) => toast.run(() => updatePlayer(live, side, i, { spell: e.target.value as typeof p.spell, spellReadyAt: null }))}>
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
              ? `Selected: ${actorPlayer.ign}${actorPlayer.hero ? ` (${actorPlayer.hero})` : ''} · ${actor!.side} side — their photo appears on the banner`
              : 'Click a player above, then an event. Each kill-streak call adds +1 kill and shows a banner with the player photo.'
          }
        >
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {KILL_EVENTS.map(({ type, icon: Icon, tone }) => (
              <button
                key={type}
                onClick={() => fire(type)}
                disabled={!actor}
                className={cn('flex h-20 flex-col items-center justify-center gap-1 rounded-xl bg-gradient-to-br font-display text-xl uppercase leading-none text-white shadow transition hover:brightness-110 active:scale-95 disabled:opacity-40', tone)}
              >
                <Icon className="h-5 w-5" />
                {EVENT_DEFS[type].label}
              </button>
            ))}
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {(['blue', 'red'] as const).map((side) => (
              <div key={side} className={cn('rounded-xl border p-3', side === 'blue' ? 'border-sky-500/40' : 'border-brand/40')}>
                <p className={cn('mb-2 font-cond text-xs font-semibold uppercase tracking-wider', side === 'blue' ? 'text-sky-500' : 'text-brand')}>{(side === 'blue' ? blue : red)?.name}</p>
                <div className="grid grid-cols-3 gap-2">
                  <Button size="sm" variant="secondary" icon={<Shell className="h-4 w-4" />} onClick={() => fire('TURTLE', side)}>
                    Turtle
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Crown className="h-4 w-4" />} onClick={() => fire('LORD', side)}>
                    Lord
                  </Button>
                  <Button size="sm" variant="secondary" icon={<Leaf className="h-4 w-4" />} onClick={() => fire('BUFF', side)}>
                    Buff
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted">
            Objectives are credited &ldquo;slain by&rdquo; the selected player on that side (or the side&apos;s jungler if none is selected) and the banner shows their photo.
          </p>
          <div className="mt-3 rounded-xl border border-dashed border-line p-3">
            <p className="mb-2 flex items-center gap-1.5 font-cond text-xs font-semibold uppercase tracking-wider text-muted">
              <HelpCircle className="h-3.5 w-3.5" /> Pre-call a contest — &ldquo;Sino kaya ang makakakuha ng…?&rdquo;
            </p>
            <div className="grid grid-cols-3 gap-2">
              {(['Turtle', 'Lord', 'Buff'] as const).map((o) => (
                <Button key={o} size="sm" variant="outline" onClick={() => contest(o)}>
                  {o} fight
                </Button>
              ))}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <Switch checked={steal} onChange={setSteal} label={<span className="text-sm">Next Turtle / Lord / Buff was a <strong>steal</strong></span>} />
            <Button size="sm" variant="outline" disabled={!actor} icon={<Sparkles className="h-4 w-4" />} onClick={() => fire('SPELL_USED')}>
              Announce spell used
            </Button>
          </div>
        </Card>

        <Card title="Gold difference" subtitle={live.goldDiff === 0 ? 'Even' : `${(live.goldDiff > 0 ? blue : red)?.name} +${formatGold(live.goldDiff)}`}>
          <div className="mb-3 flex items-center justify-between font-cond text-xs font-semibold uppercase tracking-wider">
            <span className="text-sky-500">{blue?.tag} ahead ←</span>
            <span className="font-display text-3xl leading-none tabular">{live.goldDiff > 0 ? '+' : ''}{live.goldDiff.toLocaleString()}</span>
            <span className="text-brand">→ {red?.tag} ahead</span>
          </div>
          <input
            type="range"
            min={-20000}
            max={20000}
            step={100}
            value={-live.goldDiff}
            onChange={(e) => void setGoldDiff(-Number(e.target.value))}
            className="w-full accent-[rgb(var(--brand))]"
            aria-label="Gold difference"
          />
          <div className="mt-3 grid grid-cols-6 gap-1.5">
            {[2000, 1000, 500].map((v) => (
              <Button key={`b${v}`} size="xs" variant="secondary" onClick={() => toast.run(() => setGoldDiff(live.goldDiff + v))}>
                +{v / 1000}k {blue?.tag}
              </Button>
            ))}
            {[500, 1000, 2000].map((v) => (
              <Button key={`r${v}`} size="xs" variant="secondary" onClick={() => toast.run(() => setGoldDiff(live.goldDiff - v))}>
                +{v / 1000}k {red?.tag}
              </Button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <input className="input" placeholder="Exact (+ = blue ahead)" value={goldInput} onChange={(e) => setGoldInput(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && goldInput && void setGoldDiff(Number(goldInput)).then(() => setGoldInput(''))} />
            <Button variant="secondary" onClick={() => toast.run(() => setGoldDiff(0))}>
              Even
            </Button>
          </div>
          <Button className="mt-3 w-full" variant="outline" icon={<Coins className="h-4 w-4" />} onClick={() => fire('GOLD_UPDATE', null)}>
            Announce gold update (Ate Lyka)
          </Button>
        </Card>
      </div>

      <ReplayPanel live={live} />

      <Card title="End game" subtitle="Records stats for the leaderboard, updates the series score and advances the bracket when the series is won.">
        <div className="grid gap-3 sm:grid-cols-2">
          <Button size="lg" className="bg-sky-600 hover:bg-sky-700" icon={<Trophy className="h-5 w-5" />} onClick={() => finish('blue')}>
            {blue?.name ?? 'Blue'} wins
          </Button>
          <Button size="lg" icon={<Trophy className="h-5 w-5" />} onClick={() => finish('red')}>
            {red?.name ?? 'Red'} wins
          </Button>
        </div>
        <p className="mt-2 flex items-center gap-1 text-xs text-muted">
          <Target className="h-3.5 w-3.5" /> Tip: double-check K/D/A before ending — they feed the public leaderboard.
        </p>
      </Card>
    </div>
  );
}

const spellCd = (spell: keyof typeof SPELL_COOLDOWN) => SPELL_COOLDOWN[spell] ?? 90;

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
