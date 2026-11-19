import { useMemo, useState } from 'react';
import { Download, Library, Shuffle } from 'lucide-react';
import { CASTERS, CASTER_BY_ID, type CasterId } from '@/services/casters';
import { LINE_GROUPS, enumerateLines, libraryStats, type LineGroup } from '@/services/personaLines';
import { eventPairCount } from '@/services/templates';
import { CasterAvatar } from '@/components/Brand';
import { Button, Card, Input, Select } from '@/components/ui';
import { cn, shuffle } from '@/lib/utils';

const GROUP_LABEL: Record<LineGroup, string> = {
  DRAFTBAN: 'Draft bans',
  DRAFTPICK: 'Draft picks',
  DRAFTTALK: 'Draft talk (speculation & story)',
  DRAFTSTART: 'Drafting phase welcome',
  GAMESTART: 'Game start',
  BREAK: 'Going to break',
  INTRO: 'Game intro',
  DRAFT: 'Draft',
  KILL: 'Kills (FB / 2K / 3K)',
  BIGKILL: 'Maniac / Savage',
  OBJECTIVE: 'Turtle / Lord / Buff',
  STEAL: 'Objective steals',
  CONTEST: 'Objective contest',
  GOLD: 'Gold lead',
  EVEN: 'Gold even',
  SPELL: 'Battle spells',
  REPLAY: 'Instant replay',
  RESULT: 'Game result',
  VICTORY: 'Series victory',
  CHAMPION: 'Champions',
  BANTER: 'Desk banter',
};

/**
 * Browse / search / export the caster line generator. Every line is a
 * template: {placeholders} are filled with verified match facts on air.
 */
export function LineLibrary({ profiles }: { profiles: Record<string, { avatarUrl: string; displayName: string }> }) {
  const stats = useMemo(() => libraryStats(), []);
  const [caster, setCaster] = useState<CasterId>('ken');
  const [group, setGroup] = useState<LineGroup>('BIGKILL');
  const [q, setQ] = useState('');
  const [seed, setSeed] = useState(0);

  const lines = useMemo(() => [...enumerateLines(caster, group)].map((l) => l.text), [caster, group]);
  const shown = useMemo(() => {
    const filtered = q ? lines.filter((l) => l.toLowerCase().includes(q.toLowerCase())) : lines;
    return (seed ? shuffle(filtered) : filtered).slice(0, 40);
  }, [lines, q, seed]);

  const exportJson = (who: CasterId | 'all') => {
    const ids = who === 'all' ? CASTERS.map((c) => c.id) : [who];
    const data = Object.fromEntries(
      ids.map((id) => {
        const byGroup: Record<string, string[]> = {};
        for (const l of enumerateLines(id)) (byGroup[l.group] ??= []).push(l.text);
        return [id, { name: CASTER_BY_ID[id].name, role: CASTER_BY_ID[id].role, lines: byGroup }];
      }),
    );
    const blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `tcc-caster-lines-${who}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  };

  return (
    <Card
      title="Caster line library"
      subtitle={`${stats.total.toLocaleString()} unique in-character caster lines + ${eventPairCount()} event calls, built into the app — no storage, no AI calls. {placeholders} are filled with live match facts.`}
      actions={
        <Button size="sm" variant="secondary" icon={<Download className="h-4 w-4" />} onClick={() => exportJson('all')}>
          Export all (.json)
        </Button>
      }
    >
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">
        {CASTERS.map((c) => (
          <button
            key={c.id}
            onClick={() => setCaster(c.id)}
            className={cn('flex flex-col items-center gap-1 rounded-xl border p-2 text-center transition', caster === c.id ? 'border-brand bg-brand/10' : 'border-line hover:border-brand/50')}
          >
            <CasterAvatar casterId={c.id} url={profiles[c.id]?.avatarUrl} size={32} />
            <span className="w-full truncate text-xs font-semibold">{profiles[c.id]?.displayName || c.name}</span>
            <span className="font-display text-lg leading-none">{stats.perCaster[c.id]?.toLocaleString()}</span>
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Select value={group} onChange={(e) => setGroup(e.target.value as LineGroup)} className="w-56">
          {LINE_GROUPS.map((g) => (
            <option key={g} value={g}>
              {GROUP_LABEL[g]}
            </option>
          ))}
        </Select>
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search lines" className="w-56" />
        <Button size="sm" variant="secondary" icon={<Shuffle className="h-4 w-4" />} onClick={() => setSeed((s) => s + 1)}>
          Shuffle
        </Button>
        <Button size="sm" variant="ghost" icon={<Download className="h-4 w-4" />} onClick={() => exportJson(caster)}>
          Export {CASTER_BY_ID[caster].name}
        </Button>
        <span className="ml-auto flex items-center gap-1 text-xs text-muted">
          <Library className="h-3.5 w-3.5" /> {lines.length.toLocaleString()} lines in this group
        </span>
      </div>
      <ul className="scrollbar-thin mt-3 max-h-72 space-y-1.5 overflow-y-auto text-sm">
        {shown.map((l) => (
          <li key={l} className="rounded-lg bg-surface2 px-3 py-1.5">
            {l.split(/(\{\w+\})/g).map((part, i) =>
              /^\{\w+\}$/.test(part) ? (
                <span key={i} className="rounded bg-accent/15 px-1 font-mono text-[12px] text-accent">
                  {part}
                </span>
              ) : (
                <span key={i}>{part}</span>
              ),
            )}
          </li>
        ))}
        {!shown.length && <li className="text-muted">No lines match.</li>}
      </ul>
    </Card>
  );
}
