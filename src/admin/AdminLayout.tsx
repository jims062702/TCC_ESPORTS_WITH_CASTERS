import { useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookOpen, Clapperboard, Copy, ExternalLink, Film, Gamepad2, LayoutDashboard, LogOut, Menu, Mic2, Settings, Trophy, Users, X } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBooth, useLive, useNow, usePlayers } from '@/hooks/useFirestore';
import { PauseWatcher } from './controller/BreakControls';
import { GoldKeeper } from './controller/GoldReader';
import { SpellKeeper } from './controller/SpellReader';
import { isFirebaseConfigured, logout } from '@/services/firebase';
import { Logo, ThemeToggle } from '@/components/Brand';
import { Button, LiveDot, Notice, Spinner } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { BoothKeeper, useBoothStatus } from './BoothKeeper';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { obsBridge, type ObsStatus } from '@/services/obs';

/** OBS connection status (kept alive by the admin layout). */
export function useObsStatus(): { status: ObsStatus; error: string | null } {
  const [state, setState] = useState(() => ({ status: obsBridge.status, error: obsBridge.lastError }));
  useEffect(() => obsBridge.onChange(() => setState({ status: obsBridge.status, error: obsBridge.lastError })), []);
  return state;
}

/** Connects to OBS when any admin page opens (so a refresh reconnects by itself) and keeps it connected. */
function ObsKeeper() {
  useEffect(() => obsBridge.startKeeper(), []);
  return null;
}

/** "Pause the game" reminder (rings from 10 s left until clicked) + auto-resume, on every admin page. */
function PauseKeeper() {
  const live = useLive();
  const players = usePlayers();
  if (live.loading || !live.data.matchId) return null;
  return (
    <>
      <PauseWatcher live={live.data} players={players.data} />
      {/* Gold: read from the game every 3 min and announced by the casters on the mic */}
      <GoldKeeper live={live.data} />
      <SpellKeeper live={live.data} />
    </>
  );
}

const NAV = [
  { to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/admin/teams', label: 'Teams & Rosters', icon: Users },
  { to: '/admin/tournaments', label: 'Tournaments', icon: Trophy },
  { to: '/admin/controller', label: 'Live Controller', icon: Gamepad2 },
  { to: '/admin/booth', label: 'Caster Booth', icon: Mic2 },
  { to: '/admin/media', label: 'Media & Replays', icon: Film },
  { to: '/admin/settings', label: 'Settings', icon: Settings },
];

export default function AdminLayout() {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();
  const toast = useToast();
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [location.pathname]);
  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setMenuOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  if (!isFirebaseConfigured) {
    return (
      <div className="mx-auto max-w-xl px-4 py-24">
        <Notice tone="warn">
          <p className="font-semibold">Firebase is not configured.</p>
          <p className="mt-1">
            Create a <code>.env</code> file from <code>.env.example</code> with your Firebase web app keys, then restart the dev server. The{' '}
            <Link to="/guide" className="font-semibold text-brand underline">
              step-by-step setup guide
            </Link>{' '}
            walks you through it.
          </p>
        </Notice>
      </div>
    );
  }
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace state={{ from: location.pathname }} />;

  if (!isAdmin) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-5 px-4 text-center">
        <Logo size={96} />
        <h1 className="font-display text-4xl uppercase">Not an organizer yet</h1>
        <p className="text-sm text-muted">
          You&apos;re signed in as <strong>{user.email}</strong>, but this account isn&apos;t in the <code>admins</code> collection. In the Firebase console open
          Firestore → create collection <code>admins</code> → add a document whose ID is your UID below (any field, e.g. <code>email</code>).
        </p>
        <button
          className="card flex items-center gap-2 px-4 py-2 font-mono text-sm hover:border-brand"
          onClick={() => {
            void navigator.clipboard.writeText(user.uid);
            toast.success('UID copied');
          }}
        >
          {user.uid} <Copy className="h-4 w-4" />
        </button>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => window.location.reload()}>
            I&apos;ve added it — reload
          </Button>
          <Button variant="ghost" onClick={() => void logout()} icon={<LogOut className="h-4 w-4" />}>
            Sign out
          </Button>
        </div>
      </div>
    );
  }

  const navLinks = (
    <>
      {NAV.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              'flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold transition lg:py-2',
              isActive ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'text-muted hover:bg-surface2 hover:text-fg',
            )
          }
        >
          <Icon className="h-4 w-4" /> {label}
        </NavLink>
      ))}
      <Link to="/guide" className="flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-semibold text-muted transition hover:bg-surface2 hover:text-fg lg:py-2">
        <BookOpen className="h-4 w-4" /> Setup guide
      </Link>
    </>
  );
  const footer = (
    <div className="space-y-3">
      <StatusPills />
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3">
        <p className="truncate text-xs text-muted" title={user.email ?? ''}>
          {user.email}
        </p>
        <ThemeToggle />
      </div>
      <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => void logout()} icon={<LogOut className="h-4 w-4" />}>
        Sign out
      </Button>
    </div>
  );
  const brand = (
    <Link to="/" className="flex items-center gap-2.5">
      <Logo size={38} />
      <div className="leading-none">
        <p className="font-display text-xl uppercase">TCC Esports</p>
        <p className="font-cond text-[10px] font-semibold uppercase tracking-[0.25em] text-brand">Control Room</p>
      </div>
    </Link>
  );
  const current = [...NAV].sort((a, b) => b.to.length - a.to.length).find((n) => (n.end ? location.pathname === n.to : location.pathname.startsWith(n.to)));

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      {/* Desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen border-r border-line bg-surface/95 backdrop-blur lg:block">
        <div className="px-4 py-5">{brand}</div>
        <nav className="flex flex-col gap-1 px-3">{navLinks}</nav>
        <div className="absolute inset-x-0 bottom-0 p-4">{footer}</div>
      </aside>

      {/* Phones / tablets: top bar with a burger menu */}
      <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 backdrop-blur lg:hidden">
        <button onClick={() => setMenuOpen(true)} className="rounded-lg p-2 hover:bg-surface2" aria-label="Open menu" aria-expanded={menuOpen} data-testid="admin-burger">
          <Menu className="h-6 w-6" />
        </button>
        <Link to="/" className="flex min-w-0 items-center gap-2">
          <Logo size={30} />
          <span className="truncate font-display text-lg uppercase leading-none">TCC Esports</span>
        </Link>
        <span className="ml-auto truncate font-cond text-xs font-semibold uppercase tracking-wider text-brand">{current?.label ?? ''}</span>
      </header>
      <AnimatePresence>
        {menuOpen && (
          <>
            <motion.div className="fixed inset-0 z-[70] bg-black/60 backdrop-blur-sm lg:hidden" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMenuOpen(false)} />
            <motion.aside
              className="fixed inset-y-0 left-0 z-[70] flex w-[min(85vw,300px)] flex-col overflow-y-auto border-r border-line bg-surface shadow-2xl lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 320 }}
              aria-label="Menu"
              data-testid="admin-drawer"
            >
              <div className="flex items-center justify-between gap-2 px-4 py-4">
                {brand}
                <button onClick={() => setMenuOpen(false)} className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg" aria-label="Close menu">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <nav className="flex flex-col gap-1 px-3">{navLinks}</nav>
              <div className="mt-auto p-4">{footer}</div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <main className="min-w-0 px-4 py-6 pb-24 sm:px-6 lg:px-8">
        {/* A crash in one page shows an error card instead of a black screen */}
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      {/* The casting engine and the OBS link live here, so they keep running on every admin page. */}
      <BoothKeeper />
      <ObsKeeper />
      <PauseKeeper />
    </div>
  );
}

/** Small "on air" + "booth online" indicators in the sidebar. */
function StatusPills() {
  const live = useLive();
  const booth = useBooth();
  const now = useNow(5000);
  const here = useBoothStatus().running;
  const obs = useObsStatus();
  const boothOnline = here || Boolean(booth.data?.online && now - (booth.data?.lastBeat ?? 0) < 40_000);
  return (
    <div className="space-y-1.5 text-xs">
      <div className="flex items-center gap-2">
        {live.data.matchId ? <LiveDot className="h-2 w-2" /> : <span className="h-2 w-2 rounded-full bg-line" />}
        <span className="text-muted">{live.data.matchId ? `On air · ${live.data.phase}` : 'Off air'}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className={cn('h-2 w-2 rounded-full', boothOnline ? 'bg-accent shadow-glow-teal' : 'bg-line')} />
        <span className="text-muted">Casters {here ? 'on air (this tab)' : boothOnline ? 'on air (another tab)' : 'off'}</span>
      </div>
      <div className="flex items-center gap-2" title={obs.error ?? undefined}>
        <span className={cn('h-2 w-2 rounded-full', obs.status === 'connected' ? 'bg-emerald-500' : obs.status === 'offline' ? 'bg-line' : 'animate-pulse bg-amber-500')} />
        <span className="text-muted">OBS {obs.status === 'connected' ? 'connected' : obs.status === 'connecting' ? 'connecting…' : obs.status === 'retrying' ? 'reconnecting…' : 'not connected'}</span>
      </div>
      <a href="/overlay/hud" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-muted hover:text-brand">
        <Clapperboard className="h-3.5 w-3.5" /> Preview HUD overlay <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
