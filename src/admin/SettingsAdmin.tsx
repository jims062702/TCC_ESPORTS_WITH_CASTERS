import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Info, Loader2, Plus, Save, Trash2, Undo2, X } from 'lucide-react';
import type { CasterProfile, ExtraHero, SiteSettings } from '@/types';
import { BATTLE_SPELLS, MLBB_HEROES, SPELL_COOLDOWN } from '@/lib/constants';
import { SpellBadge } from '@/components/game';
import { useLive, useSettings, useTournaments } from '@/hooks/useFirestore';
import { saveSettings } from '@/services/db';
import { matchTournamentByName } from '@/services/featured';
import { CASTERS } from '@/services/casters';
import { CasterAvatar } from '@/components/Brand';
import { ImageUpload } from '@/components/MediaUpload';
import { Button, Card, Field, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { stableJson } from '@/lib/utils';
import { CarouselEditor } from './CarouselEditor';
import { ResetDataCard } from './ResetData';
import { ObsPanel } from './controller/ObsPanel';
import { GoldCard } from './controller/GoldReader';
import { SpellReaderCard } from './controller/SpellReader';

/** Everything except casterProfiles (auto-saved) and updatedAt. */
const otherFields = (s: SiteSettings) => {
  const { updatedAt: _u, casterProfiles: _c, ...rest } = s;
  return stableJson(rest);
};

type CasterSave = 'idle' | 'saving' | 'saved' | 'error';

export default function SettingsAdmin() {
  const live = useLive();
  const settings = useSettings();
  const tournaments = useTournaments();
  const toast = useToast();
  const [draft, setDraft] = useState<SiteSettings>(settings.data);
  // While the admin is editing, incoming Firestore snapshots must not overwrite their changes.
  const [edited, setEdited] = useState(false);
  const [casterSave, setCasterSave] = useState<CasterSave>('idle');

  useEffect(() => {
    if (!settings.loading && !edited) setDraft(settings.data);
  }, [settings.loading, settings.data, edited]);

  const edit = (fn: (d: SiteSettings) => SiteSettings) => {
    setEdited(true);
    setDraft(fn);
  };

  const otherDirty = edited && otherFields(draft) !== otherFields(settings.data);
  const profilesDirty = edited && stableJson(draft.casterProfiles) !== stableJson(settings.data.casterProfiles);
  const otherDirtyRef = useRef(otherDirty);
  otherDirtyRef.current = otherDirty;

  // Caster pictures & names save automatically (no Save button to forget).
  useEffect(() => {
    if (!profilesDirty) return;
    setCasterSave('saving');
    const t = setTimeout(async () => {
      try {
        await saveSettings({ casterProfiles: draft.casterProfiles });
        setCasterSave('saved');
        if (!otherDirtyRef.current) setEdited(false);
      } catch (e) {
        setCasterSave('error');
        toast.error(`Could not save caster graphics: ${(e as Error).message}`);
      }
    }, 900);
    return () => clearTimeout(t);
  }, [profilesDirty, draft.casterProfiles, toast]);

  // Warn before leaving the page with unsaved changes.
  useEffect(() => {
    if (!otherDirty && !profilesDirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [otherDirty, profilesDirty]);

  const profile = (id: string): CasterProfile => draft.casterProfiles[id] ?? { avatarUrl: '', displayName: '' };
  const setProfile = (id: string, patch: Partial<CasterProfile>) =>
    edit((d) => ({ ...d, casterProfiles: { ...d.casterProfiles, [id]: { ...(d.casterProfiles[id] ?? { avatarUrl: '', displayName: '' }), ...patch } } }));

  const save = () =>
    toast.run(async () => {
      await saveSettings(draft);
      setEdited(false);
    }, 'Settings saved');

  const discard = () => {
    setDraft(settings.data);
    setEdited(false);
  };

  // Featured tournament: free text with suggestions. Exact (case-insensitive) match → feature that tournament.
  const autoTournament = tournaments.data.find((t) => t.status === 'ongoing') ?? tournaments.data[0] ?? null;
  const featuredText = draft.featuredTitle || tournaments.data.find((t) => t.id === draft.featuredTournamentId)?.name || '';
  const matched = tournaments.data.find((t) => t.id === draft.featuredTournamentId) ?? null;
  const setFeatured = (value: string) => {
    const match = matchTournamentByName(value, tournaments.data);
    edit((d) => ({ ...d, featuredTitle: value, featuredTournamentId: match?.id ?? null }));
  };

  return (
    <div className="space-y-6 pb-20">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Site & broadcast</p>
          <h1 className="section-title">Settings</h1>
        </div>
        <Button icon={<Save className="h-4 w-4" />} onClick={save} disabled={!otherDirty}>
          {otherDirty ? 'Save settings' : 'All changes saved'}
        </Button>
      </header>

      {/* OBS connection, automatic scenes and instant-replay setup (saved on this computer) */}
      <ObsPanel phase={live.data.matchId ? live.data.phase : 'idle'} matchId={live.data.matchId} defaultOpen />
      <GoldCard live={live.data} />
      <SpellReaderCard live={live.data} />

      <CarouselEditor
        slides={draft.heroSlides ?? []}
        onChange={(heroSlides) => edit((d) => ({ ...d, heroSlides }))}
        onSave={save}
        dirty={edited && stableJson(draft.heroSlides ?? []) !== stableJson(settings.data.heroSlides ?? [])}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Landing page">
          <div className="space-y-4">
            <div>
              <span className="label">Featured tournament</span>
              <div className="relative">
                <Input
                  list="featured-tournament-options"
                  value={featuredText}
                  onChange={(e) => setFeatured(e.target.value)}
                  placeholder={`Type a title or pick a tournament (blank = automatic${autoTournament ? `: ${autoTournament.name}` : ''})`}
                  className="pr-9"
                  maxLength={80}
                />
                {featuredText && (
                  <button
                    type="button"
                    onClick={() => setFeatured('')}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted hover:bg-surface hover:text-fg"
                    aria-label="Clear (automatic)"
                    title="Clear — use automatic"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <datalist id="featured-tournament-options">
                  {tournaments.data.map((t) => (
                    <option key={t.id} value={t.name} />
                  ))}
                </datalist>
              </div>
              <p className="mt-1.5 text-xs text-muted [&>svg]:mr-1 [&>svg]:inline [&>svg]:align-[-3px]">
                {!featuredText.trim() ? (
                  <>
                    <Info className="mt-px h-3.5 w-3.5 shrink-0" /> Automatic — the Home page shows {autoTournament ? <strong className="text-fg">“{autoTournament.name}”</strong> : 'the newest tournament'} (newest ongoing).
                  </>
                ) : matched ? (
                  <>
                    <CheckCircle2 className="mt-px h-3.5 w-3.5 shrink-0 text-emerald-500" /> Featuring the tournament <strong className="text-fg">“{matched.name}”</strong> — its matches, bracket and standings are shown.
                  </>
                ) : (
                  <>
                    <Info className="mt-px h-3.5 w-3.5 shrink-0 text-accent" /> Custom title on the Home page. Matches, bracket and standings come from{' '}
                    {autoTournament ? <strong className="text-fg">“{autoTournament.name}”</strong> : 'the newest tournament'} (newest ongoing). To rename a tournament itself, edit it in Tournaments.
                  </>
                )}
              </p>
            </div>
            <Field label="Tagline">
              <Input value={draft.tagline} onChange={(e) => edit((d) => ({ ...d, tagline: e.target.value }))} />
            </Field>
            <Field label="Announcement (shown under the hero title)">
              <Input value={draft.announcement} onChange={(e) => edit((d) => ({ ...d, announcement: e.target.value }))} placeholder="Registration is open until…" />
            </Field>
            <Field label="Live stream URL (Facebook / YouTube / Twitch)">
              <Input value={draft.streamUrl} onChange={(e) => edit((d) => ({ ...d, streamUrl: e.target.value }))} placeholder="https://" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Facebook page">
                <Input value={draft.facebookUrl} onChange={(e) => edit((d) => ({ ...d, facebookUrl: e.target.value }))} />
              </Field>
              <Field label="Discord invite">
                <Input value={draft.discordUrl} onChange={(e) => edit((d) => ({ ...d, discordUrl: e.target.value }))} />
              </Field>
            </div>
          </div>
        </Card>

        <Card
          title="Battle spell icons"
          subtitle="Upload the in-game icon for each spell so the HUD and controller match the game (square PNG works best). Click Save at the bottom."
        >
          <div className="grid gap-3 sm:grid-cols-2">
            {BATTLE_SPELLS.map((spell) => (
              <div key={spell} className="flex items-center gap-3 rounded-xl border border-line p-2.5">
                <SpellBadge spell={spell} now={0} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">
                    {spell} <span className="font-normal text-muted">· {SPELL_COOLDOWN[spell]}s</span>
                  </p>
                  <ImageUpload
                    value={draft.spellIcons?.[spell] ?? ''}
                    onChange={(url) => edit((d) => ({ ...d, spellIcons: { ...(d.spellIcons ?? {}), [spell]: url } }))}
                    folder="heroes"
                    shape="circle"
                    size={44}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <HeroesCard
          heroes={draft.extraHeroes ?? []}
          onChange={(extraHeroes) => edit((d) => ({ ...d, extraHeroes }))}
        />

        <Card
          title="Caster graphics"
          subtitle="Names and pictures shown on the overlays (HUD, draft, replay, caster lower-third). Changes save automatically."
          actions={
            casterSave === 'saving' ? (
              <span className="flex items-center gap-1.5 text-xs text-muted">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…
              </span>
            ) : casterSave === 'saved' ? (
              <span className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" /> Saved — overlays updated
              </span>
            ) : casterSave === 'error' ? (
              <span className="flex items-center gap-1.5 text-xs text-red-500">
                <AlertTriangle className="h-3.5 w-3.5" /> Not saved
              </span>
            ) : null
          }
        >
          <div className="space-y-4">
            {CASTERS.map((c) => (
              <div key={c.id} className="rounded-xl border border-line p-3">
                <div className="mb-3 flex items-center gap-3">
                  <CasterAvatar casterId={c.id} url={profile(c.id).avatarUrl} size={40} />
                  <div>
                    <p className="font-semibold">{profile(c.id).displayName || c.name}</p>
                    <p className="text-xs text-muted">
                      {c.gender === 'male' ? 'Male' : 'Female'} · {c.role} — {c.specialty}
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-[1fr_1.4fr]">
                  <Field label="Display name">
                    <Input value={profile(c.id).displayName} placeholder={c.name} onChange={(e) => setProfile(c.id, { displayName: e.target.value })} />
                  </Field>
                  <Field label="Picture">
                    <ImageUpload value={profile(c.id).avatarUrl} onChange={(avatarUrl) => setProfile(c.id, { avatarUrl })} folder="casters" shape="circle" size={56} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <ResetDataCard />

      {/* Unsaved changes bar */}
      {/* (spell icons and new heroes are saved with this bar too) */}
      {otherDirty && (
        <div className="fixed inset-x-0 bottom-4 z-40 flex justify-center px-4">
          <div className="card flex items-center gap-3 border-amber-500/50 px-4 py-2.5 shadow-xl">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-500" />
            <span className="text-sm font-semibold">You have unsaved changes</span>
            <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={discard}>
              Discard
            </Button>
            <Button size="sm" icon={<Save className="h-4 w-4" />} onClick={save}>
              Save
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * New MLBB heroes: the built-in roster has 133 heroes (up to Hirara). When Moonton releases a new
 * one, add it here (class + lane) and it appears in the draft search, the
 * overlays and the casters' lines right away — no update needed.
 */
function HeroesCard({ heroes, onChange }: { heroes: ExtraHero[]; onChange: (h: ExtraHero[]) => void }) {
  const [name, setName] = useState('');
  const [classes, setClasses] = useState('');
  const [lanes, setLanes] = useState('');
  const exists = (n: string) => [...MLBB_HEROES, ...heroes.map((h) => h.name)].some((x) => x.toLowerCase() === n.trim().toLowerCase());
  const add = () => {
    if (!name.trim() || exists(name)) return;
    onChange([...heroes, { name: name.trim(), classes: classes.trim(), lanes: lanes.trim() }]);
    setName('');
    setClasses('');
    setLanes('');
  };
  return (
    <Card title="Heroes" subtitle={`Built-in roster: ${MLBB_HEROES.length} heroes (up to Hirara). Add newer heroes here — they work in the draft, overlays and caster lines. Click Save at the bottom.`}>
      {heroes.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-xl border border-line">
          {heroes.map((h, i) => (
            <li key={h.name} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="font-semibold">{h.name}</span>
              <span className="text-xs text-muted">{[h.classes, h.lanes].filter(Boolean).join(' · ') || 'no class/lane'}</span>
              <button className="ml-auto text-muted hover:text-red-500" onClick={() => onChange(heroes.filter((_, j) => j !== i))} aria-label={`Remove ${h.name}`}>
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <Field label="Hero name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. New Hero" />
        </Field>
        <Field label="Class">
          <Input value={classes} onChange={(e) => setClasses(e.target.value)} placeholder="Assassin / Mage…" />
        </Field>
        <Field label="Lane">
          <Input value={lanes} onChange={(e) => setLanes(e.target.value)} placeholder="Jungle / Mid / EXP…" />
        </Field>
        <Button icon={<Plus className="h-4 w-4" />} disabled={!name.trim() || exists(name)} onClick={add}>
          Add
        </Button>
      </div>
      {name.trim() && exists(name) && <p className="mt-1 text-xs text-muted">{name.trim()} is already in the hero list.</p>}
    </Card>
  );
}
