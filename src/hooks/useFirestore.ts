import { useEffect, useMemo, useState } from 'react';
import { registerExtraHeroes } from '@/lib/heroData';
import { resolveImageUrl } from '@/lib/utils';
import { orderBy, type QueryConstraint } from 'firebase/firestore';
import type {
  BoothState,
  CaptionState,
  GameRecord,
  Highlight,
  HeroPortrait,
  LiveState,
  Match,
  Player,
  SiteSettings,
  Team,
  Tournament,
} from '@/types';
import { COL, LIVE_DOC, SETTINGS_DOC, subscribeCollection, subscribeDoc, whereEq } from '@/services/firebase';
import { normalizeLive } from '@/services/live';
import { DEFAULT_SETTINGS } from '@/services/db';

// ─────────────────────────────────────────────────────────────────────────────
// Real-time hooks. Each effect returns Firestore's unsubscribe function, so
// listeners are always detached on unmount or when the key changes
// (no memory leaks, no duplicate listeners).
// ─────────────────────────────────────────────────────────────────────────────

export interface Sub<T> {
  data: T;
  loading: boolean;
  error: Error | null;
}

export function useCollectionData<T>(path: string | null, constraints: QueryConstraint[] = [], key = ''): Sub<T[]> {
  const [state, setState] = useState<Sub<T[]>>({ data: [], loading: Boolean(path), error: null });
  useEffect(() => {
    if (!path) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const unsubscribe = subscribeCollection<T>(
      path,
      constraints,
      (rows) => setState({ data: rows, loading: false, error: null }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );
    return unsubscribe;
    // `key` represents the constraints — callers pass a stable string.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, key]);
  return state;
}

export function useDocData<T>(path: string, id: string | null): Sub<T | null> {
  const [state, setState] = useState<Sub<T | null>>({ data: null, loading: Boolean(id), error: null });
  useEffect(() => {
    if (!id) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const unsubscribe = subscribeDoc<T>(
      path,
      id,
      (data) => setState({ data, loading: false, error: null }),
      (error) => setState((s) => ({ ...s, loading: false, error })),
    );
    return unsubscribe;
  }, [path, id]);
  return state;
}

// ── Domain hooks ────────────────────────────────────────────────────────────

export const useTeams = () => {
  const s = useCollectionData<Team>(COL.teams, [orderBy('name')], 'name');
  return s;
};

export const usePlayers = () => useCollectionData<Player>(COL.players);

export const useTournaments = () => {
  const s = useCollectionData<Tournament>(COL.tournaments);
  const data = useMemo(() => [...s.data].sort((a, b) => b.createdAt - a.createdAt), [s.data]);
  return { ...s, data };
};

export const useMatches = (tournamentId: string | null) => {
  const s = useCollectionData<Match>(
    tournamentId ? COL.matches : null,
    tournamentId ? [whereEq('tournamentId', tournamentId)] : [],
    tournamentId ?? '',
  );
  const data = useMemo(() => [...s.data].sort((a, b) => a.order - b.order), [s.data]);
  return { ...s, data };
};

export const useGames = (tournamentId: string | null | 'all') => {
  const all = tournamentId === 'all';
  return useCollectionData<GameRecord>(
    tournamentId ? COL.games : null,
    tournamentId && !all ? [whereEq('tournamentId', tournamentId)] : [],
    tournamentId ?? '',
  );
};

export const useHighlights = () => {
  const s = useCollectionData<Highlight>(COL.highlights);
  const data = useMemo(() => [...s.data].sort((a, b) => a.order - b.order || b.createdAt - a.createdAt), [s.data]);
  return { ...s, data };
};

export const useHeroPortraits = () => {
  const s = useCollectionData<HeroPortrait>(COL.heroes);
  const map = useMemo(() => {
    const m: Record<string, string> = {};
    for (const h of s.data) m[h.name.toLowerCase()] = resolveImageUrl(h.imageUrl);
    return m;
  }, [s.data]);
  return { ...s, map };
};

export const useSettings = () => {
  const s = useDocData<SiteSettings>(COL.settings, SETTINGS_DOC);
  const data = useMemo<SiteSettings>(() => {
    const merged = { ...DEFAULT_SETTINGS, updatedAt: 0, ...(s.data ?? {}), casterProfiles: { ...(s.data?.casterProfiles ?? {}) } };
    // New heroes typed in Settings → Heroes become known to the draft, casters and hero search.
    registerExtraHeroes(merged.extraHeroes ?? []);
    return merged;
  }, [s.data]);
  return { ...s, data };
};

/** Uploaded battle spell icons (Settings → Battle spell icons). */
export const useSpellIcons = () => useSettings().data.spellIcons ?? {};

export const useLive = () => {
  const s = useDocData<LiveState>(COL.live, LIVE_DOC.current);
  const data = useMemo(() => normalizeLive(s.data), [s.data]);
  return { ...s, data, exists: Boolean(s.data) };
};

export const useCaption = () => useDocData<CaptionState>(COL.live, LIVE_DOC.caption);

export const useBooth = () => useDocData<BoothState>(COL.live, LIVE_DOC.booth);

/** Ticks every `ms` — used for countdowns and cooldown rings. */
export function useNow(ms = 250) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Lookup maps for teams/players. */
export function useIndex<T extends { id: string }>(rows: T[]) {
  return useMemo(() => Object.fromEntries(rows.map((r) => [r.id, r])) as Record<string, T>, [rows]);
}
