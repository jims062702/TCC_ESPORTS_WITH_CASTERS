import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Coffee, Gamepad2, ListChecks, Power, Radio, Shuffle, Swords, Trophy } from 'lucide-react';
import type { LivePhase } from '@/types';
import { useBooth, useCollectionData, useIndex, useLive, useMatches, useNow, usePlayers, useSettings, useTeams, useTournaments } from '@/hooks/useFirestore';
import { COL, whereEq } from '@/services/firebase';
import { endBroadcast, goLive, rerollCasters, setCasters, setPhase, swapSides } from '@/services/live';
import { CASTERS } from '@/services/casters';
import { sideTeam } from '@/services/facts';
import { FORMAT_LABEL } from '@/lib/constants';
import type { GameEvent } from '@/types';
import { CasterAvatar, TeamLogo } from '@/components/Brand';
import { SeriesPips } from '@/components/game';
import { Badge, Button, Card, EmptyState, LiveDot, Select, Tabs } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn, timeAgo } from '@/lib/utils';
import { DraftPanel } from './DraftPanel';
import { GamePanel } from './GamePanel';
import { SeriesPanel } from './SeriesPanel';

export default function Controller() {
  const live = useLive();
  const teams = useTeams();
  const players = usePlayers();
  const settings = useSettings();
  const booth = useBooth();
  const now = useNow(5000);
  const toast = useToast();
  const L = live.data;

  if (live.loading) return null;
  if (!L.matchId) return <SeriesPicker previousCasters={L.casters} />;

  const blue = sideTeam(L, 'blue');
  const red = sideTeam(L, 'red');
  const boothOnline = Boolean(booth.data?.online && now - (booth.data?.lastBeat ?? 0) < 40_000);
  const profiles = settings.data.casterProfiles;

  return (
    <div className="space-y-5">
      {/* ── Scoreboard header ─────────────────────────────────────────── */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface2 px-4 py-2 font-cond text-xs font-semibold uppercase tracking-wider text-muted">
          <span className="flex items-center gap-2">
            <LiveDot className="h-2 w-2" /> On air · {L.tournamentName} · {L.matchLabel}
          </span>
          <span>
            {FORMAT_LABEL[L.format]} · Game {L.gameNumber}
          </span>
        </div>
        <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 p-4">
          <TeamBlock name={blue?.name} logo={blue?.logoUrl} side="blue" wins={blue?.id === L.teamA?.id ? L.scoreA : L.scoreB} format={L.format} />
          <div className="text-center">
            <p className="font-display text-5xl leading-none tabular sm:text-6xl">
              {L.scoreA}
              <span className="mx-2 text-muted">:</span>
              {L.scoreB}
            </p>
            <p className="mt-1 font-cond text-[11px] uppercase tracking-wider text-muted">
              {L.teamA?.tag} vs {L.teamB?.tag}
            </p>
          </div>
          <TeamBlock name={red?.name} logo={red?.logoUrl} side="red" wins={red?.id === L.teamA?.id ? L.scoreA : L.scoreB} format={L.format} right />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <Tabs<LivePhase>
            value={L.phase}
            onChange={(p) => void toast.run(() => setPhase(p))}
            items={[
              { value: 'draft', label: 'Draft' },
              { value: 'ingame', label: 'In-game' },
              { value: 'postgame', label: 'Post-game' },
              { value: 'break', label: 'Break' },
            ]}
          />
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => toast.run(() => swapSides(L), 'Sides swapped')}>
              Swap sides
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Power className="h-4 w-4" />}
              onClick={() => {
                if (confirm('Take this series off air? (Results already recorded are kept.)')) void toast.run(() => endBroadcast(L), 'Off air');
              }}
            >
              End broadcast
            </Button>
          </div>
        </div>
      </div>

      {/* ── Casting crew ─────────────────────────────────────────────── */}
      <Card
        title="On the mic"
        subtitle={boothOnline ? `Caster booth online · ${booth.data?.aiCallsToday ?? 0} AI calls today · queue ${booth.data?.queue ?? 0}` : 'Caster booth is offline — open it in Microsoft Edge to voice the casters.'}
        actions={
          <>
            {!boothOnline && (
              <Link to="/admin/booth" target="_blank" className="inline-flex h-8 items-center rounded-lg border border-brand/60 px-3 text-sm font-semibold text-brand hover:bg-brand/10">
                Open booth
              </Link>
            )}
            <Button size="sm" variant="secondary" icon={<Shuffle className="h-4 w-4" />} onClick={() => toast.run(() => rerollCasters(L), 'New caster pair seated')}>
              Random pair
            </Button>
          </>
        }
      >
        <div className="flex flex-wrap gap-2">
          {CASTERS.map((c) => {
            const seated = L.casters.includes(c.id);
            return (
              <button
                key={c.id}
                onClick={() => {
                  const next = seated ? L.casters.filter((x) => x !== c.id) : [...L.casters.slice(-1), c.id];
                  void toast.run(() => setCasters(next));
                }}
                className={cn('flex items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition', seated ? 'border-brand bg-brand/10' : 'border-line opacity-60 hover:opacity-100')}
              >
                <CasterAvatar casterId={c.id} url={profiles[c.id]?.avatarUrl} size={34} />
                <span>
                  <span className="block text-sm font-semibold">{profiles[c.id]?.displayName || c.name}</span>
                  <span className="block text-xs text-muted">{c.role}</span>
                </span>
              </button>
            );
          })}
        </div>
      </Card>

      {/* ── Phase panels ─────────────────────────────────────────────── */}
      {L.phase === 'draft' && <DraftPanel live={L} />}
      {L.phase === 'ingame' && <GamePanel live={L} players={players.data} />}
      <SeriesPanel live={L} players={players.data} teams={teams.data} />
      <EventLog matchId={L.matchId} />
    </div>
  );
}

function TeamBlock({ name, logo, side, wins, format, right }: { name?: string; logo?: string; side: 'blue' | 'red'; wins: number; format: Parameters<typeof SeriesPips>[0]['format']; right?: boolean }) {
  return (
    <div className={cn('flex min-w-0 items-center gap-3', right && 'flex-row-reverse text-right')}>
      <TeamLogo url={logo} name={name} size={52} />
      <div className="min-w-0">
        <Badge tone={side === 'blue' ? 'accent' : 'brand'} className={side === 'blue' ? '!border-sky-500/40 !bg-sky-500/10 !text-sky-500' : ''}>
          {side} side
        </Badge>
        <p className="mt-1 truncate font-display text-2xl uppercase leading-none sm:text-3xl">{name ?? 'TBD'}</p>
        <div className="mt-1.5">
          <SeriesPips format={format} wins={wins} color={side === 'blue' ? '#0ea5e9' : '#f8312f'} reverse={right} />
        </div>
      </div>
    </div>
  );
}

function SeriesPicker({ previousCasters }: { previousCasters: string[] }) {
  const tournaments = useTournaments();
  const teams = useTeams();
  const players = usePlayers();
  const toast = useToast();
  const [tid, setTid] = useState<string | null>(null);
  const tournament = tournaments.data.find((t) => t.id === tid) ?? tournaments.data.find((t) => t.status === 'ongoing') ?? tournaments.data[0] ?? null;
  const matches = useMatches(tournament?.id ?? null);
  const teamIndex = useIndex(teams.data);
  const ready = matches.data.filter((m) => m.teamAId && m.teamBId && (m.status === 'ready' || m.status === 'live' || m.status === 'pending'));

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Observer panel</p>
        <h1 className="section-title">Live Controller</h1>
      </header>
      <Card
        title="Put a series on air"
        subtitle="Picks two random casters, loads both rosters and opens the draft."
        actions={
          tournaments.data.length > 1 && (
            <Select value={tournament?.id ?? ''} onChange={(e) => setTid(e.target.value)} className="w-60">
              {tournaments.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )
        }
      >
        {!ready.length ? (
          <EmptyState icon={<Gamepad2 className="h-8 w-8" />} title="No series ready">
            Generate a bracket in <Link to="/admin/tournaments" className="text-brand underline">Tournaments</Link> — series appear here once both teams are known.
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ready.map((m) => (
              <div key={m.id} className="rounded-2xl border border-line bg-surface2 p-4">
                <div className="mb-3 flex items-center justify-between font-cond text-xs font-semibold uppercase tracking-wider text-muted">
                  <span>{m.label}</span>
                  <Badge tone="brand">{m.format}</Badge>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo url={teamIndex[m.teamAId!]?.logoUrl} name={teamIndex[m.teamAId!]?.name} size={34} />
                    <span className="truncate font-semibold">{teamIndex[m.teamAId!]?.tag}</span>
                  </div>
                  <span className="font-display text-2xl">
                    {m.scoreA}-{m.scoreB}
                  </span>
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate font-semibold">{teamIndex[m.teamBId!]?.tag}</span>
                    <TeamLogo url={teamIndex[m.teamBId!]?.logoUrl} name={teamIndex[m.teamBId!]?.name} size={34} />
                  </div>
                </div>
                <Button
                  className="mt-4 w-full"
                  icon={<Radio className="h-4 w-4" />}
                  onClick={() => toast.run(() => goLive({ match: m, tournament, teams: teams.data, players: players.data, previousCasters }), 'Series is on air')}
                >
                  Go live
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

const EVENT_ICON: Partial<Record<GameEvent['type'], typeof Swords>> = {
  SERIES_VICTORY: Trophy,
  GAME_RESULT: Trophy,
  IDLE_BANTER: Coffee,
};

function EventLog({ matchId }: { matchId: string }) {
  const events = useCollectionData<GameEvent>(COL.events, [whereEq('matchId', matchId)], matchId);
  useNow(10_000);
  const rows = useMemo(() => [...events.data].sort((a, b) => b.createdAt - a.createdAt).slice(0, 25), [events.data]);
  return (
    <Card title="Event feed" subtitle="Every trigger is queued for the caster booth (pending → claimed → done).">
      {!rows.length ? (
        <p className="text-sm text-muted">No events yet for this series.</p>
      ) : (
        <ul className="scrollbar-thin max-h-72 divide-y divide-line overflow-y-auto">
          {rows.map((e) => {
            const Icon = EVENT_ICON[e.type] ?? ListChecks;
            return (
              <li key={e.id} className="flex items-center gap-3 py-2 text-sm">
                <Icon className="h-4 w-4 shrink-0 text-brand" />
                <span className="font-semibold">{e.type.replace(/_/g, ' ')}</span>
                <span className="min-w-0 flex-1 truncate text-muted">
                  G{e.gameNumber}
                  {e.side && ` · ${e.side}`}
                  {e.playerIgn && ` · ${e.playerIgn}`}
                  {e.hero && ` (${e.hero})`}
                  {e.data?.steal ? ' · STEAL' : ''}
                  {e.note && ` · “${e.note}”`}
                </span>
                <Badge tone={e.status === 'done' ? 'success' : e.status === 'skipped' ? 'muted' : e.status === 'claimed' ? 'accent' : 'brand'}>{e.status}</Badge>
                <span className="hidden w-16 text-right text-xs text-muted sm:inline">{timeAgo(e.createdAt)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
