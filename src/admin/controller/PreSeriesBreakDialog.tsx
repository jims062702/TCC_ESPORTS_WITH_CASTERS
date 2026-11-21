import { useEffect, useState } from 'react';
import { Coffee, Radio } from 'lucide-react';
import type { LiveState, Match, Team, Tournament } from '@/types';
import { TeamLogo } from '@/components/Brand';
import { Badge, Button, Field, Input, Modal, Select } from '@/components/ui';

export function PreSeriesBreakDialog({
  open,
  onClose,
  matches,
  teams,
  live,
  onStartBreak,
  onStopBreak,
}: {
  open: boolean;
  onClose: () => void;
  tournament: Tournament | null;
  matches: Match[];
  teams: Team[];
  live: LiveState;
  onStartBreak: (opts: {
    match: Match | null;
    teamA: Team | null;
    teamB: Team | null;
    minutes: number;
    message: string;
  }) => Promise<void>;
  onStopBreak: () => Promise<void>;
}) {
  const isBreakActive = live.phase === 'break';
  const readyMatches = matches.filter((m) => m.teamAId && m.teamBId && (m.status === 'ready' || m.status === 'live' || m.status === 'pending'));

  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [minutes, setMinutes] = useState(5);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  // Initialize form state when opened
  useEffect(() => {
    if (!open) return;
    if (isBreakActive) {
      setMessage(live.breakMessage || '');
      const leftMinutes = live.breakEndsAt ? Math.max(1, Math.ceil((live.breakEndsAt - Date.now()) / 60000)) : 5;
      setMinutes(leftMinutes);
      const currentMatch = readyMatches.find(
        (m) =>
          (m.teamAId === live.teamA?.id && m.teamBId === live.teamB?.id) ||
          (m.teamAId === live.teamB?.id && m.teamBId === live.teamA?.id) ||
          m.label === live.matchLabel,
      );
      setSelectedMatchId(currentMatch?.id ?? '');
    } else {
      const first = readyMatches[0];
      setSelectedMatchId(first?.id ?? '');
      setMinutes(5);
      if (first) {
        const tA = teams.find((t) => t.id === first.teamAId);
        const tB = teams.find((t) => t.id === first.teamBId);
        setMessage(`Up Next: ${tA?.tag || tA?.name || 'Team A'} vs ${tB?.tag || tB?.name || 'Team B'}`);
      } else {
        setMessage('Short break — stay with us!');
      }
    }
  }, [open, isBreakActive]);

  const selectedMatch = readyMatches.find((m) => m.id === selectedMatchId) ?? null;
  const teamA = selectedMatch ? teams.find((t) => t.id === selectedMatch.teamAId) ?? null : null;
  const teamB = selectedMatch ? teams.find((t) => t.id === selectedMatch.teamBId) ?? null : null;

  const handleMatchChange = (matchId: string) => {
    setSelectedMatchId(matchId);
    if (!matchId) {
      setMessage('Short break — stay with us!');
      return;
    }
    const m = readyMatches.find((x) => x.id === matchId);
    if (m) {
      const tA = teams.find((t) => t.id === m.teamAId);
      const tB = teams.find((t) => t.id === m.teamBId);
      setMessage(`Up Next: ${tA?.tag || tA?.name || 'Team A'} vs ${tB?.tag || tB?.name || 'Team B'}`);
    }
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onStartBreak({
        match: selectedMatch,
        teamA,
        teamB,
        minutes,
        message: message.trim() || 'Short break — stay with us!',
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    try {
      await onStopBreak();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <Coffee className="h-5 w-5 text-brand" />
          <span>{isBreakActive ? 'Manage Break Screen' : 'Start Break Screen'}</span>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="text-xs text-muted">
          Puts the break overlay on air in OBS with a countdown timer, background highlights playlist, and &quot;Up Next&quot; team preview.
          Even while the break is running, clicking &quot;Go live&quot; on any match will immediately cancel the break and open the draft.
        </p>

        {/* Up Next Match Selection */}
        <Field label="Who is up next? (Select upcoming match)" hint="Displays team logos, names, and match label on the break screen">
          <Select
            value={selectedMatchId}
            onChange={(e) => handleMatchChange(e.target.value)}
            className="w-full"
          >
            <option value="">— No specific match (General break) —</option>
            {readyMatches.map((m) => {
              const tA = teams.find((t) => t.id === m.teamAId);
              const tB = teams.find((t) => t.id === m.teamBId);
              return (
                <option key={m.id} value={m.id}>
                  [{m.label}] {tA?.tag || tA?.name || 'TBD'} vs {tB?.tag || tB?.name || 'TBD'} ({m.format})
                </option>
              );
            })}
          </Select>
        </Field>

        {/* Preview of chosen teams */}
        {selectedMatch && teamA && teamB && (
          <div className="flex items-center justify-between rounded-xl border border-line bg-surface2 px-4 py-3">
            <div className="flex items-center gap-2 min-w-0">
              <TeamLogo url={teamA.logoUrl} name={teamA.name} size={36} />
              <div className="min-w-0">
                <p className="truncate font-semibold text-sm">{teamA.name}</p>
                <Badge tone="accent" className="text-[10px]">{teamA.tag}</Badge>
              </div>
            </div>
            <span className="font-display text-lg text-muted px-2">VS</span>
            <div className="flex items-center gap-2 min-w-0 text-right">
              <div className="min-w-0">
                <p className="truncate font-semibold text-sm">{teamB.name}</p>
                <Badge tone="brand" className="text-[10px]">{teamB.tag}</Badge>
              </div>
              <TeamLogo url={teamB.logoUrl} name={teamB.name} size={36} />
            </div>
          </div>
        )}

        {/* Break Duration */}
        <Field label="Break duration (minutes)" hint="Countdown timer displayed on the break overlay">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[3, 5, 10, 15].map((m) => (
                <Button
                  key={m}
                  type="button"
                  size="xs"
                  variant={minutes === m ? 'primary' : 'secondary'}
                  onClick={() => setMinutes(m)}
                >
                  {m} min
                </Button>
              ))}
            </div>
            <Input
              type="number"
              min={1}
              max={60}
              value={minutes}
              onChange={(e) => setMinutes(Math.max(1, Math.min(60, Number(e.target.value) || 1)))}
              className="w-full"
            />
          </div>
        </Field>

        {/* Message on Break Screen */}
        <Field label="Message on the break screen" hint="Main title shown on the overlay">
          <div className="space-y-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Up Next: Team A vs Team B"
              className="w-full"
            />
            <div className="flex flex-wrap items-center gap-1">
              {[
                selectedMatch && teamA && teamB ? `Up Next: ${teamA.tag} vs ${teamB.tag}` : null,
                'Tournament starting soon',
                'Short break — stay with us!',
                "We'll be right back",
              ]
                .filter((x): x is string => Boolean(x))
                .map((msg) => (
                  <button
                    key={msg}
                    type="button"
                    onClick={() => setMessage(msg)}
                    className="rounded bg-surface2 px-2 py-0.5 text-[11px] text-muted hover:text-white transition"
                  >
                    {msg}
                  </button>
                ))}
            </div>
          </div>
        </Field>

        {/* Footer Actions */}
        <div className="flex items-center justify-between pt-2 border-t border-line">
          {isBreakActive ? (
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={busy}
              onClick={handleStop}
            >
              Stop Break (Off Air)
            </Button>
          ) : (
            <div />
          )}
          <div className="flex items-center gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              loading={busy}
              icon={<Radio className="h-4 w-4" />}
              onClick={handleConfirm}
            >
              {isBreakActive ? 'Update Break' : 'Put Break on Air'}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
