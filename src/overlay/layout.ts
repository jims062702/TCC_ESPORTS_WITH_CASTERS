// ─────────────────────────────────────────────────────────────────────────────
// Shared overlay geometry (1920×1080 stage). The replay overlay draws its
// picture-in-picture frame here, and the OBS bridge places the live game source
// at exactly the same rectangle — keep them in one place so they always match.
// ─────────────────────────────────────────────────────────────────────────────

/** Live-game picture-in-picture during instant replays: right side, 30% width, 16:9. */
export const REPLAY_PIP = { x: 1288, y: 220, w: 576, h: 324 } as const;

/** Instant-replay zoom transitions (ms): the clip grows out of a small window; at the end the live game zooms back in. */
export const REPLAY_ZOOM = { inMs: 650, outMs: 700 } as const;
