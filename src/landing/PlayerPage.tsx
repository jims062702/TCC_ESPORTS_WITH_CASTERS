import { useEffect, useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronRight, Crown, Home, Trophy } from 'lucide-react';
import { useGames, useHeroPortraits, useHighlights, useIndex, usePlayers, useSettings, useTeams, useTournaments } from '@/hooks/useFirestore';
import { computeLeaderboard, rankBy } from '@/services/stats';
import { cld } from '@/services/cloudinary';
import { POSITION_LABEL } from '@/lib/constants';
import { HeroArt } from '@/components/game';
import { Logo, TeamLogo, ThemeToggle } from '@/components/Brand';
import { Button, EmptyState, Spinner } from '@/components/ui';
import { initials } from '@/lib/utils';
import { HighlightsSection } from './Highlights';

/**
 * Public player page (/players/:id): photo (the same portrait the overlays
 * use), profile, tournament stats and the player's highlights. Back returns
 * to the Leaderboard section.
 */
export default function PlayerPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const players = usePlayers();
  const teams = useTeams();
  const tournaments = useTournaments();
  const settings = useSettings();
  const portraits = useHeroPortraits();
  const highlights = useHighlights();
  const teamIndex = useIndex(teams.data);
  const playerIndex = useIndex(players.data);

  const player = players.data.find((p) => p.id === id) ?? null;
  const team = player ? teamIndex[player.teamId] : undefined;
  // Same tournament the leaderboard showed (passed in the link), else the featured / ongoing one.
  const tournament = useMemo(() => {
    const list = tournaments.data;
    return list.find((t) => t.id === params.get('t')) ?? list.find((t) => t.id === settings.data.featuredTournamentId) ?? list.find((t) => t.status === 'ongoing') ?? list[0] ?? null;
  }, [tournaments.data, params, settings.data.featuredTournamentId]);
  const games = useGames(tournament?.id ?? null);
  const board = useMemo(() => computeLeaderboard(games.data), [games.data]);
  const row = board.find((r) => r.playerId === id);
  const rank = row ? rankBy(board, 'kda').findIndex((r) => r.playerId === id) + 1 : null;
  const finalsMvp = Boolean(tournament?.championTeamId && tournament.finalsMvp?.playerId === id);
  const clips = useMemo(() => highlights.data.filter((h) => h.showOnSite !== false && h.playerId === id), [highlights.data, id]);

  useEffect(() => {
    window.scrollTo({ top: 0 });
    if (player) document.title = `${player.ign} — TCC Esports`;
    return () => {
      document.title = 'TCC Esports';
    };
  }, [player]);

  const back = () => navigate('/#leaderboard');

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={36} />
            <span className="font-display text-xl uppercase leading-none tracking-wide sm:text-2xl">
              TCC <span className="text-brand">Esports</span>
            </span>
          </Link>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {/* Breadcrumbs */}
        <nav aria-label="Breadcrumb" className="mb-4 flex flex-wrap items-center gap-1 text-sm text-muted" data-testid="breadcrumbs">
          <Link to="/" className="inline-flex items-center gap-1 hover:text-fg">
            <Home className="h-3.5 w-3.5" /> Home
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <Link to="/#leaderboard" className="hover:text-fg">
            Leaderboard
          </Link>
          <ChevronRight className="h-3.5 w-3.5" />
          <span className="font-semibold text-fg">{player?.ign ?? 'Player'}</span>
        </nav>
        <Button variant="secondary" size="sm" icon={<ArrowLeft className="h-4 w-4" />} onClick={back} className="mb-6">
          Back to leaderboard
        </Button>

        {players.loading ? (
          <div className="flex justify-center py-20">
            <Spinner className="h-8 w-8" />
          </div>
        ) : !player ? (
          <EmptyState title="Player not found">This player is no longer on a roster.</EmptyState>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[320px_1fr]">
            {/* Portrait */}
            <aside className="card overflow-hidden">
              <div className="relative aspect-[4/3] bg-gradient-to-br from-brand/30 via-surface2 to-surface sm:aspect-[16/10] lg:aspect-[4/5]">
                {player.photoUrl ? (
                  <img src={cld(player.photoUrl, { w: 640, h: 800 })} alt={player.ign} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full items-center justify-center font-display text-8xl text-white/80">{initials(player.ign)}</div>
                )}
                {finalsMvp && (
                  <span className="absolute left-3 top-3 inline-flex items-center gap-1.5 rounded-lg bg-amber-500 px-2.5 py-1 font-cond text-sm font-bold uppercase tracking-wider text-ink-950 shadow-lg">
                    <Crown className="h-4 w-4" /> Finals MVP
                  </span>
                )}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-4 pt-16 text-white">
                  <p className="font-display text-5xl uppercase leading-none">{player.ign}</p>
                  <p className="mt-1 font-cond text-sm font-semibold uppercase tracking-[0.25em] text-white/80">{POSITION_LABEL[player.role] ?? player.role}</p>
                </div>
              </div>
              {team && (
                <div className="flex items-center gap-3 border-t border-line p-4">
                  <TeamLogo url={team.logoUrl} name={team.name} size={44} />
                  <div className="min-w-0">
                    <p className="font-cond text-[11px] font-semibold uppercase tracking-wider text-muted">Squad</p>
                    <p className="truncate font-semibold">{team.name}</p>
                  </div>
                </div>
              )}
            </aside>

            <div className="space-y-6">
              {/* Profile */}
              <section className="card p-5" data-testid="player-profile">
                <h1 className="font-display text-3xl uppercase leading-none">{player.realName || player.ign}</h1>
                {player.bio && <p className="mt-3 text-sm leading-relaxed text-muted">{player.bio}</p>}
                <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
                  <Item label="Full name" value={player.realName || '—'} />
                  <Item label="Age" value={player.age ? String(player.age) : '—'} />
                  <Item label="Sex" value={player.sex || '—'} />
                  <Item label="Role" value={POSITION_LABEL[player.role] ?? player.role} />
                  <Item label="Course" value={player.course || '—'} />
                  <div>
                    <dt className="font-cond text-[11px] font-semibold uppercase tracking-wider text-muted">Favorite hero</dt>
                    <dd className="mt-1 flex items-center gap-2 font-semibold">
                      {player.favoriteHero ? (
                        <>
                          <HeroArt name={player.favoriteHero} portraits={portraits.map} className="h-8 w-8 rounded-md text-[7px]" />
                          {player.favoriteHero}
                        </>
                      ) : (
                        'None'
                      )}
                    </dd>
                  </div>
                </dl>
              </section>

              {/* Stats */}
              <section className="card p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-2xl uppercase leading-none">Stats</h2>
                  <span className="text-xs text-muted">{tournament?.name ?? ''}</span>
                </div>
                {row ? (
                  <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
                    <Stat label="Rank (KDA)" value={rank ? `#${rank}` : '—'} />
                    <Stat label="Games" value={row.gp} />
                    <Stat label="Wins" value={row.wins} />
                    <Stat label="KDA" value={row.kda.toFixed(2)} />
                    <Stat label="K / D / A" value={`${row.k}/${row.d}/${row.a}`} />
                    <Stat label="MVPs" value={row.mvps} icon={row.mvps ? <Trophy className="h-4 w-4 text-amber-500" /> : null} />
                  </div>
                ) : (
                  <p className="text-sm text-muted">No recorded games in this tournament yet.</p>
                )}
              </section>

              {/* Highlights */}
              <section>
                <h2 className="mb-3 font-display text-2xl uppercase leading-none">Highlights</h2>
                {clips.length ? (
                  <HighlightsSection highlights={clips} players={playerIndex} teams={teamIndex} filters={false} />
                ) : (
                  <p className="card p-5 text-sm text-muted">No highlights of {player.ign} yet.</p>
                )}
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="font-cond text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</dt>
      <dd className="mt-1 break-words font-semibold">{value}</dd>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string | number; icon?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-surface2 p-3 text-center">
      <p className="flex items-center justify-center gap-1 font-display text-2xl leading-none tabular">
        {icon}
        {value}
      </p>
      <p className="mt-1 font-cond text-[10px] font-semibold uppercase tracking-wider text-muted">{label}</p>
    </div>
  );
}
