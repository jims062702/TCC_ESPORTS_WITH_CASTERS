import { Link, NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { BookOpen, Clapperboard, Copy, ExternalLink, Film, Gamepad2, LayoutDashboard, LogOut, Mic2, Settings, Trophy, Users } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { useBooth, useLive, useNow } from '@/hooks/useFirestore';
import { isFirebaseConfigured, logout } from '@/services/firebase';
import { Logo, ThemeToggle } from '@/components/Brand';
import { Button, LiveDot, Notice, Spinner } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { cn } from '@/lib/utils';
import { BoothKeeper, useBoothStatus } from './BoothKeeper';

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

  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="sticky top-0 z-30 border-b border-line bg-surface/95 backdrop-blur lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between gap-2 px-4 py-3 lg:py-5">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={38} />
            <div className="leading-none">
              <p className="font-display text-xl uppercase">TCC Esports</p>
              <p className="font-cond text-[10px] font-semibold uppercase tracking-[0.25em] text-brand">Control Room</p>
            </div>
          </Link>
          <ThemeToggle className="lg:hidden" />
        </div>
        <nav className="scrollbar-thin flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible lg:pb-0">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold transition',
                  isActive ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'text-muted hover:bg-surface2 hover:text-fg',
                )
              }
            >
              <Icon className="h-4 w-4" /> {label}
            </NavLink>
          ))}
          <Link to="/guide" className="flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-semibold text-muted transition hover:bg-surface2 hover:text-fg">
            <BookOpen className="h-4 w-4" /> Setup guide
          </Link>
        </nav>
        <div className="hidden px-3 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block lg:space-y-3 lg:p-4">
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
      </aside>
      <main className="min-w-0 px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <Outlet />
      </main>
      {/* The casting engine lives here, so it keeps running on every admin page. */}
      <BoothKeeper />
    </div>
  );
}

/** Small "on air" + "booth online" indicators in the sidebar. */
function StatusPills() {
  const live = useLive();
  const booth = useBooth();
  const now = useNow(5000);
  const here = useBoothStatus().running;
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
      <a href="/overlay/hud" target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-muted hover:text-brand">
        <Clapperboard className="h-3.5 w-3.5" /> Preview HUD overlay <ExternalLink className="h-3 w-3" />
      </a>
    </div>
  );
}
