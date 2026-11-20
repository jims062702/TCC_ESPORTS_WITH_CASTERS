import { Link } from 'react-router-dom';
import { CheckCircle2, CircleDashed, Copy, Database, ExternalLink, Gamepad2, Mic2, MonitorPlay, Trophy, Users } from 'lucide-react';
import { useBooth, useLive, useNow, usePlayers, useTeams, useTournaments } from '@/hooks/useFirestore';
import { isCloudinaryConfigured } from '@/services/cloudinary';
import { seedSampleData } from '@/services/db';
import { Button, Card } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { CASTER_BY_ID } from '@/services/casters';
import { cn } from '@/lib/utils';

export const OVERLAYS = [
  { path: '/overlay/draft', name: 'Drafting overlay', desc: 'Bans, picks, timer, series score (transparent)' },
  { path: '/overlay/hud', name: 'In-game HUD', desc: 'Kills, objectives, gold, spells, KDA, casters + captions' },
  { path: '/overlay/replay', name: 'Instant replay frame', desc: 'INSTANT REPLAY frame + small LIVE game window on the right + narration captions' },
  { path: '/overlay/break', name: 'Break loop', desc: 'Auto-playing highlight playlist for breaks (full screen)' },
  { path: '/overlay/casters', name: 'Caster lower-third', desc: 'Active caster pair + live subtitles only' },
];

export default function Dashboard() {
  const teams = useTeams();
  const players = usePlayers();
  const tournaments = useTournaments();
  const live = useLive();
  const booth = useBooth();
  const now = useNow(5000);
  const toast = useToast();
  // OBS URLs use 127.0.0.1 instead of localhost so OBS can't reach a different app that shares the port over IPv4/IPv6.
  const origin = window.location.origin.replace('//localhost', '//127.0.0.1');
  const boothOnline = Boolean(booth.data?.online && now - (booth.data?.lastBeat ?? 0) < 40_000);

  const checklist = [
    { ok: true, label: 'Firebase connected', hint: 'Firestore + Auth are live.' },
    { ok: isCloudinaryConfigured, label: 'Cloudinary uploads', hint: 'Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.' },
    { ok: boothOnline, label: 'Caster booth running', hint: 'Open Caster Booth in Microsoft Edge and press Start.' },
    { ok: teams.data.length >= 2, label: 'Teams created', hint: 'Add teams and rosters.' },
    { ok: tournaments.data.some((t) => t.bracketGenerated), label: 'Bracket generated', hint: 'Create a tournament and generate its bracket.' },
  ];

  const stats = [
    { label: 'Teams', value: teams.data.length, icon: Users, to: '/admin/teams' },
    { label: 'Players', value: players.data.length, icon: Users, to: '/admin/teams' },
    { label: 'Tournaments', value: tournaments.data.length, icon: Trophy, to: '/admin/tournaments' },
    { label: live.data.matchId ? `On air · Game ${live.data.gameNumber}` : 'Off air', value: live.data.matchId ? `${live.data.scoreA}-${live.data.scoreB}` : '—', icon: Gamepad2, to: '/admin/controller' },
  ];

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow">Control Room</p>
        <h1 className="section-title">Dashboard</h1>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} to={s.to} className="card card-hover p-4">
            <s.icon className="h-5 w-5 text-brand" />
            <p className="mt-3 font-display text-4xl leading-none">{s.value}</p>
            <p className="font-cond text-xs font-semibold uppercase tracking-wider text-muted">{s.label}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card className="min-w-0" title="OBS Browser Sources" subtitle="Add each as a Browser Source at 1920×1080. Tick “Refresh browser when scene becomes active”.">
          <div className="space-y-2">
            {OVERLAYS.map((o) => (
              <div key={o.path} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface2 p-3">
                <MonitorPlay className="h-5 w-5 shrink-0 text-brand" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{o.name}</p>
                  <p className="truncate text-xs text-muted">{o.desc}</p>
                  <code className="mt-1 block truncate text-xs text-accent">{origin + o.path}</code>
                </div>
                <div className="flex gap-1">
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Copy className="h-3.5 w-3.5" />}
                    onClick={() => {
                      void navigator.clipboard.writeText(origin + o.path);
                      toast.success('URL copied');
                    }}
                  >
                    Copy
                  </Button>
                  <a
                    href={`${o.path}?demo=1&preview=1`}
                    target="_blank"
                    rel="noreferrer"
                    title="Open with sample data (for positioning in OBS)"
                    className="inline-flex h-8 items-center gap-1 rounded-lg border border-line px-2 text-xs font-semibold text-muted hover:border-brand/60 hover:text-fg"
                  >
                    <ExternalLink className="h-3.5 w-3.5" /> Demo
                  </a>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-xl border border-brand/40 bg-brand/5 p-3 text-xs leading-relaxed">
            <p className="font-semibold text-fg">Skip the copy-paste</p>
            <p className="mt-1 text-muted">
              <strong className="text-fg">Live Controller → OBS</strong>: connect once, then <strong className="text-fg">Create all scenes in OBS</strong> (or download the scene file for{' '}
              <strong className="text-fg">Scene Collection → Import</strong>). OBS then switches scenes by itself as you run the show.
            </p>
          </div>
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs leading-relaxed">
            <p className="font-semibold text-fg">Black screen in OBS?</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
              <li>
                <strong className="text-fg">Normal when nothing is on air</strong> — overlays are transparent until the Live Controller puts a series on air (draft overlay during the draft, HUD in-game, replay frame only during a replay).
              </li>
              <li>
                To position sources now, add <code>?demo=1</code> to the URL (sample data), then remove it before the show.
              </li>
              <li>
                Keep <code>npm run dev</code> running (or use your deployed Vercel URL) and paste these exact URLs — the dev server runs on <code>127.0.0.1:5180</code>.
              </li>
              <li>After changing a URL, right-click the source in OBS → <strong className="text-fg">Properties → Refresh cache of current page</strong>.</li>
            </ul>
          </div>
          <p className="mt-2 text-xs text-muted">
            More flags: <code>?preview=1</code> (checkerboard background), <code>?sound=0</code> (mute stingers), <code>?music=0</code> (no break music), <code>?vol=0.5</code>, HUD <code>?players=0</code> / <code>?casters=0</code> / <code>?captions=0</code>.
          </p>
        </Card>

        <div className="space-y-6">
          <Card title="Setup checklist">
            <ul className="space-y-2.5">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-start gap-2.5">
                  {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}
                  <div>
                    <p className={cn('text-sm font-semibold', !c.ok && 'text-muted')}>{c.label}</p>
                    {!c.ok && <p className="text-xs text-muted">{c.hint}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </Card>

          <Card title="Casting crew" subtitle="Two of eight AI casters (4 male, 4 female) are seated at random every game — they always take turns, one voice at a time.">
            <div className="flex flex-wrap gap-2">
              {Object.values(CASTER_BY_ID).map((c) => (
                <span key={c.id} className={cn('chip', live.data.casters.includes(c.id) && 'border-brand bg-brand/10 text-brand')}>
                  <span className="h-2 w-2 rounded-full" style={{ background: c.color }} /> {c.name} · {c.role}
                </span>
              ))}
            </div>
            <Link to="/admin/booth" className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
              <Mic2 className="h-4 w-4" /> Open caster booth
            </Link>
          </Card>

          {!teams.loading && teams.data.length === 0 && (
            <Card title="Quick start" subtitle="Load 8 sample teams with rosters and a double-elimination bracket to try everything out.">
              <Button icon={<Database className="h-4 w-4" />} onClick={() => toast.run(seedSampleData, 'Sample tournament created')}>
                Load sample data
              </Button>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
