import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeftRight, Coffee, Gamepad2, ListChecks, Power, Radio, Swords, Trophy } from 'lucide-react';
import type { LivePhase, LiveState, Match, Tournament } from '@/types';
import { Facebook } from 'lucide-react';
import { useCollectionData, useDocData, useIndex, useLive, useMatches, useNow, usePlayers, useSettings, useTeams, useTournaments } from '@/hooks/useFirestore';
import { COL, whereEq } from '@/services/firebase';
import { cancelPreSeriesBreak, clockPause, endBreak, endBroadcast, endBroadcastWithBreak, goLive, patchLive, pauseToBreak, setBreak, setPhase, setPreSeriesBreak, startGame, swapSides } from '@/services/live';
import { updateMatch } from '@/services/db';
import { picksComplete } from '@/lib/constants';
import { pickCasterPair } from '@/services/casters';
import { sideTeam } from '@/services/facts';
import { FORMAT_LABEL } from '@/lib/constants';
import type { GameEvent } from '@/types';
import { TeamLogo } from '@/components/Brand';
import { SeriesPips } from '@/components/game';
import { Badge, Button, Card, EmptyState, LiveDot, Select, Tabs } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/Confirm';
import { cn, formatDateTime, formatDuration, timeAgo } from '@/lib/utils';
import { DraftPanel } from './DraftPanel';
import { GamePanel } from './GamePanel';
import { SeriesPanel } from './SeriesPanel';
import { LineupDialog } from './LineupDialog';
import { PreSeriesBreakDialog } from './PreSeriesBreakDialog';
import { EndBroadcastDialog } from './EndBroadcastDialog';
import { useObsAutomation } from './ObsPanel';
import { HeaderClock, breakMessages, isPaused } from './BreakControls';

export default function Controller() {
  const live = useLive();
  const teams = useTeams();
  const players = usePlayers();
  const settings = useSettings();
  const toast = useToast();
  const ask = useConfirm();
  const L = live.data;
  const tournaments = useTournaments();
  const currentTournament = tournaments.data.find((t) => t.id === L.tournamentId) ?? null;
  const currentMatches = useMatches(L.tournamentId);
  const [endBroadcastOpen, setEndBroadcastOpen] = useState(false);
  // OBS follows the controller: Draft → In-game HUD → Break (no clicking in OBS).
  useObsAutomation(L.phase, Boolean(L.matchId || L.phase === 'break'));
  // The on-air match (for its "View on Facebook" switch).
  const currentMatch = useDocData<Match>(COL.matches, L.matchId);

  if (live.loading) return null;
  if (!L.matchId) return <SeriesPicker live={L} previousCasters={L.casters} />;

  /** Draft / In-game / Break tabs (a finished game stays under In-game). */
  const changePhase = (p: LivePhase) => {
    const gameDone = L.scoreA + L.scoreB >= L.gameNumber;
    const paused = isPaused(L);
    const shown = L.phase === 'postgame' || paused ? 'ingame' : L.phase;
    if (p === shown) return;
    // Paused game → Break tab: it becomes a normal break (no auto-resume).
    if (paused && p === 'break') return void toast.run(() => pauseToBreak(), 'Now a full break — end it from the Break tab');
    if (p === 'ingame') {
      if (L.phase === 'break') return void toast.run(() => (gameDone ? setPhase('postgame') : L.gameStartedAt ? endBreak(L, players.data) : setPhase('draft')));
      if (!picksComplete(L.draft)) return void toast.error('Pick all 10 heroes first — bans can be "none".');
      return void toast.run(() => startGame(L), 'Game started — HUD is live');
    }
    if (p === 'break') {
      if (L.phase === 'ingame' || paused) return void toast.error('During a game use "Pause the game" (right column).');
      const message = breakMessages(L, 'break')[0];
      return void ask({ title: 'Go to break?', message: `The break screen goes on air with a 5:00 countdown and "${message}". You can change the message and add time on the Break tab.`, confirmLabel: 'Go to break' }).then((ok) => {
        if (ok) void toast.run(() => setBreak(L, 5, message), 'Break on air — 5:00 countdown');
      });
    }
    if (gameDone) return void toast.error('This game is finished — use "Start Game ' + (L.scoreA + L.scoreB + 1) + ' draft" below.');
    void (async () => {
      if (L.phase === 'ingame' && !(await ask({ title: 'Back to the draft?', message: 'The game clock pauses until you switch back to In-game.', confirmLabel: 'Back to draft' }))) return;
      await toast.run(async () => {
        if (L.phase === 'ingame') await clockPause(L);
        await patchLive({ phase: 'draft', breakPause: false });
      });
    })();
  };

  const blue = sideTeam(L, 'blue');
  const red = sideTeam(L, 'red');

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
            {(L.phase !== 'draft' || L.gameStartedAt) && <HeaderClock live={L} />}
          </div>
          <TeamBlock name={red?.name} logo={red?.logoUrl} side="red" wins={red?.id === L.teamA?.id ? L.scoreA : L.scoreB} format={L.format} right />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3">
          <Tabs<LivePhase>
            value={L.phase === 'postgame' || isPaused(L) ? 'ingame' : L.phase}
            onChange={changePhase}
            items={[
              { value: 'draft', label: 'Draft' },
              { value: 'ingame', label: 'In-game' },
              { value: 'break', label: 'Break', disabled: L.phase === 'ingame' || isPaused(L), title: L.phase === 'ingame' || isPaused(L) ? 'During a game use "Pause the game" (right column)' : undefined },
            ]}
          />
          <div className="ml-auto flex flex-wrap items-center gap-2">
            {/* Website "View on Facebook" button for THIS match only */}
            <label
              className={cn('flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs font-semibold', currentMatch.data?.facebookLive ? 'border-[#1877f2] bg-[#1877f2]/10 text-[#1877f2]' : 'border-line text-muted')}
              title={settings.data.facebookUrl ? 'Show a View on Facebook button for this match on the website' : 'Add your Facebook page link in Settings first'}
            >
              <input
                type="checkbox"
                className="accent-[#1877f2]"
                disabled={!settings.data.facebookUrl || !L.matchId}
                checked={Boolean(currentMatch.data?.facebookLive)}
                onChange={(e) => void toast.run(() => updateMatch(L.matchId!, { facebookLive: e.target.checked }), e.target.checked ? 'View on Facebook is now on the website' : 'View on Facebook hidden')}
              />
              <Facebook className="h-4 w-4" /> View on Facebook {currentMatch.data?.facebookLive ? 'ON' : 'OFF'}
            </label>
            <Button size="sm" variant="secondary" icon={<ArrowLeftRight className="h-4 w-4" />} onClick={() => toast.run(() => swapSides(L), 'Sides swapped')}>
              Swap sides
            </Button>
            <Button
              size="sm"
              variant="danger"
              icon={<Power className="h-4 w-4" />}
              onClick={() => setEndBroadcastOpen(true)}
            >
              End broadcast
            </Button>
          </div>
        </div>
      </div>

      {/* ── Phase panels ─────────────────────────────────────────────── */}
      {L.phase === 'draft' && <DraftPanel live={L} players={players.data} teams={teams.data} />}
      {(L.phase === 'ingame' || isPaused(L)) && <GamePanel live={L} players={players.data} />}
      <SeriesPanel live={L} players={players.data} teams={teams.data} onEndBroadcast={() => setEndBroadcastOpen(true)} />
      <EventLog matchId={L.matchId} />
      <EndBroadcastDialog
        open={endBroadcastOpen}
        onClose={() => setEndBroadcastOpen(false)}
        live={L}
        tournament={currentTournament}
        matches={currentMatches.data}
        teams={teams.data}
        onConfirmBreak={async (opts) => {
          await toast.run(
            () =>
              endBroadcastWithBreak(L, {
                minutes: opts.minutes,
                message: opts.message,
                nextMatch: opts.nextMatch,
                nextTeamA: opts.nextTeamA,
                nextTeamB: opts.nextTeamB,
                tournament: currentTournament,
              }),
            opts.minutes > 0 ? `Break on air (${opts.minutes}:00) — select next series` : 'Broadcast ended',
          );
        }}
        onDirectEnd={async () => {
          await toast.run(() => endBroadcast(L), 'Off air');
        }}
      />
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

function SeriesPicker({ live, previousCasters }: { live: LiveState; previousCasters: string[] }) {
  const tournaments = useTournaments();
  const teams = useTeams();
  const players = usePlayers();
  const toast = useToast();
  const now = useNow(1000);
  const [tid, setTid] = useState<string | null>(null);
  const tournament = tournaments.data.find((t) => t.id === tid) ?? tournaments.data.find((t) => t.status === 'ongoing') ?? tournaments.data[0] ?? null;
  const matches = useMatches(tournament?.id ?? null);
  const teamIndex = useIndex(teams.data);
  const ready = matches.data.filter((m) => m.teamAId && m.teamBId && (m.status === 'ready' || m.status === 'live' || m.status === 'pending'));
  const [pending, setPending] = useState<{ match: Match; tournament: Tournament | null; casters: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [breakOpen, setBreakOpen] = useState(false);

  const isBreakActive = live.phase === 'break';
  const leftSec = live.breakEndsAt ? Math.max(0, Math.round((live.breakEndsAt - now) / 1000)) : null;
  const timeLeftFormatted = leftSec !== null ? formatDuration(leftSec) : '';

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Observer panel</p>
        <h1 className="section-title">Live Controller</h1>
      </header>
      {pending && (
        <LineupDialog
          open
          onClose={() => setPending(null)}
          title={`Lineups · Game ${pending.match.scoreA + pending.match.scoreB + 1}`}
          confirmLabel="Go live"
          teams={[teams.data.find((t) => t.id === pending.match.teamAId), teams.data.find((t) => t.id === pending.match.teamBId)]}
          players={players.data}
          tournamentId={pending.match.tournamentId}
          matchId={pending.match.id}
          casters={pending.casters}
          withHistory
          busy={busy}
          onConfirm={async (setup) => {
            setBusy(true);
            const ok = await toast.run(async () => { await goLive({ match: pending.match, tournament: pending.tournament, teams: teams.data, players: players.data, previousCasters, setup }); return true; }, 'Series is on air');
            setBusy(false);
            if (ok) setPending(null);
          }}
        />
      )}
      <PreSeriesBreakDialog
        open={breakOpen}
        onClose={() => setBreakOpen(false)}
        tournament={tournament}
        matches={matches.data}
        teams={teams.data}
        live={live}
        onStartBreak={async (opts) => {
          await toast.run(
            () =>
              setPreSeriesBreak({
                tournament,
                match: opts.match,
                teamA: opts.teamA,
                teamB: opts.teamB,
                minutes: opts.minutes,
                message: opts.message,
              }),
            `Break on air — ${opts.minutes}:00 countdown`,
          );
        }}
        onStopBreak={async () => {
          await toast.run(() => cancelPreSeriesBreak(), 'Break stopped');
        }}
      />
      <Card
        title="Put a series on air"
        subtitle="Picks two random casters, loads both rosters and opens the draft."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              variant={isBreakActive ? 'danger' : 'secondary'}
              icon={<Coffee className="h-4 w-4" />}
              onClick={() => setBreakOpen(true)}
            >
              {isBreakActive ? (
                <span className="flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
                  </span>
                  Break ON AIR {timeLeftFormatted ? `(${timeLeftFormatted})` : ''}
                </span>
              ) : (
                'Break'
              )}
            </Button>
            {tournaments.data.length > 0 && (
              <Select value={tournament?.id ?? ''} onChange={(e) => setTid(e.target.value)} className="w-60">
                {tournaments.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            )}
          </div>
        }
      >
        {isBreakActive && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-red-500/40 bg-red-500/10 p-4">
            <div className="flex items-center gap-3">
              <span className="relative flex h-3 w-3">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-cond font-bold uppercase tracking-wider text-red-500">Break screen is ON AIR</span>
                  {leftSec !== null && (
                    <Badge tone="brand" className="font-mono font-bold">
                      {timeLeftFormatted}
                    </Badge>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-muted">
                  {live.breakMessage || 'Break'}
                  {live.teamA && live.teamB ? ` · Up next: ${live.teamA.name} vs ${live.teamB.name}` : ''}
                  <span className="ml-1 text-ink-300 dark:text-ink-400">
                    — Clicking &quot;Go live&quot; on any match below will end the break and switch to Draft.
                  </span>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="secondary" onClick={() => setBreakOpen(true)}>
                Adjust Break
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-red-500 hover:bg-red-500/10"
                onClick={() => void toast.run(() => cancelPreSeriesBreak(), 'Break stopped')}
              >
                Stop Break
              </Button>
            </div>
          </div>
        )}
        {!ready.length ? (
          <EmptyState icon={<Gamepad2 className="h-8 w-8" />} title="No series ready">
            Generate a bracket in <Link to="/admin/tournaments" className="text-brand underline">Tournaments</Link> — series appear here once both teams are known.
          </EmptyState>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {ready.map((m) => (
              // Every card has the same rows (label · schedule · teams · button) so they line up.
              <div key={m.id} className="flex h-full flex-col rounded-2xl border border-line bg-surface2 p-4">
                <div className="flex items-center justify-between gap-2 font-cond text-xs font-semibold uppercase tracking-wider text-muted">
                  <span className="min-w-0 truncate" title={m.label}>{m.label}</span>
                  <Badge tone="brand">{m.format}</Badge>
                </div>
                <p className="mb-3 mt-1 truncate text-xs text-muted">{m.scheduledAt ? `Scheduled ${formatDateTime(m.scheduledAt)}` : 'Schedule TBA'}</p>
                <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2">
                  <div className="flex min-w-0 items-center gap-2">
                    <TeamLogo url={teamIndex[m.teamAId!]?.logoUrl} name={teamIndex[m.teamAId!]?.name} size={34} />
                    <span className="truncate font-semibold">{teamIndex[m.teamAId!]?.tag}</span>
                  </div>
                  <span className="font-display text-2xl">
                    {m.scoreA}-{m.scoreB}
                  </span>
                  <div className="flex min-w-0 items-center justify-end gap-2">
                    <span className="truncate font-semibold">{teamIndex[m.teamBId!]?.tag}</span>
                    <TeamLogo url={teamIndex[m.teamBId!]?.logoUrl} name={teamIndex[m.teamBId!]?.name} size={34} />
                  </div>
                </div>
                <div className="min-h-4 flex-1" />
                <Button
                  className="mt-auto w-full"
                  icon={<Radio className="h-4 w-4" />}
                  onClick={() => setPending({ match: m, tournament, casters: pickCasterPair(previousCasters) })}
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
