import { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import type { CasterProfile, SiteSettings } from '@/types';
import { useSettings, useTournaments } from '@/hooks/useFirestore';
import { saveSettings } from '@/services/db';
import { CASTERS } from '@/services/casters';
import { CasterAvatar } from '@/components/Brand';
import { ImageUpload } from '@/components/MediaUpload';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { CarouselEditor } from './CarouselEditor';

export default function SettingsAdmin() {
  const settings = useSettings();
  const tournaments = useTournaments();
  const toast = useToast();
  const [draft, setDraft] = useState<SiteSettings>(settings.data);

  useEffect(() => {
    if (!settings.loading) setDraft(settings.data);
  }, [settings.loading, settings.data]);

  const profile = (id: string): CasterProfile => draft.casterProfiles[id] ?? { avatarUrl: '', displayName: '' };
  const setProfile = (id: string, patch: Partial<CasterProfile>) =>
    setDraft((d) => ({ ...d, casterProfiles: { ...d.casterProfiles, [id]: { ...profile(id), ...patch } } }));

  const save = () => toast.run(() => saveSettings(draft), 'Settings saved');

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Site & broadcast</p>
          <h1 className="section-title">Settings</h1>
        </div>
        <Button icon={<Save className="h-4 w-4" />} onClick={save}>
          Save settings
        </Button>
      </header>

      <CarouselEditor
        slides={draft.heroSlides ?? []}
        onChange={(heroSlides) => setDraft((d) => ({ ...d, heroSlides }))}
        onSave={save}
        dirty={JSON.stringify(draft.heroSlides ?? []) !== JSON.stringify(settings.data.heroSlides ?? [])}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Landing page">
          <div className="space-y-4">
            <Field label="Featured tournament">
              <Select value={draft.featuredTournamentId ?? ''} onChange={(e) => setDraft({ ...draft, featuredTournamentId: e.target.value || null })}>
                <option value="">Automatic (newest ongoing)</option>
                {tournaments.data.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tagline">
              <Input value={draft.tagline} onChange={(e) => setDraft({ ...draft, tagline: e.target.value })} />
            </Field>
            <Field label="Announcement (shown under the hero title)">
              <Input value={draft.announcement} onChange={(e) => setDraft({ ...draft, announcement: e.target.value })} placeholder="Registration is open until…" />
            </Field>
            <Field label="Live stream URL (Facebook / YouTube / Twitch)">
              <Input value={draft.streamUrl} onChange={(e) => setDraft({ ...draft, streamUrl: e.target.value })} placeholder="https://" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Facebook page">
                <Input value={draft.facebookUrl} onChange={(e) => setDraft({ ...draft, facebookUrl: e.target.value })} />
              </Field>
              <Field label="Discord invite">
                <Input value={draft.discordUrl} onChange={(e) => setDraft({ ...draft, discordUrl: e.target.value })} />
              </Field>
            </div>
          </div>
        </Card>

        <Card title="Caster graphics" subtitle="Names and avatars shown on the HUD and caster lower-third. Voices are set in the Caster Booth.">
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
                  <Field label="Avatar">
                    <ImageUpload value={profile(c.id).avatarUrl} onChange={(avatarUrl) => setProfile(c.id, { avatarUrl })} folder="casters" shape="circle" size={56} />
                  </Field>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}
