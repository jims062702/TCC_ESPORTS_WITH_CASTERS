import { useMemo } from 'react';

/** URL query flags for overlays, e.g. ?demo=1&preview=1&captions=0. */
export const useQuery = () => useMemo(() => new URLSearchParams(window.location.search), []);

export const flag = (q: URLSearchParams, key: string, fallback = true) =>
  q.has(key) ? q.get(key) !== '0' && q.get(key) !== 'false' : fallback;
