import { CalendarClock, Swords, Trophy } from 'lucide-react';
import type { GameRecord, Match, Team } from '@/types';
import { TeamLogo } from '@/components/Brand';
import { Badge, EmptyState, LiveDot, Modal } from '@/components/ui';
import { FORMAT_LABEL } from '@/lib/constants';
import { cn, formatDateTime, formatDuration, kdaRatio } from '@/lib/utils';

const isRealMatch = (m: Match) => m.status !== 'void' && !(m.status === 'completed' && !m.loserId);

export function MatchesSection({ matches, teams, onSelect }: { matches: Match[]; teams: Record<string, Team>; onSelect: (m: Match) => void }) {
  const real = matches.filter(isRealMatch);
  const live = real.filter((m) => m.status === 'live');
  const upcoming = real
    .filter((m) => m.status === 'ready' || (m.status === 'pending' && (m.teamAId || m.teamBId)))
    .sort((a, b) => (a.scheduledAt ?? Infinity) - (b.scheduledAt ?? Infinity) || a.order - b.order)
    .slice(0, 6);
  const recent = real
    .filter((m) => m.status === 'completed')
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, 6);

  return (
    <>
      {!real.length ? (
        <EmptyState icon={<CalendarClock className="h-8 w-8" />} title="No matches yet">
          The bracket hasn&apos;t been generated. Check back soon!
        </EmptyState>
      ) : (
        <div className="grid gap-8 lg:grid-cols-2">
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 font-cond text-sm font-semibold uppercase tracking-wider text-muted">
              <Swords className="h-4 w-4 text-brand" /> {live.length ? 'Live & up next' : 'Up next'}
            </h3>
            {[...live, ...upcoming].map((m) => (
              <MatchRow key={m.id} m={m} teams={teams} onSelect={onSelect} />
            ))}
            {!live.length && !upcoming.length && <p className="text-sm text-muted">No upcoming matches.</p>}
          </div>
          <div className="space-y-3">
            <h3 className="flex items-center gap-2 font-cond text-sm font-semibold uppercase tracking-wider text-muted">
              <Trophy className="h-4 w-4 text-brand" /> Recent results
            </h3>
            {recent.map((m) => (
              <MatchRow key={m.id} m={m} teams={teams} onSelect={onSelect} />
            ))}
            {!recent.length && <p className="text-sm text-muted">No results yet.</p>}
          </div>
        </div>
      )}
    </>
  );
}

function MatchRow({ m, teams, onSelect }: { m: Match; teams: Record<string, Team>; onSelect: (m: Match) => void }) {
  const a = m.teamAId ? teams[m.teamAId] : null;
  const b = m.teamBId ? teams[m.teamBId] : null;
  const live = m.status === 'live';
  const done = m.status === 'completed';
  const side = (t: Team | null, score: number, won: boolean, right?: boolean) => (
    <div className={cn('flex min-w-0 flex-1 items-center gap-3', right && 'flex-row-reverse text-right', done && !won && 'opacity-55')}>
      <TeamLogo url={t?.logoUrl} name={t?.name ?? 'TBD'} size={40} />
      <div className="min-w-0">
        <p className={cn('truncate font-semibold', !t && 'italic text-muted')}>{t?.name ?? 'TBD'}</p>
        <p className="font-cond text-xs uppercase tracking-wider text-muted">{t?.tag ?? '—'}</p>
      </div>
      {(live || done) && <span className={cn('font-display text-4xl leading-none tabular', right ? 'mr-auto' : 'ml-auto', won ? 'text-brand' : '')}>{score}</span>}
    </div>
  );
  return (
    <button onClick={() => onSelect(m)} className={cn('card card-hover flex w-full flex-col gap-3 p-4 text-left', live && 'border-brand shadow-glow')}>
      <div className="flex items-center justify-between gap-2 font-cond text-xs font-semibold uppercase tracking-wider text-muted">
        <span className="truncate">{m.label}</span>
        <span className="flex shrink-0 items-center gap-2">
          {live ? (
            <Badge tone="live">
              <LiveDot className="h-2 w-2 [&>span]:bg-white" /> Live
            </Badge>
          ) : done ? (
            <Badge tone="muted">Final</Badge>
          ) : (
            <span>{formatDateTime(m.scheduledAt)}</span>
          )}
          <Badge tone="brand">{m.format}</Badge>
        </span>
      </div>
      <div className="flex items-center gap-3">
        {side(a, m.scoreA, m.winnerId === m.teamAId)}
        <span className="font-display text-lg text-muted">VS</span>
        {side(b, m.scoreB, m.winnerId === m.teamBId, true)}
      </div>
    </button>
  );
}

/** Series detail: per-game winners, durations, drafts and MVP. */
export function MatchModal({ match, onClose, teams, games }: { match: Match | null; onClose: () => void; teams: Record<string, Team>; games: GameRecord[] }) {
  const list = match ? games.filter((g) => g.matchId === match.id).sort((x, y) => x.gameNumber - y.gameNumber) : [];
  const a = match?.teamAId ? teams[match.teamAId] : null;
  const b = match?.teamBId ? teams[match.teamBId] : null;
  return (
    <Modal open={!!match} onClose={onClose} title={match?.label ?? ''} wide>
      {match && (
        <div className="space-y-5">
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface2 p-4">
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <TeamLogo url={a?.logoUrl} name={a?.name ?? 'TBD'} size={56} />
              <p className="w-full truncate font-semibold">{a?.name ?? 'TBD'}</p>
            </div>
            <div className="text-center">
              <p className="font-display text-5xl leading-none tabular">
                {match.scoreA} <span className="text-muted">-</span> {match.scoreB}
              </p>
              <p className="mt-1 font-cond text-xs uppercase tracking-wider text-muted">{FORMAT_LABEL[match.format]}</p>
            </div>
            <div className="flex min-w-0 flex-1 flex-col items-center gap-2 text-center">
              <TeamLogo url={b?.logoUrl} name={b?.name ?? 'TBD'} size={56} />
              <p className="w-full truncate font-semibold">{b?.name ?? 'TBD'}</p>
            </div>
          </div>
          {!list.length ? (
            <p className="text-center text-sm text-muted">{match.status === 'completed' ? 'Game details were not recorded for this series.' : 'No games played yet.'}</p>
          ) : (
            list.map((g) => {
              const winner = teams[g.winnerTeamId];
              const mvp = [...g.players].filter((p) => p.teamId === g.winnerTeamId).sort((x, y) => kdaRatio(y.k, y.d, y.a) - kdaRatio(x.k, x.d, x.a))[0];
              return (
                <div key={g.id} className="rounded-xl border border-line p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <p className="font-display text-2xl uppercase leading-none">Game {g.gameNumber}</p>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge tone="brand">{winner?.name ?? 'Winner'} win</Badge>
                      {g.durationSec > 0 && <Badge tone="muted">{formatDuration(g.durationSec)}</Badge>}
                    </div>
                  </div>
                  <div className="grid gap-3 text-sm sm:grid-cols-2">
                    {(['blue', 'red'] as const).map((side) => {
                      const tid = side === 'blue' ? g.blueTeamId : g.redTeamId;
                      return (
                        <div key={side} className={cn('rounded-lg border-l-4 bg-surface2 p-3', side === 'blue' ? 'border-sky-500' : 'border-brand')}>
                          <p className="mb-1 font-semibold">
                            {teams[tid]?.name ?? side} · {g[side].kills} kills
                          </p>
                          <p className="text-xs text-muted">Picks: {g[side].picks.filter(Boolean).join(', ') || '—'}</p>
                          <p className="text-xs text-muted">
                            Turtles {g[side].turtles} · Lords {g[side].lords}
                          </p>
                        </div>
                      );
                    })}
                  </div>
                  {mvp && (
                    <p className="mt-3 text-sm">
                      <span className="eyebrow mr-2">MVP</span>
                      <strong>{mvp.ign}</strong> {mvp.hero && <span className="text-muted">({mvp.hero})</span>} — {mvp.k}/{mvp.d}/{mvp.a}
                    </p>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}
    </Modal>
  );
}
