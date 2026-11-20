import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CalendarRange, ChevronDown, ChevronUp } from 'lucide-react';
import type { Tournament } from '@/types';
import { cn, safeLocalGet, safeLocalSet } from '@/lib/utils';

const OPEN_KEY = 'tcc.seasonSwitcherOpen';

/** "Season 2" → 2 (for ordering); no number → null. */
const seasonNumber = (label: string) => {
  const m = /(\d+)/.exec(label);
  return m ? Number(m[1]) : null;
};

/**
 * Bottom-right season picker on the website (hide / show). Picking a season
 * shows that season's records everywhere: matches, bracket, standings,
 * leaderboard and teams. Seasons come from Tournaments → Season.
 */
export function SeasonSwitcher({ tournaments, currentId, onPick }: { tournaments: Tournament[]; currentId: string | null; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(() => safeLocalGet<boolean>(OPEN_KEY, false));
  const toggle = (v: boolean) => {
    setOpen(v);
    safeLocalSet(OPEN_KEY, v);
  };

  const seasons = useMemo(() => {
    const groups = new Map<string, Tournament[]>();
    for (const t of tournaments) {
      const label = t.season?.trim() || t.name;
      groups.set(label, [...(groups.get(label) ?? []), t]);
    }
    return [...groups.entries()]
      .map(([label, list]) => ({ label, list: [...list].sort((a, b) => b.createdAt - a.createdAt) }))
      .sort((a, b) => {
        const na = seasonNumber(a.label);
        const nb = seasonNumber(b.label);
        if (na !== null && nb !== null && na !== nb) return nb - na;
        return b.list[0].createdAt - a.list[0].createdAt;
      });
  }, [tournaments]);

  if (!tournaments.length) return null;
  const current = tournaments.find((t) => t.id === currentId) ?? null;
  const currentLabel = current ? current.season?.trim() || current.name : 'Season';
  // Phones: a compact chip ("S1") so it doesn't cover the page.
  const num = seasonNumber(currentLabel);
  const shortLabel = num !== null ? `S${num}` : currentLabel.slice(0, 6);

  return (
    <div className="fixed bottom-[88px] right-2 z-30 flex flex-col items-end gap-2 sm:bottom-4 sm:right-4" data-testid="season-switcher">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12, scale: 0.97 }}
            className="card max-h-[60vh] w-[min(88vw,300px)] overflow-y-auto p-3 shadow-2xl"
            data-testid="season-panel"
          >
            <div className="mb-2 flex items-center justify-between">
              <p className="flex items-center gap-1.5 font-cond text-xs font-bold uppercase tracking-[0.2em] text-muted">
                <CalendarRange className="h-4 w-4 text-brand" /> Seasons
              </p>
              <button onClick={() => toggle(false)} className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface2 hover:text-fg" aria-label="Hide seasons">
                Hide <ChevronDown className="h-3.5 w-3.5" />
              </button>
            </div>
            <ul className="space-y-1">
              {seasons.map((s) => (
                <li key={s.label}>
                  {s.list.length === 1 ? (
                    <SeasonButton label={s.label} sub={s.list[0].season?.trim() ? s.list[0].name : null} on={s.list[0].id === currentId} status={s.list[0].status} onClick={() => onPick(s.list[0].id)} />
                  ) : (
                    <div className="rounded-lg border border-line p-1.5">
                      <p className="px-1.5 pb-1 font-cond text-xs font-bold uppercase tracking-wider text-muted">{s.label}</p>
                      {s.list.map((t) => (
                        <SeasonButton key={t.id} label={t.name} on={t.id === currentId} status={t.status} onClick={() => onPick(t.id)} />
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
      <button
        onClick={() => toggle(!open)}
        className="flex items-center gap-1.5 rounded-full border border-line bg-surface/95 px-2.5 py-1.5 text-xs font-semibold shadow-lg backdrop-blur hover:border-brand sm:gap-2 sm:px-3.5 sm:py-2 sm:text-sm"
        aria-expanded={open}
        data-testid="season-toggle"
      >
        <CalendarRange className="h-4 w-4 text-brand" />
        <span className="sm:hidden">{shortLabel}</span>
        <span className="hidden max-w-[160px] truncate sm:inline">{currentLabel}</span>
        {open ? <ChevronDown className="h-4 w-4 text-muted" /> : <ChevronUp className="h-4 w-4 text-muted" />}
      </button>
    </div>
  );
}

function SeasonButton({ label, sub, on, status, onClick }: { label: string; sub?: string | null; on: boolean; status: Tournament['status']; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={cn('flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition', on ? 'bg-brand text-white' : 'hover:bg-surface2')}
    >
      <span className="min-w-0">
        <span className="block truncate font-semibold">{label}</span>
        {sub && <span className={cn('block truncate text-xs', on ? 'text-white/80' : 'text-muted')}>{sub}</span>}
      </span>
      <span className={cn('shrink-0 font-cond text-[10px] font-bold uppercase tracking-wider', on ? 'text-white/80' : status === 'ongoing' ? 'text-emerald-500' : 'text-muted')}>
        {status === 'ongoing' ? 'Live' : status === 'completed' ? 'Done' : 'Soon'}
      </span>
    </button>
  );
}
