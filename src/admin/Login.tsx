import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation } from 'react-router-dom';
import { ArrowLeft, LogIn } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { isFirebaseConfigured, loginWithEmail, loginWithGoogle } from '@/services/firebase';
import { Logo, ThemeToggle } from '@/components/Brand';
import { Button, Field, Input, Notice } from '@/components/ui';

export default function Login() {
  const { user, loading } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const from = (location.state as { from?: string } | null)?.from ?? '/admin';

  if (!loading && user) return <Navigate to={from} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      await loginWithEmail(email, password);
    } catch (err) {
      setError((err as { code?: string }).code === 'auth/invalid-credential' ? 'Wrong email or password.' : (err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setError('');
    try {
      await loginWithGoogle();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4">
      <div className="absolute left-1/2 top-1/3 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand/20 blur-[120px]" />
      <div className="absolute right-4 top-4 flex items-center gap-2">
        <ThemeToggle />
      </div>
      <div className="card relative w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={110} glow />
          <h1 className="mt-3 font-display text-4xl uppercase leading-none">Organizer Login</h1>
          <p className="neon mt-1 font-display text-sm uppercase tracking-[0.3em]">Let the game begin</p>
        </div>
        {!isFirebaseConfigured ? (
          <Notice tone="warn">
            Firebase is not configured yet — follow the{' '}
            <Link to="/guide" className="font-semibold text-brand underline">
              setup guide
            </Link>
            .
          </Notice>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            <Field label="Email">
              <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Field label="Password">
              <Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
            {error && <p className="text-sm text-red-500">{error}</p>}
            <Button type="submit" className="w-full" loading={busy} icon={<LogIn className="h-4 w-4" />}>
              Sign in
            </Button>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-line" /> or <span className="h-px flex-1 bg-line" />
            </div>
            <Button type="button" variant="secondary" className="w-full" onClick={google}>
              Continue with Google
            </Button>
          </form>
        )}
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <Link to="/" className="flex items-center gap-1 text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> Back to site
          </Link>
          <Link to="/guide" className="text-muted underline hover:text-fg">
            Setup guide
          </Link>
        </div>
      </div>
    </div>
  );
}
