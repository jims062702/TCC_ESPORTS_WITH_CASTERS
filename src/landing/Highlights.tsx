import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Film, Maximize2, Play, X } from 'lucide-react';
import type { Highlight } from '@/types';
import { videoPoster, videoStreamUrl } from '@/services/cloudinary';
import { Button, EmptyState } from '@/components/ui';
import { cn, formatDuration } from '@/lib/utils';
import { scrollToSection } from './sections';

const PAGE = 4; // cards per row / per "See more"

/** True on devices with a real mouse (desktop), false on touch screens. */
function useCanHover() {
  const query = '(hover: hover) and (pointer: fine)';
  const [can, setCan] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setCan(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return can;
}

/**
 * Public Highlights: 4 video cards per row. Desktop: hovering a card plays a
 * muted preview. Any device: clicking/tapping opens the big player with sound.
 * Shows 4 at a time — "See more" adds 4 more, "Show less" collapses back.
 */
export function HighlightsSection({ highlights }: { highlights: Highlight[] }) {
  const [visible, setVisible] = useState(PAGE);
  const [open, setOpen] = useState<number | null>(null);
  const canHover = useCanHover();

  if (!highlights.length) {
    return (
      <EmptyState icon={<Film className="h-8 w-8" />} title="No highlights yet">
        The best plays of the tournament will appear here.
      </EmptyState>
    );
  }

  const shown = highlights.slice(0, visible);
  const hasMore = visible < highlights.length;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <AnimatePresence initial={false}>
          {shown.map((h, i) => (
            <motion.div key={h.id} layout initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }} transition={{ duration: 0.25, delay: i >= visible - PAGE ? (i % PAGE) * 0.05 : 0 }}>
              <HighlightCard h={h} canHover={canHover} onOpen={() => setOpen(i)} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {(hasMore || visible > PAGE) && (
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          {hasMore && (
            <Button variant="outline" icon={<ChevronDown className="h-4 w-4" />} onClick={() => setVisible((v) => Math.min(highlights.length, v + PAGE))}>
              See more ({highlights.length - visible} more)
            </Button>
          )}
          {visible > PAGE && (
            <Button
              variant="ghost"
              icon={<ChevronUp className="h-4 w-4" />}
              onClick={() => {
                setVisible(PAGE);
                scrollToSection('highlights');
              }}
            >
              Show less
            </Button>
          )}
        </div>
      )}
      <p className="mt-3 text-center text-xs text-muted">
        Showing {shown.length} of {highlights.length} · {canHover ? 'hover to preview, click to watch' : 'tap a video to watch'}
      </p>

      <HighlightPlayer list={highlights} index={open} onClose={() => setOpen(null)} onNav={(d) => setOpen((i) => (i === null ? i : (i + d + highlights.length) % highlights.length))} />
    </div>
  );
}

function HighlightCard({ h, canHover, onOpen }: { h: Highlight; canHover: boolean; onOpen: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const poster = h.thumbnailUrl || videoPoster(h.videoUrl, 640) || undefined;

  const start = () => {
    if (!canHover || !video.current) return;
    video.current.currentTime = 0;
    video.current.play().then(() => setPlaying(true)).catch(() => {});
  };
  const stop = () => {
    if (!video.current) return;
    video.current.pause();
    video.current.currentTime = 0;
    setPlaying(false);
  };

  return (
    <button
      type="button"
      onClick={() => {
        stop();
        onOpen();
      }}
      onMouseEnter={start}
      onMouseLeave={stop}
      aria-label={`Watch ${h.title}`}
      className="group block w-full overflow-hidden rounded-2xl border border-line bg-surface text-left shadow-sm transition hover:-translate-y-1 hover:border-brand/60 hover:shadow-glow focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand"
    >
      <div className="relative aspect-video overflow-hidden bg-ink-950">
        <video
          ref={video}
          src={videoStreamUrl(h.videoUrl, 640) + (poster ? '' : '#t=0.5')}
          poster={poster}
          muted
          loop
          playsInline
          preload="metadata"
          className={cn('h-full w-full object-cover transition duration-500', playing ? 'scale-105' : 'group-hover:scale-105')}
        />
        <div className={cn('absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent transition-opacity', playing && 'opacity-40')} />
        {!playing && (
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-brand/90 text-white shadow-glow transition group-hover:scale-110">
            <Play className="ml-0.5 h-5 w-5 fill-white" />
          </span>
        )}
        {playing && (
          <span className="absolute left-2 top-2 flex items-center gap-1 rounded-md bg-black/60 px-2 py-0.5 font-cond text-[11px] font-semibold uppercase tracking-wider text-white">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand" /> Preview
          </span>
        )}
        <span className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/50 text-white opacity-0 transition group-hover:opacity-100">
          <Maximize2 className="h-3.5 w-3.5" />
        </span>
        {h.durationSec ? (
          <span className="absolute bottom-2 right-2 rounded bg-black/70 px-1.5 py-0.5 font-mono text-[11px] text-white">{formatDuration(h.durationSec)}</span>
        ) : null}
      </div>
      <div className="p-3">
        <p className="line-clamp-2 text-sm font-semibold leading-snug sm:text-base">{h.title}</p>
        <p className="mt-0.5 text-xs text-muted">{new Date(h.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}</p>
      </div>
    </button>
  );
}

/** Enlarged player with sound, previous/next and keyboard support (Esc, ← →). */
function HighlightPlayer({ list, index, onClose, onNav }: { list: Highlight[]; index: number | null; onClose: () => void; onNav: (d: number) => void }) {
  const h = index !== null ? list[index] : null;

  useEffect(() => {
    if (index === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onNav(-1);
      if (e.key === 'ArrowRight') onNav(1);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [index, onClose, onNav]);

  return (
    <AnimatePresence>
      {h && (
        <motion.div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/90 p-3 backdrop-blur-sm sm:p-8"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          role="dialog"
          aria-modal="true"
          aria-label={h.title}
        >
          <motion.div
            className="relative w-full max-w-6xl"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', bounce: 0.15, duration: 0.4 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3 text-white">
              <div className="min-w-0">
                <p className="truncate font-display text-2xl uppercase leading-none sm:text-3xl">{h.title}</p>
                <p className="mt-1 font-cond text-xs uppercase tracking-wider text-white/60">
                  Highlight {index! + 1} of {list.length}
                </p>
              </div>
              <button onClick={onClose} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-brand" aria-label="Close">
                <X className="h-5 w-5" />
              </button>
            </div>
            <video key={h.id} src={videoStreamUrl(h.videoUrl)} poster={h.thumbnailUrl || undefined} controls autoPlay playsInline className="aspect-video w-full rounded-2xl bg-black shadow-2xl" />
            {list.length > 1 && (
              <>
                <button
                  onClick={() => onNav(-1)}
                  aria-label="Previous highlight"
                  className="absolute -left-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-brand sm:-left-16"
                >
                  <ChevronLeft className="h-6 w-6" />
                </button>
                <button
                  onClick={() => onNav(1)}
                  aria-label="Next highlight"
                  className="absolute -right-2 top-1/2 flex h-12 w-12 -translate-y-1/2 items-center justify-center rounded-full bg-black/60 text-white hover:bg-brand sm:-right-16"
                >
                  <ChevronRight className="h-6 w-6" />
                </button>
              </>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
