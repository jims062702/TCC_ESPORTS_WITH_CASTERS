import { useEffect, useState } from 'react';
import { Coffee, Power, Radio } from 'lucide-react';
import type { LiveState, Match, Team, Tournament } from '@/types';
import { winsNeeded } from '@/lib/constants';
import { TeamLogo } from '@/components/Brand';
import { Badge, Button, Field, Input, Modal, Select } from '@/components/ui';

export function EndBroadcastDialog({
  open,
  onClose,
  live,
  matches,
  teams,
  onConfirmBreak,
  onDirectEnd,
}: {
  open: boolean;
  onClose: () => void;
  live: LiveState;
  tournament: Tournament | null;
  matches: Match[];
  teams: Team[];
  onConfirmBreak: (opts: {
    minutes: number;
    message: string;
    nextMatch: Match | null;
    nextTeamA: Team | null;
    nextTeamB: Team | null;
  }) => Promise<void>;
  onDirectEnd: () => Promise<void>;
}) {
  const isSeriesOver = Math.max(live.scoreA, live.scoreB) >= winsNeeded(live.format);
  const remainingMatches = matches.filter(
    (m) => m.id !== live.matchId && m.teamAId && m.teamBId && (m.status === 'ready' || m.status === 'pending'),
  );

  const [selectedMatchId, setSelectedMatchId] = useState<string>('');
  const [minutes, setMinutes] = useState(10);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const nextMatch = remainingMatches[0] ?? null;
    setSelectedMatchId(nextMatch?.id ?? '');
    setMinutes(isSeriesOver ? 10 : 5);
    if (nextMatch) {
      const tA = teams.find((t) => t.id === nextMatch.teamAId);
      const tB = teams.find((t) => t.id === nextMatch.teamBId);
      setMessage(`Up Next: ${tA?.tag || tA?.name || 'Team A'} vs ${tB?.tag || tB?.name || 'Team B'}`);
    } else {
      setMessage(isSeriesOver ? 'Thank you for watching!' : 'Short break — stay with us!');
    }
  }, [open, isSeriesOver]);

  const selectedMatch = remainingMatches.find((m) => m.id === selectedMatchId) ?? null;
  const teamA = selectedMatch ? teams.find((t) => t.id === selectedMatch.teamAId) ?? null : null;
  const teamB = selectedMatch ? teams.find((t) => t.id === selectedMatch.teamBId) ?? null : null;

  const handleMatchChange = (matchId: string) => {
    setSelectedMatchId(matchId);
    if (!matchId) {
      setMessage(isSeriesOver ? 'Thank you for watching!' : 'Short break — stay with us!');
      return;
    }
    const m = remainingMatches.find((x) => x.id === matchId);
    if (m) {
      const tA = teams.find((t) => t.id === m.teamAId);
      const tB = teams.find((t) => t.id === m.teamBId);
      setMessage(`Up Next: ${tA?.tag || tA?.name || 'Team A'} vs ${tB?.tag || tB?.name || 'Team B'}`);
    }
  };

  const handleStartBreak = async () => {
    setBusy(true);
    try {
      await onConfirmBreak({
        minutes,
        message: message.trim() || 'Short break — stay with us!',
        nextMatch: selectedMatch,
        nextTeamA: teamA,
        nextTeamB: teamB,
      });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const handleDirectOffAir = async () => {
    setBusy(true);
    try {
      await onDirectEnd();
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
          <span>{isSeriesOver ? 'Series Complete · End Broadcast' : 'End Broadcast'}</span>
        </div>
      }
    >
      <div className="space-y-4">
        {isSeriesOver ? (
          <div className="rounded-xl border border-brand/40 bg-brand/10 p-3 text-sm">
            <p className="font-semibold text-brand">Series finished ({live.scoreA}-{live.scoreB})</p>
            <p className="text-xs text-muted mt-0.5">
              Choose the break duration and message below to put the break screen on air. You will be returned to the Live Controller (Put a series on air) where you can pick and Go live on the next series at any time.
            </p>
          </div>
        ) : (
          <p className="text-xs text-muted">
            Takes this series off air. You can choose to start a break screen now for viewers while you return to the series list, or go completely off air.
          </p>
        )}

        {/* Up Next Match Selection */}
        <Field label="Upcoming series (Up Next)" hint="Displayed on the break overlay for viewers">
          <Select
            value={selectedMatchId}
            onChange={(e) => handleMatchChange(e.target.value)}
            className="w-full"
          >
            <option value="">— No upcoming match (General / closing break) —</option>
            {remainingMatches.map((m) => {
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
        <Field label="Break duration (minutes)" hint="Countdown displayed on the break overlay">
          <div className="space-y-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {[3, 5, 10, 15, 20].map((m) => (
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
        <Field label="Message on the break screen" hint="Headline text on the break overlay">
          <div className="space-y-2">
            <Input
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="e.g. Series finished — Next match starting soon"
              className="w-full"
            />
            <div className="flex flex-wrap items-center gap-1">
              {[
                selectedMatch && teamA && teamB ? `Up Next: ${teamA.tag} vs ${teamB.tag}` : null,
                'Series concluded — Next series starting soon',
                'Thank you for watching!',
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
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-line">
          <Button
            type="button"
            variant="danger"
            size="sm"
            loading={busy}
            icon={<Power className="h-4 w-4" />}
            onClick={handleDirectOffAir}
          >
            End without break (Off air)
          </Button>
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
              onClick={handleStartBreak}
            >
              Start Break &amp; Return to Controller
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
