import { collection, doc, getDoc, getDocs, setDoc, writeBatch } from 'firebase/firestore';
import { COL, LIVE_DOC, db } from './firebase';
import { defaultLive } from './live';

// ─────────────────────────────────────────────────────────────────────────────
// Reset data (Settings → Reset data). Clears statistics for a fresh start while
// keeping everything visual: hero portraits, caster photos, battle-spell icons,
// the home carousel, highlight clips and all other site settings are never
// touched (they live in settings / heroes / highlights, which this skips).
// ─────────────────────────────────────────────────────────────────────────────

export interface ResetOptions {
  /** Hero picks & bans, player stats, leaderboard, game & Finals MVPs, event log. */
  stats: boolean;
  /** Brackets and match results (tournaments stay, back to "not generated"). */
  brackets: boolean;
  /** Tournaments, teams and players themselves. */
  rosters: boolean;
  /** Gemini pre-generated caster lines (built-in lines stay). */
  aiLines: boolean;
}

/** What a reset will remove (stats are implied by brackets, brackets by rosters). */
export const resetScope = (o: ResetOptions) => ({
  stats: o.stats || o.brackets || o.rosters,
  brackets: o.brackets || o.rosters,
  rosters: o.rosters,
  aiLines: o.aiLines,
});

async function wipe(col: string): Promise<number> {
  const snap = await getDocs(collection(db, col));
  for (let i = 0; i < snap.docs.length; i += 450) {
    const batch = writeBatch(db);
    snap.docs.slice(i, i + 450).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
  return snap.size;
}

/** Returns how many documents were removed per collection. */
export async function resetData(opts: ResetOptions): Promise<Record<string, number>> {
  const o = resetScope(opts);
  const live = await getDoc(doc(db, COL.live, LIVE_DOC.current));
  if (live.exists() && live.data()?.matchId) throw new Error('A series is on air — press "End broadcast" in the Live Controller first.');
  const removed: Record<string, number> = {};

  if (o.stats) {
    removed.games = await wipe(COL.games);
    removed.events = await wipe(COL.events);
    removed.commentary = await wipe(COL.commentary);
  }
  if (o.brackets) removed.matches = await wipe(COL.matches);
  if (o.rosters) {
    removed.tournaments = await wipe(COL.tournaments);
    removed.players = await wipe(COL.players);
    removed.teams = await wipe(COL.teams);
  } else if (o.stats) {
    // Keep the tournaments; clear what was computed from games (and the bracket if asked).
    const ts = await getDocs(collection(db, COL.tournaments));
    const patch: Record<string, string | boolean | null | object> = o.brackets
      ? { bracketGenerated: false, seeding: false, opponentPicks: {}, championTeamId: null, finalsMvp: null, status: 'upcoming' }
      : { finalsMvp: null };
    for (let i = 0; i < ts.docs.length; i += 450) {
      const batch = writeBatch(db);
      ts.docs.slice(i, i + 450).forEach((d) => batch.update(d.ref, patch));
      await batch.commit();
    }
  }
  if (o.aiLines) removed.scripts = await wipe(COL.scripts);

  // Fresh off-air state (clears the series story and tournament meta the casters use) and empty captions.
  await setDoc(doc(db, COL.live, LIVE_DOC.current), { ...defaultLive(), updatedAt: Date.now() });
  await setDoc(doc(db, COL.live, LIVE_DOC.caption), { current: null, recent: [], updatedAt: Date.now() });
  return removed;
}
