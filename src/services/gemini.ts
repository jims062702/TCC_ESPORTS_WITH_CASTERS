import type { EventType } from '@/types';
import type { CommentaryFacts } from './facts';
import { CASTER_BY_ID } from './casters';
import { getIdToken } from './firebase';

// ─────────────────────────────────────────────────────────────────────────────
// Gemini client. The browser never sees the API key: requests go to the
// /api/gemini Vercel function (or the Vite dev middleware), which checks that
// the caller is a signed-in TCC admin before forwarding to Google.
// ─────────────────────────────────────────────────────────────────────────────

export interface AiLine {
  caster: string;
  text: string;
}

export interface AiResult {
  lines: AiLine[];
  model: string;
  latencyMs: number;
}

export class GeminiError extends Error {
  constructor(
    message: string,
    public status: number,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
}

const EVENT_DIRECTIONS: Partial<Record<EventType, string>> = {
  DRAFT_START:
    'The drafting phase is starting. The first caster opens with "Welcome sa drafting phase natin, partner <other caster name>!" and the partner thanks them by name, then both set up the draft: game number, series score, what to watch in the bans. No hero names — the draft has not happened yet.',
  GAME_START:
    'The game is starting right now. Welcome everyone to the game and say the game number exactly ("Welcome sa Game <n>…"), mention the series score, and build anticipation. No kills or events have happened yet.',
  BREAK_START:
    'The broadcast is going to a short break. Send the show to break warmly: say you will be back (mention the minutes if given), invite viewers to stay and watch the highlights.',
  GAME_INTRO:
    'Open the game like a broadcast cold open: welcome viewers, state the stage, the game number, the series format and the current series score exactly. Build anticipation.',
  DRAFT_COMPLETE:
    'Break down the completed draft: compare both lineups using ONLY the listed heroes and bans. Talk about likely game plans (early pressure vs late game, teamfight vs pick-off) in general terms.',
  FIRST_BLOOD: 'Call the first blood and what the early lead means.',
  DOUBLE_KILL: 'Call the double kill quickly and react.',
  TRIPLE_KILL: 'Huge hype for the triple kill.',
  MANIAC: 'Explosive hype — one kill away from a Savage.',
  SAVAGE: 'Maximum hype, the whole enemy team got wiped by one player. Make it legendary.',
  TURTLE:
    'Call "Turtle slain by <actor IGN>" (if an actor is given) and what it gives the team. If steal=true the other team stole it — go wild. Do NOT mention Retribution or any battle spell for objectives.',
  LORD: 'Call "Lord slain by <actor IGN>" (if an actor is given) and what the push means. If steal=true it was a Lord steal — scream it. Do NOT mention Retribution or any battle spell for objectives.',
  BUFF: 'Call "Buff slain by <actor IGN>" (if an actor is given). If steal=true it was stolen from the enemy jungle. Do NOT mention Retribution or any battle spell.',
  OBJECTIVE_CONTEST:
    'Both teams are gathering at the objective in FACTS.objective. Build suspense and ask "Sino kaya ang makakakuha ng <objective>?" Do not say who gets it.',
  GOLD_UPDATE: 'Read the gold situation and kills, explain who controls the tempo. Quote numbers exactly as given.',
  SPELL_USED: 'The actor just used their battle spell. Comment on it and the cooldown window it opens for the enemy.',
  INSTANT_REPLAY:
    'The broadcast is showing a 10-second INSTANT REPLAY right now. The FIRST line must begin with "Tingnan muna natin ang instant replay". Then narrate it play-by-play like it is happening again on screen, using ONLY the replay title/description and the actor. Keep it under ~10 seconds of speech total.',
  GAME_RESULT: 'Announce the game winner and the updated series score exactly. Mention how many wins are still needed if the series continues.',
  SERIES_VICTORY:
    'Announce the series winner and the final series score exactly. If isChampionship=true, crown them CHAMPIONS of the tournament with maximum emotion and congratulate them.',
  IDLE_BANTER: 'Quiet moment on the map — light desk banter using the current stats only.',
};

export function buildCommentaryPrompt(
  type: EventType,
  facts: CommentaryFacts,
  pair: string[],
  recentLines: string[],
): { system: string; prompt: string; casters: string[] } {
  const seated = pair.map((id) => CASTER_BY_ID[id]).filter(Boolean);
  const casterBlock = seated
    .map((c) => `- id "${c.id}" — ${c.name} (${c.gender}, ${c.role}). Specialty: ${c.specialty}. Style: ${c.style}`)
    .join('\n');

  const system = [
    'You write live shoutcaster dialogue for a Mobile Legends: Bang Bang (MLBB) esports broadcast in the Philippines, produced by TCC Esports ("Let the game begin!").',
    'The lines are read aloud by text-to-speech, so write exactly what should be spoken.',
    '',
    'LANGUAGE: natural Filipino Taglish, the way Filipino pro-league (MPL-style) MLBB casters talk — Tagalog sentence glue with English game terms. Energetic, punchy and conversational. Each line 6–24 words, at most 2 short sentences.',
    'BROADCAST STYLE: the play-by-play voice builds energy with short bursts on the action ("ITO NA!", "PATAY!", "ANG LAKAS!"); the color/analyst voice answers with the WHY (positioning, rotation, timing, stats, story). Casters react to each other naturally ("Tama ka diyan…", "Exactly!") without repeating each other.',
    '',
    'CASTERS ON THE DESK (only these two speak, and they react to each other):',
    casterBlock,
    '',
    'ACCURACY RULES (most important):',
    '1. Use ONLY facts from the FACTS JSON. Never invent kills, heroes, items, builds, gold amounts, timers, scores, player names, or plays that are not listed.',
    '2. Say team names, player IGNs and hero names exactly as written.',
    '3. If a detail is missing, react to the moment and the stakes instead of guessing.',
    '4. Series scores, game numbers and results must match FACTS exactly (e.g. "3-0" in a "Best of 5").',
    '5. Gold numbers: say them like casters do ("2.5k gold") but only from FACTS.gold.',
    '6. No emojis, hashtags, stage directions, asterisks, quotes or speaker labels inside "text".',
    '7. Objective steals (Turtle, Lord, Buff) can be done by any hero — never credit Retribution; say "slain by <IGN>".',
    '8. ONE SPEAKER AT A TIME: every line is a complete thought, and the next caster only responds after the previous one has finished. No cut-off sentences, no interruptions, never two casters in one line.',
    '',
    'OUTPUT: JSON only: {"lines":[{"caster":"<caster id>","text":"<spoken line>"}]} with 2 to 4 lines, alternating speakers. The first speaker should be the caster whose specialty fits the event best.',
  ].join('\n');

  const prompt = [
    `EVENT: ${type}`,
    `DIRECTION: ${EVENT_DIRECTIONS[type] ?? 'React to the event.'}`,
    `FACTS: ${JSON.stringify(facts)}`,
    recentLines.length ? `RECENT LINES (do not repeat these phrases): ${JSON.stringify(recentLines.slice(-6))}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return { system, prompt, casters: seated.map((c) => c.id) };
}

export async function callGeminiProxy<T>(body: Record<string, unknown>, timeoutMs: number): Promise<T & { model: string; latencyMs: number }> {
  const token = await getIdToken();
  if (!token) throw new GeminiError('Sign in as an admin to use the AI casters.', 401);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = performance.now();
  try {
    const res = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new GeminiError(json?.error ?? `Gemini proxy error ${res.status}`, res.status, json?.retryAfterSec);
    return { ...json, model: json.model ?? 'gemini', latencyMs: Math.round(performance.now() - started) };
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw new GeminiError('Gemini timed out', 504);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export async function requestCommentary(input: { system: string; prompt: string; casters: string[] }, timeoutMs = 9000): Promise<AiResult> {
  const res = await callGeminiProxy<{ lines?: AiLine[] }>({ mode: 'lines', ...input }, timeoutMs);
  const lines = Array.isArray(res.lines) ? res.lines : [];
  if (!lines.length) throw new GeminiError('Empty response from Gemini', 502);
  return { lines, model: res.model, latencyMs: res.latencyMs };
}

// ── Pre-shoutcast library generation (one batched call per group of keys) ───

export interface LibraryEntry {
  key: string;
  lead: string;
  follow: string;
}

const KEY_GUIDE: Record<string, string> = {
  DRAFT_START: 'drafting phase starts for game {gameNumber} — the lead MUST say "Welcome sa drafting phase natin, partner {partner}!" and the follow thanks {partner} by name',
  DRAFT_START_FIRST: 'first draft of the series — lead MUST say "Welcome sa drafting phase natin, partner {partner}!"; follow thanks {partner}',
  DRAFT_START_MATCHPOINT: 'draft starts with {mpTeam} on match point — lead MUST greet "partner {partner}"',
  DRAFT_START_DECIDER: 'draft of the deciding game — lead MUST greet "partner {partner}"',
  GAME_START: 'the game is starting — welcome everyone to Game {gameNumber} (lead MUST say "Game {gameNumber}")',
  GAME_START_FIRST: 'Game {gameNumber}, the first game of the series, is starting — welcome to the game',
  GAME_START_MATCHPOINT: 'Game {gameNumber} starts with {mpTeam} on match point',
  GAME_START_DECIDER: 'the deciding Game {gameNumber} is starting',
  BREAK_START: 'going to a short break (use {breakMins} minutes when it fits) — no game numbers',
  BREAK_START_NEXT: 'going to break before Game {nextGame}',
  BREAK_START_PAUSE: 'short pause in the middle of Game {gameNumber}',
  GAME_INTRO: 'opening a game mid-series (mention game number, format and series score)',
  GAME_INTRO_FIRST: 'opening Game 1 of the series',
  GAME_INTRO_MATCHPOINT: 'opening a game where {mpTeam} is on match point',
  GAME_INTRO_DECIDER: 'opening the deciding final game of the series',
  DRAFT_COMPLETE: 'draft just finished — compare {bluePicks} vs {redPicks}',
  DRAFT_BAN: '{team} just banned {hero} — say why ({banReason})',
  DRAFT_BAN_TARGET: '{team} banned {hero}, the signature hero of {targetPlayer} ({enemy})',
  DRAFT_BAN_HISTORY: '{team} banned {hero}, which {enemy} used in Game {prevGame}',
  DRAFT_PICK: '{team} picked {hero} for {player} ({position}) — hype what it brings ({pickHype})',
  DRAFT_PICK_SIGNATURE: '{team} got {hero}, the signature hero of {player} — the enemy did not ban it; big hype',
  DRAFT_TALK: 'general draft talk between picks (no hero names unless given)',
  DRAFT_TALK_BAN: 'speculate: will {team} ban {candHero}, the hero of {candPlayer} from {enemy}?',
  DRAFT_TALK_PICK: 'speculate: will {team} pick {candHero} for {candPlayer}?',
  DRAFT_TALK_META: '{metaHero} is still open — picked or banned {metaCount} times in {tournament}',
  DRAFT_TALK_STORY: 'story: {prevWinner} won Game {prevGame} with {prevWinnerPicks}; can {prevLoser} answer?',
  DRAFT_TALK_MATCHUP: 'lane matchup at {position}: {blueHero} ({bluePlayer}) vs {redHero} ({redPlayer})',
  POSTGAME_TALK: 'post-game recap: {winner} won Game {gameNumber}; MVP-ish {spotPlayer} on {spotHero} with {spotKda}',
  POSTGAME_TALK_SERIES: 'series is over, {winner} won {winnerScore}-{loserScore}; recap and respect for {loser}',
  POSTGAME_TALK_CHAMPION: '{winner} are champions of {tournament}; celebrate the MVP {spotPlayer}',
  BREAK_TALK: 'light chat during the break (series {seriesScore}, next Game {nextGame})',
  BANTER_PLAYER: 'spotlight {spotPlayer} ({spotTeam}) on {spotHero}, KDA {spotKda}',
  BANTER_MATCHUP: 'in-game lane matchup at {position}: {blueHero} vs {redHero}',
  BANTER_TIME: 'we are {gameMinute} minutes into the game',
  FIRST_BLOOD: 'first blood by {player}',
  DOUBLE_KILL: 'double kill by {player}',
  TRIPLE_KILL: 'triple kill by {player}',
  MANIAC: 'maniac (4 kills) by {player}',
  SAVAGE: 'savage (5 kills, team wipe) by {player}',
  OBJECTIVE_CONTEST: 'both teams gathering at the {objective} — ask "Sino kaya ang makakakuha ng {objective}?"',
  TURTLE: 'Turtle slain by {player} for {team}',
  TURTLE_STEAL: 'Turtle STOLEN by {team}, slain by {player} (never mention Retribution)',
  LORD: 'Lord slain by {player} for {team}',
  LORD_STEAL: 'Lord STOLEN by {team}, slain by {player} (never mention Retribution)',
  BUFF: 'jungle buff slain by {player} for {team}',
  BUFF_STEAL: 'enemy buff STOLEN by {team}, slain by {player} (never mention Retribution)',
  GOLD_UPDATE: '{leader} leads by {gold} gold over {trailer}',
  GOLD_EVEN: 'gold is dead even',
  SPELL_USED: '{player} just used battle spell {spell} ({cooldown}s cooldown)',
  INSTANT_REPLAY: 'instant replay is showing — the lead MUST start with "Tingnan muna natin ang instant replay", use {replayTitle}',
  GAME_RESULT: '{winner} won game {gameNumber}; series {winnerScore}-{loserScore}',
  GAME_RESULT_MATCHPOINT: '{winner} won and is now on match point',
  GAME_RESULT_TIED: '{winner} won and tied the series {winnerScore}-{loserScore}',
  SERIES_VICTORY: '{winner} won the series {winnerScore}-{loserScore} vs {loser}',
  SERIES_VICTORY_CHAMPION: '{winner} are crowned CHAMPIONS of {tournament}, {winnerScore}-{loserScore}',
  IDLE_BANTER: 'quiet moment on the map — general desk banter using only placeholders or no specifics',
};

export function buildLibraryPrompt(keys: string[], perKey: number, placeholders: Record<string, string>, examples: Record<string, [string, string][]>) {
  const system = [
    'You are the head writer for TCC Esports, a Filipino Mobile Legends: Bang Bang broadcast. Write reusable shoutcaster call TEMPLATES in natural Taglish.',
    'Each entry is a pair: "lead" (the play-by-play call) and "follow" (the co-caster reaction, spoken after the lead finishes — never an interruption). 6–22 words each, punchy, spoken-word friendly for text-to-speech.',
    'Style: Filipino pro-league (MPL-style) broadcast — hype bursts on the call ("ITO NA!", "PATAY!", "LINIS!"), then the partner adds the why: positioning, rotation, timing, stats or the story of the series.',
    'Use {placeholders} for every specific fact (names, teams, numbers). NEVER write real team or player names, numbers, items or heroes directly.',
    `Allowed placeholders ONLY: ${Object.keys(placeholders).map((p) => `{${p}}`).join(', ')}.`,
    'Objective steals (Turtle, Lord, Buff) can be done by any hero — never mention Retribution. Use "slain by {player}".',
    'No emojis, hashtags, asterisks, quotes or stage directions. Vary the vocabulary — do not repeat the example lines.',
    'Output JSON only: {"entries":[{"key":"<KEY>","lead":"...","follow":"..."}]}.',
  ].join('\n');
  const prompt = [
    `Write ${perKey} NEW entries for EACH of these keys:`,
    ...keys.map((k) => `- ${k}: ${KEY_GUIDE[k] ?? k}${examples[k]?.length ? ` (example style: "${examples[k][0][0]}" / "${examples[k][0][1]}")` : ''}`),
    `Placeholder meanings: ${JSON.stringify(placeholders)}`,
  ].join('\n');
  return { system, prompt };
}

export async function requestLibrary(keys: string[], perKey: number, placeholders: Record<string, string>, examples: Record<string, [string, string][]>) {
  const { system, prompt } = buildLibraryPrompt(keys, perKey, placeholders, examples);
  const res = await callGeminiProxy<{ entries?: LibraryEntry[] }>({ mode: 'library', system, prompt, keys }, 45_000);
  return { entries: Array.isArray(res.entries) ? res.entries : [], model: res.model, latencyMs: res.latencyMs };
}
