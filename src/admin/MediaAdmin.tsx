import { useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Film, ListVideo, Trash2 } from 'lucide-react';
import type { Highlight } from '@/types';
import { useHeroPortraits, useHighlights } from '@/hooks/useFirestore';
import { createHighlight, deleteHeroPortrait, deleteHighlight, saveHeroPortrait, updateHighlight } from '@/services/db';
import { videoPoster } from '@/services/cloudinary';
import { MLBB_HEROES } from '@/lib/constants';
import { ImageUpload, VideoDropzone } from '@/components/MediaUpload';
import { Badge, Button, Card, EmptyState, Input, Select, Switch, Tabs } from '@/components/ui';
import { useToast } from '@/components/Toast';

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

function Highlights() {
  const highlights = useHighlights();
  const toast = useToast();
  const [folder, setFolder] = useState<'highlights' | 'replays'>('highlights');
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
        subtitle="Match highlights and saved instant replays (from your OBS replay folder) are hosted on Cloudinary. They appear in the website's Highlights section and can loop on the break screen."
        actions={
          <Select value={folder} onChange={(e) => setFolder(e.target.value as typeof folder)} className="h-8 w-40 py-0 text-xs">
            <option value="highlights">Folder: highlights</option>
            <option value="replays">Folder: replays</option>
          </Select>
        }
      >
        <VideoDropzone
          folder={folder}
          onUploaded={(res, file) =>
            void toast.run(() =>
              createHighlight({
                title: file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' '),
                videoUrl: res.url,
                thumbnailUrl: videoPoster(res.url),
                matchId: null,
                inPlaylist: true,
                showOnSite: true,
                ...(res.duration ? { durationSec: Math.round(res.duration) } : {}),
                order: highlights.data.length,
              }),
            )
          }
        />
      </Card>

      <Card title="Clips" subtitle={`${playlist.length} in the break-loop playlist (plays top to bottom, then loops).`}>
        {!highlights.data.length ? (
          <EmptyState icon={<Film className="h-8 w-8" />} title="No clips yet">
            Upload highlights to build the break-loop playlist.
          </EmptyState>
        ) : (
          <ul className="space-y-2">
            {highlights.data.map((h, i) => (
              <li key={h.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface2 p-2">
                <div className="relative aspect-video w-36 shrink-0 overflow-hidden rounded-lg bg-ink-900">
                  {h.thumbnailUrl ? <img src={h.thumbnailUrl} alt="" className="h-full w-full object-cover" loading="lazy" /> : <video src={h.videoUrl} muted className="h-full w-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Input defaultValue={h.title} onBlur={(e) => e.target.value !== h.title && void toast.run(() => updateHighlight(h.id, { title: e.target.value }), 'Title saved')} />
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <Switch checked={h.inPlaylist} onChange={(v) => void toast.run(() => updateHighlight(h.id, { inPlaylist: v }))} label="In break loop" />
                    <Switch checked={h.showOnSite !== false} onChange={(v) => void toast.run(() => updateHighlight(h.id, { showOnSite: v }))} label="Show on website" />
                    <a href={h.videoUrl} target="_blank" rel="noreferrer" className="text-brand hover:underline">
                      Open video
                    </a>
                    {h.videoUrl.includes('/replays/') && <Badge tone="accent">Replay</Badge>}
                  </div>
                </div>
                <div className="flex gap-1">
                  <Button size="xs" variant="ghost" disabled={i === 0} onClick={() => move(h, -1)} icon={<ArrowUp className="h-4 w-4" />} />
                  <Button size="xs" variant="ghost" disabled={i === highlights.data.length - 1} onClick={() => move(h, 1)} icon={<ArrowDown className="h-4 w-4" />} />
                  <Button
                    size="xs"
                    variant="ghost"
                    icon={<Trash2 className="h-4 w-4 text-red-500" />}
                    onClick={() => {
                      if (confirm('Remove this clip from the site? (The file stays in your Cloudinary media library.)')) void toast.run(() => deleteHighlight(h.id), 'Clip removed');
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
          <ListVideo className="h-3.5 w-3.5" /> Break overlay: <code>/overlay/break</code> (muted autoplay; add <code>?sound=1</code> to play clip audio in OBS).
        </p>
      </Card>
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
