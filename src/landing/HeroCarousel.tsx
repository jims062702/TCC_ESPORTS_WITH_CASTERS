import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { HeroSlide } from '@/types';
import { cld } from '@/services/cloudinary';
import { Logo } from '@/components/Brand';
import { cn } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Home carousel, split into pieces so the controls can live anywhere:
//   useCarousel()      — index, direction, next/prev/goTo + 3 s auto-advance
//   CarouselImage      — the sliding image (swipe on touch, progress bar, caption)
//   CarouselArrow      — previous / next button
//   CarouselDots       — one dot per uploaded image
// The landing page puts the arrows on each side of the Home section and the
// dots at its bottom; the Settings preview uses the all-in-one HeroCarousel.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Shown until the admin uploads their own images (Admin → Settings → Home
 * carousel), so the carousel, arrows and dots work out of the box.
 */
export const BUILTIN_SLIDES: HeroSlide[] = [
  { id: 'builtin-badge', url: 'builtin:badge', caption: '' },
  { id: 'builtin-tagline', url: 'builtin:tagline', caption: '' },
  { id: 'builtin-mlbb', url: 'builtin:mlbb', caption: '' },
];

const isBuiltin = (url: string) => url.startsWith('builtin:');

/** Branded slides drawn with CSS (crisp at any size, no image files needed). */
function BuiltinSlide({ kind }: { kind: string }) {
  if (kind === 'tagline') {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center gap-4 overflow-hidden bg-gradient-to-br from-crimson-700 via-crimson-950 to-ink-950 p-6 text-center">
        <div className="grid-bg absolute inset-0 opacity-20" />
        <Logo size={110} className="relative h-[24%] w-auto drop-shadow-[0_0_24px_rgba(0,0,0,0.6)]" />
        <p className="neon relative font-display text-4xl uppercase leading-[0.9] tracking-[0.18em] sm:text-6xl">
          Let the
          <br />
          game begin
        </p>
      </div>
    );
  }
  if (kind === 'mlbb') {
    return (
      <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-ink-950 p-6 text-center">
        <div className="absolute -left-16 -top-16 h-64 w-64 rounded-full bg-teal-glow/20 blur-3xl" />
        <div className="absolute -bottom-20 -right-10 h-72 w-72 rounded-full bg-crimson-600/30 blur-3xl" />
        <p className="relative font-cond text-sm font-semibold uppercase tracking-[0.35em] text-teal-glow sm:text-base">Mobile Legends: Bang Bang</p>
        <p className="relative mt-2 font-display text-5xl uppercase leading-[0.85] text-white sm:text-7xl">
          TCC Esports
          <br />
          <span className="text-crimson-500">Tournament</span>
        </p>
        <p className="relative mt-4 font-cond text-sm uppercase tracking-[0.25em] text-white/70 sm:text-base">Live brackets · Standings · Leaderboards</p>
      </div>
    );
  }
  return (
    <div className="relative flex h-full w-full items-center justify-center overflow-hidden bg-[radial-gradient(circle_at_50%_45%,#841917_0%,#1d1b20_55%,#0d0b0e_100%)]">
      <Logo size={420} glow className="relative h-[82%] w-auto" />
    </div>
  );
}

/** Full-bleed versions of the built-in slides: artwork sits on the right half (the left fades under the text). */
function BuiltinBackground({ kind }: { kind: string }) {
  // Phones: artwork in the lower part of the screen (the text sits on top); desktop: the right half.
  const right = 'absolute inset-x-0 bottom-[7%] flex h-[42%] flex-col items-center justify-center px-6 text-center opacity-60 lg:left-auto lg:right-0 lg:top-0 lg:bottom-0 lg:h-auto lg:w-1/2 lg:px-10 lg:opacity-100';
  if (kind === 'tagline') {
    return (
      <div className="absolute inset-0 bg-gradient-to-br from-[#f8e4e1] via-[#f1d3cf] to-[#ece4e1] dark:from-crimson-950 dark:via-crimson-800 dark:to-crimson-950">
        <div className="grid-bg absolute inset-0 opacity-30 dark:opacity-15" />
        <div className={right}>
          <Logo size={180} className="h-[12vh] w-auto lg:h-[22vh] drop-shadow-[0_14px_28px_rgba(80,20,20,0.22)] dark:drop-shadow-[0_0_30px_rgba(0,0,0,0.6)]" />
          <p className="neon mt-4 font-display text-5xl uppercase leading-[0.9] tracking-[0.18em] lg:mt-6 lg:text-7xl xl:text-8xl">
            Let the
            <br />
            game begin
          </p>
        </div>
      </div>
    );
  }
  if (kind === 'mlbb') {
    return (
      <div className="absolute inset-0 bg-[#ebe5e2] dark:bg-ink-950">
        <div className="absolute right-[30%] top-[10%] h-[50vh] w-[50vh] rounded-full bg-teal-deep/10 blur-[100px] dark:bg-teal-glow/15" />
        <div className="absolute -bottom-20 right-0 h-[60vh] w-[60vh] rounded-full bg-crimson-600/15 blur-[110px] dark:bg-crimson-600/30" />
        <div className={right}>
          <p className="font-cond text-sm font-semibold uppercase tracking-[0.3em] text-teal-deep dark:text-teal-glow lg:text-lg lg:tracking-[0.35em]">Mobile Legends: Bang Bang</p>
          <p className="mt-2 font-display text-6xl uppercase leading-[0.85] text-ink-900 dark:text-white lg:mt-3 lg:text-8xl">
            TCC Esports
            <br />
            <span className="text-crimson-700 dark:text-crimson-500">Tournament</span>
          </p>
          <p className="mt-3 font-cond text-sm uppercase tracking-[0.2em] text-ink-600 dark:text-white/70 lg:mt-5 lg:text-lg lg:tracking-[0.25em]">Live brackets · Standings · Leaderboards</p>
        </div>
      </div>
    );
  }
  return (
    <div className="absolute inset-0 bg-[radial-gradient(circle_at_72%_50%,#f4d4d0_0%,#efe6e3_42%,#f0ece9_78%)] dark:bg-[radial-gradient(circle_at_72%_50%,#841917_0%,#1d1b20_42%,#0d0b0e_78%)]">
      <Logo
        size={640}
        className="absolute bottom-[6%] right-1/2 h-[42%] w-auto translate-x-1/2 opacity-25 drop-shadow-[0_24px_48px_rgba(80,20,20,0.25)] dark:opacity-40 dark:drop-shadow-[0_0_28px_rgba(248,49,47,0.45)] lg:bottom-auto lg:right-[6%] lg:top-1/2 lg:h-[56%] lg:-translate-y-1/2 lg:translate-x-0 lg:opacity-100 dark:lg:opacity-100"
      />
    </div>
  );
}

/**
 * Home background: the current image fills the whole section with no border.
 * Desktop — fades into the page on the left (behind the text), fully visible on the right.
 * Phones/tablets — fades from the top so the stacked text stays readable.
 */
export function CarouselBackground({ slides, state }: { slides: HeroSlide[]; state: CarouselState }) {
  const reduce = useReducedMotion();
  const current = slides[state.index];
  return (
    <div className="absolute inset-0" role="region" aria-roledescription="carousel" aria-label="TCC Esports highlights">
      <AnimatePresence initial={false}>
        {current && (
          <motion.div
            key={current.id + state.index}
            className="absolute inset-0"
            initial={{ opacity: 0, scale: reduce ? 1 : 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ opacity: { duration: 0.8 }, scale: { duration: 3.4, ease: 'easeOut' } }}
            aria-roledescription="slide"
            aria-label={`${state.index + 1} of ${state.count}`}
          >
            {isBuiltin(current.url) ? (
              <BuiltinBackground kind={current.url.slice('builtin:'.length)} />
            ) : (
              <img src={cld(current.url, { w: 1920, h: 1080 })} alt={current.caption || `Image ${state.index + 1}`} draggable={false} className="h-full w-full select-none object-cover" />
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Fade toward the left (text side); the right side shows the image fully */}
      <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-r from-bg from-25% via-bg/60 via-45% to-transparent to-65% lg:block" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-bg/85 via-bg/65 to-bg/20 lg:hidden" />
      {/* Soft edges under the navbar and into the next section */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-bg/70 to-transparent" />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-bg to-transparent" />

      {current?.caption && !isBuiltin(current.url) && (
        <motion.p
          key={`cap-${current.id}-${state.index}`}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-24 right-24 hidden max-w-[40%] text-right font-display text-5xl uppercase leading-none text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)] lg:block"
        >
          {current.caption}
        </motion.p>
      )}

      {/* 3-second progress bar along the bottom edge */}
      {state.running && (
        <motion.span
          key={`bar-${state.index}`}
          className="absolute bottom-0 left-0 h-1 bg-brand"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: state.interval / 1000, ease: 'linear' }}
        />
      )}
    </div>
  );
}

/** Horizontal swipe on an element (by id) flips the carousel on touch screens. */
export function useSwipe(elementId: string, go: (delta: number) => void) {
  useEffect(() => {
    const el = document.getElementById(elementId);
    if (!el) return;
    let x0 = 0;
    let y0 = 0;
    const onStart = (e: TouchEvent) => {
      x0 = e.touches[0].clientX;
      y0 = e.touches[0].clientY;
    };
    const onEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - x0;
      const dy = e.changedTouches[0].clientY - y0;
      if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(dx < 0 ? 1 : -1);
    };
    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchend', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchend', onEnd);
    };
  }, [elementId, go]);
}

export interface CarouselState {
  index: number;
  dir: number;
  count: number;
  go: (delta: number) => void;
  goTo: (i: number) => void;
  running: boolean;
  interval: number;
}

export function useCarousel(count: number, interval = 3000): CarouselState {
  const [[index, dir], setState] = useState<[number, number]>([0, 1]);
  const [visible, setVisible] = useState(true);

  const go = useCallback((delta: number) => setState(([i]) => [count ? (i + delta + count) % count : 0, delta]), [count]);
  const goTo = useCallback((i: number) => setState(([cur]) => [i, i >= cur ? 1 : -1]), []);

  // Keep the index valid when the admin adds/removes images.
  useEffect(() => {
    if (index >= count && count) setState([0, 1]);
  }, [count, index]);

  // Pause only while the browser tab is hidden.
  useEffect(() => {
    const onVis = () => setVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  // Auto-advance every `interval` ms. Depends on `index`, so clicking an arrow or dot restarts the countdown.
  const running = count > 1 && visible;
  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go(1), interval);
    return () => clearTimeout(t);
  }, [running, interval, go, index]);

  return { index: count ? index % count : 0, dir, count, go, goTo, running, interval };
}

export function CarouselImage({ slides, state, className }: { slides: HeroSlide[]; state: CarouselState; className?: string }) {
  const reduce = useReducedMotion();
  const current = slides[state.index];

  if (!current) {
    // No images yet: show the badge until the admin adds carousel images.
    return (
      <div className={cn('relative flex aspect-[4/3] w-full items-center justify-center', className)}>
        <div className="absolute inset-[12%] rounded-full bg-brand/20 blur-3xl" />
        <Logo size={420} glow className="relative h-full w-auto p-[6%]" />
      </div>
    );
  }

  const variants = {
    enter: (d: number) => (reduce ? { opacity: 0 } : { x: d > 0 ? '100%' : '-100%', opacity: 0.4 }),
    center: { x: 0, opacity: 1 },
    exit: (d: number) => (reduce ? { opacity: 0 } : { x: d > 0 ? '-100%' : '100%', opacity: 0.4 }),
  };

  return (
    <div
      className={cn('relative aspect-[4/3] w-full overflow-hidden rounded-3xl border border-line bg-ink-950 shadow-glow-lg', className)}
      role="region"
      aria-roledescription="carousel"
      aria-label="TCC Esports highlights"
    >
      <AnimatePresence initial={false} custom={state.dir}>
        <motion.div
          key={current.id + state.index}
          custom={state.dir}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ duration: 0.6, ease: [0.32, 0.72, 0, 1] }}
          drag={state.count > 1 ? 'x' : false}
          dragConstraints={{ left: 0, right: 0 }}
          dragElastic={0.2}
          onDragEnd={(_, info) => {
            if (info.offset.x < -60) state.go(1);
            else if (info.offset.x > 60) state.go(-1);
          }}
          className="absolute inset-0 cursor-grab active:cursor-grabbing"
          aria-roledescription="slide"
          aria-label={`${state.index + 1} of ${state.count}`}
        >
          {isBuiltin(current.url) ? (
            <BuiltinSlide kind={current.url.slice('builtin:'.length)} />
          ) : (
            <>
              <img src={cld(current.url, { w: 1280, h: 960 })} alt={current.caption || `Image ${state.index + 1}`} draggable={false} className="h-full w-full select-none object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent" />
            </>
          )}
          {current.caption && (
            <p className="absolute inset-x-0 bottom-6 px-6 text-center font-display text-3xl uppercase leading-none text-white drop-shadow sm:text-4xl">{current.caption}</p>
          )}
        </motion.div>
      </AnimatePresence>
      {/* 3-second progress bar */}
      {state.running && (
        <motion.span
          key={`bar-${state.index}`}
          className="absolute left-0 top-0 h-1 bg-brand"
          initial={{ width: '0%' }}
          animate={{ width: '100%' }}
          transition={{ duration: state.interval / 1000, ease: 'linear' }}
        />
      )}
    </div>
  );
}

/** Previous / next button. Always visible; disabled when there is only one image. */
export function CarouselArrow({ direction, state, className }: { direction: 'prev' | 'next'; state: CarouselState; className?: string }) {
  const Icon = direction === 'prev' ? ChevronLeft : ChevronRight;
  const disabled = state.count < 2;
  return (
    <button
      type="button"
      onClick={() => state.go(direction === 'prev' ? -1 : 1)}
      disabled={disabled}
      title={disabled ? 'Add more images to use the arrows' : undefined}
      aria-label={direction === 'prev' ? 'Previous image' : 'Next image'}
      className={cn(
        'z-10 flex h-12 w-12 items-center justify-center rounded-full border border-line bg-surface/80 text-fg shadow-lg backdrop-blur transition hover:scale-105 hover:border-brand hover:bg-brand hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100 disabled:hover:border-line disabled:hover:bg-surface/80 disabled:hover:text-fg',
        className,
      )}
    >
      <Icon className="h-6 w-6" />
    </button>
  );
}

/** One dot per uploaded image; the current image's dot is filled red. */
export function CarouselDots({ state, className }: { state: CarouselState; className?: string }) {
  if (state.count < 1) return null;
  return (
    <div className={cn('flex items-center justify-center gap-2.5', className)} role="tablist" aria-label={`${state.count} images`}>
      {Array.from({ length: state.count }).map((_, i) => {
        const on = i === state.index;
        return (
          <button
            key={i}
            type="button"
            role="tab"
            aria-selected={on}
            aria-label={`Image ${i + 1} of ${state.count}`}
            onClick={() => state.goTo(i)}
            className={cn(
              'h-3.5 w-3.5 rounded-full border-2 transition-all',
              on ? 'scale-125 border-brand bg-brand shadow-[0_0_10px_rgba(248,49,47,0.8)]' : 'border-muted/70 bg-transparent hover:border-brand hover:bg-brand/40',
            )}
          />
        );
      })}
    </div>
  );
}

/** All-in-one carousel (used for the Settings live preview). */
export function HeroCarousel({ slides, interval = 3000, className }: { slides: HeroSlide[]; interval?: number; className?: string }) {
  const state = useCarousel(slides.length, interval);
  return (
    <div className={cn('space-y-3', className)}>
      <div className="relative">
        <CarouselImage slides={slides} state={state} />
        <CarouselArrow direction="prev" state={state} className="absolute left-3 top-1/2 -translate-y-1/2" />
        <CarouselArrow direction="next" state={state} className="absolute right-3 top-1/2 -translate-y-1/2" />
      </div>
      <CarouselDots state={state} />
    </div>
  );
}
