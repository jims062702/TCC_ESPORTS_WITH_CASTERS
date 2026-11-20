import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Film, FolderOpen, ListVideo, Save, Trash2 } from 'lucide-react';
import type { Highlight } from '@/types';
import { useHeroPortraits, useHighlights, usePlayers, useTeams, useTournaments } from '@/hooks/useFirestore';
import { knownSeasons, teamSeason } from '@/lib/seasons';
import { createHighlight, deleteHeroPortrait, deleteHighlight, saveHeroPortrait, updateHighlight } from '@/services/db';
import { uploadToCloudinary, videoPoster } from '@/services/cloudinary';
import { MLBB_HEROES, POSITION_LABEL } from '@/lib/constants';
import { ImageUpload, VideoDropzone } from '@/components/MediaUpload';
import { Badge, Button, Card, EmptyState, Field, Input, Select, Switch, Tabs } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { useConfirm } from '@/components/Confirm';
import { fetchLocalReplay, fileNameOf, findSavedReplays, type RecentReplay } from '@/services/replayClips';
import { obsBridge } from '@/services/obs';

export default function MediaAdmin() {
  const [tab, setTab] = useState<'highlights' | 'heroes'>('highlights');
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Cloudinary media</p>
          <h1 className="section-title">Media & Replays</h1>
        </div>
        <Tabs
          value={tab}
          onChange={setTab}
          items={[
            { value: 'highlights', label: 'Highlights & replays' },
            { value: 'heroes', label: 'Hero portraits' },
          ]}
        />
      </header>
      {tab === 'highlights' ? <Highlights /> : <Heroes />}
    </div>
  );
}

/** Players listed as "IGN — Squad (Role)" for tagging clips. */
function usePlayerOptions() {
  const players = usePlayers();
  const teams = useTeams();
  const tournaments = useTournaments();
  return useMemo(() => {
    // Same squad name in two seasons → "Falcons · Season 2".
    const { seasons, legacy } = knownSeasons(tournaments.data, teams.data);
    const teamName = (id: string) => {
      const t = teams.data.find((x) => x.id === id);
      if (!t) return 'No squad';
      return seasons.length > 1 ? `${t.name} · ${teamSeason(t, legacy)}` : t.name;
    };
    return [...players.data]
      .sort((a, b) => teamName(a.teamId).localeCompare(teamName(b.teamId)) || a.order - b.order)
      .map((p) => ({ id: p.id, teamId: p.teamId, label: `${p.ign} — ${teamName(p.teamId)} (${POSITION_LABEL[p.role] ?? p.role})` }));
  }, [players.data, teams.data, tournaments.data]);
}

const parseKeywords = (text: string) => [...new Set(text.split(/[,#\n]/).map((k) => k.trim().toLowerCase()).filter(Boolean))].slice(0, 15);

interface PendingClip {
  url: string;
  durationSec?: number;
  fileName: string;
}

function Highlights() {
  const highlights = useHighlights();
  const toast = useToast();
  const ask = useConfirm();
  const playerOptions = usePlayerOptions();
  const [folder, setFolder] = useState<'highlights' | 'replays'>('replays');
  const [pending, setPending] = useState<PendingClip | null>(null);
  const playlist = highlights.data.filter((h) => h.inPlaylist);

  const move = (h: Highlight, dir: -1 | 1) => {
    const list = highlights.data;
    const i = list.findIndex((x) => x.id === h.id);
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    void toast.run(async () => {
      await updateHighlight(list[i].id, { order: j });
      await updateHighlight(list[j].id, { order: i });
    });
  };

  return (
    <div className="space-y-6">
      <Card
        title="Upload a clip"
        subtitle="Instant replays (saved by OBS in its replay folder) and match highlights. Add a short description, keywords and the player — viewers can search them on the website, and clips in the break loop play on the break / pause screen one after another."
        actions={
          <Select value={folder} onChange={(e) => setFolder(e.target.value as typeof folder)} className="h-8 w-40 py-0 text-xs">
            <option value="replays">Folder: replays</option>
            <option value="highlights">Folder: highlights</option>
          </Select>
        }
      >
        {pending ? (
          <ClipDetailsForm
            pending={pending}
            playerOptions={playerOptions}
            onCancel={() => setPending(null)}
            onSave={async (meta) => {
              const ok = await toast.run(async () => {
                await createHighlight({
                  title: meta.title,
                  videoUrl: pending.url,
                  thumbnailUrl: videoPoster(pending.url),
                  matchId: null,
                  inPlaylist: meta.inPlaylist,
                  showOnSite: meta.showOnSite,
                  description: meta.description,
                  keywords: meta.keywords,
                  playerId: meta.playerId,
                  teamId: meta.teamId,
                  ...(pending.durationSec ? { durationSec: Math.round(pending.durationSec) } : {}),
                  order: highlights.data.length,
                });
                return true;
              }, meta.inPlaylist ? 'Clip saved — it plays on the break screen' : 'Clip saved');
              if (ok) setPending(null);
            }}
          />
        ) : (
          <div className="space-y-3">
            <VideoDropzone folder={folder} onUploaded={(res, file) => setPending({ url: res.url, durationSec: res.duration, fileName: file.name })} />
            <ObsReplayPicker folder={folder} onUploaded={setPending} />
          </div>
        )}
      </Card>

      <Card title="Clips" subtitle={`${playlist.length} in the break-loop playlist — they play top to bottom on the break / pause screen, each one moving on to the next, then loop.`}>
        {!highlights.data.length ? (
          <EmptyState icon={<Film className="h-8 w-8" />} title="No clips yet">
            Upload instant replays or highlights to build the break-loop playlist.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {highlights.data.map((h, i) => (
              <li key={h.id} className="flex flex-col gap-3 rounded-xl border border-line bg-surface2 p-2 sm:flex-row sm:items-start">
                <div className="relative aspect-video w-full shrink-0 overflow-hidden rounded-lg bg-ink-900 sm:w-36">
                  {h.thumbnailUrl ? <img src={h.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <video src={h.videoUrl} muted className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 space-y-1.5 sm:flex-1">
                  <Input defaultValue={h.title} onBlur={(e) => e.target.value !== h.title && void toast.run(() => updateHighlight(h.id, { title: e.target.value }), 'Title saved')} aria-label="Title" />
                  <Input
                    defaultValue={h.description ?? ''}
                    placeholder="Short description"
                    onBlur={(e) => e.target.value !== (h.description ?? '') && void toast.run(() => updateHighlight(h.id, { description: e.target.value.trim() }), 'Description saved')}
                    aria-label="Description"
                  />
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    <Input
                      defaultValue={(h.keywords ?? []).join(', ')}
                      placeholder="Keywords: savage, lord steal, gold lane…"
                      onBlur={(e) => {
                        const kw = parseKeywords(e.target.value);
                        if (kw.join(',') !== (h.keywords ?? []).join(',')) void toast.run(() => updateHighlight(h.id, { keywords: kw }), 'Keywords saved');
                      }}
                      aria-label="Keywords"
                    />
                    <Select
                      value={h.playerId ?? ''}
                      onChange={(e) => {
                        const p = playerOptions.find((o) => o.id === e.target.value);
                        void toast.run(() => updateHighlight(h.id, { playerId: p?.id ?? null, teamId: p?.teamId ?? null }), 'Player saved');
                      }}
                      aria-label="Player"
                    >
                      <option value="">Player (squad) — none</option>
                      {playerOptions.map((o) => (
                        <option key={o.id} value={o.id}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <Switch checked={h.inPlaylist} onChange={(v) => void toast.run(() => updateHighlight(h.id, { inPlaylist: v }))} label="In break loop" />
                    <Switch checked={h.showOnSite !== false} onChange={(v) => void toast.run(() => updateHighlight(h.id, { showOnSite: v }))} label="Show on website" />
                    <a href={h.videoUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      Open video
                    </a>
                    {h.videoUrl.includes('/replays/') && <Badge tone="accent">Replay</Badge>}
                  </div>
                </div>
                <div className="flex justify-end gap-1 sm:flex-col">
                  <Button size="xs" variant="ghost" disabled={i === 0} onClick={() => move(h, -1)} icon={<ArrowUp className="h-4 w-4" />} aria-label="Move up" />
                  <Button size="xs" variant="ghost" disabled={i === highlights.data.length - 1} onClick={() => move(h, 1)} icon={<ArrowDown className="h-4 w-4" />} aria-label="Move down" />
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<Trash2 className="h-4 w-4 text-red-500" />}
                    aria-label="Remove clip"
                    onClick={() => {
                      void ask({ title: 'Remove this clip?', message: 'It disappears from the site and the break loop. The file stays in your Cloudinary media library.', confirmLabel: 'Remove clip', danger: true }).then((ok) => {
                        if (ok) void toast.run(() => deleteHighlight(h.id), 'Clip removed');
                      });
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-muted">
          <ListVideo className="mr-1 inline h-3.5 w-3.5 align-[-3px]" /> Break overlay: <code>/overlay/break</code> (muted autoplay; add <code>?sound=1</code> to play clip audio in OBS).
        </p>
      </Card>
    </div>
  );
}

/** After the video is uploaded: title, short description, keywords and the player (with squad). */
function ClipDetailsForm({
  pending,
  playerOptions,
  onCancel,
  onSave,
}: {
  pending: PendingClip;
  playerOptions: { id: string; teamId: string; label: string }[];
  onCancel: () => void;
  onSave: (meta: { title: string; description: string; keywords: string[]; playerId: string | null; teamId: string | null; inPlaylist: boolean; showOnSite: boolean }) => void;
}) {
  const [title, setTitle] = useState(pending.fileName.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '));
  const [description, setDescription] = useState('');
  const [keywords, setKeywords] = useState('');
  const [playerId, setPlayerId] = useState('');
  const [inPlaylist, setInPlaylist] = useState(true);
  const [showOnSite, setShowOnSite] = useState(true);
  const player = playerOptions.find((o) => o.id === playerId);
  return (
    <div className="grid gap-4 md:grid-cols-[240px_1fr]" data-testid="clip-details">
      <video src={pending.url} controls muted className="aspect-video w-full rounded-lg bg-ink-900" />
      <div className="space-y-3">
        <p className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">Uploaded ✓ — add the details, then save.</p>
        <Field label="Title">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. LORD STEAL — Bagyo" />
        </Field>
        <Field label="Short description">
          <Input value={description} maxLength={200} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Flickers over the wall and steals the Lord with 50 HP" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Keywords" hint="Comma-separated — e.g. lord steal, savage, gold lane">
            <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="lord steal, clutch" />
          </Field>
          <Field label="Player (with squad)">
            <Select value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
              <option value="">— none —</option>
              {playerOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-sm">
          <Switch checked={inPlaylist} onChange={setInPlaylist} label="Play on the break / pause screen" />
          <Switch checked={showOnSite} onChange={setShowOnSite} label="Show on the website" />
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            icon={<Save className="h-4 w-4" />}
            disabled={!title.trim()}
            onClick={() => onSave({ title: title.trim(), description: description.trim(), keywords: parseKeywords(keywords), playerId: player?.id ?? null, teamId: player?.teamId ?? null, inPlaylist, showOnSite })}
          >
            Save clip
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Pick one of the replays OBS saved in its replay folder (when the site runs on this computer). */
function ObsReplayPicker({ folder, onUploaded }: { folder: 'highlights' | 'replays'; onUploaded: (p: PendingClip) => void }) {
  const toast = useToast();
  const [files, setFiles] = useState<RecentReplay[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [pct, setPct] = useState(0);
  const load = async () => {
    try {
      if (!obsBridge.connected) return toast.error('Connect OBS first (Settings → OBS) — or drop the file above.');
      const dir = await obsBridge.recordDirectory();
      setFiles(await findSavedReplays(dir));
    } catch (e) {
      toast.error((e as Error).message);
    }
  };
  const pick = async (r: RecentReplay) => {
    setBusy(r.path);
    setPct(0);
    try {
      const file = await fetchLocalReplay(r.path);
      if (!file) throw new Error('Could not read the replay file — drop it in the box above instead.');
      const res = await uploadToCloudinary(file, { folder, resourceType: 'video', onProgress: setPct });
      onUploaded({ url: res.url, durationSec: res.duration, fileName: file.name });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="rounded-xl border border-dashed border-line p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm">
          <span className="font-semibold">Instant replays saved by OBS</span> <span className="text-muted">— pick one instead of browsing for the file.</span>
        </p>
        <Button size="sm" variant="secondary" icon={<FolderOpen className="h-4 w-4" />} onClick={() => void load()}>
          {files ? 'Refresh' : 'Show OBS replays'}
        </Button>
      </div>
      {files && (
        <ul className="mt-2 max-h-60 space-y-1 overflow-y-auto">
          {!files.length && <li className="text-xs text-muted">No replays in OBS&apos;s folder yet.</li>}
          {files.map((r) => (
            <li key={r.path} className="flex items-center justify-between gap-2 rounded-lg bg-surface2 px-3 py-1.5 text-sm">
              <span className="min-w-0 truncate">{fileNameOf(r.path)}</span>
              <Button size="xs" loading={busy === r.path} disabled={Boolean(busy) && busy !== r.path} onClick={() => void pick(r)}>
                {busy === r.path ? `${pct}%` : 'Upload'}
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Heroes() {
  const portraits = useHeroPortraits();
  const toast = useToast();
  const [q, setQ] = useState('');
  const [onlyMissing, setOnlyMissing] = useState(false);
  const list = useMemo(
    () => MLBB_HEROES.filter((h) => h.toLowerCase().includes(q.toLowerCase()) && (!onlyMissing || !portraits.map[h.toLowerCase()])),
    [q, onlyMissing, portraits.map],
  );
  return (
    <Card
      title="Hero portraits"
      subtitle={`${Object.keys(portraits.map).length}/${MLBB_HEROES.length} uploaded. Portraits appear on the draft overlay; heroes without one show a styled name card. Upload artwork you have the rights to use.`}
      actions={
        <>
          <Switch checked={onlyMissing} onChange={setOnlyMissing} label={<span className="text-sm">Missing only</span>} />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search hero" className="w-48" />
        </>
      }
    >
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {list.map((h) => (
          <div key={h} className="rounded-xl border border-line p-3">
            <p className="mb-2 font-semibold">{h}</p>
            <ImageUpload
              value={portraits.map[h.toLowerCase()] ?? ''}
              folder="heroes"
              size={72}
              onChange={(url) => void toast.run(() => (url ? saveHeroPortrait(h, url) : deleteHeroPortrait(h)))}
            />
          </div>
        ))}
      </div>
    </Card>
  );
}
