import { motion } from 'framer-motion';
import { ArrowRight, Crown, PlayCircle } from 'lucide-react';
import type { Match, SiteSettings, Team, Tournament } from '@/types';
import { TeamLogo } from '@/components/Brand';
import { Badge, LiveDot } from '@/components/ui';
import { FORMAT_LABEL } from '@/lib/constants';
import { scrollToSection } from './sections';

/**
 * Home section text (left side). The carousel image fills the whole section
 * behind it (see CarouselBackground), fading out under this text.
 */
export function Hero({
  tournament,
  settings,
  liveMatch,
  teams,
  stats,
}: {
  tournament: Tournament | null;
  settings: SiteSettings;
  liveMatch: Match | null;
  teams: Record<string, Team>;
  stats: { label: string; value: string | number }[];
}) {
  const champion = tournament?.championTeamId ? teams[tournament.championTeamId] : null;
  return (
    <div className="relative w-full max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-4 flex flex-wrap items-center gap-2">
        {liveMatch ? (
          <Badge tone="live">
            <LiveDot className="h-2 w-2 [&>span]:bg-white" /> Live now
          </Badge>
        ) : (
          <Badge tone="brand">{tournament?.status === 'completed' ? 'Completed' : tournament?.status === 'ongoing' ? 'Ongoing' : 'Upcoming'}</Badge>
        )}
        {tournament?.season && <Badge tone="muted">{tournament.season}</Badge>}
        <Badge tone="accent">Mobile Legends: Bang Bang</Badge>
      </motion.div>

      <motion.h1
        initial={{ opacity: 0, y: 18 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="font-display text-6xl uppercase leading-[0.85] tracking-wide drop-shadow-sm sm:text-7xl xl:text-8xl"
      >
        {tournament?.name ?? 'TCC Esports'}
      </motion.h1>
      <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.15 }} className="neon mt-3 font-display text-3xl uppercase tracking-[0.3em] sm:text-4xl">
        {settings.tagline || 'Let the game begin'}
      </motion.p>
      {settings.announcement && <p className="mt-4 max-w-xl text-base text-muted sm:text-lg">{settings.announcement}</p>}

      {champion && (
        <div className="mt-5 inline-flex items-center gap-3 rounded-2xl border border-brand/40 bg-surface/80 px-4 py-3 backdrop-blur">
          <Crown className="h-6 w-6 text-brand" />
          <TeamLogo url={champion.logoUrl} name={champion.name} size={36} />
          <div>
            <p className="eyebrow">Champion</p>
            <p className="font-display text-2xl uppercase leading-none">{champion.name}</p>
          </div>
        </div>
      )}

      <div className="mt-7 flex flex-wrap gap-3">
        {settings.streamUrl && (
          <a href={settings.streamUrl} target="_blank" rel="noreferrer" className="inline-flex h-12 items-center gap-2 rounded-xl bg-brand px-6 font-semibold text-white shadow-glow transition hover:bg-brand-strong">
            <PlayCircle className="h-5 w-5" /> Watch live
          </a>
        )}
        <a
          href="#highlights"
          onClick={(e) => {
            e.preventDefault();
            scrollToSection('highlights');
          }}
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface/80 px-6 font-semibold backdrop-blur transition hover:border-brand/60"
        >
          <PlayCircle className="h-5 w-5 text-brand" /> Highlights
        </a>
        <a
          href="#bracket"
          onClick={(e) => {
            e.preventDefault();
            scrollToSection('bracket');
          }}
          className="inline-flex h-12 items-center gap-2 rounded-xl border border-line bg-surface/80 px-6 font-semibold backdrop-blur transition hover:border-brand/60"
        >
          View bracket <ArrowRight className="h-4 w-4" />
        </a>
      </div>

      <dl className="mt-8 grid max-w-lg grid-cols-3 gap-3">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-line bg-surface/80 px-4 py-3 backdrop-blur">
            <dt className="font-cond text-[11px] font-semibold uppercase tracking-wider text-muted">{s.label}</dt>
            <dd className="font-display text-4xl leading-none">{s.value}</dd>
          </div>
        ))}
      </dl>

      {liveMatch && (
        <a
          href="#matches"
          onClick={(e) => {
            e.preventDefault();
            scrollToSection('matches');
          }}
          className="mt-5 flex max-w-lg items-center gap-3 rounded-2xl border border-brand/60 bg-surface/85 px-4 py-3 shadow-glow backdrop-blur"
        >
          <LiveDot />
          <TeamLogo url={teams[liveMatch.teamAId ?? '']?.logoUrl} name={teams[liveMatch.teamAId ?? '']?.name} size={28} />
          <span className="min-w-0 flex-1 truncate text-center font-display text-2xl leading-none">
            {teams[liveMatch.teamAId ?? '']?.tag ?? 'TBD'} <span className="text-brand">{liveMatch.scoreA} - {liveMatch.scoreB}</span> {teams[liveMatch.teamBId ?? '']?.tag ?? 'TBD'}
          </span>
          <TeamLogo url={teams[liveMatch.teamBId ?? '']?.logoUrl} name={teams[liveMatch.teamBId ?? '']?.name} size={28} />
          <span className="hidden font-cond text-xs uppercase text-muted sm:inline">{FORMAT_LABEL[liveMatch.format]}</span>
        </a>
      )}
    </div>
  );
}
