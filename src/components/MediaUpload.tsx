import { useEffect, useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, UploadCloud } from 'lucide-react';
import { isCloudinaryConfigured, uploadToCloudinary, type CloudinaryFolder, type UploadResult } from '@/services/cloudinary';
import { cn } from '@/lib/utils';
import { useToast } from './Toast';

/** Image picker that uploads to Cloudinary and returns the secure URL. Also accepts a pasted URL. */
export function ImageUpload({
  value,
  onChange,
  folder,
  shape = 'square',
  size = 96,
  label = 'Upload',
}: {
  value: string;
  onChange: (url: string) => void;
  folder: CloudinaryFolder;
  shape?: 'square' | 'circle';
  size?: number;
  label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [value]);
  const toast = useToast();

  const pick = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file.');
    setProgress(0);
    try {
      const res = await uploadToCloudinary(file, { folder, resourceType: 'image', onProgress: setProgress });
      onChange(res.url);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        disabled={!isCloudinaryConfigured || progress !== null}
        className={cn(
          'group relative flex shrink-0 items-center justify-center overflow-hidden border-2 border-dashed border-line bg-surface2 transition hover:border-brand disabled:cursor-not-allowed',
          shape === 'circle' ? 'rounded-full' : 'rounded-xl',
        )}
        style={{ width: size, height: size }}
        title={isCloudinaryConfigured ? label : 'Configure Cloudinary to enable uploads'}
      >
        {value && !broken ? (
          <img src={value} alt="" onError={() => setBroken(true)} className={cn('h-full w-full', shape === 'circle' ? 'object-cover' : 'object-contain p-1')} />
        ) : (
          <ImagePlus className="h-6 w-6 text-muted group-hover:text-brand" />
        )}
        {progress !== null && (
          <span className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 text-xs font-semibold text-white">
            <Loader2 className="mb-1 h-5 w-5 animate-spin" />
            {progress}%
          </span>
        )}
      </button>
      <div className="min-w-0 flex-1 space-y-1.5">
        <input
          className="input text-xs"
          placeholder={isCloudinaryConfigured ? 'or paste an image URL' : 'Paste an image URL (Cloudinary not configured)'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        {value && broken && (
          <p className="text-xs text-amber-600 dark:text-amber-400">This link isn&apos;t a direct image (e.g. a Facebook or Google Drive page). Upload the file, or use a link that ends in .jpg / .png.</p>
        )}
        {value && (
          <button type="button" onClick={() => onChange('')} className="inline-flex items-center gap-1 text-xs text-muted hover:text-red-500">
            <Trash2 className="h-3.5 w-3.5" /> Remove
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={(e) => pick(e.target.files?.[0])} />
    </div>
  );
}

/** Drag & drop / click uploader for highlight videos and replay clips. */
export function VideoDropzone({ folder, onUploaded }: { folder: CloudinaryFolder; onUploaded: (res: UploadResult, file: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [drag, setDrag] = useState(false);
  const toast = useToast();

  const upload = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith('video/')) return toast.error('Please choose a video file (MP4/WebM/MOV).');
    setProgress(0);
    try {
      const res = await uploadToCloudinary(file, { folder, resourceType: 'video', onProgress: setProgress });
      onUploaded(res, file);
      toast.success('Video uploaded to Cloudinary');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setProgress(null);
    }
  };

  return (
    <button
      type="button"
      disabled={!isCloudinaryConfigured || progress !== null}
      onClick={() => input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload(e.dataTransfer.files?.[0]);
      }}
      className={cn(
        'flex w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-6 py-8 text-center transition disabled:cursor-not-allowed disabled:opacity-60',
        drag ? 'border-brand bg-brand/5' : 'border-line hover:border-brand/60',
      )}
    >
      {progress !== null ? <Loader2 className="h-8 w-8 animate-spin text-brand" /> : <UploadCloud className="h-8 w-8 text-brand" />}
      <span className="font-semibold">{progress !== null ? `Uploading… ${progress}%` : 'Drop a highlight clip or click to upload'}</span>
      <span className="text-xs text-muted">{isCloudinaryConfigured ? 'MP4 / WebM / MOV · up to 100 MB (Cloudinary free tier)' : 'Cloudinary is not configured — see README'}</span>
      <input ref={input} type="file" accept="video/*" hidden onChange={(e) => void upload(e.target.files?.[0])} />
    </button>
  );
}
