import { useEffect, useRef } from 'react';
import { safeLocalGet, safeLocalSet, stableJson } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// Form drafts: what you typed in a modal is kept in this browser while you
// type, so closing it by accident (click outside, Esc, ×) loses nothing.
// Opening the same form again brings the draft back; saving clears it.
// ─────────────────────────────────────────────────────────────────────────────

const PREFIX = 'tcc.formDraft.';
/** Drafts older than this are dropped. */
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

interface Stored<T> {
  value: T;
  at: number;
}

/** A saved draft for this form, or null. */
export function loadFormDraft<T>(key: string): T | null {
  const s = safeLocalGet<Stored<T> | null>(PREFIX + key, null);
  if (!s || typeof s !== 'object' || !('value' in s) || typeof s.at !== 'number') return null;
  if (Date.now() - s.at > MAX_AGE_MS) {
    clearFormDraft(key);
    return null;
  }
  return s.value;
}

export function clearFormDraft(key: string) {
  try {
    localStorage.removeItem(PREFIX + key);
  } catch {
    /* storage unavailable */
  }
}

/**
 * Keep `value` as the draft of form `key` while it differs from `initial`
 * (what the form opened with). Pass key = null while the form is closed.
 */
export function useFormDraft<T>(key: string | null, value: T, initial: T) {
  const initialJson = useRef('');
  initialJson.current = stableJson(initial);
  const json = stableJson(value);
  useEffect(() => {
    if (!key) return;
    // Saved right away (no debounce), so closing the modal mid-typing keeps the last letter too.
    if (json === initialJson.current) clearFormDraft(key);
    else safeLocalSet(PREFIX + key, { value, at: Date.now() } satisfies Stored<T>);
    // `json` represents `value`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, json]);
}
