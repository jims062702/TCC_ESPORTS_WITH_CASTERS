import { useRef, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Link2, Loader2, Save, Trash2 } from 'lucide-react';
import type { HeroSlide } from '@/types';
import { cld, isCloudinaryConfigured, uploadToCloudinary } from '@/services/cloudinary';
import { BUILTIN_SLIDES, HeroCarousel } from '@/landing/HeroCarousel';
import { Button, Card, Input } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { uid } from '@/lib/utils';

/** Admin → Settings → Home carousel: upload, caption, reorder and preview the Home section images. */
export function CarouselEditor({ slides, onChange, onSave, dirty }: { slides: HeroSlide[]; onChange: (s: HeroSlide[]) => void; onSave: () => void; dirty: boolean }) {
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [url, setUrl] = useState('');

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    const added: HeroSlide[] = [];
    const list = [...files].filter((f) => f.type.startsWith('image/'));
    for (let i = 0; i < list.length; i++) {
      try {
        const res = await uploadToCloudinary(list[i], { folder: 'carousel', resourceType: 'image', onProgress: (p) => setProgress(`${i + 1}/${list.length} · ${p}%`) });
        added.push({ id: uid('slide_'), url: res.url, caption: '' });
      } catch (e) {
        toast.error((e as Error).message);
      }
    }
    setProgress(null);
    if (added.length) {
      onChange([...slides, ...added]);
      toast.info(`${added.length} image${added.length > 1 ? 's' : ''} added — press Save to publish`);
    }
  };

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= slides.length) return;
    const next = [...slides];
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  };

  return (
    <Card
      title="Home carousel"
      subtitle="Images on the right side of the Home section. They change every 3 seconds, with left/right arrows and one dot per image."
      actions={
        <Button size="sm" icon={<Save className="h-4 w-4" />} disabled={!dirty} onClick={onSave}>
          Save
        </Button>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <Button icon={progress ? <Loader2 className="h-4 w-4 animate-spin" /> : <ImagePlus className="h-4 w-4" />} disabled={!isCloudinaryConfigured || !!progress} onClick={() => input.current?.click()}>
              {progress ? `Uploading ${progress}` : 'Upload images'}
            </Button>
            <input ref={input} type="file" accept="image/*" multiple hidden onChange={(e) => void upload(e.target.files).then(() => (e.target.value = ''))} />
          </div>
          <div className="flex gap-2">
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="…or paste an image URL" />
            <Button
              variant="secondary"
              icon={<Link2 className="h-4 w-4" />}
              disabled={!/^https?:\/\//.test(url)}
              onClick={() => {
                onChange([...slides, { id: uid('slide_'), url: url.trim(), caption: '' }]);
                setUrl('');
              }}
            >
              Add
            </Button>
          </div>
          {!isCloudinaryConfigured && <p className="text-xs text-amber-500">Cloudinary isn&apos;t configured — you can still paste image URLs.</p>}

          <ul className="space-y-2">
            {slides.map((s, i) => (
              <li key={s.id} className="flex items-center gap-3 rounded-xl border border-line bg-surface2 p-2">
                <span className="w-5 text-center font-display text-xl leading-none text-brand">{i + 1}</span>
                <img src={cld(s.url, { w: 160, h: 120 })} alt="" className="h-14 w-20 shrink-0 rounded-lg object-cover" />
                <Input
                  value={s.caption}
                  placeholder="Caption (optional)"
                  onChange={(e) => onChange(slides.map((x) => (x.id === s.id ? { ...x, caption: e.target.value } : x)))}
                />
                <div className="flex shrink-0 gap-0.5">
                  <Button size="xs" variant="ghost" disabled={i === 0} onClick={() => move(i, -1)} icon={<ArrowUp className="h-4 w-4" />} aria-label="Move up" />
                  <Button size="xs" variant="ghost" disabled={i === slides.length - 1} onClick={() => move(i, 1)} icon={<ArrowDown className="h-4 w-4" />} aria-label="Move down" />
                  <Button size="xs" variant="ghost" onClick={() => onChange(slides.filter((x) => x.id !== s.id))} icon={<Trash2 className="h-4 w-4 text-red-500" />} aria-label="Remove" />
                </div>
              </li>
            ))}
            {!slides.length && (
              <li className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                No images yet — the Home section shows 3 built-in TCC slides until you add your own. Your uploads replace them.
              </li>
            )}
          </ul>
        </div>
        <div>
          <p className="label">{slides.length ? 'Live preview' : 'Live preview — built-in slides (until you upload)'}</p>
          <HeroCarousel slides={slides.length ? slides : BUILTIN_SLIDES} />
          {dirty && <p className="mt-2 text-xs text-amber-500">Unsaved changes — press Save to publish to the landing page.</p>}
        </div>
      </div>
    </Card>
  );
}
