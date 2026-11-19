import type { Tournament } from '@/types';

// ─────────────────────────────────────────────────────────────────────────────
// "Featured tournament" (Admin → Settings) is free text with suggestions:
//   • exact name of a tournament (case-insensitive) → that tournament is featured
//   • anything else → a custom Home title (data stays on the automatic tournament)
//   • blank → automatic (newest ongoing)
// ─────────────────────────────────────────────────────────────────────────────

export function matchTournamentByName(value: string, tournaments: Tournament[]): Tournament | null {
  const v = value.trim().toLowerCase();
  if (!v) return null;
  return tournaments.find((t) => t.name.trim().toLowerCase() === v) ?? null;
}

/** Home headline for the landing page. */
export function featuredHeadline(opts: {
  picked: string | null;
  featuredTournamentId: string | null;
  featuredTitle: string | undefined;
  tournament: Tournament | null;
}): string {
  const { picked, featuredTournamentId, featuredTitle, tournament } = opts;
  // A tournament chosen by the visitor or matched in Settings shows its own name (renames follow).
  const custom = picked || featuredTournamentId ? '' : (featuredTitle ?? '').trim();
  return custom || tournament?.name || 'TCC Esports';
}
