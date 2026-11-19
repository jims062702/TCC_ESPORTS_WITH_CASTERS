import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, GitBranch, Plus, Radio, RotateCcw, Save, Shuffle, Trash2, Trophy, X } from 'lucide-react';
import type { Match, SeriesFormat, Tournament, TournamentStatus, TournamentType } from '@/types';
import { useIndex, useMatches, usePlayers, useTeams, useTournaments, useLive } from '@/hooks/useFirestore';
import { createTournament, deleteTournament, generateTournamentBracket, reportSeries, revertSeries, updateMatch, updateTournament } from '@/services/db';
import { goLive } from '@/services/live';
import { FORMAT_LABEL, SERIES_FORMATS, winsNeeded } from '@/lib/constants';
import { BracketView } from '@/components/Bracket';
import { TeamLogo } from '@/components/Brand';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn, shuffle } from '@/lib/utils';

type TDraft = Omit<Tournament, 'id' | 'createdAt'>;

const SETTING_FIELDS = ['name', 'season', 'type', 'defaultFormat', 'finalFormat', 'status', 'startDate', 'prizePool'] as const;

const blank: TDraft = {
  name: '',
  season: '',
  type: 'double',
  defaultFormat: 'BO3',
  finalFormat: 'BO5',
  teamIds: [],
  status: 'upcoming',
  championTeamId: null,
  prizePool: '',
  startDate: '',
  bracketGenerated: false,
};

export default function TournamentsAdmin() {
  const tournaments = useTournaments();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<TDraft>(blank);
  const selected = tournaments.data.find((t) => t.id === selectedId) ?? tournaments.data[0] ?? null;

  const create = async () => {
    if (!draft.name.trim()) return toast.error('Name is required');
    const ref = await toast.run(() => createTournament({ ...draft, name: draft.name.trim() }), 'Tournament created');
    if (ref) {
      setSelectedId(ref.id);
      setCreating(false);
      setDraft(blank);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Series & brackets</p>
          <h1 className="section-title">Tournaments</h1>
        </div>
        <div className="flex items-center gap-2">
          {tournaments.data.length > 1 && (
            <Select value={selected?.id ?? ''} onChange={(e) => setSelectedId(e.target.value)} className="w-56">
              {tournaments.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          )}
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            New tournament
          </Button>
        </div>
      </header>

      {!selected && !tournaments.loading ? (
        <EmptyState icon={<Trophy className="h-8 w-8" />} title="No tournaments yet">
          Create a tournament, add teams in seed order and generate a single or double elimination bracket.
        </EmptyState>
      ) : (
        selected && <TournamentEditor key={selected.id} t={selected} />
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New tournament">
        <div className="space-y-4">
          <SettingsFields draft={draft} setDraft={setDraft} />
          <Button className="w-full" onClick={create} icon={<Save className="h-4 w-4" />}>
            Create
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function SettingsFields({ draft, setDraft }: { draft: TDraft; setDraft: (d: TDraft) => void }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="TCC Invitational" />
      </Field>
      <Field label="Season / edition">
        <Input value={draft.season ?? ''} onChange={(e) => setDraft({ ...draft, season: e.target.value })} placeholder="Season 1" />
      </Field>
      <Field label="Bracket type">
        <Select value={draft.type} onChange={(e) => setDraft({ ...draft, type: e.target.value as TournamentType })}>
          <option value="single">Single elimination</option>
          <option value="double">Double elimination</option>
        </Select>
      </Field>
      <Field label="Default series format">
        <Select value={draft.defaultFormat} onChange={(e) => setDraft({ ...draft, defaultFormat: e.target.value as SeriesFormat })}>
          {SERIES_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Final / Grand Final format">
        <Select value={draft.finalFormat} onChange={(e) => setDraft({ ...draft, finalFormat: e.target.value as SeriesFormat })}>
          {SERIES_FORMATS.map((f) => (
            <option key={f} value={f}>
              {FORMAT_LABEL[f]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Status">
        <Select value={draft.status} onChange={(e) => setDraft({ ...draft, status: e.target.value as TournamentStatus })}>
          <option value="upcoming">Upcoming</option>
          <option value="ongoing">Ongoing</option>
          <option value="completed">Completed</option>
        </Select>
      </Field>
      <Field label="Start date">
        <Input type="date" value={draft.startDate ?? ''} onChange={(e) => setDraft({ ...draft, startDate: e.target.value })} />
      </Field>
      <Field label="Prize pool (optional)" className="sm:col-span-2">
        <Input value={draft.prizePool ?? ''} onChange={(e) => setDraft({ ...draft, prizePool: e.target.value })} placeholder="₱10,000" />
      </Field>
    </div>
  );
}

function TournamentEditor({ t }: { t: Tournament }) {
  const toast = useToast();
  const navigate = useNavigate();
  const teams = useTeams();
  const players = usePlayers();
  const live = useLive();
  const matches = useMatches(t.id);
  const teamIndex = useIndex(teams.data);
  const [draft, setDraft] = useState<TDraft>(() => {
    const { id: _id, createdAt: _c, ...rest } = t;
    return rest;
  });
  const [seeds, setSeeds] = useState<string[]>(t.teamIds);
  const [open, setOpen] = useState<Match | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setSeeds(t.teamIds), [t.teamIds]);

  const available = teams.data.filter((x) => !seeds.includes(x.id));
  const seedsChanged = seeds.join() !== t.teamIds.join();
  const settingsChanged = SETTING_FIELDS.some((f) => (draft[f] ?? '') !== (t[f] ?? ''));

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= seeds.length) return;
    const next = [...seeds];
    [next[i], next[j]] = [next[j], next[i]];
    setSeeds(next);
  };

  const generate = async () => {
    if (seeds.length < 2) return toast.error('Add at least 2 teams');
    if (t.bracketGenerated && !confirm('Regenerating will erase all existing matches and game stats for this tournament. Continue?')) return;
    setBusy(true);
    const count = await toast.run(() => generateTournamentBracket({ ...t, ...draft, id: t.id, createdAt: t.createdAt }, seeds));
    setBusy(false);
    if (count) toast.success(`Bracket generated — ${count} matches`);
  };

  const playable = useMemo(() => matches.data.filter((m) => m.teamAId && m.teamBId && m.status !== 'completed' && m.status !== 'void'), [matches.data]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-2">
        <Card
          title="Settings"
          subtitle={t.championTeamId ? `Champion: ${teamIndex[t.championTeamId]?.name ?? '—'}` : undefined}
          actions={
            <>
              <Button
                size="sm"
                variant="danger"
                icon={<Trash2 className="h-4 w-4" />}
                onClick={() => {
                  if (confirm(`Delete ${t.name}, its matches and game stats?`)) void toast.run(() => deleteTournament(t.id), 'Tournament deleted');
                }}
              >
                Delete
              </Button>
              <Button
                size="sm"
                icon={<Save className="h-4 w-4" />}
                disabled={!settingsChanged}
                onClick={() => toast.run(() => updateTournament(t.id, Object.fromEntries(SETTING_FIELDS.map((f) => [f, draft[f] ?? ''])) as Partial<Tournament>), 'Saved')}
              >
                Save
              </Button>
            </>
          }
        >
          <SettingsFields draft={draft} setDraft={setDraft} />
          {t.bracketGenerated && <p className="mt-3 text-xs text-muted">Type & format changes apply the next time you generate the bracket. Per-match formats can be edited below.</p>}
        </Card>

        <Card
          title="Teams & seeding"
          subtitle="Seed #1 at the top. Byes go to the top seeds automatically."
          actions={
            <>
              <Button size="sm" variant="secondary" icon={<Shuffle className="h-4 w-4" />} onClick={() => setSeeds(shuffle(seeds))}>
                Shuffle
              </Button>
              {seedsChanged && (
                <Button size="sm" variant="secondary" icon={<Save className="h-4 w-4" />} onClick={() => toast.run(() => updateTournament(t.id, { teamIds: seeds }), 'Teams saved')}>
                  Save teams
                </Button>
              )}
            </>
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="label">Seeded ({seeds.length})</p>
              <ol className="scrollbar-thin max-h-80 space-y-1 overflow-y-auto">
                {seeds.map((id, i) => (
                  <li key={id} className="flex items-center gap-2 rounded-lg border border-line bg-surface2 px-2 py-1.5">
                    <span className="w-6 text-center font-display text-lg leading-none text-brand">{i + 1}</span>
                    <TeamLogo url={teamIndex[id]?.logoUrl} name={teamIndex[id]?.name} size={22} />
                    <span className="min-w-0 flex-1 truncate text-sm">{teamIndex[id]?.name ?? 'Deleted team'}</span>
                    <button onClick={() => move(i, -1)} className="text-muted hover:text-fg" aria-label="Up">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button onClick={() => move(i, 1)} className="text-muted hover:text-fg" aria-label="Down">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button onClick={() => setSeeds(seeds.filter((x) => x !== id))} className="text-muted hover:text-red-500" aria-label="Remove">
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                ))}
                {!seeds.length && <li className="text-sm text-muted">Add teams from the right.</li>}
              </ol>
            </div>
            <div>
              <p className="label">Available</p>
              <ul className="scrollbar-thin max-h-80 space-y-1 overflow-y-auto">
                {available.map((x) => (
                  <li key={x.id}>
                    <button onClick={() => setSeeds([...seeds, x.id])} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface2">
                      <Plus className="h-4 w-4 text-brand" />
                      <TeamLogo url={x.logoUrl} name={x.name} size={22} />
                      <span className="truncate">{x.name}</span>
                    </button>
                  </li>
                ))}
                {!available.length && <li className="text-sm text-muted">All teams added.</li>}
              </ul>
            </div>
          </div>
          <Button className="mt-4 w-full" loading={busy} onClick={generate} icon={<GitBranch className="h-4 w-4" />}>
            {t.bracketGenerated ? 'Regenerate bracket' : 'Generate bracket'} ({draft.type === 'double' ? 'double' : 'single'} elimination)
          </Button>
        </Card>
      </div>

      <Card title="Bracket" subtitle="Click a match to schedule it, edit its format, report a result or put it on air.">
        {matches.data.length ? (
          <BracketView matches={matches.data} teams={teamIndex} type={t.type} onSelect={setOpen} />
        ) : (
          <p className="text-sm text-muted">No bracket yet.</p>
        )}
      </Card>

      {playable.length > 0 && (
        <Card title="Ready to play" subtitle="Series with both teams decided.">
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {playable.map((m) => (
              <button key={m.id} onClick={() => setOpen(m)} className="flex items-center gap-3 rounded-xl border border-line bg-surface2 px-3 py-2 text-left hover:border-brand/60">
                <TeamLogo url={teamIndex[m.teamAId!]?.logoUrl} name={teamIndex[m.teamAId!]?.name} size={26} />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {teamIndex[m.teamAId!]?.tag} vs {teamIndex[m.teamBId!]?.tag}
                </span>
                <span className="font-cond text-xs uppercase text-muted">{m.label}</span>
                {m.status === 'live' && <Badge tone="live">Live</Badge>}
              </button>
            ))}
          </div>
        </Card>
      )}

      <MatchEditor
        match={open ? (matches.data.find((m) => m.id === open.id) ?? open) : null}
        onClose={() => setOpen(null)}
        teams={teams.data}
        onGoLive={async (m) => {
          if (live.data.matchId === m.id) return navigate('/admin/controller');
          if (live.data.matchId && !confirm('Another series is on air. Replace it?')) return;
          const ok = await toast.run(async () => {
            await goLive({ match: m, tournament: t, teams: teams.data, players: players.data, previousCasters: live.data.casters });
            return true;
          }, 'Series is on air');
          if (ok) navigate('/admin/controller');
        }}
      />
    </div>
  );
}

function MatchEditor({ match, onClose, teams, onGoLive }: { match: Match | null; onClose: () => void; teams: { id: string; name: string }[]; onGoLive: (m: Match) => void }) {
  const toast = useToast();
  const [scoreA, setScoreA] = useState(0);
  const [scoreB, setScoreB] = useState(0);
  const [when, setWhen] = useState('');

  useEffect(() => {
    if (!match) return;
    setScoreA(match.scoreA);
    setScoreB(match.scoreB);
    setWhen(match.scheduledAt ? new Date(match.scheduledAt - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');
  }, [match?.id, match?.scoreA, match?.scoreB, match?.scheduledAt]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!match) return <Modal open={false} onClose={onClose} title="">{null}</Modal>;
  const need = winsNeeded(match.format);
  const teamName = (id: string | null) => teams.find((t) => t.id === id)?.name ?? 'TBD';
  const canReport = match.teamAId && match.teamBId && match.status !== 'completed';
  const validScore = (scoreA === need && scoreB < need) || (scoreB === need && scoreA < need);

  return (
    <Modal open={!!match} onClose={onClose} title={match.label} wide>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Team A">
            <Select value={match.teamAId ?? ''} disabled={match.status === 'completed'} onChange={(e) => toast.run(() => updateMatch(match.id, { teamAId: e.target.value || null, status: e.target.value && match.teamBId ? 'ready' : 'pending' }))}>
              <option value="">TBD</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Team B">
            <Select value={match.teamBId ?? ''} disabled={match.status === 'completed'} onChange={(e) => toast.run(() => updateMatch(match.id, { teamBId: e.target.value || null, status: e.target.value && match.teamAId ? 'ready' : 'pending' }))}>
              <option value="">TBD</option>
              {teams.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Series format">
            <Select value={match.format} disabled={match.status === 'completed'} onChange={(e) => toast.run(() => updateMatch(match.id, { format: e.target.value as SeriesFormat }), 'Format updated')}>
              {SERIES_FORMATS.map((f) => (
                <option key={f} value={f}>
                  {FORMAT_LABEL[f]}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Field label="Scheduled (local time)" className="flex-1">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
          <Button variant="secondary" onClick={() => toast.run(() => updateMatch(match.id, { scheduledAt: when ? new Date(when).getTime() : null }), 'Schedule saved')}>
            Save schedule
          </Button>
        </div>

        <div className="rounded-2xl border border-line bg-surface2 p-4">
          <p className="label">Result</p>
          {match.status === 'completed' ? (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p>
                <strong>{teamName(match.winnerId)}</strong> won {Math.max(match.scoreA, match.scoreB)}-{Math.min(match.scoreA, match.scoreB)}
              </p>
              <Button
                size="sm"
                variant="danger"
                icon={<RotateCcw className="h-4 w-4" />}
                onClick={() => {
                  if (confirm('Revert this result? Teams will be removed from the next matches.')) void toast.run(() => revertSeries(match), 'Result reverted');
                }}
              >
                Revert result
              </Button>
            </div>
          ) : canReport ? (
            <div className="flex flex-wrap items-end gap-3">
              <Field label={teamName(match.teamAId)}>
                <Input type="number" min={0} max={need} value={scoreA} onChange={(e) => setScoreA(Number(e.target.value))} className="w-24" />
              </Field>
              <Field label={teamName(match.teamBId)}>
                <Input type="number" min={0} max={need} value={scoreB} onChange={(e) => setScoreB(Number(e.target.value))} className="w-24" />
              </Field>
              <Button
                disabled={!validScore}
                onClick={() => toast.run(() => reportSeries(match, scoreA > scoreB ? match.teamAId! : match.teamBId!, scoreA, scoreB), 'Result saved — bracket advanced')}
              >
                Report result
              </Button>
              <p className={cn('w-full text-xs', validScore ? 'text-muted' : 'text-amber-500')}>
                {FORMAT_LABEL[match.format]}: the winner needs exactly {need} game wins. Use the live controller to record per-game stats instead.
              </p>
            </div>
          ) : (
            <p className="text-sm text-muted">Waiting for both teams.</p>
          )}
        </div>

        {match.teamAId && match.teamBId && match.status !== 'completed' && (
          <Button className="w-full" size="lg" icon={<Radio className="h-5 w-5" />} onClick={() => onGoLive(match)}>
            {match.status === 'live' ? 'Open in live controller' : 'Go live with this series'}
          </Button>
        )}
      </div>
    </Modal>
  );
}
