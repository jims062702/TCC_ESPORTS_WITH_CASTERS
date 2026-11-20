import { useEffect, useMemo, useState } from 'react';
import { CalendarRange, Copy, Pencil, Plus, Save, Star, Trash2, UserPlus, Users } from 'lucide-react';
import type { Player, Role, Team } from '@/types';
import { usePlayers, useTeams, useTournaments } from '@/hooks/useFirestore';
import { copyTeamsToSeason, createPlayer, createTeam, deletePlayer, deleteTeam, updatePlayer, updateTeam } from '@/services/db';
import { MAX_ROSTER, MLBB_HEROES, ROLES } from '@/lib/constants';
import { canonicalHero } from '@/lib/heroData';
import { Avatar, TeamLogo } from '@/components/Brand';
import { ImageUpload } from '@/components/MediaUpload';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/Confirm';
import { DraftNotice } from '@/components/DraftNotice';
import { clearFormDraft, loadFormDraft, useFormDraft } from '@/hooks/useFormDraft';
import { cn, safeLocalGet, safeLocalSet } from '@/lib/utils';
import { cleanSeason, knownSeasons, nextSeasonLabel, sameSeason, teamSeason, tournamentSeason } from '@/lib/seasons';

type TeamDraft = Pick<Team, 'name' | 'tag' | 'logoUrl'> & { coachName: string; coachPhoto: string; season: string };
/** Role starts empty — the organizer picks it. Battle spells are picked per game in the Drafting phase. */
type PlayerDraft = Omit<Player, 'id' | 'createdAt' | 'role' | 'spell'> & { role: Role | '' };
/** What the player form holds (also its saved draft). */
type PlayerForm = { data: PlayerDraft; heroText: string };

const blankTeam: TeamDraft = { name: '', tag: '', logoUrl: '', coachName: '', coachPhoto: '', season: '' };
const teamDraft = (t: Team, legacy: string): TeamDraft => ({ name: t.name, tag: t.tag, logoUrl: t.logoUrl, coachName: t.coach?.name ?? '', coachPhoto: t.coach?.photoUrl ?? '', season: teamSeason(t, legacy) });
const coachOf = (d: TeamDraft) => (d.coachName.trim() ? { name: d.coachName.trim(), photoUrl: d.coachPhoto } : null);

const SEASON_KEY = 'tcc.teamsSeason';
const EXTRA_KEY = 'tcc.extraSeasons';
const NEW_SEASON = '__new_season__';

/** "ling, Fanny" → ["Ling", "Fanny"]; unknown names are kept but flagged. */
const parseHeroes = (text: string) =>
  text
    .split(',')
    .map((h) => canonicalHero(h))
    .filter(Boolean)
    .slice(0, 5);
const unknownHeroes = (list: string[]) => list.filter((h) => !MLBB_HEROES.includes(h));

export default function TeamsAdmin() {
  const teams = useTeams();
  const players = usePlayers();
  const tournaments = useTournaments();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTeam, setNewTeam] = useState<TeamDraft>(blankTeam);
  const [teamRestored, setTeamRestored] = useState(false);
  // What you type in "New team" survives closing the modal by accident.
  useFormDraft(creating ? 'team:new' : null, newTeam, blankTeam);
  const openCreate = () => {
    const saved = loadFormDraft<TeamDraft>('team:new');
    setNewTeam(saved ? { ...blankTeam, ...saved } : blankTeam);
    setTeamRestored(Boolean(saved));
    setCreating(true);
  };
  const [seasonModal, setSeasonModal] = useState<'new' | 'copy' | null>(null);
  // Seasons made here that have no teams or tournaments yet.
  const [extra, setExtra] = useState<string[]>(() => {
    const v = safeLocalGet<unknown>(EXTRA_KEY, []);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  });
  const [picked, setPicked] = useState<string>(() => {
    const v = safeLocalGet<unknown>(SEASON_KEY, '');
    return typeof v === 'string' ? v : '';
  });

  const { seasons, legacy } = useMemo(() => knownSeasons(tournaments.data, teams.data, extra), [tournaments.data, teams.data, extra]);
  // Default: the newest season.
  const season = seasons.find((s) => sameSeason(s, picked)) ?? seasons[seasons.length - 1];
  const inSeason = (t: Team, s: string) => sameSeason(teamSeason(t, legacy), s);
  const seasonTeams = useMemo(() => teams.data.filter((t) => sameSeason(teamSeason(t, legacy), season)), [teams.data, legacy, season]);
  const others = seasons.filter((s) => !sameSeason(s, season) && teams.data.some((t) => inSeason(t, s)));
  const seasonTournaments = tournaments.data.filter((t) => sameSeason(tournamentSeason(t, legacy), season));
  const removable = !seasonTeams.length && !seasonTournaments.length && extra.some((x) => sameSeason(x, season));

  const pickSeason = (s: string) => {
    setPicked(s);
    safeLocalSet(SEASON_KEY, s);
    setSelectedId(null);
  };
  const rememberSeason = (s: string) => {
    if (seasons.some((x) => sameSeason(x, s))) return;
    const next = [...extra, s];
    setExtra(next);
    safeLocalSet(EXTRA_KEY, next);
  };
  const forgetSeason = (s: string) => {
    const next = extra.filter((x) => !sameSeason(x, s));
    setExtra(next);
    safeLocalSet(EXTRA_KEY, next);
    setPicked('');
    safeLocalSet(SEASON_KEY, '');
  };

  const selected = seasonTeams.find((t) => t.id === selectedId) ?? seasonTeams[0] ?? null;
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of players.data) m[p.teamId] = (m[p.teamId] ?? 0) + 1;
    return m;
  }, [players.data]);

  const create = async () => {
    if (!newTeam.name.trim()) return toast.error('Team name is required');
    if (seasonTeams.some((t) => t.name.trim().toLowerCase() === newTeam.name.trim().toLowerCase())) return toast.error(`${season} already has a team named ${newTeam.name.trim()}`);
    const ref = await toast.run(
      () => createTeam({ name: newTeam.name.trim(), tag: (newTeam.tag || newTeam.name.slice(0, 3)).toUpperCase().trim(), logoUrl: newTeam.logoUrl, coach: coachOf(newTeam), season }),
      `Team created in ${season}`,
    );
    if (ref) {
      clearFormDraft('team:new');
      setSelectedId(ref.id);
      setCreating(false);
      setNewTeam(blankTeam);
    }
  };

  /** New season (optionally bringing back teams), or copy teams into this season. */
  const finishSeason = async (target: string, copy: Team[]) => {
    if (copy.length) {
      const n = await toast.run(() => copyTeamsToSeason(copy, players.data, target));
      if (n === undefined) return false;
      toast.success(`${n} team${n === 1 ? '' : 's'} copied to ${target} with their rosters`);
    }
    rememberSeason(target);
    pickSeason(target);
    setSeasonModal(null);
    return true;
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Tournament management</p>
          <h1 className="section-title">Teams & Rosters</h1>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Select
            value={season}
            onChange={(e) => (e.target.value === NEW_SEASON ? setSeasonModal('new') : pickSeason(e.target.value))}
            className="w-full sm:w-52"
            aria-label="Season"
            data-testid="teams-season"
          >
            {[...seasons].reverse().map((s) => (
              <option key={s} value={s}>
                {s} · {teams.data.filter((t) => inSeason(t, s)).length} teams
              </option>
            ))}
            <option value={NEW_SEASON}>+ New season…</option>
          </Select>
          <Button
            variant="secondary"
            className="flex-1 sm:flex-none"
            icon={<Copy className="h-4 w-4" />}
            onClick={() => setSeasonModal('copy')}
            disabled={!others.length}
            title={others.length ? `Bring back teams (with rosters) from another season into ${season}` : 'No other season has teams yet'}
          >
            Copy teams
          </Button>
          <Button className="flex-1 sm:flex-none" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            New team
          </Button>
        </div>
      </header>

      <p className="flex items-start gap-2 rounded-xl border border-line bg-surface2/60 px-3 py-2 text-sm text-muted" data-testid="season-note">
        <CalendarRange className="mt-0.5 h-4 w-4 shrink-0 text-brand" />
        <span>
          <strong className="text-fg">{season}</strong> has its own teams & rosters
          {seasonTournaments.length ? ` — used by ${seasonTournaments.map((t) => t.name).join(', ')}` : ''}. Teams of other seasons, and their stats, stay as they were.
          {removable && (
            <button onClick={() => forgetSeason(season)} className="ml-2 font-semibold text-red-500 hover:underline">
              Remove this empty season
            </button>
          )}
        </span>
      </p>

      {seasonTeams.length === 0 && !teams.loading ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title={`No ${season} teams yet`}>
          {others.length ? `Create the teams for ${season}, or bring back returning teams (with their rosters) from another season.` : `Create the teams for ${season}, or load sample data from the dashboard.`}
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
              New team
            </Button>
            {others.length > 0 && (
              <Button size="sm" variant="secondary" icon={<Copy className="h-4 w-4" />} onClick={() => setSeasonModal('copy')}>
                Copy teams from {others[others.length - 1]}
              </Button>
            )}
          </div>
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="card scrollbar-thin max-h-[75vh] space-y-1 overflow-y-auto p-2" data-testid="season-teams">
            {seasonTeams.map((t) => (
              <button
                key={t.id}
                onClick={() => setSelectedId(t.id)}
                className={cn('flex w-full items-center gap-3 rounded-xl px-3 py-2 text-left transition', selected?.id === t.id ? 'bg-brand/10 ring-1 ring-brand/50' : 'hover:bg-surface2')}
              >
                <TeamLogo url={t.logoUrl} name={t.name} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold">{t.name}</p>
                  <p className="font-cond text-xs uppercase tracking-wider text-muted">
                    {t.tag} · {counts[t.id] ?? 0} players
                  </p>
                </div>
              </button>
            ))}
          </div>
          {selected && (
            <TeamEditor
              key={selected.id}
              team={selected}
              roster={players.data.filter((p) => p.teamId === selected.id)}
              seasons={seasons}
              legacy={legacy}
              onMoved={(s) => {
                pickSeason(s);
                setSelectedId(selected.id);
              }}
            />
          )}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title={`New team · ${season}`}>
        <div className="space-y-4">
          {teamRestored && (
            <DraftNotice
              onDiscard={() => {
                clearFormDraft('team:new');
                setNewTeam(blankTeam);
                setTeamRestored(false);
              }}
            />
          )}
          <Field label="Team name">
            <Input value={newTeam.name} onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Tag" hint="2–5 letters shown on overlays (e.g. MNL)">
            <Input value={newTeam.tag} maxLength={5} onChange={(e) => setNewTeam({ ...newTeam, tag: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Logo (transparent PNG recommended)">
            <ImageUpload value={newTeam.logoUrl} onChange={(logoUrl) => setNewTeam({ ...newTeam, logoUrl })} folder="teams" />
          </Field>
          <p className="text-xs text-muted">The team is added to {season}. Add its players after creating it.</p>
          <Button className="w-full" onClick={create} icon={<Save className="h-4 w-4" />}>
            Create team
          </Button>
        </div>
      </Modal>

      {seasonModal && (
        <SeasonModal
          mode={seasonModal}
          target={season}
          seasons={seasons}
          legacy={legacy}
          teams={teams.data}
          counts={counts}
          onClose={() => setSeasonModal(null)}
          onDone={finishSeason}
        />
      )}
    </div>
  );
}

/**
 * "New season" (name it, optionally bring back teams) or "Copy teams" into the
 * season on screen. Copies are separate teams, so the old season keeps its records.
 */
function SeasonModal({
  mode,
  target,
  seasons,
  legacy,
  teams,
  counts,
  onClose,
  onDone,
}: {
  mode: 'new' | 'copy';
  target: string;
  seasons: string[];
  legacy: string;
  teams: Team[];
  counts: Record<string, number>;
  onClose: () => void;
  onDone: (season: string, copy: Team[]) => Promise<boolean>;
}) {
  const [name, setName] = useState(() => (mode === 'new' ? nextSeasonLabel(seasons) : target));
  const into = mode === 'new' ? cleanSeason(name) : target;
  const sources = seasons.filter((s) => !sameSeason(s, into) && teams.some((t) => sameSeason(teamSeason(t, legacy), s)));
  const [source, setSource] = useState(() => sources[sources.length - 1] ?? '');
  const from = sources.find((s) => sameSeason(s, source)) ?? sources[sources.length - 1] ?? '';
  const [ticked, setTicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const already = new Set(teams.filter((t) => into && sameSeason(teamSeason(t, legacy), into)).map((t) => t.name.trim().toLowerCase()));
  const sourceTeams = from ? teams.filter((t) => sameSeason(teamSeason(t, legacy), from)) : [];
  const copyable = sourceTeams.filter((t) => !already.has(t.name.trim().toLowerCase()));
  const chosen = copyable.filter((t) => ticked.includes(t.id));
  const exists = mode === 'new' && seasons.some((s) => sameSeason(s, into));
  const toggle = (id: string) => setTicked((list) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]));

  const submit = async () => {
    if (!into) return;
    setBusy(true);
    const ok = await onDone(into, chosen);
    if (!ok) setBusy(false);
  };

  return (
    <Modal open onClose={onClose} title={mode === 'new' ? 'New season' : `Copy teams into ${target}`}>
      <div className="space-y-4" data-testid="season-modal">
        {mode === 'new' && (
          <Field label="Season name" hint={exists ? `${into} already exists — ticked teams are copied into it.` : 'Use the same name in Tournaments → Season so the tournament picks these teams.'}>
            <Input value={name} autoFocus onChange={(e) => setName(e.target.value)} placeholder="Season 2" data-testid="season-name" />
          </Field>
        )}
        {sources.length > 0 ? (
          <>
            <div className="flex flex-wrap items-end justify-between gap-2">
              <Field label={mode === 'new' ? 'Returning teams (optional)' : 'Copy from'} className="min-w-0 flex-1">
                <Select value={from} onChange={(e) => { setSource(e.target.value); setTicked([]); }}>
                  {[...sources].reverse().map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </Select>
              </Field>
              {copyable.length > 0 && (
                <Button size="sm" variant="ghost" onClick={() => setTicked(chosen.length === copyable.length ? [] : copyable.map((t) => t.id))}>
                  {chosen.length === copyable.length ? 'Clear' : 'Select all'}
                </Button>
              )}
            </div>
            <ul className="scrollbar-thin max-h-64 space-y-1 overflow-y-auto rounded-xl border border-line p-1.5">
              {sourceTeams.map((t) => {
                const dupe = already.has(t.name.trim().toLowerCase());
                return (
                  <li key={t.id}>
                    <label className={cn('flex items-center gap-3 rounded-lg px-2 py-1.5 text-sm', dupe ? 'opacity-50' : 'cursor-pointer hover:bg-surface2')}>
                      <input type="checkbox" className="h-4 w-4 accent-brand" disabled={dupe} checked={!dupe && ticked.includes(t.id)} onChange={() => toggle(t.id)} />
                      <TeamLogo url={t.logoUrl} name={t.name} size={26} />
                      <span className="min-w-0 flex-1 truncate font-semibold">{t.name}</span>
                      <span className="shrink-0 text-xs text-muted">{dupe ? `already in ${into}` : `${counts[t.id] ?? 0} players`}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <p className="text-xs text-muted">
              {mode === 'new' ? 'Leave all unticked to start the season with no teams. ' : ''}Copied teams get their own roster for {into || 'the new season'} — edit or remove players freely; {from} keeps its teams, stats and results.
            </p>
          </>
        ) : (
          <p className="text-sm text-muted">The season starts with no teams — create them with “New team”.</p>
        )}
        <Button className="w-full" loading={busy} disabled={!into || (mode === 'copy' && !chosen.length)} onClick={submit} icon={mode === 'new' ? <CalendarRange className="h-4 w-4" /> : <Copy className="h-4 w-4" />} data-testid="season-submit">
          {mode === 'new' ? (chosen.length ? `Create ${into || 'season'} with ${chosen.length} team${chosen.length === 1 ? '' : 's'}` : `Create ${into || 'season'}`) : `Copy ${chosen.length || ''} team${chosen.length === 1 ? '' : 's'} into ${target}`}
        </Button>
      </div>
    </Modal>
  );
}

function TeamEditor({ team, roster, seasons, legacy, onMoved }: { team: Team; roster: Player[]; seasons: string[]; legacy: string; onMoved: (season: string) => void }) {
  const toast = useToast();
  const ask = useConfirm();
  const [draft, setDraft] = useState<TeamDraft>(() => teamDraft(team, legacy));
  const [editing, setEditing] = useState<{ id: string | null; data: PlayerDraft } | null>(null);
  const [heroText, setHeroText] = useState('');
  // Unsaved input is kept while typing, so closing the modal by accident loses nothing.
  const [formBase, setFormBase] = useState<PlayerForm | null>(null);
  const [restored, setRestored] = useState(false);
  const formKey = editing ? (editing.id ? `player:${editing.id}` : `player:new:${team.id}`) : null;
  useFormDraft(formKey, editing ? { data: editing.data, heroText } : null, formBase);
  const openForm = (id: string | null, base: PlayerForm) => {
    const saved = loadFormDraft<PlayerForm>(id ? `player:${id}` : `player:new:${team.id}`);
    const form = saved?.data ? { data: { ...base.data, ...saved.data, teamId: team.id }, heroText: saved.heroText ?? '' } : base;
    setFormBase(base);
    setRestored(Boolean(saved?.data));
    setHeroText(form.heroText);
    setEditing({ id, data: form.data });
  };
  const original = teamDraft(team, legacy);
  const dirty = (Object.keys(original) as (keyof TeamDraft)[]).some((k) => draft[k] !== original[k]);
  const full = roster.length >= MAX_ROSTER;
  const sorted = [...roster].sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || a.order - b.order);
  const starters = roster.filter((p) => p.isStarter).length;

  useEffect(() => setDraft(teamDraft(team, legacy)), [team.name, team.tag, team.logoUrl, team.coach?.name, team.coach?.photoUrl, team.season, legacy]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    const moved = !sameSeason(draft.season, original.season);
    if (moved && !(await ask({ title: `Move ${team.name} to ${draft.season}?`, message: `The team and its ${roster.length} players move to ${draft.season}. To keep ${team.name} in ${original.season} too, use “Copy teams” instead.`, confirmLabel: 'Move team' }))) return;
    const ok = await toast.run(async () => { await updateTeam(team.id, { name: draft.name, tag: draft.tag, logoUrl: draft.logoUrl, coach: coachOf(draft), season: cleanSeason(draft.season) }); return true; }, moved ? `Moved to ${draft.season}` : 'Team saved');
    if (ok && moved) onMoved(draft.season);
  };

  const openNew = () => {
    if (full) return toast.error(`A team can have at most ${MAX_ROSTER} players.`);
    openForm(null, {
      data: { teamId: team.id, ign: '', realName: '', role: '', photoUrl: '', isStarter: starters < 5, order: roster.length, signatureHeroes: [], age: null, sex: null, course: '', favoriteHero: '', bio: '' },
      heroText: '',
    });
  };
  const openEdit = (p: Player) => {
    const { id: _id, createdAt: _c, spell: _s, ...data } = p;
    openForm(p.id, { data, heroText: (p.signatureHeroes ?? []).join(', ') });
  };

  const savePlayer = async () => {
    if (!editing) return;
    if (!editing.data.ign.trim()) return toast.error('IGN is required');
    const { role } = editing.data;
    if (!role) return toast.error('Pick the player\'s role');
    if (!editing.id && full) return toast.error(`A team can have at most ${MAX_ROSTER} players.`);
    const fav = (editing.data.favoriteHero ?? '').trim();
    const data = {
      ...editing.data,
      role,
      ign: editing.data.ign.trim(),
      signatureHeroes: parseHeroes(heroText),
      age: editing.data.age && Number.isFinite(editing.data.age) ? editing.data.age : null,
      sex: editing.data.sex ?? null,
      course: (editing.data.course ?? '').trim(),
      favoriteHero: fav && fav.toLowerCase() !== 'none' ? canonicalHero(fav) : '',
      bio: (editing.data.bio ?? '').trim(),
    };
    const ok = await toast.run(async () => {
      await (editing.id ? updatePlayer(editing.id, data) : createPlayer(data));
      return true;
    }, editing.id ? 'Player updated' : 'Player added');
    if (ok) {
      if (formKey) clearFormDraft(formKey);
      setRestored(false);
      setEditing(null);
    }
  };

  return (
    <div className="space-y-6">
      <Card
        title="Team details"
        actions={
          <>
            <Button
              variant="danger"
              size="sm"
              icon={<Trash2 className="h-4 w-4" />}
              onClick={() => {
                void ask({ title: `Delete ${team.name}?`, message: `The team and its ${roster.length} players are deleted. This can't be undone.`, confirmLabel: 'Delete team', danger: true }).then((ok) => { if (ok) void toast.run(() => deleteTeam(team.id), 'Team deleted'); });
              }}
            >
              Delete
            </Button>
            <Button
              size="sm"
              disabled={!dirty}
              icon={<Save className="h-4 w-4" />}
              onClick={() => void save()}
            >
              Save
            </Button>
          </>
        }
      >
        <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
          <div className="space-y-4">
            <Field label="Team name">
              <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </Field>
            <Field label="Tag">
              <Input value={draft.tag} maxLength={5} onChange={(e) => setDraft({ ...draft, tag: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Season" hint="Tournaments of this season pick from its teams">
              <Select value={seasons.find((x) => sameSeason(x, draft.season)) ?? draft.season} onChange={(e) => setDraft({ ...draft, season: e.target.value })} data-testid="team-season">
                {[...seasons].reverse().map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Logo">
            <ImageUpload value={draft.logoUrl} onChange={(logoUrl) => setDraft({ ...draft, logoUrl })} folder="teams" size={112} />
          </Field>
          <Field label="Coach (optional — shown on the draft overlay)" hint="Leave blank for “No coach”.">
            <Input value={draft.coachName} placeholder="Coach name" onChange={(e) => setDraft({ ...draft, coachName: e.target.value })} />
          </Field>
          <Field label="Coach photo (optional)">
            <ImageUpload value={draft.coachPhoto} onChange={(coachPhoto) => setDraft({ ...draft, coachPhoto })} folder="players" shape="circle" size={72} />
          </Field>
        </div>
      </Card>

      <Card
        title="Roster"
        subtitle={`${roster.length}/${MAX_ROSTER} players · ${starters}/5 default starters · pick who plays each game when you Go live / start the next draft`}
        actions={
          <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={openNew} disabled={full} title={full ? `Max ${MAX_ROSTER} players per team` : undefined}>
            {full ? 'Roster full (7)' : 'Add player'}
          </Button>
        }
      >
        {sorted.length === 0 ? (
          <p className="text-sm text-muted">No players yet.</p>
        ) : (
          <div className="divide-y divide-line">
            {sorted.map((p) => (
              <div key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
                <Avatar url={p.photoUrl} name={p.ign} size={42} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 truncate font-semibold">
                    {p.ign} {p.isStarter ? <Badge tone="brand">Starter</Badge> : <Badge tone="muted">Sub</Badge>}
                  </p>
                  <p className="text-xs text-muted">
                    {p.role}
                    {p.realName && ` · ${p.realName}`}
                    {p.signatureHeroes?.length ? ` · ★ ${p.signatureHeroes.join(', ')}` : ''}
                  </p>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    title="Toggle starter"
                    onClick={() => toast.run(() => updatePlayer(p.id, { isStarter: !p.isStarter }))}
                    icon={<Star className={cn('h-4 w-4', p.isStarter && 'fill-brand text-brand')} />}
                  />
                  <Button size="xs" variant="ghost" onClick={() => openEdit(p)} icon={<Pencil className="h-4 w-4" />} />
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      void ask({ title: `Remove ${p.ign}?`, message: `${p.ign} is removed from the roster.`, confirmLabel: 'Remove player', danger: true }).then((ok) => { if (ok) void toast.run(() => deletePlayer(p.id), 'Player removed'); });
                    }}
                    icon={<Trash2 className="h-4 w-4 text-red-500" />}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit player' : 'Add player'} xl>
        {editing && (
          <div className="space-y-4" data-testid="player-modal">
            {restored && (
              <DraftNotice
                onDiscard={() => {
                  if (formKey) clearFormDraft(formKey);
                  if (formBase) {
                    setHeroText(formBase.heroText);
                    setEditing({ ...editing, data: formBase.data });
                  }
                  setRestored(false);
                }}
              />
            )}
            <datalist id="mlbb-heroes-sig">
              {MLBB_HEROES.map((h) => (
                <option key={h} value={h} />
              ))}
            </datalist>
            {/* Desktop: picture on the left, the profile fields in three columns — no scrolling. Phones: one column, scrolls. */}
            <div className="grid gap-4 lg:grid-cols-[200px_1fr] lg:gap-6">
              <Field label="Profile picture" hint="Also the player's portrait on the overlays and the player page">
                <ImageUpload value={editing.data.photoUrl} onChange={(photoUrl) => setEditing({ ...editing, data: { ...editing.data, photoUrl } })} folder="players" shape="circle" size={112} stackLg />
              </Field>
              <div className="grid content-start gap-4 sm:grid-cols-2 lg:grid-cols-3 lg:gap-x-4 lg:gap-y-3">
                <Field label="IGN (in-game name)">
                  <Input value={editing.data.ign} autoFocus onChange={(e) => setEditing({ ...editing, data: { ...editing.data, ign: e.target.value } })} />
                </Field>
                <Field label="Full name">
                  <Input value={editing.data.realName ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, realName: e.target.value } })} />
                </Field>
                <Field label="Age">
                  <Input type="number" min={10} max={60} value={editing.data.age ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, age: e.target.value ? Math.round(Number(e.target.value)) : null } })} />
                </Field>
                <Field label="Sex">
                  <Select value={editing.data.sex ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, sex: (e.target.value || null) as Player['sex'] } })}>
                    <option value="">—</option>
                    <option value="Male">Male</option>
                    <option value="Female">Female</option>
                  </Select>
                </Field>
                <Field label="Course">
                  <Input value={editing.data.course ?? ''} placeholder="e.g. BS Information Technology" onChange={(e) => setEditing({ ...editing, data: { ...editing.data, course: e.target.value } })} />
                </Field>
                <Field label="Favorite hero">
                  <Input value={editing.data.favoriteHero ?? ''} list="mlbb-heroes-sig" placeholder="None (leave blank)" onChange={(e) => setEditing({ ...editing, data: { ...editing.data, favoriteHero: e.target.value } })} />
                </Field>
                <Field label="Role">
                  <Select
                    value={editing.data.role}
                    className={cn(!editing.data.role && 'text-muted', '[&>option]:text-fg')}
                    onChange={(e) => setEditing({ ...editing, data: { ...editing.data, role: e.target.value as Role } })}
                    data-testid="player-role"
                  >
                    <option value="" disabled>
                      Select role
                    </option>
                    {ROLES.map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Lineup order (lower = earlier)">
                  <Input type="number" value={editing.data.order} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, order: Number(e.target.value) } })} />
                </Field>
                <Field label="Default starter">
                  <div className="flex h-[42px] items-center">
                    <Switch checked={editing.data.isStarter} onChange={(isStarter) => setEditing({ ...editing, data: { ...editing.data, isStarter } })} label={editing.data.isStarter ? 'Starter' : 'Sub'} />
                  </div>
                </Field>
              </div>
            </div>
            <div className="grid gap-4 lg:grid-cols-2 lg:gap-6">
              <Field label="Short description" hint="Shown on the player's page on the website">
                <textarea
                  className="input min-h-[80px] lg:min-h-[72px]"
                  maxLength={400}
                  value={editing.data.bio ?? ''}
                  placeholder="e.g. Fearless jungler known for clutch Lord steals."
                  onChange={(e) => setEditing({ ...editing, data: { ...editing.data, bio: e.target.value } })}
                />
              </Field>
              <Field label="Signature heroes (optional, comma-separated)" hint="The casters hype these in the draft — e.g. “NAKUHA NI … ANG Ling!”. Heroes from recorded games are added automatically.">
                <Input value={heroText} list="mlbb-heroes-sig" placeholder="e.g. Ling, Fanny, Lancelot" onChange={(e) => setHeroText(e.target.value)} />
                {unknownHeroes(parseHeroes(heroText)).length > 0 && (
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">Not in the hero list: {unknownHeroes(parseHeroes(heroText)).join(', ')} — check the spelling.</p>
                )}
              </Field>
            </div>
            <div className="flex flex-col gap-3 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">Battle spells are picked per game in the Live Controller&apos;s Drafting phase.</p>
              <Button className="w-full sm:w-auto sm:min-w-[220px]" onClick={savePlayer} icon={<Save className="h-4 w-4" />}>
                Save player
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
