import { useEffect, useState, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** Landing page sections, in order (drives the navbar and scroll-spy). */
export const SECTIONS = [
  { id: 'home', label: 'Home' },
  { id: 'highlights', label: 'Highlights' },
  { id: 'matches', label: 'Matches' },
  { id: 'bracket', label: 'Bracket' },
  { id: 'standings', label: 'Standings' },
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'teams', label: 'Teams' },
] as const;

export type SectionId = (typeof SECTIONS)[number]['id'];

/**
 * A full-screen landing section: always at least one screen tall, so the
 * visitor sees one section at a time. Long content (big brackets, long
 * leaderboards) simply makes the section taller — there are no inner scroll
 * boxes, so the mouse wheel / touch always scrolls the page.
 */
export function FullSection({
  id,
  eyebrow,
  title,
  actions,
  alt,
  children,
  bodyClassName,
  containerClassName,
  background,
  overlay,
  footer,
}: {
  id: SectionId;
  eyebrow?: string;
  title?: string;
  actions?: ReactNode;
  alt?: boolean;
  children: ReactNode;
  bodyClassName?: string;
  containerClassName?: string;
  /** Full-bleed layer behind the content (e.g. the Home carousel). */
  background?: ReactNode;
  /** Absolutely-positioned extras relative to the whole section (e.g. carousel arrows and dots). */
  overlay?: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <section
      id={id}
      data-section={id}
      aria-label={title ?? id}
      className={cn('relative flex min-h-screen flex-col pt-16 supports-[min-height:100svh]:min-h-[100svh]', alt && 'bg-surface/50')}
    >
      {background && <div className="absolute inset-0 z-0 overflow-hidden">{background}</div>}
      <div className={cn('relative z-10 mx-auto flex w-full max-w-7xl flex-1 flex-col px-4 py-6 sm:px-6 lg:py-10', containerClassName)}>
        {title && (
          <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              {eyebrow && <p className="eyebrow">{eyebrow}</p>}
              <h2 className="section-title mt-1">{title}</h2>
            </div>
            {actions}
          </header>
        )}
        <div className={cn('flex-1', bodyClassName)}>{children}</div>
      </div>
      {overlay}
      {footer}
    </section>
  );
}

/** Tracks which section is in the middle of the viewport. */
export function useActiveSection(): SectionId {
  const [active, setActive] = useState<SectionId>('home');
  useEffect(() => {
    // Deep links (e.g. /#bracket): the SPA renders after the browser's own
    // anchor jump, so jump there ourselves. 'instant' bypasses CSS smooth
    // scrolling so the observer below sees the right section immediately.
    const initial = window.location.hash.slice(1);
    if (SECTIONS.some((s) => s.id === initial)) {
      const el = document.getElementById(initial);
      if (el) window.scrollTo({ top: el.offsetTop, behavior: 'instant' });
      setActive(initial as SectionId);
    }
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            const id = e.target.getAttribute('data-section') as SectionId;
            setActive(id);
            history.replaceState(null, '', id === 'home' ? window.location.pathname : `#${id}`);
          }
        }
      },
      { rootMargin: '-45% 0px -50% 0px', threshold: 0 },
    );
    els.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);
  return active;
}

/** Smooth scrolling for menu links while the landing page is mounted (no snapping). */
export function useSmoothScrolling() {
  useEffect(() => {
    document.documentElement.classList.add('smooth-page');
    return () => document.documentElement.classList.remove('smooth-page');
  }, []);
}

/** Smoothly scroll to a section's top edge. */
export function scrollToSection(id: SectionId) {
  const el = document.getElementById(id);
  if (el) window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY, behavior: 'smooth' });
}
