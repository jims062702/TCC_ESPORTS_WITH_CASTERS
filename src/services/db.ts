import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type DocumentReference,
} from 'firebase/firestore';
import type { Highlight, HeroPortrait, Match, Player, SiteSettings, Team, Tournament, GameRecord } from '@/types';
import { COL, SETTINGS_DOC, db } from './firebase';
import { applySeriesResult, generateBracket, revertSeriesResult, generateSeedingRound, pickOpponent } from './bracket';
import { DEFAULT_SPELL_BY_ROLE, heroSlug } from '@/lib/constants';

// ─────────────────────────────────────────────────────────────────────────────
// CRUD for the admin dashboard. Writes are protected by Firestore rules
// (admins only); reads are public so the landing page & overlays need no login.
// ─────────────────────────────────────────────────────────────────────────────

const strip = <T extends { id?: string }>(o: T) => {
  const { id: _id, ...rest } = o;
  return rest;
};

async function commitInChunks(ops: Array<(b: ReturnType<typeof writeBatch>) => void>) {
  for (let i = 0; i < ops.length; i += 450) {
    const batch = writeBatch(db);
    ops.slice(i, i + 450).forEach((op) => op(batch));
    await batch.commit();
  }
}

// ── Teams & players ─────────────────────────────────────────────────────────

export const createTeam = (data: Omit<Team, 'id' | 'createdAt'>) =>
  addDoc(collection(db, COL.teams), { ...data, createdAt: Date.now() });

export const updateTeam = (id: string, patch: Partial<Team>) => updateDoc(doc(db, COL.teams, id), strip(patch));

export async function deleteTeam(id: string) {
  const players = await getDocs(query(collection(db, COL.players), where('teamId', '==', id)));
  const refs: DocumentReference[] = [doc(db, COL.teams, id), ...players.docs.map((d) => d.ref)];
  await commitInChunks(refs.map((r) => (b) => b.delete(r)));
}

export const createPlayer = (data: Omit<Player, 'id' | 'createdAt'>) =>
  addDoc(collection(db, COL.players), { ...data, createdAt: Date.now() });

export const updatePlayer = (id: string, patch: Partial<Player>) => updateDoc(doc(db, COL.players, id), strip(patch));

export const deletePlayer = (id: string) => deleteDoc(doc(db, COL.players, id));

// ── Tournaments & brackets ──────────────────────────────────────────────────

export const createTournament = (data: Omit<Tournament, 'id' | 'createdAt'>) =>
  addDoc(collection(db, COL.tournaments), { ...data, createdAt: Date.now() });

export const updateTournament = (id: string, patch: Partial<Tournament>) =>
  updateDoc(doc(db, COL.tournaments, id), strip(patch));

export async function deleteTournament(id: string) {
  const [matches, games] = await Promise.all([
    getDocs(query(collection(db, COL.matches), where('tournamentId', '==', id))),
    getDocs(query(collection(db, COL.games), where('tournamentId', '==', id))),
  ]);
  const refs = [doc(db, COL.tournaments, id), ...matches.docs.map((d) => d.ref), ...games.docs.map((d) => d.ref)];
  await commitInChunks(refs.map((r) => (b) => b.delete(r)));
}

/** (Re)generate the bracket: removes old matches & games of this tournament first. */
/**
 * Generate the bracket. With `keepSeeding`, the finished seeding round (and its
 * game stats) is kept and the bracket is built from its results.
 */
export async function generateTournamentBracket(t: Tournament, seededTeamIds: string[], opts: { keepSeeding?: boolean } = {}) {
  const matches = generateBracket(t, seededTeamIds);
  const [oldMatches, oldGames] = await Promise.all([
    getDocs(query(collection(db, COL.matches), where('tournamentId', '==', t.id))),
    getDocs(query(collection(db, COL.games), where('tournamentId', '==', t.id))),
  ]);
  const keep = new Set(opts.keepSeeding ? oldMatches.docs.filter((d) => (d.data() as Match).bracket === 'SEED').map((d) => d.id) : []);
  await commitInChunks([
    ...oldMatches.docs.filter((d) => !keep.has(d.id)).map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)),
    ...oldGames.docs.filter((d) => !keep.has((d.data() as GameRecord).matchId)).map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)),
  ]);
  await commitInChunks([
    ...matches.map((m) => (b: ReturnType<typeof writeBatch>) => b.set(doc(db, COL.matches, m.id), strip(m))),
    (b) =>
      b.update(doc(db, COL.tournaments, t.id), {
        teamIds: seededTeamIds,
        bracketGenerated: true,
        seeding: false,
        opponentPicks: {},
        status: 'ongoing',
        championTeamId: null,
        finalsMvp: null,
      }),
  ]);
  return matches.length;
}

/** Start a seeding round: every team plays one Bo1 game; the results seed the bracket. Clears old matches. */
export async function startSeedingRound(t: Tournament, teamIds: string[]) {
  const seedMatches = generateSeedingRound(t, teamIds);
  const [oldMatches, oldGames] = await Promise.all([
    getDocs(query(collection(db, COL.matches), where('tournamentId', '==', t.id))),
    getDocs(query(collection(db, COL.games), where('tournamentId', '==', t.id))),
  ]);
  await commitInChunks([
    ...oldMatches.docs.map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)),
    ...oldGames.docs.map((d) => (b: ReturnType<typeof writeBatch>) => b.delete(d.ref)),
  ]);
  await commitInChunks([
    ...seedMatches.map((m) => (b: ReturnType<typeof writeBatch>) => b.set(doc(db, COL.matches, m.id), strip(m))),
    (b) => b.update(doc(db, COL.tournaments, t.id), { teamIds, seeding: true, bracketGenerated: false, opponentPicks: {}, status: 'ongoing', championTeamId: null, finalsMvp: null }),
  ]);
  return seedMatches.length;
}

export const updateMatch = (id: string, patch: Partial<Match>) =>
  updateDoc(doc(db, COL.matches, id), { ...strip(patch), updatedAt: Date.now() });

async function loadMatches(tournamentId: string): Promise<Match[]> {
  const snap = await getDocs(query(collection(db, COL.matches), where('tournamentId', '==', tournamentId)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Match);
}

/**
 * A seeding winner picks its first-round opponent (any team except itself).
 * The bracket swaps the teams; both teams are then locked for later picks.
 */
export async function pickSeedingOpponent(t: Tournament, winnerId: string, pickedId: string) {
  const picks = t.opponentPicks ?? {};
  if (picks[winnerId]) throw new Error('This team has already picked its opponent.');
  const locked = new Set([...Object.keys(picks), ...Object.values(picks)]);
  if (locked.has(pickedId)) throw new Error('That team is already locked in by another pick.');
  const matches = await loadMatches(t.id);
  const changed = pickOpponent(matches, winnerId, pickedId);
  await commitInChunks([
    ...changed.map((m) => (b: ReturnType<typeof writeBatch>) => b.set(doc(db, COL.matches, m.id), strip(m))),
    (b) => b.update(doc(db, COL.tournaments, t.id), { opponentPicks: { ...picks, [winnerId]: pickedId } }),
  ]);
  return changed.length;
}

/** Manually report a finished series (when it wasn't run through the live controller). */
export async function reportSeries(match: Match, winnerId: string, scoreA: number, scoreB: number) {
  const matches = await loadMatches(match.tournamentId);
  const changed = applySeriesResult(matches, match.id, winnerId, scoreA, scoreB);
  await commitInChunks([
    ...changed.map((m) => (b: ReturnType<typeof writeBatch>) => b.set(doc(db, COL.matches, m.id), strip(m))),
    ...(match.isFinal
      ? [(b: ReturnType<typeof writeBatch>) => b.update(doc(db, COL.tournaments, match.tournamentId), { championTeamId: winnerId, status: 'completed' })]
      : []),
  ]);
}

export async function revertSeries(match: Match) {
  const matches = await loadMatches(match.tournamentId);
  const changed = revertSeriesResult(matches, match.id);
  await commitInChunks([
    ...changed.map((m) => (b: ReturnType<typeof writeBatch>) => b.set(doc(db, COL.matches, m.id), strip(m))),
    ...(match.isFinal
      ? [(b: ReturnType<typeof writeBatch>) => b.update(doc(db, COL.tournaments, match.tournamentId), { championTeamId: null, status: 'ongoing' })]
      : []),
  ]);
}

// ── Media, heroes, settings ─────────────────────────────────────────────────

export const createHighlight = (data: Omit<Highlight, 'id' | 'createdAt'>) =>
  addDoc(collection(db, COL.highlights), { ...data, createdAt: Date.now() });

export const updateHighlight = (id: string, patch: Partial<Highlight>) =>
  updateDoc(doc(db, COL.highlights, id), strip(patch));

export const deleteHighlight = (id: string) => deleteDoc(doc(db, COL.highlights, id));

export const saveHeroPortrait = (name: string, imageUrl: string) =>
  setDoc(doc(db, COL.heroes, heroSlug(name)), { name, imageUrl } satisfies Omit<HeroPortrait, 'id'>);

export const deleteHeroPortrait = (name: string) => deleteDoc(doc(db, COL.heroes, heroSlug(name)));

export const DEFAULT_SETTINGS: Omit<SiteSettings, 'updatedAt'> = {
  featuredTournamentId: null,
  featuredTitle: '',
  heroSlides: [],
  streamUrl: '',
  facebookUrl: '',
  discordUrl: '',
  tagline: 'Let the game begin',
  announcement: '',
  casterProfiles: {},
};

export const saveSettings = (patch: Partial<SiteSettings>) =>
  setDoc(doc(db, COL.settings, SETTINGS_DOC), { ...patch, updatedAt: Date.now() }, { merge: true });

// ── Sample data (for a quick test run) ──────────────────────────────────────

const SAMPLE_TEAMS: Array<[string, string, string[]]> = [
  ['Manila Mavericks', 'MNL', ['Kidlat', 'Bagwis', 'Sinag', 'Halimaw', 'Tikbalang']],
  ['Cebu Krakens', 'CBK', ['Alon', 'Bagyo', 'Dagat', 'Pating', 'Kugita']],
  ['Davao Durians', 'DVO', ['Agila', 'Bundok', 'Kalabaw', 'Tarsier', 'Waling']],
  ['Iloilo Inferno', 'ILO', ['Apoy', 'Baga', 'Liyab', 'Sigaw', 'Usok']],
  ['Baguio Blizzard', 'BGO', ['Hamog', 'Ulap', 'Lamig', 'Pino', 'Strawberry']],
  ['Bicol Volcanoes', 'BCL', ['Mayon', 'Sili', 'Lava', 'Abo', 'Pinangat']],
  ['Pampanga Pythons', 'PMP', ['Sisig', 'Kamandag', 'Sawa', 'Parol', 'Kapampangan']],
  ['Tacloban Typhoons', 'TAC', ['Unos', 'Kulog', 'Ipo', 'Habagat', 'Amihan']],
];
const SAMPLE_ROLES = ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam'] as const;

export async function seedSampleData() {
  const teamIds: string[] = [];
  const ops: Array<(b: ReturnType<typeof writeBatch>) => void> = [];
  SAMPLE_TEAMS.forEach(([name, tag, igns], ti) => {
    const teamRef = doc(collection(db, COL.teams));
    teamIds.push(teamRef.id);
    ops.push((b) => b.set(teamRef, { name, tag, logoUrl: '', createdAt: Date.now() + ti } satisfies Omit<Team, 'id'>));
    igns.forEach((ign, pi) => {
      const role = SAMPLE_ROLES[pi];
      ops.push((b) =>
        b.set(doc(collection(db, COL.players)), {
          teamId: teamRef.id,
          ign,
          realName: '',
          role,
          photoUrl: '',
          spell: DEFAULT_SPELL_BY_ROLE[role],
          isStarter: true,
          order: pi,
          createdAt: Date.now(),
        } satisfies Omit<Player, 'id'>),
      );
    });
  });
  const tRef = doc(collection(db, COL.tournaments));
  const tournament: Tournament = {
    id: tRef.id,
    name: 'TCC Invitational',
    season: 'Season 1',
    type: 'double',
    defaultFormat: 'BO3',
    finalFormat: 'BO5',
    teamIds,
    status: 'upcoming',
    championTeamId: null,
    prizePool: '',
    startDate: '',
    bracketGenerated: false,
    createdAt: Date.now(),
  };
  ops.push((b) => b.set(tRef, strip(tournament)));
  ops.push((b) => b.set(doc(db, COL.settings, SETTINGS_DOC), { ...DEFAULT_SETTINGS, featuredTournamentId: tRef.id, updatedAt: Date.now() }, { merge: true }));
  await commitInChunks(ops);
  await generateTournamentBracket(tournament, teamIds);
  return tRef.id;
}
