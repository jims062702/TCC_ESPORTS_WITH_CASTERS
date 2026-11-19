import type { FinalsMvp, Match, Team, TournamentType } from '@/types';
import { bracketColumns, roundTitle } from '@/services/bracket';
import { cn, formatDateTime } from '@/lib/utils';
import { Avatar, TeamLogo } from './Brand';
import { Button, LiveDot } from './ui';
import { Crown, Printer, Trophy } from 'lucide-react';

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
  finalsMvp,
  title,
}: {
  matches: Match[];
  teams: Record<string, Team>;
  type: TournamentType;
  onSelect?: (m: Match) => void;
  highlightTeamId?: string | null;
  finalsMvp?: FinalsMvp | null;
  /** Printed above the bracket (tournament name). */
  title?: string;
}) {
  const ub = bracketColumns(matches, 'UB');
  const lb = bracketColumns(matches, 'LB');
  const gf = matches.find((m) => m.bracket === 'GF');
  const isDouble = lb.length > 0;
  const props = { teams, onSelect, highlightTeamId };
  // The champion is the winner of the final series (Grand Final, or the last round in single elimination).
  const final = matches.find((m) => m.isFinal) ?? gf ?? null;
  const seeding = matches.filter((m) => m.bracket === 'SEED').sort((a, b) => a.index - b.index);
  const champion = final?.status === 'completed' && final.winnerId ? teams[final.winnerId] : null;

  return (
    <div className="print-area space-y-10">
      {title && <h2 className="print-only font-display text-3xl uppercase">{title} — Bracket</h2>}
      {seeding.length > 0 && (
        <div>
          <h3 className="eyebrow mb-1">Seeding Round</h3>
          <p className="mb-3 text-xs text-muted">Every team plays one game — winners take the top seeds, so the results decide who faces whom in the bracket.</p>
          <div className="flex flex-wrap gap-4">
            {seeding.map((m) => (
              <MatchCard key={m.id} match={m} {...props} />
            ))}
          </div>
        </div>
      )}
      <Tree title={isDouble ? 'Upper Bracket' : undefined} columns={ub} bracket="UB" type={isDouble ? 'double' : type} {...props} />
      {isDouble && <Tree title="Lower Bracket" columns={lb} bracket="LB" type="double" {...props} />}
      {gf ? (
        <div>
          <div className="mb-3 flex gap-10">
            <h3 className="eyebrow flex w-72 items-center gap-2">
              <Crown className="h-4 w-4" /> Grand Final
            </h3>
            <h3 className="eyebrow flex items-center gap-2 text-amber-500">
              <Trophy className="h-4 w-4" /> Champion
            </h3>
          </div>
          <div className="flex flex-wrap items-center gap-10">
            <div className="relative">
              <MatchCard match={gf} {...props} featured />
              <span className="pointer-events-none absolute -right-10 top-1/2 hidden w-10 border-t-2 border-amber-400/70 sm:block" />
            </div>
            <ChampionCard team={champion} mvp={finalsMvp ?? null} />
          </div>
        </div>
      ) : (
        final && (
          <div>
            <h3 className="eyebrow mb-3 flex items-center gap-2 text-amber-500">
              <Trophy className="h-4 w-4" /> Champion
            </h3>
            <ChampionCard team={champion} mvp={finalsMvp ?? null} />
          </div>
        )
      )}
    </div>
  );
}

/** The CHAMPION slot after the final — the winner and the Finals MVP. */
function ChampionCard({ team, mvp }: { team: Team | null; mvp: FinalsMvp | null }) {
  return (
    <div className={cn('w-72 overflow-hidden rounded-xl border-2 bg-surface shadow-sm', team ? 'border-amber-400 shadow-[0_0_24px_rgba(251,191,36,0.35)]' : 'border-dashed border-line')}>
      <div className="flex h-[26px] items-center justify-between border-b border-line bg-amber-400/15 px-2.5 font-cond text-[11px] font-bold uppercase tracking-[0.25em] text-amber-600 dark:text-amber-400">
        <span className="flex items-center gap-1">
          <Trophy className="h-3.5 w-3.5" /> Champion
        </span>
        {team && <Crown className="h-3.5 w-3.5" />}
      </div>
      <div className="flex items-center gap-3 px-3 py-2.5">
        <TeamLogo url={team?.logoUrl} name={team?.name ?? 'TBD'} size={40} className="rounded-lg" />
        <span className={cn('min-w-0 flex-1 truncate font-display text-2xl uppercase leading-none', !team && 'italic text-muted')}>{team?.name ?? 'TBD'}</span>
      </div>
      {mvp && team && (
        <div className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs">
          <Avatar url={mvp.photoUrl} name={mvp.ign} size={26} />
          <span className="min-w-0 flex-1">
            <span className="block font-cond text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">Finals MVP</span>
            <span className="block truncate font-semibold">{mvp.ign}</span>
          </span>
          <span className="text-right text-[11px] text-muted">
            {mvp.gameMvps} game MVP{mvp.gameMvps === 1 ? '' : 's'}
            <br />
            KDA {mvp.kda.toFixed(2)}
            {mvp.tp !== null ? ` · TP ${mvp.tp}%` : ''}
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Print just the bracket: it is copied into a hidden frame with the site's
 * styles (light colours), scaled to fit one A4 landscape page, then printed.
 */
export function printBracket() {
  const area = document.querySelector<HTMLElement>('.print-area');
  if (!area) return;
  // Measure with every scroll container fully open.
  const width = Math.max(area.scrollWidth, ...[...area.querySelectorAll<HTMLElement>('.overflow-x-auto')].map((el) => el.scrollWidth));
  const height = area.scrollHeight;
  // Fit the page WIDTH (A4 landscape ≈ 1060 px at 96 dpi with 8 mm margins); long brackets flow onto more pages
  // instead of shrinking until they can't be read.
  const zoom = Math.max(0.62, Math.min(1, 1060 / Math.max(1, width)));
  void height;
  const styles = [...document.querySelectorAll('style, link[rel="stylesheet"]')].map((n) => n.outerHTML).join('\n');
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  Object.assign(frame.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html lang="en" style="--print-zoom:${zoom}"><head><meta charset="utf-8"><title>Bracket</title>${styles}
    <style>
      @page{size:A4 landscape;margin:8mm}
      html{font-size:17px}
      html,body{background:#fff!important;margin:0;color:#000}
      :root,html.dark{--bg:255 255 255;--surface:255 255 255;--surface-2:222 219 217;--line:70 66 66;--fg:0 0 0;--muted:35 35 40;--glow-a:0;--glow-lg-a:0}
      .print-area .overflow-x-auto{overflow:visible!important}
      .print-only{display:block!important}
      .print-area>div,.print-area>h2{break-inside:avoid;page-break-inside:avoid}
      .print-area>div{margin-bottom:22px}
      .print-area button{border-width:1.5px!important;box-shadow:none!important}
      .print-area .opacity-50{opacity:.85!important}
      .print-area .italic{color:#333!important}
      .print-area .font-medium{font-weight:600!important}
      .print-area .eyebrow{font-size:15px!important}
    </style>
    </head><body>${area.outerHTML}</body></html>`);
  doc.close();
  const go = () => {
    frame.contentWindow?.focus();
    frame.contentWindow?.print();
    setTimeout(() => frame.remove(), 1500);
  };
  // Give stylesheets, fonts and logos a moment to load in the frame.
  const imgs = [...doc.images];
  void Promise.race([Promise.all([doc.fonts?.ready, ...imgs.map((i) => (i.complete ? null : new Promise((r) => ((i.onload = r), (i.onerror = r)))))]), new Promise((r) => setTimeout(r, 1500))]).then(() => setTimeout(go, 150));
}

/** Print the bracket on one landscape page (scaled to fit, light colours). */
export function PrintBracketButton({ className }: { className?: string }) {
  return (
    <Button
      size="sm"
      variant="secondary"
      className={cn('print-hide', className)}
      icon={<Printer className="h-4 w-4" />}
      onClick={() => printBracket()}
    >
      Print bracket
    </Button>
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
        <span className="min-w-0 truncate">{m.label}</span>
        <span className="flex shrink-0 items-center gap-1.5">
          {/* Scheduled date & time (local) until the series is played */}
          {m.scheduledAt && <span className="normal-case tracking-normal text-fg/80">{formatDateTime(m.scheduledAt)}</span>}
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
