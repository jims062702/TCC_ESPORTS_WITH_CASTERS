import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Crown, Facebook, GitBranch, Medal, MessageCircle, Users } from 'lucide-react';
import type { Match } from '@/types';
import { useGames, useHighlights, useIndex, useMatches, usePlayers, useSettings, useTeams, useTournaments } from '@/hooks/useFirestore';
import { computeLeaderboard, computePlacements, computeStandings } from '@/services/stats';
import { featuredHeadline } from '@/services/featured';
import { isFirebaseConfigured } from '@/services/firebase';
import { BracketView } from '@/components/Bracket';
import { Avatar, Logo, TeamLogo } from '@/components/Brand';
import { EmptyState, Notice, Select, Spinner } from '@/components/ui';
import { Navbar } from './Navbar';
import { Hero } from './Hero';
import { MatchModal, MatchesSection } from './Matches';
import { StandingsTable } from './Standings';
import { Leaderboard } from './Leaderboard';
import { FullSection, useActiveSection, useSmoothScrolling } from './sections';
import { BUILTIN_SLIDES, CarouselArrow, CarouselBackground, CarouselDots, useCarousel, useSwipe } from './HeroCarousel';
import { HighlightsSection } from './Highlights';
import { SeasonSwitcher } from './SeasonSwitcher';
import { cn } from '@/lib/utils';

export default function LandingPage() {
  useSmoothScrolling();
  const active = useActiveSection();
  const settings = useSettings();
  const tournaments = useTournaments();
  const teams = useTeams();
  const players = usePlayers();
  const [picked, setPicked] = useState<string | null>(null);

  // Featured tournament: chosen in Settings → else the newest ongoing → else newest.
  const tournament = useMemo(() => {
    const list = tournaments.data;
    return (
      list.find((t) => t.id === picked) ??
      list.find((t) => t.id === settings.data.featuredTournamentId) ??
      list.find((t) => t.status === 'ongoing') ??
      list[0] ??
      null
    );
  }, [tournaments.data, picked, settings.data.featuredTournamentId]);

  // Home headline: a tournament picked by the visitor or matched in Settings shows its own
  // name (so renames follow); otherwise the custom title typed in Settings; else the tournament.
  const headline = featuredHeadline({ picked, featuredTournamentId: settings.data.featuredTournamentId, featuredTitle: settings.data.featuredTitle, tournament });

  const matches = useMatches(tournament?.id ?? null);
  const games = useGames(tournament?.id ?? null);
  const teamIndex = useIndex(teams.data);
  const playerIndex = useIndex(players.data);
  const [selected, setSelected] = useState<Match | null>(null);

  const standings = useMemo(() => computeStandings(tournament, matches.data), [tournament, matches.data]);
  const placements = useMemo(() => computePlacements(tournament, matches.data), [tournament, matches.data]);
  const leaderboard = useMemo(() => computeLeaderboard(games.data), [games.data]);
  const liveMatch = matches.data.find((m) => m.status === 'live') ?? null;
  const tournamentTeams = tournament ? tournament.teamIds.map((id) => teamIndex[id]).filter(Boolean) : teams.data;
  const loading = tournaments.loading || settings.loading;
  // Uploaded images, or 3 built-in TCC slides until the admin uploads some.
  const slides = settings.data.heroSlides?.length ? settings.data.heroSlides : BUILTIN_SLIDES;
  const carousel = useCarousel(slides.length, 3000);
  useSwipe('home', carousel.go);
  const highlights = useHighlights();
  const publicHighlights = useMemo(() => highlights.data.filter((h) => h.showOnSite !== false), [highlights.data]);

  // Keyboard ← / → flips the Home carousel while the Home section is in view.
  const goSlide = carousel.go;
  useEffect(() => {
    if (active !== 'home') return;
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'ArrowLeft') goSlide(-1);
      if (e.key === 'ArrowRight') goSlide(1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, goSlide]);

  const stats = [
    { label: 'Teams', value: tournament?.teamIds.length ?? teams.data.length },
    { label: 'Series played', value: matches.data.filter((m) => m.status === 'completed' && m.loserId).length },
    { label: 'Games', value: games.data.length },
  ];

  const tournamentPicker =
    tournaments.data.length > 1 ? (
      <Select value={tournament?.id ?? ''} onChange={(e) => setPicked(e.target.value)} className="w-64" aria-label="Tournament">
        {tournaments.data.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name} {t.season ? `· ${t.season}` : ''}
          </option>
        ))}
      </Select>
    ) : null;

  const loadingState = (
    <div className="flex h-full items-center justify-center py-16">
      <Spinner className="h-8 w-8" />
    </div>
  );

  return (
    <div className="min-h-screen">
      <Navbar active={active} />

      {/* Ambient page background (grid + crimson glow from the badge) */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="grid-bg absolute inset-0 opacity-20 [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)] dark:opacity-30" />
        <div className="absolute -top-40 left-[70%] h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-brand/[0.06] blur-[120px] dark:bg-brand/15" />
        <div className="absolute bottom-0 left-0 h-72 w-72 rounded-full bg-accent/[0.06] blur-[100px] dark:bg-accent/10" />
      </div>

      {/* ── Home ───────────────────────────────────────────────────────── */}
      <FullSection
        id="home"
        bodyClassName="flex flex-col"
        containerClassName="pb-24 lg:px-20"
        background={<CarouselBackground slides={slides} state={carousel} />}
        overlay={
          <>
            {/* Desktop: previous / next on each side of the Home section */}
            <CarouselArrow direction="prev" state={carousel} className="absolute left-4 top-1/2 hidden -translate-y-1/2 lg:flex" />
            <CarouselArrow direction="next" state={carousel} className="absolute right-4 top-1/2 hidden -translate-y-1/2 lg:flex" />
            {/* Bottom of the Home section: one dot per image (phones also get the arrows here) */}
            <div className="absolute inset-x-0 bottom-6 z-10 flex items-center justify-center gap-4">
              <CarouselArrow direction="prev" state={carousel} className="h-10 w-10 lg:hidden" />
              <CarouselDots state={carousel} />
              <CarouselArrow direction="next" state={carousel} className="h-10 w-10 lg:hidden" />
            </div>
          </>
        }
      >
        {!isFirebaseConfigured && (
          <Notice tone="warn" className="mb-4 shrink-0">
            <strong>Firebase is not configured.</strong> Follow the <Link to="/guide" className="font-semibold text-brand underline">setup guide</Link> to connect the site.
          </Notice>
        )}
        <div className="flex flex-1 items-center">
          <Hero tournament={tournament} settings={settings.data} liveMatch={liveMatch} teams={teamIndex} stats={stats} title={headline} />
        </div>
      </FullSection>

      {/* ── Highlights ─────────────────────────────────────────────────── */}
      <FullSection id="highlights" eyebrow="Best plays" title="Highlights" alt>
        {highlights.loading ? loadingState : <HighlightsSection highlights={publicHighlights} players={playerIndex} teams={teamIndex} />}
      </FullSection>

      {/* ── Matches ────────────────────────────────────────────────────── */}
      <FullSection id="matches" eyebrow="Schedule & Results" title="Matches" actions={tournamentPicker}>
        {loading ? loadingState : <MatchesSection matches={matches.data} teams={teamIndex} onSelect={setSelected} facebookUrl={settings.data.facebookUrl} />}
      </FullSection>

      {/* ── Bracket ────────────────────────────────────────────────────── */}
      <FullSection id="bracket" eyebrow={tournament?.type === 'double' ? 'Double elimination' : 'Single elimination'} title="Bracket" alt>
        {loading ? (
          loadingState
        ) : matches.data.length ? (
          <BracketView matches={matches.data} teams={teamIndex} type={tournament?.type ?? 'single'} onSelect={setSelected} finalsMvp={tournament?.finalsMvp} title={tournament?.name} />
        ) : (
          <EmptyState icon={<GitBranch className="h-8 w-8" />} title="Bracket coming soon">
            The organisers haven&apos;t generated the bracket yet.
          </EmptyState>
        )}
      </FullSection>

      {/* ── Standings ──────────────────────────────────────────────────── */}
      <FullSection id="standings" eyebrow="Live standings" title="Standings">
        {loading ? loadingState : <StandingsTable rows={standings} teams={teamIndex} />}
      </FullSection>

      {/* ── Leaderboard ────────────────────────────────────────────────── */}
      <FullSection id="leaderboard" eyebrow="Player & hero stats" title="Leaderboard" alt>
        {loading ? loadingState : <Leaderboard rows={leaderboard} games={games.data} players={playerIndex} teams={teamIndex} finalsMvpId={tournament?.championTeamId ? (tournament.finalsMvp?.playerId ?? null) : null} tournamentId={tournament?.id ?? null} />}
      </FullSection>

      {/* ── Teams (+ footer) ───────────────────────────────────────────── */}
      <FullSection
        id="teams"
        eyebrow="Rosters"
        title="Teams"
        footer={
          <footer className="shrink-0 border-t border-line bg-surface/80">
            <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row sm:px-6">
              <div className="flex items-center gap-3">
                <Logo size={40} />
                <div>
                  <p className="font-display text-xl uppercase leading-none">TCC Esports</p>
                  <p className="neon font-display text-sm uppercase tracking-[0.25em]">Let the game begin</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {settings.data.facebookUrl && (
                  <a href={settings.data.facebookUrl} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-brand" aria-label="Facebook">
                    <Facebook className="h-5 w-5" />
                  </a>
                )}
                {settings.data.discordUrl && (
                  <a href={settings.data.discordUrl} target="_blank" rel="noreferrer" className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-brand" aria-label="Discord">
                    <MessageCircle className="h-5 w-5" />
                  </a>
                )}
              </div>
              <p className="text-center text-xs text-muted">© {new Date().getFullYear()} TCC Esports. Mobile Legends: Bang Bang is a trademark of Moonton.</p>
            </div>
          </footer>
        }
      >
        {loading ? (
          loadingState
        ) : tournamentTeams.length ? (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...tournamentTeams]
              // Champion and runner-ups first, then teams still alive, then eliminated teams.
              .sort((a, b) => {
                const rank = (id: string) => placements[id]?.place ?? (standings.find((s) => s.teamId === id)?.status === 'eliminated' ? 9 : 5);
                return rank(a.id) - rank(b.id);
              })
              .map((t) => {
              const roster = players.data.filter((p) => p.teamId === t.id).sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || a.order - b.order);
              const st = standings.find((s) => s.teamId === t.id);
              const placed = placements[t.id];
              const eliminated = !placed && st?.status === 'eliminated';
              return (
                <article key={t.id} className={cn('card card-hover overflow-hidden', placed?.place === 1 && 'border-amber-500/70 shadow-[0_0_30px_rgba(245,158,11,0.18)]', eliminated && 'opacity-80')} data-testid={`team-${t.id}`}>
                  <div className="stripe-bg flex items-center gap-3 border-b border-line p-4">
                    <TeamLogo url={t.logoUrl} name={t.name} size={52} />
                    <div className="min-w-0 flex-1">
                      <h3 className="truncate font-display text-2xl uppercase leading-none">{t.name}</h3>
                      <p className="font-cond text-xs uppercase tracking-wider text-muted">
                        {t.tag}
                        {st && ` · ${st.seriesW}W-${st.seriesL}L`}
                      </p>
                      {(placed || eliminated) && (
                        <span
                          className={cn(
                            'mt-1.5 inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-cond text-[11px] font-bold uppercase tracking-wider',
                            placed?.place === 1 && 'bg-amber-500 text-ink-950',
                            placed?.place === 2 && 'bg-slate-300 text-ink-950',
                            placed?.place === 3 && 'bg-orange-700 text-white',
                            placed?.place === 4 && 'bg-surface2 text-fg ring-1 ring-line',
                            eliminated && 'bg-red-600/15 text-red-600 dark:text-red-400',
                          )}
                          data-testid="team-placement"
                        >
                          {placed?.place === 1 ? <Crown className="h-3.5 w-3.5" /> : placed ? <Medal className="h-3.5 w-3.5" /> : null}
                          {placed ? placed.label : 'Eliminated'}
                        </span>
                      )}
                    </div>
                  </div>
                  <ul className="divide-y divide-line/70">
                    {roster.map((p) => (
                      <li key={p.id} className="flex items-center gap-3 px-4 py-2">
                        <Avatar url={p.photoUrl} name={p.ign} size={30} />
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.ign}</span>
                        <span className="font-cond text-xs uppercase tracking-wider text-muted">{p.isStarter ? p.role : 'Sub'}</span>
                      </li>
                    ))}
                    {!roster.length && <li className="px-4 py-3 text-sm text-muted">Roster TBA</li>}
                  </ul>
                </article>
              );
            })}
          </div>
        ) : (
          <EmptyState icon={<Users className="h-8 w-8" />} title="No teams yet" />
        )}
      </FullSection>

      {/* Season picker (bottom right, hide / show) */}
      <SeasonSwitcher tournaments={tournaments.data} currentId={tournament?.id ?? null} onPick={setPicked} />

      <MatchModal match={selected ? (matches.data.find((m) => m.id === selected.id) ?? selected) : null} onClose={() => setSelected(null)} teams={teamIndex} games={games.data} facebookUrl={settings.data.facebookUrl} />
    </div>
  );
}
