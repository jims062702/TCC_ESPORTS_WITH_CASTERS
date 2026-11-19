import type { Role } from '@/types';
import { MLBB_HEROES } from './constants';

// ─────────────────────────────────────────────────────────────────────────────
// Hero knowledge for the draft casters (free, offline — no API needed).
// Each hero: class, usual lanes and play-style traits. The casters turn the
// traits into reasons ("binan nila ang Freya para hindi mahirapan ang
// backline") and pick hype. Lanes also auto-assign a pick to the right player.
// Edit freely when the meta changes — unknown heroes simply get generic lines.
// ─────────────────────────────────────────────────────────────────────────────

export type HeroClass = 'Tank' | 'Fighter' | 'Assassin' | 'Mage' | 'Marksman' | 'Support';
export type HeroTrait =
  | 'dive'
  | 'burst'
  | 'cc'
  | 'late'
  | 'early'
  | 'sustain'
  | 'poke'
  | 'mobility'
  | 'protect'
  | 'teamfight'
  | 'pickoff'
  | 'push'
  | 'tank'
  | 'objective';

export interface HeroInfo {
  classes: HeroClass[];
  lanes: Role[];
  traits: HeroTrait[];
}

/** "Class/Class | Lane/Lane | trait,trait" */
const RAW: Record<string, string> = {
  Aamon: 'Assassin | Jungle | burst,dive,pickoff,mobility',
  Akai: 'Tank | Roam/Jungle | cc,tank,teamfight',
  Aldous: 'Fighter | EXP | late,pickoff,burst',
  Alice: 'Mage/Tank | EXP/Mid | sustain,dive,teamfight',
  Alpha: 'Fighter | EXP/Jungle | sustain,teamfight,cc',
  Alucard: 'Fighter/Assassin | Jungle/EXP | sustain,dive',
  Angela: 'Support | Roam | protect,sustain',
  Argus: 'Fighter | EXP/Gold | push,late,sustain',
  Arlott: 'Fighter/Assassin | EXP/Roam | mobility,cc,dive',
  Atlas: 'Tank | Roam | cc,teamfight,tank',
  Aulus: 'Fighter | EXP | late,sustain',
  Aurora: 'Mage | Mid | cc,burst,teamfight',
  Badang: 'Fighter | EXP/Jungle | cc,burst',
  Balmond: 'Fighter | Jungle/EXP | sustain,early,objective',
  Bane: 'Fighter/Mage | Jungle/EXP | poke,push,teamfight',
  Barats: 'Tank/Fighter | Jungle/EXP | tank,cc,objective',
  Baxia: 'Tank | Jungle/Roam | tank,dive,mobility',
  Beatrix: 'Marksman | Gold/Jungle | burst,poke',
  Belerick: 'Tank | Roam/EXP | tank,cc,protect',
  Benedetta: 'Assassin/Fighter | EXP | mobility,dive,push',
  Brody: 'Marksman | Gold | early,burst',
  Bruno: 'Marksman | Gold | late,burst',
  Carmilla: 'Support/Tank | Roam | cc,teamfight',
  Cecilion: 'Mage | Mid | late,poke',
  "Chang'e": 'Mage | Mid | poke,teamfight',
  Chip: 'Support/Tank | Roam | mobility,protect,teamfight',
  Chou: 'Fighter | EXP/Roam | cc,pickoff,mobility',
  Cici: 'Fighter | EXP | mobility,sustain',
  Claude: 'Marksman | Gold | late,teamfight,mobility',
  Clint: 'Marksman | Gold | early,poke',
  Cyclops: 'Mage | Mid/Jungle | burst,pickoff',
  Diggie: 'Support | Roam | protect,cc',
  Dyrroth: 'Fighter | EXP/Jungle | burst,early',
  Edith: 'Tank/Marksman | EXP/Roam | tank,cc,burst',
  Esmeralda: 'Mage/Tank | EXP | sustain,dive',
  Estes: 'Support | Roam | sustain,protect',
  Eudora: 'Mage | Mid | burst,pickoff',
  Fanny: 'Assassin | Jungle | mobility,burst,dive',
  Faramis: 'Support/Mage | Roam/Mid | teamfight,protect',
  Floryn: 'Support | Roam | sustain,protect',
  Franco: 'Tank | Roam | cc,pickoff',
  Fredrinn: 'Fighter/Tank | Jungle/EXP | tank,sustain,objective,teamfight',
  Freya: 'Fighter | EXP/Jungle | dive,burst,sustain',
  Gatotkaca: 'Tank/Fighter | Roam/EXP | cc,teamfight',
  Gloo: 'Tank | Roam/EXP | sustain,cc,dive',
  Gord: 'Mage | Mid | poke,late',
  Granger: 'Marksman | Gold/Jungle | burst,early',
  Grock: 'Tank/Fighter | Roam/EXP | cc,push,tank',
  Guinevere: 'Fighter | EXP/Jungle | cc,burst,dive',
  Gusion: 'Assassin | Jungle/Mid | burst,mobility,dive',
  Hanabi: 'Marksman | Gold | late,teamfight',
  Hanzo: 'Assassin | Jungle | poke,objective',
  Harith: 'Mage | Gold/Mid | mobility,sustain',
  Harley: 'Assassin/Mage | Jungle/Mid | burst,pickoff',
  Hayabusa: 'Assassin | Jungle | mobility,pickoff,push',
  Helcurt: 'Assassin | Jungle | pickoff,burst',
  Hilda: 'Fighter/Tank | Roam/EXP | sustain,early',
  Hirara: 'Assassin | Jungle | burst,mobility,dive',
  Hylos: 'Tank | Roam | cc,tank,sustain',
  Irithel: 'Marksman | Gold | teamfight,late',
  Ixia: 'Marksman | Gold | sustain,teamfight',
  Jawhead: 'Fighter | EXP/Roam | pickoff,cc',
  Johnson: 'Tank/Support | Roam | mobility,pickoff,cc',
  Joy: 'Assassin | Jungle/Mid | mobility,burst',
  Julian: 'Fighter/Mage | Jungle/EXP | burst,sustain',
  Kadita: 'Mage/Assassin | Roam/Mid | cc,burst,teamfight',
  Kagura: 'Mage | Mid | burst,mobility,poke',
  Kaja: 'Support/Fighter | Roam | pickoff,cc',
  Kalea: 'Support/Fighter | Roam | sustain,cc',
  Karina: 'Assassin | Jungle | burst,sustain',
  Karrie: 'Marksman | Gold | late',
  Khaleed: 'Fighter | EXP | sustain,teamfight',
  Khufra: 'Tank | Roam | cc,mobility',
  Kimmy: 'Marksman/Mage | Gold/Mid | poke',
  Lancelot: 'Assassin | Jungle | mobility,burst,dive',
  'Lapu-Lapu': 'Fighter | EXP | teamfight,sustain',
  Layla: 'Marksman | Gold | late,poke',
  Leomord: 'Fighter | Jungle/EXP | mobility,burst',
  Lesley: 'Marksman/Assassin | Gold | burst,poke,late',
  Ling: 'Assassin | Jungle | mobility,burst,dive',
  Lolita: 'Support/Tank | Roam | protect,cc',
  Lukas: 'Fighter | EXP/Jungle | sustain,cc',
  Lunox: 'Mage | Mid/Gold | burst,sustain,late',
  'Luo Yi': 'Mage | Mid | cc,teamfight',
  Lylia: 'Mage | Mid | poke,mobility',
  Marcel: 'Tank/Support | Roam | cc,protect',
  Martis: 'Fighter | EXP/Jungle | cc,early,mobility',
  Masha: 'Fighter/Tank | EXP | push,sustain',
  Mathilda: 'Support/Assassin | Roam | mobility,protect',
  Melissa: 'Marksman | Gold | early,protect',
  Minotaur: 'Tank/Support | Roam | cc,sustain,teamfight',
  Minsitthar: 'Fighter | EXP/Roam | cc,pickoff',
  Miya: 'Marksman | Gold | late',
  Moskov: 'Marksman | Gold | late,teamfight',
  Nana: 'Mage | Mid/Roam | cc,poke',
  Natalia: 'Assassin | Roam/Jungle | pickoff,mobility',
  Natan: 'Marksman | Gold | late',
  Nolan: 'Assassin | Jungle | burst,mobility',
  Novaria: 'Mage | Mid | poke,pickoff',
  Obsidia: 'Marksman | Gold | poke,late',
  Odette: 'Mage | Mid | teamfight,burst',
  Paquito: 'Fighter/Assassin | EXP | burst,early',
  Pharsa: 'Mage | Mid | poke,teamfight',
  Phoveus: 'Fighter | EXP | dive,sustain',
  'Popol and Kupa': 'Marksman | Gold | push,cc',
  Rafaela: 'Support | Roam | sustain,protect',
  Roger: 'Fighter/Marksman | Jungle | burst,early',
  Ruby: 'Fighter | EXP/Roam | sustain,cc',
  Saber: 'Assassin | Jungle/Roam | pickoff,burst',
  Selena: 'Assassin/Mage | Roam/Mid | pickoff,cc',
  Silvanna: 'Fighter | EXP | cc,pickoff',
  Sora: 'Fighter/Assassin | EXP/Jungle | mobility,burst',
  Sun: 'Fighter | EXP/Jungle | push,sustain',
  Suyou: 'Assassin/Fighter | Jungle/EXP | mobility,burst',
  Terizla: 'Fighter | EXP | cc,teamfight,sustain',
  Thamuz: 'Fighter | EXP/Jungle | sustain,early',
  Tigreal: 'Tank | Roam | cc,teamfight',
  Uranus: 'Tank | EXP | sustain,push',
  Vale: 'Mage | Mid/Roam | cc,burst,teamfight',
  Valentina: 'Mage | Mid/EXP | burst,sustain',
  Valir: 'Mage | Mid | poke,cc',
  Vexana: 'Mage | Mid | burst,cc,teamfight',
  Wanwan: 'Marksman | Gold | mobility,late',
  'X.Borg': 'Fighter | EXP | sustain,teamfight,burst',
  Xavier: 'Mage | Mid | poke,teamfight',
  'Yi Sun-shin': 'Assassin/Marksman | Jungle/Gold | late,burst',
  Yin: 'Fighter/Assassin | Jungle/EXP | pickoff,burst',
  'Yu Zhong': 'Fighter | EXP | sustain,teamfight',
  Yve: 'Mage | Mid | poke,teamfight,cc',
  Zetian: 'Mage | Mid | burst,poke',
  Zhask: 'Mage | Mid | push',
  Zhuxin: 'Mage | Mid/Roam | cc,teamfight,sustain',
  Zilong: 'Fighter/Assassin | EXP/Jungle | push,early',
};

const parse = (raw: string): HeroInfo => {
  const [c, l, t] = raw.split('|').map((s) => s.trim());
  return { classes: c.split('/') as HeroClass[], lanes: l.split('/') as Role[], traits: t.split(',') as HeroTrait[] };
};

const BY_KEY: Record<string, HeroInfo> = Object.fromEntries(Object.entries(RAW).map(([name, raw]) => [name.toLowerCase(), parse(raw)]));

// ── Heroes added in Settings (new releases) ─────────────────────────────────
const CLASSES = ['Tank', 'Fighter', 'Assassin', 'Mage', 'Marksman', 'Support'];
const LANES = ['EXP', 'Jungle', 'Mid', 'Gold', 'Roam'];
const DEFAULT_TRAITS: Record<string, HeroTrait[]> = { Tank: ['tank', 'cc'], Fighter: ['sustain', 'dive'], Assassin: ['burst', 'mobility'], Mage: ['burst', 'poke'], Marksman: ['late', 'poke'], Support: ['protect', 'sustain'] };
let extraNames: string[] = [];

/** Register heroes typed in Settings → Heroes (called whenever settings load). */
export function registerExtraHeroes(list: { name: string; classes?: string; lanes?: string }[] = []) {
  extraNames = [];
  for (const h of list) {
    const name = h.name?.trim();
    if (!name || MLBB_HEROES.some((x) => x.toLowerCase() === name.toLowerCase())) continue;
    extraNames.push(name);
    const classes = (h.classes ?? '').split(/[\/,]/).map((c) => CLASSES.find((x) => x.toLowerCase() === c.trim().toLowerCase())).filter(Boolean) as HeroClass[];
    const lanes = (h.lanes ?? '').split(/[\/,]/).map((l) => LANES.find((x) => x.toLowerCase() === l.trim().toLowerCase())).filter(Boolean) as Role[];
    BY_KEY[name.toLowerCase()] = { classes: classes.length ? classes : ['Fighter'], lanes, traits: DEFAULT_TRAITS[classes[0] ?? 'Fighter'] };
  }
}

/** Every hero the system knows: the built-in roster + heroes added in Settings. */
export const allHeroes = () => (extraNames.length ? [...MLBB_HEROES, ...extraNames].sort((a, b) => a.localeCompare(b)) : MLBB_HEROES);

/** Canonical spelling of a hero name ("ling" → "Ling"), or the input trimmed if unknown. */
export function canonicalHero(name: string): string {
  const key = name.trim().toLowerCase();
  return allHeroes().find((h) => h.toLowerCase() === key) ?? name.trim();
}

/** Heroes matching what was typed: exact/prefix first, then anywhere in the name. */
export function searchHeroes(query: string, exclude: Set<string> = new Set(), limit = 8): string[] {
  const q = query.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!q) return [];
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, '');
  const pool = allHeroes().filter((h) => !exclude.has(h.toLowerCase()));
  const starts = pool.filter((h) => norm(h).startsWith(q) || h.toLowerCase().split(/[\s-]/).some((w) => w.startsWith(query.trim().toLowerCase())));
  const contains = pool.filter((h) => !starts.includes(h) && norm(h).includes(q));
  // Shorter names first, so "fre" + Enter gives Freya before Fredrinn.
  const byLength = (x: string, y: string) => x.length - y.length || x.localeCompare(y);
  return [...starts.sort(byLength), ...contains.sort(byLength)].slice(0, limit);
}

export const heroInfo = (name: string): HeroInfo | null => BY_KEY[name.trim().toLowerCase()] ?? null;

// Reasons and hype, most telling trait first.
const BAN_REASON: Record<HeroTrait, string> = {
  dive: 'para hindi mahirapan ang backline nila',
  burst: 'para walang biglang mabubura sa isang combo',
  cc: 'para iwas sa malalakas na crowd control at initiation',
  mobility: 'para walang makakatakas o makakahabol sa kanila',
  sustain: 'para hindi tumagal sa laban ang kalaban',
  late: 'para hindi na umabot sa late game ang banta',
  early: 'para hindi sila ma-pressure nang maaga',
  poke: 'para hindi sila ma-poke mula sa malayo',
  protect: 'para mawalan ng proteksyon ang carry ng kalaban',
  push: 'para hindi mabilis bumagsak ang mga tore nila',
  teamfight: 'para hindi sila matalo sa malalaking teamfight',
  pickoff: 'para iwas pick-off sa mga rotation',
  objective: 'para hindi sila maunahan sa Turtle at Lord',
  tank: 'para walang matibay na frontline ang kalaban',
};
const PICK_HYPE: Record<HeroTrait, string> = {
  dive: 'siguradong puntirya niya ang backline',
  burst: 'isang combo lang, tapos agad ang kalaban',
  cc: 'maraming crowd control para sa teamfight',
  late: 'pang-late game na carry ito',
  early: 'malakas na pressure sa early game',
  sustain: 'matibay sa mahahabang laban',
  poke: 'kayang mag-poke mula sa malayo',
  mobility: 'napakabilis gumalaw sa mapa',
  protect: 'proteksyon para sa carry ng team',
  teamfight: 'halimaw sa malalaking teamfight',
  pickoff: 'handang mang-pick off sa mga rotation',
  push: 'mabilis magpabagsak ng mga tore',
  tank: 'matibay na frontline ng team',
  objective: 'mabilis kumuha ng Turtle at Lord',
};
const CLASS_LABEL: Record<HeroClass, string> = { Tank: 'tank', Fighter: 'fighter', Assassin: 'assassin', Mage: 'mage', Marksman: 'marksman', Support: 'support' };

const pick = <T,>(arr: T[], seed: number) => arr[Math.abs(seed) % arr.length];

/** Why a team would ban this hero (lower-case clause starting with "para…"). */
export function banReason(hero: string, seed = 0): string {
  const info = heroInfo(hero);
  if (!info) return 'para hindi nila ito makaharap ngayong game';
  return BAN_REASON[pick(info.traits.slice(0, 2), seed)];
}

/** What a hero brings to the draft (lower-case clause). */
export function pickHype(hero: string, seed = 0): string {
  const info = heroInfo(hero);
  if (!info) return 'malaking dagdag sa lineup nila';
  return PICK_HYPE[pick(info.traits.slice(0, 2), seed)];
}

/** "assassin", "mage/support"… */
export const heroClassLabel = (hero: string) => {
  const info = heroInfo(hero);
  return info ? info.classes.map((c) => CLASS_LABEL[c]).join('/') : 'hero';
};
