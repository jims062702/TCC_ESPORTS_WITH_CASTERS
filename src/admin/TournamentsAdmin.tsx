import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowDown, ArrowUp, GitBranch, Plus, Radio, RotateCcw, Save, Shuffle, Trash2, Trophy, X } from 'lucide-react';
import type { Match, SeriesFormat, Tournament, TournamentStatus, TournamentType } from '@/types';
import { useGames, useIndex, useMatches, usePlayers, useTeams, useTournaments, useLive } from '@/hooks/useFirestore';
import { createTournament, deleteTournament, generateTournamentBracket, pickSeedingOpponent, reportSeries, revertSeries, startSeedingRound, updateMatch, updateTournament } from '@/services/db';
import { firstRoundIssues, pickableOpponents, seedingWinners, seedsFromSeeding } from '@/services/bracket';
import { goLive, refreshFinalsMvp } from '@/services/live';
import { FORMAT_LABEL, SERIES_FORMATS, winsNeeded } from '@/lib/constants';
import { BracketView, PrintBracketButton } from '@/components/Bracket';
import { TeamLogo } from '@/components/Brand';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/Confirm';
import { DraftNotice } from '@/components/DraftNotice';
import { clearFormDraft, loadFormDraft, useFormDraft } from '@/hooks/useFormDraft';
import { cn, shuffle } from '@/lib/utils';
import { knownSeasons, sameSeason, teamSeason, tournamentSeason } from '@/lib/seasons';

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
  const allTeams = useTeams();
  const { seasons } = useMemo(() => knownSeasons(tournaments.data, allTeams.data), [tournaments.data, allTeams.data]);
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<TDraft>(blank);
  // What you type in "New tournament" survives closing the modal by accident.
  const [draftBase, setDraftBase] = useState<TDraft>(blank);
  const [restored, setRestored] = useState(false);
  useFormDraft(creating ? 'tournament:new' : null, draft, draftBase);
  const selected = tournaments.data.find((t) => t.id === selectedId) ?? tournaments.data[0] ?? null;

  const create = async () => {
    if (!draft.name.trim()) return toast.error('Name is required');
    const ref = await toast.run(() => createTournament({ ...draft, name: draft.name.trim() }), 'Tournament created');
    if (ref) {
      clearFormDraft('tournament:new');
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
          <Button
            icon={<Plus className="h-4 w-4" />}
            onClick={() => {
              const base = { ...blank, season: seasons[seasons.length - 1] ?? '' };
              const saved = loadFormDraft<TDraft>('tournament:new');
              setDraftBase(base);
              setDraft(saved ? { ...base, ...saved } : base);
              setRestored(Boolean(saved));
              setCreating(true);
            }}
          >
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
          {restored && (
            <DraftNotice
              onDiscard={() => {
                clearFormDraft('tournament:new');
                setDraft(draftBase);
                setRestored(false);
              }}
            />
          )}
          <SettingsFields draft={draft} setDraft={setDraft} seasons={seasons} />
          <Button className="w-full" onClick={create} icon={<Save className="h-4 w-4" />}>
            Create
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function SettingsFields({ draft, setDraft, seasons = [] }: { draft: TDraft; setDraft: (d: TDraft) => void; seasons?: string[] }) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="Name" className="sm:col-span-2">
        <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="TCC Invitational" />
      </Field>
      <Field label="Season / edition" hint="Teams come from Teams & Rosters of this season">
        <Input value={draft.season ?? ''} list="tournament-season-options" onChange={(e) => setDraft({ ...draft, season: e.target.value })} placeholder="Season 1" data-testid="tournament-season" />
        <datalist id="tournament-season-options">
          {[...seasons].reverse().map((x) => (
            <option key={x} value={x} />
          ))}
        </datalist>
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
  const ask = useConfirm();
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
  const [allSeasons, setAllSeasons] = useState(false);

  useEffect(() => setSeeds(t.teamIds), [t.teamIds]);

  // Each season has its own teams & rosters: pick from this tournament's season.
  const allTournaments = useTournaments();
  const { seasons, legacy } = useMemo(() => knownSeasons(allTournaments.data, teams.data), [allTournaments.data, teams.data]);
  const season = tournamentSeason(draft, legacy);
  const ofSeason = (id: string) => {
    const x = teamIndex[id];
    return !x || sameSeason(teamSeason(x, legacy), season);
  };
  const available = teams.data.filter((x) => !seeds.includes(x.id) && (allSeasons || sameSeason(teamSeason(x, legacy), season)));
  const seasonTeamCount = teams.data.filter((x) => sameSeason(teamSeason(x, legacy), season)).length;
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
    if (t.bracketGenerated && !(await ask({ title: 'Regenerate the bracket?', message: 'This erases all existing matches and game stats for this tournament.', confirmLabel: 'Regenerate', danger: true }))) return;
    setBusy(true);
    const count = await toast.run(() => generateTournamentBracket({ ...t, ...draft, id: t.id, createdAt: t.createdAt }, seeds));
    setBusy(false);
    if (count) toast.success(`Bracket generated — ${count} matches`);
  };

  const playable = useMemo(() => matches.data.filter((m) => m.teamAId && m.teamBId && m.status !== 'completed' && m.status !== 'void'), [matches.data]);

  // ── Seeding round: every team plays one game; the results seed the bracket ──
  const games = useGames(t.id);
  const seedMatches = useMemo(() => matches.data.filter((m) => m.bracket === 'SEED').sort((a, b) => a.index - b.index), [matches.data]);
  const seedingDone = seedMatches.length > 0 && seedMatches.every((m) => m.status === 'completed');
  const seedingOrder = useMemo(() => (seedingDone ? seedsFromSeeding(seedMatches, games.data) : []), [seedingDone, seedMatches, games.data]);

  const startSeeding = async () => {
    if (seeds.length < 2) return toast.error('Add at least 2 teams');
    if ((t.bracketGenerated || matches.data.length) && !(await ask({ title: 'Start a seeding round?', message: 'This erases the current bracket, matches and game stats for this tournament.', confirmLabel: 'Start seeding', danger: true }))) return;
    setBusy(true);
    const count = await toast.run(() => startSeedingRound({ ...t, ...draft, id: t.id, createdAt: t.createdAt }, seeds));
    setBusy(false);
    if (count) toast.success(`Seeding round drawn — ${count} games. Put them on air from the Live Controller.`);
  };

  const bracketFromSeeding = async () => {
    if (!seedingDone) return;
    setBusy(true);
    const count = await toast.run(() => generateTournamentBracket({ ...t, ...draft, id: t.id, createdAt: t.createdAt }, seedingOrder, { keepSeeding: true }));
    setBusy(false);
    if (count) toast.success(`Bracket generated from the seeding results — ${count} matches`);
  };

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
                  void ask({ title: `Delete ${t.name}?`, message: 'The tournament, its matches and game stats are deleted. This can\'t be undone.', confirmLabel: 'Delete tournament', danger: true }).then((ok) => { if (ok) void toast.run(() => deleteTournament(t.id), 'Tournament deleted'); });
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
          <SettingsFields draft={draft} setDraft={setDraft} seasons={seasons} />
          {t.bracketGenerated && <p className="mt-3 text-xs text-muted">Type & format changes apply the next time you generate the bracket. Per-match formats can be edited below.</p>}
        </Card>

        <Card
          title="Teams & seeding"
          subtitle={`${season} teams · Seed #1 at the top. Byes go to the top seeds automatically.`}
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
                    {!ofSeason(id) && (
                      <span className="shrink-0 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400" title={`This team is from ${teamSeason(teamIndex[id], legacy)}, not ${season}`}>
                        {teamSeason(teamIndex[id], legacy)}
                      </span>
                    )}
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
              {seeds.some((id) => !ofSeason(id)) && (
                <p className="mt-2 text-xs text-amber-600 dark:text-amber-400" data-testid="other-season-note">
                  {seeds.filter((id) => !ofSeason(id)).length} seeded team(s) are from another season. For a fresh {season} roster, create or copy the teams in{' '}
                  <Link to="/admin/teams" className="underline">
                    Teams &amp; Rosters
                  </Link>
                  , then swap them here{t.bracketGenerated || matches.data.length ? ' and regenerate the bracket (this erases its matches)' : ''}.
                </p>
              )}
            </div>
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="label">Available · {allSeasons ? 'all seasons' : season}</p>
                <label className="mb-1.5 flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                  <input type="checkbox" className="h-3.5 w-3.5 accent-brand" checked={allSeasons} onChange={(e) => setAllSeasons(e.target.checked)} data-testid="all-seasons" />
                  All seasons
                </label>
              </div>
              <ul className="scrollbar-thin max-h-80 space-y-1 overflow-y-auto" data-testid="available-teams">
                {available.map((x) => (
                  <li key={x.id}>
                    <button onClick={() => setSeeds([...seeds, x.id])} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface2">
                      <Plus className="h-4 w-4 shrink-0 text-brand" />
                      <TeamLogo url={x.logoUrl} name={x.name} size={22} />
                      <span className="min-w-0 flex-1 truncate">{x.name}</span>
                      {allSeasons && <span className="shrink-0 text-[10px] text-muted">{teamSeason(x, legacy)}</span>}
                    </button>
                  </li>
                ))}
                {!available.length && (
                  <li className="text-sm text-muted">
                    {seasonTeamCount || allSeasons ? (
                      'All teams added.'
                    ) : (
                      <>
                        No {season} teams yet —{' '}
                        <Link to="/admin/teams" className="text-brand underline">
                          create them in Teams &amp; Rosters
                        </Link>
                        .
                      </>
                    )}
                  </li>
                )}
              </ul>
            </div>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Button loading={busy} onClick={startSeeding} variant="secondary" icon={<Shuffle className="h-4 w-4" />} title="Every team plays one Bo1 game first; the results decide the bracket seeds">
              Seeding round first (1 game each)
            </Button>
            <Button loading={busy} onClick={generate} icon={<GitBranch className="h-4 w-4" />}>
              {t.bracketGenerated ? 'Regenerate bracket' : 'Generate bracket'} ({draft.type === 'double' ? 'double' : 'single'} elimination)
            </Button>
          </div>
          <p className="mt-2 text-xs text-muted">
            <strong>Seeding round</strong>: teams are drawn into one-game matches (Bo1). When every team has played, the bracket is built from the results — winners get the top seeds.
          </p>
        </Card>
      </div>

      {seedMatches.length > 0 && !t.bracketGenerated && (
        <Card
          title="Seeding round"
          subtitle={seedingDone ? 'All seeding games are done — the bracket seeds below come from the results.' : `${seedMatches.filter((m) => m.status === 'completed').length} of ${seedMatches.length} seeding games played. Put them on air from the Live Controller, or click a game below to report its result.`}
          actions={
            <Button size="sm" loading={busy} disabled={!seedingDone} icon={<GitBranch className="h-4 w-4" />} onClick={bracketFromSeeding}>
              Generate bracket from seeding
            </Button>
          }
        >
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {seedMatches.map((m) => (
              <button key={m.id} onClick={() => setOpen(m)} className="rounded-xl border border-line px-3 py-2 text-left text-sm transition hover:border-brand/60">
                <p className="font-cond text-[11px] font-semibold uppercase tracking-wider text-muted">
                  {m.label} · {m.status === 'completed' ? 'done' : m.status === 'live' ? 'live' : 'to play'}
                </p>
                {[m.teamAId, m.teamBId].map((id, i) => (
                  <p key={i} className={cn('truncate', m.winnerId && m.winnerId === id ? 'font-bold text-brand' : m.winnerId ? 'text-muted' : '')}>
                    {id ? teamIndex[id]?.name ?? id : 'Seeding bye'}
                  </p>
                ))}
              </button>
            ))}
          </div>
          {seedingDone && (
            <ol className="mt-4 grid gap-1 text-sm sm:grid-cols-2 xl:grid-cols-4">
              {seedingOrder.map((id, i) => (
                <li key={id} className="flex items-center gap-2 rounded-lg bg-surface2 px-2 py-1">
                  <span className="w-6 font-display text-lg text-brand">{i + 1}</span>
                  <TeamLogo url={teamIndex[id]?.logoUrl} name={teamIndex[id]?.name} size={20} />
                  <span className="truncate">{teamIndex[id]?.name ?? id}</span>
                </li>
              ))}
            </ol>
          )}
        </Card>
      )}

      {t.bracketGenerated && seedMatches.length > 0 && <OpponentPicks t={t} matches={matches.data} teamIndex={teamIndex} />}

      <Card title="Bracket" subtitle="Click a match to schedule it, edit its format, report a result or put it on air." actions={
          <>
            {(() => {
              const final = matches.data.find((m) => m.isFinal && m.status === 'completed');
              return final ? (
                <Button size="sm" variant="ghost" icon={<Trophy className="h-4 w-4" />} onClick={() => toast.run(() => refreshFinalsMvp(t.id, final.id), 'Finals MVP updated')}>
                  Refresh Finals MVP
                </Button>
              ) : null;
            })()}
            <PrintBracketButton />
          </>
        }>
        {matches.data.length ? (
          <BracketView matches={matches.data} teams={teamIndex} type={t.type} onSelect={setOpen} finalsMvp={t.finalsMvp} title={t.name} />
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
        siblings={matches.data}
        onGoLive={async (m) => {
          if (live.data.matchId === m.id) return navigate('/admin/controller');
          if (live.data.matchId && !(await ask({ title: 'Replace the series on air?', message: 'Another series is on air right now. Going live takes it off air.', confirmLabel: 'Go live' }))) return;
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

function MatchEditor({ match, onClose, teams, onGoLive, siblings = [] }: { match: Match | null; onClose: () => void; teams: { id: string; name: string }[]; onGoLive: (m: Match) => void; siblings?: Match[] }) {
  const toast = useToast();
  const ask = useConfirm();
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
  // Teams already playing in another match of the same round can't be added here (no duplicates).
  const busy = new Set(siblings.filter((m) => m.id !== match.id && m.bracket === match.bracket && m.round === match.round && m.status !== 'void').flatMap((m) => [m.teamAId, m.teamBId]).filter(Boolean) as string[]);
  const choices = (current: string | null, other: string | null) => teams.filter((t) => t.id === current || (!busy.has(t.id) && t.id !== other));
  const validScore = (scoreA === need && scoreB < need) || (scoreB === need && scoreA < need);

  return (
    <Modal open={!!match} onClose={onClose} title={match.label} wide>
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Team A">
            <Select value={match.teamAId ?? ''} disabled={match.status === 'completed'} onChange={(e) => toast.run(() => updateMatch(match.id, { teamAId: e.target.value || null, status: e.target.value && match.teamBId ? 'ready' : 'pending' }))}>
              <option value="">TBD</option>
              {choices(match.teamAId, match.teamBId).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Team B">
            <Select value={match.teamBId ?? ''} disabled={match.status === 'completed'} onChange={(e) => toast.run(() => updateMatch(match.id, { teamBId: e.target.value || null, status: e.target.value && match.teamAId ? 'ready' : 'pending' }))}>
              <option value="">TBD</option>
              {choices(match.teamBId, match.teamAId).map((t) => (
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
                  void ask({ title: 'Revert this result?', message: 'The teams are removed from the next matches.', confirmLabel: 'Revert result', danger: true }).then((ok) => { if (ok) void toast.run(() => revertSeries(match), 'Result reverted'); });
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

/**
 * Seeding winners choose their first-round opponent (any team except
 * themselves — winners or losers). The bracket swaps automatically; once a
 * match's draft starts, it can't change any more.
 */
function OpponentPicks({ t, matches, teamIndex }: { t: Tournament; matches: Match[]; teamIndex: Record<string, { name: string; logoUrl: string } | undefined> }) {
  const toast = useToast();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const picks = t.opponentPicks ?? {};
  const locked = new Set([...Object.keys(picks), ...Object.values(picks)]);
  const winners = seedingWinners(matches, t.teamIds);
  const r1 = matches.filter((m) => m.bracket === 'UB' && m.round === 1 && m.status !== 'void');
  const opponentOf = (id: string) => {
    const m = r1.find((x) => x.teamAId === id || x.teamBId === id);
    return m ? (m.teamAId === id ? m.teamBId : m.teamAId) : null;
  };
  const started = (id: string) => {
    const m = r1.find((x) => x.teamAId === id || x.teamBId === id);
    return Boolean(m && m.status !== 'ready' && m.status !== 'pending');
  };
  if (!winners.length) return null;
  const name = (id: string | null) => (id ? teamIndex[id]?.name ?? id : 'BYE');
  const issues = firstRoundIssues(matches, t.teamIds);
  return (
    <Card title="Seeding winners pick their opponent" subtitle="Only teams that won their seeding game choose. Pick any team except yourself and your current opponent (seeding winners or losers) — the bracket swaps automatically. Once a match's draft starts, it can't change.">
      {issues.duplicates.length > 0 && (
        <div className="mb-3 rounded-xl border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
          <p className="font-semibold">
            {issues.duplicates.map(name).join(', ')} {issues.duplicates.length === 1 ? 'is' : 'are'} in two first-round matches
            {issues.missing.length ? ` and ${issues.missing.map(name).join(', ')} ${issues.missing.length === 1 ? 'is' : 'are'} missing` : ''} — probably from editing a match by hand. Fix it before picking:
          </p>
          <ul className="mt-2 space-y-1.5">
            {r1
              .filter((m) => issues.duplicates.some((d) => m.teamAId === d || m.teamBId === d))
              .map((m) => {
                const dup = issues.duplicates.find((d) => m.teamAId === d || m.teamBId === d)!;
                const slot = m.teamAId === dup ? 'teamAId' : 'teamBId';
                const open = m.status === 'ready' || m.status === 'pending';
                return (
                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                    <span className="text-muted">
                      {m.label}: {name(m.teamAId)} vs {name(m.teamBId)}
                    </span>
                    {open &&
                      issues.missing.map((missing) => (
                        <Button key={missing} size="xs" variant="secondary" onClick={() => toast.run(() => updateMatch(m.id, { [slot]: missing, status: 'ready' }), `${name(missing)} is back in the bracket`)}>
                          Put {name(missing)} here instead of {name(dup)}
                        </Button>
                      ))}
                  </li>
                );
              })}
          </ul>
        </div>
      )}
      <ul className="divide-y divide-line">
        {winners.map((w) => {
          const options = pickableOpponents(matches, w, locked);
          return (
            <li key={w} className="flex flex-wrap items-center gap-3 py-2.5">
              <TeamLogo url={teamIndex[w]?.logoUrl} name={name(w)} size={28} />
              <span className="min-w-[140px] font-semibold">{name(w)}</span>
              <span className="text-xs text-muted">now vs {name(opponentOf(w))}</span>
              <span className="ml-auto flex items-center gap-2">
                {picks[w] ? (
                  <Badge tone="success">Picked {name(picks[w])}</Badge>
                ) : started(w) ? (
                  <Badge tone="muted">Locked — draft started</Badge>
                ) : locked.has(w) ? (
                  <Badge tone="muted">Picked by another team</Badge>
                ) : (
                  <>
                    <Select className="h-8 w-48 py-0 text-xs" value={choice[w] ?? ''} onChange={(e) => setChoice((c) => ({ ...c, [w]: e.target.value }))}>
                      <option value="">Choose opponent…</option>
                      {options.map((id) => (
                        <option key={id} value={id}>
                          {name(id)}
                        </option>
                      ))}
                    </Select>
                    <Button
                      size="sm"
                      loading={busy === w}
                      disabled={!choice[w]}
                      onClick={async () => {
                        setBusy(w);
                        await toast.run(() => pickSeedingOpponent(t, w, choice[w]), `${name(w)} will face ${name(choice[w])}`);
                        setBusy(null);
                      }}
                    >
                      Confirm
                    </Button>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
