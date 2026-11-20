import { useState } from 'react';
import { RotateCcw, ShieldCheck } from 'lucide-react';
import { resetData, resetScope, type ResetOptions } from '@/services/reset';
import { useConfirm } from '@/components/Confirm';
import { useToast } from '@/components/Toast';
import { Button, Card, Switch } from '@/components/ui';

const OPTIONS: { key: keyof ResetOptions; label: string; detail: string }[] = [
  { key: 'stats', label: 'Stats', detail: 'Hero picks & bans, player stats, leaderboard, game MVPs and Finals MVP (all recorded games).' },
  { key: 'brackets', label: 'Brackets & match results', detail: 'Every bracket and series result. Tournaments stay, ready to generate a new bracket.' },
  { key: 'rosters', label: 'Tournaments, teams & players', detail: 'Removes them completely (team logos and player photos too).' },
  { key: 'aiLines', label: 'AI caster line library', detail: 'Gemini pre-generated lines. Built-in lines stay.' },
];

/** Settings → Reset data: a fresh start that never touches images (heroes, casters, spells, carousel). */
export function ResetDataCard() {
  const toast = useToast();
  const ask = useConfirm();
  const [opts, setOpts] = useState<ResetOptions>({ stats: true, brackets: false, rosters: false, aiLines: false });
  const [busy, setBusy] = useState(false);
  const scope = resetScope(opts);
  const chosen = OPTIONS.filter((o) => scope[o.key]);

  const run = async () => {
    if (!chosen.length) return toast.error('Choose what to reset');
    const ok = await ask({
      title: 'Reset data?',
      message: (
        <div className="space-y-2">
          <p>This permanently removes:</p>
          <ul className="list-disc pl-5 text-fg">
            {chosen.map((o) => (
              <li key={o.key}>{o.label}</li>
            ))}
          </ul>
          <p>Hero images, caster photos, spell icons, carousel images and highlight clips are kept.</p>
          <p>Type RESET to confirm.</p>
        </div>
      ),
      confirmLabel: 'Reset data',
      danger: true,
      requireText: 'RESET',
    });
    if (!ok) return;
    setBusy(true);
    const removed = await toast.run(() => resetData(opts));
    setBusy(false);
    if (removed) {
      const total = Object.values(removed).reduce((a, b) => a + b, 0);
      toast.success(`Reset done — ${total} record${total === 1 ? '' : 's'} removed`);
    }
  };

  return (
    <Card title="Reset data" subtitle="Start fresh (e.g. after testing). Images are never deleted: hero portraits, caster photos, battle-spell icons, carousel images and highlight clips stay.">
      <div className="space-y-3">
        {OPTIONS.map((o) => {
          const implied = scope[o.key] && !opts[o.key];
          return (
            <div key={o.key} className="flex items-start justify-between gap-4 rounded-xl border border-line bg-surface2 p-3">
              <div className="min-w-0">
                <p className="font-semibold">{o.label}</p>
                <p className="text-xs text-muted">
                  {o.detail}
                  {implied && <span className="text-amber-600 dark:text-amber-400"> Included because of the option below.</span>}
                </p>
              </div>
              <Switch checked={scope[o.key]} disabled={implied} onChange={(v) => setOpts((s) => ({ ...s, [o.key]: v }))} label="" />
            </div>
          );
        })}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ShieldCheck className="h-4 w-4 text-emerald-500" /> Images are always kept. A series that is on air must be ended first.
          </p>
          <Button variant="destructive" loading={busy} icon={<RotateCcw className="h-4 w-4" />} onClick={run}>
            Reset data
          </Button>
        </div>
      </div>
    </Card>
  );
}
