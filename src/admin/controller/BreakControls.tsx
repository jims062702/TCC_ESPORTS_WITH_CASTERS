import { useEffect, useRef, useState } from 'react';
import { AlarmClock, BellOff, Coffee, Crown, Megaphone, Play, Plus, Timer, Trophy, X } from 'lucide-react';
import type { LiveState, Player } from '@/types';
import { FORMAT_LABEL, winsNeeded } from '@/lib/constants';
import { clockAdjust, clockSet, endBreak, extendBreak, patchLive, setBreak, triggerEvent } from '@/services/live';
import { sideTeam } from '@/services/facts';
import { formatClock, gameElapsedMs, parseClock } from '@/lib/clock';
import { playReminderBeep } from '@/overlay/sound';
import { useNow } from '@/hooks/useFirestore';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/Confirm';
import { cn } from '@/lib/utils';

/** "3:07" from milliseconds (never negative). */
export const formatLeft = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** A valid break length in minutes (an empty or 0 field falls back to 5 so there is always a countdown). */
export const breakMinutes = (v: number) => (Number.isFinite(v) && v > 0 ? Math.min(60, v) : 5);

export const isPaused = (live: LiveState) => live.phase === 'break' && Boolean(live.breakPause);

const CUSTOM = '__custom__';

/** Ready-made break / pause messages (with the real team names) — pick one, no typing needed. */
export function breakMessages(live: LiveState, kind: 'pause' | 'break'): string[] {
  const blue = sideTeam(live, 'blue')?.name ?? 'Blue side';
  const red = sideTeam(live, 'red')?.name ?? 'Red side';
  const next = live.scoreA + live.scoreB + 1;
  const a = live.teamA?.name ?? blue;
  const b = live.teamB?.name ?? red;
  if (kind === 'pause')
    return [
      'Technical pause — we will be right back',
      `${blue} technical pause`,
      `${red} technical pause`,
      `Pause requested by ${blue}`,
      `Pause requested by ${red}`,
      'Player reconnecting — the game resumes shortly',
      'Network issue — resuming shortly',
      'Device check in progress',
      'Referee review in progress',
      'Short pause — stay with us!',
      'Game paused — please stand by',
    ];
  const seriesOver = Math.max(live.scoreA, live.scoreB) >= winsNeeded(live.format);
  return seriesOver
    ? ['Thank you for watching!', 'The champions will be crowned shortly', 'Stay tuned for the next series', 'Short break — stay with us!']
    : [
        `Game ${next} starts soon!`,
        `${a} vs ${b} — Game ${next} up next`,
        `The draft for Game ${next} starts soon`,
        'Players are resetting — back in a few minutes',
        'Short break — stay with us!',
        'Series continues after the break',
        'Technical difficulties — please stand by',
        'We will be right back!',
      ];
}

/** Scroll through ready-made messages; "Custom…" lets you type one if you must. */
export function MessagePicker({ live, kind, value, onChange }: { live: LiveState; kind: 'pause' | 'break'; value: string; onChange: (v: string) => void }) {
  const options = breakMessages(live, kind);
  const custom = value !== '' && !options.includes(value);
  const [typing, setTyping] = useState(custom);
  return (
    <div className="space-y-1.5">
      <Select
        value={typing ? CUSTOM : value}
        onChange={(e) => {
          if (e.target.value === CUSTOM) {
            setTyping(true);
            onChange('');
          } else {
            setTyping(false);
            onChange(e.target.value);
          }
        }}
        aria-label="Message on the break screen"
      >
        {/* What the overlay shows when no message was set */}
        {value === '' && !typing && <option value="">{kind === 'pause' ? 'Game paused' : "We'll be right back"} (default)</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
        <option value={CUSTOM}>Custom message…</option>
      </Select>
      {typing && <Input autoFocus value={value} onChange={(e) => onChange(e.target.value)} placeholder="Type the message" />}
    </div>
  );
}

/** Quick announcements: game intro, series victory, clear banner. */
export function AnnouncementsCard({ live }: { live: LiveState }) {
  const toast = useToast();
  const ask = useConfirm();
  const need = winsNeeded(live.format);
  const seriesOver = Math.max(live.scoreA, live.scoreB) >= need;
  const leaderIsA = live.scoreA > live.scoreB;
  const leader = leaderIsA ? live.teamA : live.teamB;
  return (
    <Card title="Announcements" subtitle="Each queues a call for the casters and a graphic on the overlays.">
      <div className="grid gap-2">
        <Button
          variant="secondary"
          icon={<Megaphone className="h-4 w-4" />}
          onClick={() =>
            void ask({ title: 'Game intro?', message: `The "Game ${live.gameNumber}" intro graphic goes on stream and the casters introduce the game.`, confirmLabel: 'Announce' }).then((ok) => {
              if (ok) void toast.run(() => triggerEvent(live, 'GAME_INTRO'), 'Game intro queued');
            })
          }
        >
          Game intro — Game {live.gameNumber} of {FORMAT_LABEL[live.format]}
        </Button>
        <Button
          variant="secondary"
          disabled={!seriesOver}
          title={seriesOver ? '' : 'Available once a team has won the series'}
          icon={live.isFinal ? <Crown className="h-4 w-4" /> : <Trophy className="h-4 w-4" />}
          onClick={() =>
            void ask({ title: live.isFinal ? 'Champion announcement?' : 'Series victory announcement?', message: `${leader?.name ?? 'The winner'} — the casters celebrate the ${live.isFinal ? 'championship' : 'series win'} on stream.`, confirmLabel: 'Announce' }).then((ok) => {
              if (ok) void toast.run(() => triggerEvent(live, 'SERIES_VICTORY', { side: null, data: { winnerIsA: leaderIsA, seriesOver: true, isChampionship: live.isFinal } }), 'Victory announcement queued');
            })
          }
        >
          {live.isFinal ? 'Champion announcement' : 'Series victory announcement'}
          {seriesOver && leader ? ` — ${leader.tag} ${Math.max(live.scoreA, live.scoreB)}-${Math.min(live.scoreA, live.scoreB)}` : ''}
        </Button>
        {live.banner && (
          <Button variant="ghost" icon={<X className="h-4 w-4" />} onClick={() => toast.run(() => patchLive({ banner: null }))}>
            Clear on-screen banner
          </Button>
        )}
      </div>
    </Card>
  );
}

/** Big remaining-time readout for a break or pause. */
export function TimeLeft({ endsAt, now, label }: { endsAt: number | null; now: number; label: string }) {
  if (!endsAt) return <p className="rounded-xl border border-dashed border-line px-3 py-2 text-center text-sm text-muted">No countdown — press +1 min to add one</p>;
  const left = endsAt - now;
  const urgent = left <= 10_000;
  return (
    <div className={cn('flex items-center justify-between rounded-xl border px-4 py-2', urgent ? 'animate-pulse border-brand bg-brand/10' : 'border-line bg-surface2')} data-testid="time-left">
      <span className="flex items-center gap-2 font-cond text-xs font-semibold uppercase tracking-wider text-muted">
        <Timer className="h-4 w-4" /> {label}
      </span>
      <span className={cn('font-display text-4xl leading-none tabular', urgent && 'text-brand')}>{left > 0 ? formatLeft(left) : "Time's up"}</span>
    </div>
  );
}

/**
 * In-game "Pause the game": stops the game clock and puts the break screen on
 * air while the controller stays on In-game. The game resumes when the
 * countdown ends (or End pause); a reminder rings from 10 s left.
 */
export function PauseCard({ live, players }: { live: LiveState; players: Player[] }) {
  const toast = useToast();
  const ask = useConfirm();
  const now = useNow(500);
  const [minutes, setMinutes] = useState(5);
  const [message, setMessage] = useState('');
  const paused = isPaused(live);
  const msg = message || breakMessages(live, 'pause')[0];
  return (
    <Card
      title={paused ? 'Game paused' : 'Pause the game'}
      subtitle={paused ? 'The game clock is stopped. It resumes by itself when the time is up.' : 'Technical pause in the middle of the game — the game clock stops and resumes when the pause ends.'}
    >
      {paused ? (
        <div className="space-y-3" data-testid="pause-active">
          <TimeLeft endsAt={live.breakEndsAt} now={now} label="Pause ends in" />
          <Field label="Message on the break screen (changes it right away)">
            <MessagePicker live={live} kind="pause" value={live.breakMessage} onChange={(breakMessage) => void patchLive({ breakMessage })} />
          </Field>
          <div className="grid grid-cols-[auto_1fr] gap-2">
            <Button variant="secondary" icon={<Plus className="h-4 w-4" />} onClick={() => toast.run(() => extendBreak(live, 60), '+1 minute')}>
              1 min
            </Button>
            <Button icon={<Play className="h-4 w-4" />} onClick={() => toast.run(() => endBreak(live, players), 'Pause over — game clock running again')}>
              End pause → resume game
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-[90px_1fr]">
            <Field label="Minutes">
              <Input type="number" min={1} max={60} value={minutes} onChange={(e) => setMinutes(Number(e.target.value))} />
            </Field>
            <Field label="Message on the break screen">
              <MessagePicker live={live} kind="pause" value={msg} onChange={setMessage} />
            </Field>
          </div>
          <Button
            className="w-full"
            variant="secondary"
            icon={<Coffee className="h-4 w-4" />}
            disabled={!live.gameStartedAt}
            title={live.gameStartedAt ? '' : 'Start the game first'}
            onClick={() =>
              void ask({ title: 'Pause the game?', message: `The game clock stops and the break screen shows "${msg}" with a ${breakMinutes(minutes)}:00 countdown. You stay on the In-game screen.`, confirmLabel: 'Pause the game' }).then((ok) => {
                if (ok) void toast.run(() => setBreak(live, breakMinutes(minutes), msg, { pause: true }), `Game paused for ${breakMinutes(minutes)} min — clock stopped`);
              })
            }
          >
            Pause the game ({breakMinutes(minutes)} min)
          </Button>
          <p className="text-xs text-muted">The break screen (highlights, countdown, break music) goes on air; you stay on this In-game screen.</p>
        </div>
      )}
    </Card>
  );
}

/**
 * Watches a "Pause the game": rings a reminder from 10 s left until the
 * operator clicks it, and resumes the game by itself when the time is up.
 */
export function usePauseWatch(live: LiveState, players: Player[]) {
  const toast = useToast();
  const now = useNow(250);
  const paused = isPaused(live) && Boolean(live.breakEndsAt);
  const endsAt = live.breakEndsAt;
  const left = paused && endsAt ? endsAt - now : null;
  const [ringing, setRinging] = useState(false);
  const dismissedFor = useRef<number | null>(null);
  const resumedFor = useRef<number | null>(null);
  const wasPaused = useRef(paused);

  // 10 seconds left → start the reminder (once per countdown).
  useEffect(() => {
    if (left !== null && left <= 10_000 && endsAt !== null && dismissedFor.current !== endsAt) setRinging(true);
  }, [left, endsAt]);

  // Time's up → resume the game (once).
  useEffect(() => {
    if (left !== null && left <= 0 && endsAt !== null && resumedFor.current !== endsAt) {
      resumedFor.current = endsAt;
      void toast.run(() => endBreak(live, players), 'Pause over — game clock running again');
    }
  }, [left, endsAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // The operator ended the pause early → that click also stops the reminder.
  useEffect(() => {
    if (wasPaused.current && !paused && resumedFor.current !== endsAt) setRinging(false);
    wasPaused.current = paused;
  }, [paused, endsAt]);

  // The alarm itself: a beep every second until clicked.
  useEffect(() => {
    if (!ringing) return;
    playReminderBeep();
    const t = setInterval(() => playReminderBeep(), 1000);
    return () => clearInterval(t);
  }, [ringing]);

  const stop = () => {
    dismissedFor.current = endsAt ?? -1;
    setRinging(false);
  };
  return { ringing, stop, left, paused };
}

/**
 * Mounted once in the admin layout: the pause reminder and auto-resume keep
 * working on every admin page (Live Controller, Settings…).
 */
export function PauseWatcher({ live, players }: { live: LiveState; players: Player[] }) {
  const w = usePauseWatch(live, players);
  return <PauseReminder ringing={w.ringing} left={w.left} paused={w.paused} onStop={w.stop} />;
}

/** Floating reminder while the pause is ending — keeps beeping until clicked. */
export function PauseReminder({ ringing, left, paused, onStop }: { ringing: boolean; left: number | null; paused: boolean; onStop: () => void }) {
  if (!ringing) return null;
  return (
    <button
      onClick={onStop}
      className="fixed left-1/2 top-4 z-[60] flex -translate-x-1/2 animate-pulse items-center gap-3 rounded-2xl border-2 border-brand bg-surface/95 px-5 py-3 text-left shadow-2xl backdrop-blur"
      data-testid="pause-reminder"
    >
      <AlarmClock className="h-7 w-7 text-brand" />
      <span>
        <span className="block font-display text-2xl uppercase leading-none">
          {paused && left !== null && left > 0 ? `Pause ends in ${formatLeft(left)}` : 'Pause over — game resumed'}
        </span>
        <span className="block text-xs text-muted">Click to stop the reminder</span>
      </span>
      <BellOff className="h-5 w-5 text-muted" />
    </button>
  );
}

/** Game clock in the scoreboard header (under the series score). */
export function HeaderClock({ live }: { live: LiveState }) {
  const toast = useToast();
  const now = useNow(250);
  const [text, setText] = useState('');
  const elapsed = gameElapsedMs(live, now);
  const paused = Boolean(live.clockPausedAt);
  const started = Boolean(live.gameStartedAt);
  return (
    <div className="mt-2 flex flex-col items-center gap-1.5" data-testid="header-clock">
      <div className="flex items-center gap-2">
        <Timer className={cn('h-4 w-4', paused ? 'text-amber-500' : 'text-brand')} />
        <span className={cn('font-display text-3xl leading-none tabular', paused && 'text-amber-500')} title="Game clock (shown on the HUD)">
          {started ? formatClock(elapsed) : '00:00'}
        </span>
        {paused && <span className="font-cond text-[10px] font-semibold uppercase tracking-wider text-amber-500">paused</span>}
      </div>
      <div className="flex flex-wrap items-center justify-center gap-1">
        {[-10, -1, 1, 10].map((d) => (
          <Button key={d} size="xs" variant="ghost" disabled={!started} onClick={() => toast.run(() => clockAdjust(live, d))}>
            {d > 0 ? `+${d}s` : `${d}s`}
          </Button>
        ))}
        <Input className="h-7 w-16 px-2 py-0 text-xs" placeholder="mm:ss" value={text} onChange={(e) => setText(e.target.value)} />
        <Button
          size="xs"
          variant="secondary"
          onClick={() => {
            const s = parseClock(text);
            if (s === null) return toast.error('Type the in-game time like 12:34');
            void toast.run(() => clockSet(live, s), 'Clock synced');
            setText('');
          }}
        >
          Set
        </Button>
      </div>
    </div>
  );
}
