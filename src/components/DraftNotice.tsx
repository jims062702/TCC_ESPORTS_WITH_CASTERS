import { History } from 'lucide-react';

/** "Draft restored" strip at the top of a form that reopened with unsaved input. */
export function DraftNotice({ onDiscard }: { onDiscard: () => void }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs" data-testid="draft-restored">
      <span className="flex items-center gap-1.5 text-amber-700 dark:text-amber-300">
        <History className="h-4 w-4 shrink-0" /> Draft restored — what you typed before closing is back.
      </span>
      <button type="button" onClick={onDiscard} className="shrink-0 font-semibold text-muted underline-offset-2 hover:text-fg hover:underline">
        Discard draft
      </button>
    </div>
  );
}
