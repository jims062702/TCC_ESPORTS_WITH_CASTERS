import { useEffect, useMemo, useState } from 'react';
import { Pencil, Plus, Save, Star, Trash2, UserPlus, Users } from 'lucide-react';
import type { BattleSpell, Player, Role, Team } from '@/types';
import { usePlayers, useTeams } from '@/hooks/useFirestore';
import { createPlayer, createTeam, deletePlayer, deleteTeam, updatePlayer, updateTeam } from '@/services/db';
import { BATTLE_SPELLS, DEFAULT_SPELL_BY_ROLE, ROLES } from '@/lib/constants';
import { Avatar, TeamLogo } from '@/components/Brand';
import { ImageUpload } from '@/components/MediaUpload';
import { SpellBadge } from '@/components/game';
import { Badge, Button, Card, EmptyState, Field, Input, Modal, Select, Switch } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';

type TeamDraft = Pick<Team, 'name' | 'tag' | 'logoUrl'>;
type PlayerDraft = Omit<Player, 'id' | 'createdAt'>;

const blankTeam: TeamDraft = { name: '', tag: '', logoUrl: '' };

export default function TeamsAdmin() {
  const teams = useTeams();
  const players = usePlayers();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newTeam, setNewTeam] = useState<TeamDraft>(blankTeam);

  const selected = teams.data.find((t) => t.id === selectedId) ?? teams.data[0] ?? null;
  const counts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of players.data) m[p.teamId] = (m[p.teamId] ?? 0) + 1;
    return m;
  }, [players.data]);

  const create = async () => {
    if (!newTeam.name.trim()) return toast.error('Team name is required');
    const ref = await toast.run(
      () => createTeam({ name: newTeam.name.trim(), tag: (newTeam.tag || newTeam.name.slice(0, 3)).toUpperCase().trim(), logoUrl: newTeam.logoUrl }),
      'Team created',
    );
    if (ref) {
      setSelectedId(ref.id);
      setCreating(false);
      setNewTeam(blankTeam);
    }
  };

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Tournament management</p>
          <h1 className="section-title">Teams & Rosters</h1>
        </div>
        <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
          New team
        </Button>
      </header>

      {teams.data.length === 0 && !teams.loading ? (
        <EmptyState icon={<Users className="h-8 w-8" />} title="No teams yet">
          Create your first team, or load sample data from the dashboard.
        </EmptyState>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <div className="card scrollbar-thin max-h-[75vh] space-y-1 overflow-y-auto p-2">
            {teams.data.map((t) => (
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
          {selected && <TeamEditor key={selected.id} team={selected} roster={players.data.filter((p) => p.teamId === selected.id)} />}
        </div>
      )}

      <Modal open={creating} onClose={() => setCreating(false)} title="New team">
        <div className="space-y-4">
          <Field label="Team name">
            <Input value={newTeam.name} onChange={(e) => setNewTeam({ ...newTeam, name: e.target.value })} autoFocus />
          </Field>
          <Field label="Tag" hint="2–5 letters shown on overlays (e.g. MNL)">
            <Input value={newTeam.tag} maxLength={5} onChange={(e) => setNewTeam({ ...newTeam, tag: e.target.value.toUpperCase() })} />
          </Field>
          <Field label="Logo (transparent PNG recommended)">
            <ImageUpload value={newTeam.logoUrl} onChange={(logoUrl) => setNewTeam({ ...newTeam, logoUrl })} folder="teams" />
          </Field>
          <Button className="w-full" onClick={create} icon={<Save className="h-4 w-4" />}>
            Create team
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function TeamEditor({ team, roster }: { team: Team; roster: Player[] }) {
  const toast = useToast();
  const [draft, setDraft] = useState<TeamDraft>({ name: team.name, tag: team.tag, logoUrl: team.logoUrl });
  const [editing, setEditing] = useState<{ id: string | null; data: PlayerDraft } | null>(null);
  const dirty = draft.name !== team.name || draft.tag !== team.tag || draft.logoUrl !== team.logoUrl;
  const sorted = [...roster].sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || a.order - b.order);
  const starters = roster.filter((p) => p.isStarter).length;

  useEffect(() => setDraft({ name: team.name, tag: team.tag, logoUrl: team.logoUrl }), [team.name, team.tag, team.logoUrl]);

  const openNew = () =>
    setEditing({
      id: null,
      data: { teamId: team.id, ign: '', realName: '', role: 'EXP', photoUrl: '', spell: 'Vengeance', isStarter: starters < 5, order: roster.length },
    });

  const savePlayer = async () => {
    if (!editing) return;
    if (!editing.data.ign.trim()) return toast.error('IGN is required');
    const data = { ...editing.data, ign: editing.data.ign.trim() };
    await toast.run<unknown>(() => (editing.id ? updatePlayer(editing.id, data) : createPlayer(data)), editing.id ? 'Player updated' : 'Player added');
    setEditing(null);
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
                if (confirm(`Delete ${team.name} and its ${roster.length} players?`)) void toast.run(() => deleteTeam(team.id), 'Team deleted');
              }}
            >
              Delete
            </Button>
            <Button size="sm" disabled={!dirty} icon={<Save className="h-4 w-4" />} onClick={() => toast.run(() => updateTeam(team.id, draft), 'Team saved')}>
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
          </div>
          <Field label="Logo">
            <ImageUpload value={draft.logoUrl} onChange={(logoUrl) => setDraft({ ...draft, logoUrl })} folder="teams" size={112} />
          </Field>
        </div>
      </Card>

      <Card
        title="Roster"
        subtitle={`${starters}/5 starters · battle spells feed the HUD & Trixie's spell calls`}
        actions={
          <Button size="sm" icon={<UserPlus className="h-4 w-4" />} onClick={openNew}>
            Add player
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
                  </p>
                </div>
                <span className="flex items-center gap-2 text-xs text-muted">
                  <SpellBadge spell={p.spell} now={0} size={26} /> {p.spell}
                </span>
                <div className="flex gap-1">
                  <Button
                    size="xs"
                    variant="ghost"
                    title="Toggle starter"
                    onClick={() => toast.run(() => updatePlayer(p.id, { isStarter: !p.isStarter }))}
                    icon={<Star className={cn('h-4 w-4', p.isStarter && 'fill-brand text-brand')} />}
                  />
                  <Button size="xs" variant="ghost" onClick={() => setEditing({ id: p.id, data: { ...p } })} icon={<Pencil className="h-4 w-4" />} />
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remove ${p.ign}?`)) void toast.run(() => deletePlayer(p.id), 'Player removed');
                    }}
                    icon={<Trash2 className="h-4 w-4 text-red-500" />}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal open={!!editing} onClose={() => setEditing(null)} title={editing?.id ? 'Edit player' : 'Add player'}>
        {editing && (
          <div className="space-y-4">
            <Field label="Profile picture">
              <ImageUpload value={editing.data.photoUrl} onChange={(photoUrl) => setEditing({ ...editing, data: { ...editing.data, photoUrl } })} folder="players" shape="circle" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="IGN (in-game name)">
                <Input value={editing.data.ign} autoFocus onChange={(e) => setEditing({ ...editing, data: { ...editing.data, ign: e.target.value } })} />
              </Field>
              <Field label="Real name (optional)">
                <Input value={editing.data.realName ?? ''} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, realName: e.target.value } })} />
              </Field>
              <Field label="Role">
                <Select
                  value={editing.data.role}
                  onChange={(e) => {
                    const role = e.target.value as Role;
                    setEditing({ ...editing, data: { ...editing.data, role, spell: editing.id ? editing.data.spell : DEFAULT_SPELL_BY_ROLE[role] } });
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r}>{r}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Battle spell">
                <Select value={editing.data.spell} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, spell: e.target.value as BattleSpell } })}>
                  {BATTLE_SPELLS.map((s) => (
                    <option key={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Lineup order" hint="Lower = earlier on overlays">
                <Input type="number" value={editing.data.order} onChange={(e) => setEditing({ ...editing, data: { ...editing.data, order: Number(e.target.value) } })} />
              </Field>
              <div className="flex items-end pb-2">
                <Switch checked={editing.data.isStarter} onChange={(isStarter) => setEditing({ ...editing, data: { ...editing.data, isStarter } })} label="Starter" />
              </div>
            </div>
            <Button className="w-full" onClick={savePlayer} icon={<Save className="h-4 w-4" />}>
              Save player
            </Button>
          </div>
        )}
      </Modal>
    </div>
  );
}
