// ─────────────────────────────────────────────────────────────────────────────
// Cloudinary (free tier) — unsigned uploads straight from the browser.
// Create an *unsigned* upload preset in Cloudinary → Settings → Upload and
// restrict it (folder "tcc-esports", allowed formats, max file size).
// ─────────────────────────────────────────────────────────────────────────────

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export const isCloudinaryConfigured = Boolean(CLOUD_NAME && UPLOAD_PRESET);

export type CloudinaryResource = 'image' | 'video' | 'auto';

export type CloudinaryFolder = 'teams' | 'players' | 'casters' | 'heroes' | 'highlights' | 'replays' | 'carousel';

export interface UploadResult {
  url: string;
  publicId: string;
  resourceType: string;
  width?: number;
  height?: number;
  duration?: number;
  format: string;
  bytes: number;
}

export interface UploadOptions {
  folder: CloudinaryFolder;
  resourceType?: CloudinaryResource;
  onProgress?: (percent: number) => void;
  signal?: AbortSignal;
}

const MAX_IMAGE_MB = 10;
const MAX_VIDEO_MB = 100; // Cloudinary free plan limit for a single video upload

export function uploadToCloudinary(file: File | string, opts: UploadOptions): Promise<UploadResult> {
  if (!isCloudinaryConfigured) {
    return Promise.reject(new Error('Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.'));
  }
  const isUrl = typeof file === 'string';
  const resourceType = opts.resourceType ?? (!isUrl && file.type.startsWith('video/') ? 'video' : 'image');
  const limit = resourceType === 'video' ? MAX_VIDEO_MB : MAX_IMAGE_MB;
  if (!isUrl && file.size > limit * 1024 * 1024) {
    return Promise.reject(new Error(`File is larger than ${limit} MB.`));
  }

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET!);
  form.append('folder', `tcc-esports/${opts.folder}`);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/${resourceType}/upload`);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) opts.onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => {
      try {
        const body = JSON.parse(xhr.responseText);
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve({
            url: body.secure_url,
            publicId: body.public_id,
            resourceType: body.resource_type,
            width: body.width,
            height: body.height,
            duration: body.duration,
            format: body.format,
            bytes: body.bytes,
          });
        } else {
          reject(new Error(body?.error?.message ?? `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(`Upload failed (${xhr.status})`));
      }
    };
    xhr.onerror = () => reject(new Error('Network error while uploading to Cloudinary.'));
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'));
    opts.signal?.addEventListener('abort', () => xhr.abort());
    xhr.send(form);
  });
}

const isCloudinaryUrl = (url: string) => /res\.cloudinary\.com\/.+\/upload\//.test(url);

/**
 * Inserts on-the-fly transformations into a Cloudinary delivery URL so the
 * landing page and overlays download small, optimised images.
 *   cld(url, { w: 128, h: 128 }) → …/upload/c_fill,g_auto,w_128,h_128,f_auto,q_auto/…
 */
export function cld(
  url: string | null | undefined,
  t: { w?: number; h?: number; crop?: 'fill' | 'fit' | 'thumb' | 'pad'; gravity?: string } = {},
): string {
  if (!url) return '';
  if (!isCloudinaryUrl(url)) return url;
  const parts = [
    `c_${t.crop ?? 'fill'}`,
    t.crop === 'fit' || t.crop === 'pad' ? null : `g_${t.gravity ?? 'auto'}`,
    t.w ? `w_${t.w}` : null,
    t.h ? `h_${t.h}` : null,
    'f_auto',
    'q_auto',
  ].filter(Boolean);
  return url.replace('/upload/', `/upload/${parts.join(',')}/`);
}

/** Poster frame for a Cloudinary video (first second, as JPG). */
export function videoPoster(videoUrl: string, w = 640): string {
  if (!isCloudinaryUrl(videoUrl)) return '';
  return videoUrl
    .replace('/upload/', `/upload/so_1,c_fill,w_${w},h_${Math.round((w * 9) / 16)},q_auto/`)
    .replace(/\.(mp4|mov|webm|mkv)$/i, '.jpg');
}

/** Stream-friendly MP4 (H.264) at a max width — keeps overlay playback smooth in OBS. */
export function videoStreamUrl(videoUrl: string, w = 1920): string {
  if (!isCloudinaryUrl(videoUrl)) return videoUrl;
  return videoUrl.replace('/upload/', `/upload/c_limit,w_${w},q_auto,vc_h264/`).replace(/\.(mov|webm|mkv)$/i, '.mp4');
}
