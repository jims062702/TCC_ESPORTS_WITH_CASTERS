import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Menu, Shield, X } from 'lucide-react';
import { Logo, ThemeToggle } from '@/components/Brand';
import { cn } from '@/lib/utils';
import { SECTIONS, scrollToSection, type SectionId } from './sections';

export function Navbar({ active }: { active: SectionId }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Desktop links scroll right away. Mobile menu links close the menu first and
  // scroll once its closing animation has finished — starting a smooth scroll
  // in the same moment the menu collapses gets cancelled by the browser.
  const pending = useRef<SectionId | null>(null);
  const go = (id: SectionId) => (e: React.MouseEvent) => {
    e.preventDefault();
    if (open) {
      pending.current = id;
      setOpen(false);
    } else {
      scrollToSection(id);
    }
  };
  const afterMenuClosed = () => {
    if (pending.current) scrollToSection(pending.current);
    pending.current = null;
  };

  return (
    <header className={cn('fixed inset-x-0 top-0 z-40 transition', scrolled || open ? 'border-b border-line bg-bg/85 backdrop-blur-lg' : 'bg-transparent')}>
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
        <a href="#home" onClick={go('home')} className="flex items-center gap-2.5">
          <Logo size={40} />
          <span className="font-display text-2xl uppercase leading-none tracking-wide">
            TCC <span className="text-brand">Esports</span>
          </span>
        </a>
        <div className="hidden items-center gap-0.5 lg:flex xl:gap-1">
          {SECTIONS.map((s) => {
            const on = active === s.id;
            return (
              <a
                key={s.id}
                href={`#${s.id}`}
                onClick={go(s.id)}
                aria-current={on ? 'page' : undefined}
                className={cn('relative rounded-lg px-2.5 py-2 font-cond text-sm font-semibold uppercase tracking-wider transition xl:px-3', on ? 'text-brand' : 'text-muted hover:bg-surface2 hover:text-fg')}
              >
                {on && <motion.span layoutId="nav-active" className="absolute inset-0 rounded-lg bg-brand/10 ring-1 ring-brand/40" transition={{ type: 'spring', stiffness: 450, damping: 35 }} />}
                <span className="relative">{s.label}</span>
                {on && <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[13px] h-[3px] rounded-full bg-brand shadow-glow" />}
              </a>
            );
          })}
        </div>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Link to="/admin" className="hidden h-9 items-center gap-1.5 rounded-lg border border-line px-3 font-cond text-sm font-semibold uppercase tracking-wider text-muted transition hover:border-brand/60 hover:text-fg sm:inline-flex">
            <Shield className="h-4 w-4" /> <span className="lg:hidden xl:inline">Admin</span>
          </Link>
          <button className="rounded-lg p-2 lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </nav>
      <AnimatePresence onExitComplete={afterMenuClosed}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden lg:hidden">
            <div className="flex flex-col px-4 py-2">
              {SECTIONS.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  onClick={go(s.id)}
                  aria-current={active === s.id ? 'page' : undefined}
                  className={cn(
                    'flex items-center gap-3 rounded-lg px-3 py-3 font-cond font-semibold uppercase tracking-wider',
                    active === s.id ? 'bg-brand/10 text-brand' : 'text-muted hover:bg-surface2 hover:text-fg',
                  )}
                >
                  <span className={cn('h-2 w-2 rounded-full', active === s.id ? 'bg-brand' : 'bg-line')} />
                  {s.label}
                </a>
              ))}
              <Link to="/admin" className="rounded-lg px-3 py-3 font-cond font-semibold uppercase tracking-wider text-muted hover:bg-surface2 hover:text-fg">
                Admin
              </Link>
              <Link to="/guide" className="flex items-center gap-2 rounded-lg px-3 py-3 font-cond font-semibold uppercase tracking-wider text-muted hover:bg-surface2 hover:text-fg">
                <BookOpen className="h-4 w-4" /> Setup guide
              </Link>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
}
