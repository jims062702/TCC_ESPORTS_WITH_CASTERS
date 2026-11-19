import { Crown } from 'lucide-react';
import type { Team } from '@/types';
import type { StandingRow } from '@/services/stats';
import { TeamLogo } from '@/components/Brand';
import { Badge, EmptyState } from '@/components/ui';
import { cn } from '@/lib/utils';

export function StandingsTable({ rows, teams }: { rows: StandingRow[]; teams: Record<string, Team> }) {
  if (!rows.length) return <EmptyState title="No standings yet">Standings appear once teams are added to the tournament.</EmptyState>;
  return (
    <div className="card overflow-hidden">
      <div className="scrollbar-thin overflow-x-auto">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="border-b border-line bg-surface2">
            <tr className="table-head">
              <th className="w-12 px-4 py-3 text-left">#</th>
              <th className="px-4 py-3 text-left">Team</th>
              <th className="px-3 py-3 text-center">Series W-L</th>
              <th className="px-3 py-3 text-center">Games W-L</th>
              <th className="px-3 py-3 text-center">Diff</th>
              <th className="px-3 py-3 text-center">Form</th>
              <th className="px-4 py-3 text-right">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const t = teams[r.teamId];
              return (
                <tr key={r.teamId} className={cn('border-b border-line/70 last:border-0 transition hover:bg-surface2/60', r.status === 'eliminated' && 'opacity-60')}>
                  <td className="px-4 py-3 font-display text-2xl leading-none text-muted">{i + 1}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <TeamLogo url={t?.logoUrl} name={t?.name} size={34} />
                      <div className="min-w-0">
                        <p className="flex items-center gap-1.5 truncate font-semibold">
                          {t?.name ?? 'Unknown team'} {r.status === 'champion' && <Crown className="h-4 w-4 text-brand" />}
                        </p>
                        <p className="font-cond text-xs uppercase tracking-wider text-muted">{t?.tag}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-center font-semibold tabular">
                    {r.seriesW}-{r.seriesL}
                  </td>
                  <td className="px-3 py-3 text-center tabular text-muted">
                    {r.gameW}-{r.gameL}
                  </td>
                  <td className={cn('px-3 py-3 text-center font-semibold tabular', r.diff > 0 ? 'text-emerald-500' : r.diff < 0 ? 'text-brand' : 'text-muted')}>
                    {r.diff > 0 ? `+${r.diff}` : r.diff}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex justify-center gap-1">
                      {r.form.length ? (
                        r.form.map((f, fi) => (
                          <span key={fi} className={cn('flex h-5 w-5 items-center justify-center rounded text-[10px] font-bold', f === 'W' ? 'bg-emerald-500/15 text-emerald-500' : 'bg-brand/15 text-brand')}>
                            {f}
                          </span>
                        ))
                      ) : (
                        <span className="text-muted">—</span>
                      )}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    {r.status === 'champion' ? <Badge tone="live">Champion</Badge> : r.status === 'alive' ? <Badge tone="success">Alive</Badge> : <Badge tone="muted">Eliminated</Badge>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
