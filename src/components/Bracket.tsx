import type { Match, Team, TournamentType } from '@/types';
import { bracketColumns, roundTitle } from '@/services/bracket';
import { cn } from '@/lib/utils';
import { TeamLogo } from './Brand';
import { LiveDot } from './ui';
import { Crown } from 'lucide-react';

const CARD_H = 88;
const SLOT_H = 104;

/**
 * Interactive bracket tree (upper, lower and grand final).
 * Columns are flex-aligned so connector lines meet the next round's match centre.
 */
export function BracketView({
  matches,
  teams,
  type,
  onSelect,
  highlightTeamId,
}: {
  matches: Match[];
  teams: Record<string, Team>;
  type: TournamentType;
  onSelect?: (m: Match) => void;
  highlightTeamId?: string | null;
}) {
  const ub = bracketColumns(matches, 'UB');
  const lb = bracketColumns(matches, 'LB');
  const gf = matches.find((m) => m.bracket === 'GF');
  const isDouble = lb.length > 0;
  const props = { teams, onSelect, highlightTeamId };

  return (
    <div className="space-y-10">
      <Tree title={isDouble ? 'Upper Bracket' : undefined} columns={ub} bracket="UB" type={isDouble ? 'double' : type} {...props} />
      {isDouble && <Tree title="Lower Bracket" columns={lb} bracket="LB" type="double" {...props} />}
      {gf && (
        <div>
          <h3 className="eyebrow mb-3 flex items-center gap-2">
            <Crown className="h-4 w-4" /> Grand Final
          </h3>
          <MatchCard match={gf} {...props} featured />
        </div>
      )}
    </div>
  );
}

function Tree({
  title,
  columns,
  bracket,
  type,
  teams,
  onSelect,
  highlightTeamId,
}: {
  title?: string;
  columns: Match[][];
  bracket: 'UB' | 'LB';
  type: TournamentType;
  teams: Record<string, Team>;
  onSelect?: (m: Match) => void;
  highlightTeamId?: string | null;
}) {
  if (!columns.length) return null;
  const maxCount = Math.max(...columns.map((c) => c.length));
  const bodyH = maxCount * SLOT_H;
  return (
    <div>
      {title && <h3 className="eyebrow mb-3">{title}</h3>}
      <div className="scrollbar-thin -mx-4 overflow-x-auto px-4 pb-3">
        <div className="flex min-w-max gap-10">
          {columns.map((col, ci) => {
            const next = columns[ci + 1];
            const mode = !next ? 'none' : next.length * 2 === col.length ? 'pair' : next.length === col.length ? 'straight' : 'none';
            return (
              <div key={ci} className="flex w-60 flex-col">
                <div className="mb-2 h-6 truncate font-cond text-xs font-semibold uppercase tracking-wider text-muted">
                  {roundTitle(bracket, col[0].round, columns.length, type)}
                </div>
                <div className="flex flex-col" style={{ height: bodyH }}>
                  {mode === 'pair'
                    ? Array.from({ length: col.length / 2 }).map((_, gi) => {
                        const a = col[gi * 2];
                        const b = col[gi * 2 + 1];
                        const aOn = a.status !== 'void';
                        const bOn = b.status !== 'void';
                        return (
                          <div key={gi} className="relative flex flex-1 flex-col">
                            <Cell match={a} teams={teams} onSelect={onSelect} highlightTeamId={highlightTeamId} />
                            <Cell match={b} teams={teams} onSelect={onSelect} highlightTeamId={highlightTeamId} />
                            {aOn && <span className="pointer-events-none absolute -right-5 bottom-1/2 top-1/4 w-5 rounded-tr-md border-r-2 border-t-2 border-line" />}
                            {bOn && <span className="pointer-events-none absolute -right-5 bottom-1/4 top-1/2 w-5 rounded-br-md border-b-2 border-r-2 border-line" />}
                            {(aOn || bOn) && <span className="pointer-events-none absolute -right-10 top-1/2 w-5 border-t-2 border-line" />}
                          </div>
                        );
                      })
                    : col.map((m) => (
                        <div key={m.id} className="relative flex flex-1 flex-col">
                          <Cell match={m} teams={teams} onSelect={onSelect} highlightTeamId={highlightTeamId} />
                          {mode === 'straight' && m.status !== 'void' && <span className="pointer-events-none absolute -right-10 top-1/2 w-10 border-t-2 border-line" />}
                        </div>
                      ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function Cell(props: { match: Match; teams: Record<string, Team>; onSelect?: (m: Match) => void; highlightTeamId?: string | null }) {
  return (
    <div className="flex flex-1 items-center">
      <MatchCard {...props} />
    </div>
  );
}

export function MatchCard({
  match: m,
  teams,
  onSelect,
  highlightTeamId,
  featured,
}: {
  match: Match;
  teams: Record<string, Team>;
  onSelect?: (m: Match) => void;
  highlightTeamId?: string | null;
  featured?: boolean;
}) {
  if (m.status === 'void') return <div className="invisible w-60" style={{ height: CARD_H }} />;
  const live = m.status === 'live';
  const done = m.status === 'completed';
  const bye = done && !m.loserId && (!m.teamAId || !m.teamBId);

  const row = (teamId: string | null, dead: boolean, score: number) => {
    const team = teamId ? teams[teamId] : null;
    const won = done && m.winnerId && teamId === m.winnerId;
    const lost = done && teamId && !won;
    return (
      <div className={cn('flex h-[30px] items-center gap-2 px-2.5', lost && 'opacity-50', highlightTeamId && teamId === highlightTeamId && 'bg-brand/10')}>
        <TeamLogo url={team?.logoUrl} name={team?.name ?? (dead ? 'BYE' : 'TBD')} size={20} className="rounded-md" />
        <span className={cn('min-w-0 flex-1 truncate text-sm', won ? 'font-bold' : 'font-medium', !team && 'italic text-muted')}>
          {team?.name ?? (dead ? 'BYE' : 'TBD')}
        </span>
        {!bye && (teamId && (done || live)) && (
          <span className={cn('w-5 text-right font-display text-xl leading-none tabular', won ? 'text-brand' : 'text-muted')}>{score}</span>
        )}
      </div>
    );
  };

  return (
    <button
      type="button"
      onClick={() => onSelect?.(m)}
      disabled={!onSelect}
      className={cn(
        'group w-60 overflow-hidden rounded-xl border bg-surface text-left shadow-sm transition',
        onSelect && 'hover:-translate-y-0.5 hover:border-brand/60 hover:shadow-glow',
        live ? 'border-brand shadow-glow' : 'border-line',
        featured && 'w-72 border-brand/60',
      )}
      style={{ height: CARD_H }}
    >
      <div className="flex h-[26px] items-center justify-between border-b border-line bg-surface2 px-2.5 font-cond text-[11px] font-semibold uppercase tracking-wider text-muted">
        <span className="truncate">{m.label}</span>
        <span className="flex items-center gap-1.5">
          {live && (
            <span className="flex items-center gap-1 text-brand">
              <LiveDot className="h-2 w-2" /> Live
            </span>
          )}
          {m.format}
        </span>
      </div>
      {row(m.teamAId, m.deadA, m.scoreA)}
      {row(m.teamBId, m.deadB, m.scoreB)}
    </button>
  );
}
