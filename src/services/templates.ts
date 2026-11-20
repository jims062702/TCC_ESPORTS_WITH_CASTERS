import type { GameEvent, ScriptEntry } from '@/types';
import type { CommentaryFacts } from './facts';
import { CASTER_BY_ID, leadCaster, type CasterId } from './casters';
import { MAJOR_GROUPS, PERSONA_ACK, PERSONA_VOICE, composeLine, groupForKey, libraryStats, type LineGroup } from './personaLines';
import { formatGold, pickRandom } from '@/lib/utils';
import { heroSkills } from '@/lib/heroSkills';

// ─────────────────────────────────────────────────────────────────────────────
// Pre-written shoutcast library ("pre-shoutcasts").
//
// Every line is a template with {placeholders} that are filled ONLY from the
// verified fact sheet — so the casters can't invent anything. If a line needs
// a value that isn't known (e.g. {hero} before heroes are assigned), that
// line is skipped automatically.
//
// The built-in library below is merged with lines that Gemini pre-generates
// once in the Caster Booth (scripts/library). During a match most events are
// voiced from this library, so live Gemini calls are only spent where they
// add the most (replays with a description, series wins, draft breakdowns).
//
// Note: steals of Turtle / Lord / Buff are never attributed to Retribution —
// any hero can land the last hit. Lines say "slain by {player}" instead.
// ─────────────────────────────────────────────────────────────────────────────

export const SCRIPT_KEYS = [
  'DRAFT_START',
  'DRAFT_START_FIRST',
  'DRAFT_START_MATCHPOINT',
  'DRAFT_START_DECIDER',
  'GAME_START',
  'GAME_START_FIRST',
  'GAME_START_MATCHPOINT',
  'GAME_START_DECIDER',
  'BREAK_START',
  'BREAK_START_NEXT',
  'BREAK_START_PAUSE',
  'KILL',
  'SAVAGE_MORE',
  'FIRST_BLOOD_VICTIMS',
  'DOUBLE_KILL_VICTIMS',
  'TRIPLE_KILL_VICTIMS',
  'MANIAC_VICTIMS',
  'DRAFT_BAN',
  'DRAFT_BAN_NONE',
  'DRAFT_BAN_TARGET',
  'DRAFT_BAN_HISTORY',
  'DRAFT_PICK',
  'DRAFT_PICK_SIGNATURE',
  'DRAFT_TALK',
  'DRAFT_TALK_BAN',
  'DRAFT_TALK_PICK',
  'DRAFT_TALK_META',
  'DRAFT_TALK_STORY',
  'DRAFT_TALK_MATCHUP',
  'POSTGAME_TALK',
  'POSTGAME_TALK_SERIES',
  'POSTGAME_TALK_CHAMPION',
  'BREAK_TALK',
  'BANTER_PLAYER',
  'BANTER_MATCHUP',
  'BANTER_TIME',
  'GAME_INTRO',
  'GAME_INTRO_FIRST',
  'GAME_INTRO_MATCHPOINT',
  'GAME_INTRO_DECIDER',
  'DRAFT_COMPLETE',
  'FIRST_BLOOD',
  'DOUBLE_KILL',
  'TRIPLE_KILL',
  'MANIAC',
  'SAVAGE',
  'OBJECTIVE_CONTEST',
  'TURTLE',
  'TURTLE_STEAL',
  'TURTLE_HEALING',
  'TURRET',
  'TURRET_GOLDEN',
  'INVADE',
  'INVADE_BUFF',
  'GAME_START_ELIMINATION',
  'WISP_REVEAL',
  'MAP_EFFECT',
  'MAP_EFFECT_WISPS',
  'MAP_EFFECT_TURTLE',
  'MAP_EFFECT_TURRET',
  'MAP_EFFECT_CLOUD',
  'BANTER_MAP',
  'LORD',
  'LORD_STEAL',
  'BUFF',
  'BUFF_STEAL',
  'GOLD_UPDATE',
  'GOLD_EVEN',
  'SPELL_USED',
  'SPELL_USED_ESCAPE',
  'SPELL_USED_RETRI',
  'OBJECTIVE_RETRI_BOTH',
  'OBJECTIVE_RETRI_DOWN',
  'INVADE_RETRI_DOWN',
  'BANTER_RETRI',
  'LEVEL_MAX',
  'LEVEL_MAX_RECORD',
  'LEVEL_MAX_FIRST',
  'MULTIKILL_ULT',
  'DRAFT_PICK_SKILL',
  'INSTANT_REPLAY',
  'GAME_RESULT',
  'GAME_RESULT_MATCHPOINT',
  'GAME_RESULT_TIED',
  'SERIES_VICTORY',
  'SERIES_VICTORY_CHAMPION',
  'IDLE_BANTER',
] as const;
export type ScriptKey = (typeof SCRIPT_KEYS)[number];

/** Placeholders a script line may use (also sent to Gemini for pre-generation). */
export const SCRIPT_PLACEHOLDERS: Record<string, string> = {
  player: 'IGN of the player involved',
  hero: "that player's hero",
  team: "the player's / objective team",
  enemy: 'the opposing team',
  kda: 'player K/D/A like 5/1/3',
  kills: "team's total kills",
  objCount: 'how many of this objective the team has now',
  objective: 'Turtle, Lord or Buff',
  effect: "this game's battlefield effect (Revealing Wisps, Healing Turtle, Golden Turret, Flying Cloud)",
  tier: 'turret destroyed: Outer, Inner or Base',
  turretCount: 'how many turrets that team has destroyed',
  objectiveUpper: 'TURTLE, LORD or BUFF (for all-caps hype calls)',
  spell: 'battle spell name',
  cooldown: 'spell cooldown in seconds',
  leader: 'team ahead in gold',
  trailer: 'team behind in gold',
  gold: 'gold lead like 2.5k',
  blueTeam: 'blue side team',
  redTeam: 'red side team',
  blueKills: 'blue team kills',
  redKills: 'red team kills',
  blueTurtles: 'blue turtles',
  redTurtles: 'red turtles',
  blueLords: 'blue lords',
  redLords: 'red lords',
  bluePicks: 'blue heroes picked',
  redPicks: 'red heroes picked',
  teamA: 'series team A',
  teamB: 'series team B',
  seriesScore: 'series score text',
  mpTeam: 'team on match point',
  gameNumber: 'game number',
  format: 'Best of 3 / Best of 5…',
  winsNeeded: 'wins needed to take the series',
  winner: 'game/series winner',
  loser: 'game/series loser',
  winnerScore: "winner's series wins",
  loserScore: "loser's series wins",
  tournament: 'tournament name',
  stage: 'bracket stage',
  replayTitle: 'replay headline',
  replayDesc: 'what the replay shows',
  spellWatch: 'a spell currently on cooldown',
  heroUlt: "the hero's ultimate, by its real skill name (e.g. Tempest of Blades)",
  heroSkill: "one of the hero's regular skills, by its real name (e.g. Defiant Sword)",
  blueJungler: 'blue side jungler (has Retribution)',
  redJungler: 'red side jungler (has Retribution)',
  downJungler: 'the jungler whose Retribution is on cooldown',
  downTeam: "that jungler's team",
  upJungler: 'the jungler whose Retribution is ready',
  upTeam: "the team whose jungler's Retribution is ready",
  retriSecs: 'seconds until that Retribution is back',
  levelTime: 'game time the player reached Level 15, like 8:13',
  prevTime: 'the Level 15 record before this one, like 9:02',
  prevPlayer: 'who set that record',
  partner: 'the OTHER caster on the desk (the one being spoken to), e.g. "Ate Lyka"',
  me: 'the caster speaking this line',
  breakMins: 'break length in minutes',
  breakMessage: 'the break message typed by the producer',
  nextGame: 'the game number after the break',
  heroClass: 'hero class, e.g. assassin',
  banReason: 'why ban it (lower-case clause starting with "para"), e.g. para hindi mahirapan ang backline nila',
  pickHype: 'what the hero brings (lower-case clause), e.g. siguradong puntirya niya ang backline',
  targetPlayer: 'enemy player whose signature hero was banned',
  targetRecord: 'that player\'s record on the hero (full sentence)',
  prevGame: 'an earlier game number of this series',
  poolRecord: 'the player\'s record on this hero (full sentence)',
  position: 'position, e.g. Jungler',
  candHero: 'a hero that might be banned/picked next',
  candPlayer: 'the player known for that hero',
  candRecord: 'that player\'s record on it (full sentence)',
  metaHero: 'a popular hero of this tournament still available',
  metaCount: 'how many times it was picked or banned',
  phaseName: 'draft phase name, e.g. Ban Phase 2',
  prevWinner: 'winner of an earlier game',
  prevLoser: 'loser of that game',
  prevWinnerPicks: 'two heroes the winner used then',
  spotPlayer: 'a player in the spotlight',
  spotHero: 'their hero',
  spotKda: 'their K/D/A',
  spotTeam: 'their team',
  blueHero: 'blue hero in the matchup',
  redHero: 'red hero in the matchup',
  bluePlayer: 'blue player in the matchup',
  redPlayer: 'red player in the matchup',
  gameMinute: 'minutes into the game',
  victim: 'the player who was killed',
  victims: 'everyone killed in this streak, e.g. "B1, B2 at B3"',
  victimCount: 'how many were killed in this streak',
  victimHero: "the killed player's hero",
};

type Pair = [string, string];

const BUILTIN: Record<ScriptKey, Pair[]> = {
  // ── Invades: a team goes into the enemy jungle ──
  INVADE: [
    ['May planong pag-invade ang {team}!', 'Mukhang papasukin nila ang jungle ng {enemy} — kukunin ata ang mga jungle creeps!'],
    ['Invade! Pumasok ang {team} sa jungle ng {enemy}!', 'Delikado yan, {partner} — kapag nahuli sila, teamfight agad.'],
    ['Uy, nasa jungle na ng {enemy} ang {team}!', 'Gutom na gutom — pati creeps ng kalaban, kinukuha na!'],
    ['Ang tapang ng {team} — counter-jungle!', 'Pinapahirapan nila ang jungler ng {enemy}. Mawawalan yan ng gold at experience.'],
    ['Invasion, mga ka-TCC! Papasok ang {team}!', 'Kung hindi makakasagot agad ang {enemy}, malaking lamang ito para sa {team}.'],
    ['Abangan niyo — lumalapit ang {team} sa jungle ng {enemy}.', 'Mukhang may plano silang nakawin ang farm. Babantayan kaya ito ng {enemy}?'],
  ],
  INVADE_BUFF: [
    ['May planong pag-invade ang {team} — mukhang buff ang target!', 'Kapag nakuha nila yan, malaking dagok sa jungler ng {enemy}.'],
    ['Buff steal attempt! Papasok ang {team}!', 'Sino kaya ang makakakuha ng buff — {team} o {enemy}?'],
    ['Inaabangan ng {team} ang buff ng {enemy}!', 'Tamang timing lang ang kailangan, {partner} — isang huling hit lang!'],
    ['Ang lakas ng loob — aagawin ng {team} ang buff ng {enemy}!', 'Pag nakuha yan, babagal ang farm ng kalaban sa mga susunod na minuto.'],
    ['Nasa buff na ng {enemy} ang {team}!', 'Ito yung klase ng laro na nananalo ng tempo — matapang, pero kalkulado.'],
  ],
  // ── Game start in an elimination series (lower bracket, single elimination, grand final) ──
  GAME_START_ELIMINATION: [
    ['Simulan na natin ang Game {gameNumber} ng {stage}!', 'Do-or-die ito, mga ka-TCC — ang matatalo sa seryeng ito, uuwi na.'],
    ['Simula na ang Game {gameNumber} ng {stage} — elimination na ito!', 'Wala nang bukas para sa matatalo, {partner}. Lahat ibubuhos dito.'],
    ['Ito na, simula na ang Game {gameNumber} ng {stage}!', 'Isang serye na lang ang pagitan ng {teamA} at {teamB} sa pag-uwi. Sino ang mananatili?'],
    ['Welcome sa Game {gameNumber} ng {stage} — tara na!', 'Sa ganitong serye, isang pagkakamali lang, tapos na ang kampanya.'],
  ],
  // ── 2026 map: battlefield effects, turrets, wisps ──
  MAP_EFFECT: [
    ['Battlefield effect ngayong game: {effect}!', 'Iba ang takbo ng laro dito — kailangan nilang mag-adjust agad, {partner}.'],
    ['{effect} ang lumabas sa mapa ngayon!', 'Abangan natin kung sinong team ang mas handa diyan.'],
  ],
  MAP_EFFECT_WISPS: [
    ['Revealing Wisps ang battlefield effect ngayong game!', 'Delikado ang magtago sa bush — isang wisp lang, kita ka na agad.'],
    ['May Revealing Wisps tayo sa mapa, mga ka-TCC!', 'Kaya yung mga assassin, ingat sa ambush — lalabas at lalabas ang posisyon nila.'],
    ['Revealing Wisps! Vision ang magiging laban dito.', 'Kung sino ang maagap kumuha ng wisp, sila ang may mata sa mapa, {partner}.'],
    ['Battlefield effect: Revealing Wisps.', 'Mahirap mag-flank ngayon — hinahabol ng wisp ang mga nagtatago.'],
  ],
  MAP_EFFECT_TURTLE: [
    ['Healing Turtle ang battlefield effect ngayong game!', 'Walang shield ang Turtle dito — pero may kakamping Turtle na tutulak at magpapagaling sa team!'],
    ['Healing Turtle, mga ka-TCC!', 'Kaya sobrang importante ng Turtle — hindi lang gold, may kasama pang tutulak sa lane ng kalaban.'],
    ['Ayan, Healing Turtle ang lumabas!', 'Kapag nakuha mo ang Turtle, tuloy ang push — mabilis pa ang heal ng mga kakampi sa paligid, {partner}.'],
  ],
  MAP_EFFECT_TURRET: [
    ['Golden Turret ang battlefield effect ngayong game!', 'Bawat turret na babagsak, malaking gold para sa buong team — kaya bawat tower, ipaglalaban!'],
    ['Golden Turret, mga ka-TCC!', 'Mas makapal ang inner at base turret, pero sulit na sulit ang gold kapag nabasag.'],
    ['May Golden Turret tayo ngayon!', 'Abangan ang split push, {partner} — isang tower lang, pwedeng mag-iba ang gold lead.'],
  ],
  MAP_EFFECT_CLOUD: [
    ['Flying Cloud ang mapa ngayong game!', 'Bagong itsura lang ng ulap — walang binago sa objectives, kaya purong galing ang labanan dito.'],
    ['Flying Cloud ang battlefield ngayon.', 'Classic na laro, {partner} — walang special effect na masasandalan.'],
  ],
  TURRET: [
    ['Bagsak ang {tier} turret! Sa {team} ang tower!', 'Lumalawak ang mapa para sa {team} — mas madali na ang rotation nila.'],
    ['TURRET DOWN! Wasak ang {tier} turret ng {enemy}!', 'Ganyan ang tamang pag-convert ng advantage, {partner}.'],
    ['Isa pang tower para sa {team}!', '{turretCount} turret na ang nabasag nila — tuloy ang pressure!'],
    ['Wasak ang turret! {team} ang may gawa!', 'Kailangan nang dumepensa ng {enemy}, kung hindi, lalaki pa ang lamang.'],
  ],
  TURRET_GOLDEN: [
    ['GOLDEN TURRET! Bagsak ang {tier} turret ng {enemy}!', 'Ang laking gold niyan para sa buong {team}!'],
    ['Golden Turret para sa {team}!', 'Lahat sila may dagdag na gold — ramdam agad yan sa items!'],
    ['Wasak ang tower — at golden pa!', 'Ganyan ang laro sa Golden Turret, {partner} — bawat push, may bonus na ginto.'],
  ],
  WISP_REVEAL: [
    ['Nahuli ng wisp! Kita na ang nagtatago!', 'Salamat sa Revealing Wisp — wala nang surprise attack mula sa {enemy}.'],
    ['Lumipad ang wisp — revealed!', 'Ang galing ng {team}, hawak nila ang vision ngayon.'],
    ['WISP REVEAL para sa {team}!', 'Ayan ang lumabas sa bush — hindi na sila makakapag-ambush, {partner}.'],
    ['Kinuha ni {player} ang wisp — at may nakita!', 'Ganyan kahalaga ang vision sa ganitong battlefield.'],
  ],
  TURTLE_HEALING: [
    ['HEALING TURTLE para sa {team}! Slain by {player}!', 'At ngayon, may kasamang Turtle sa push — mabilis pa ang heal ng mga kakampi sa paligid!'],
    ['Nakuha ng {team} ang Turtle — Healing Turtle!', 'Tutulak ang kakampi nilang Turtle sa lane ng {enemy}. Kailangan nang dumepensa!'],
    ['Sa {team} ang Healing Turtle!', 'Walang shield, pero may Turtle companion — perfect sa turret push, {partner}.'],
  ],
  BANTER_MAP: [
    ['Tandaan natin, {effect} ang battlefield effect ngayon.', 'Kaya iba ang galaw ng mga team — inaayon nila ang rotation diyan.'],
    ['Sa {effect}, iba ang priority sa mapa.', 'Kung sino ang mas mabilis mag-adapt, siya ang may lamang, {partner}.'],
  ],
  // ── Drafting phase welcome (automatic on Go live / next game) ────────────
  // {partner} = the other caster on the desk, so the lead greets them by name
  // and the reply thanks the lead by name.
  DRAFT_START: [
    ['Welcome sa drafting phase natin, partner {partner}! Game {gameNumber} na!', 'Salamat, {partner}! {seriesScore} ang serye — tingnan natin kung may adjustment sa draft.'],
    ['Balik tayo sa draft! Welcome sa drafting phase natin, partner {partner}!', 'Salamat, {partner}! Bagong game, bagong draft — siguradong may natutunan ang dalawang team sa nakaraang laro.'],
    ['Partner {partner}, welcome sa drafting phase natin para sa Game {gameNumber}!', 'Salamat, {partner}! Sa {format} na ito, {seriesScore} — kaya ang draft na ito, napakahalaga.'],
    ['Welcome sa drafting phase natin, partner {partner}! Tayo naman ang nasa desk para sa Game {gameNumber}!', 'Salamat, {partner}! Excited ako sa draft na ito — {seriesScore} ang serye.'],
    ['Welcome sa drafting phase natin, partner {partner}! {blueTeam} sa blue side, {redTeam} sa red side.', 'Salamat, {partner}! Abangan natin ang mga ban — dito madalas makikita ang adjustment ng bawat team.'],
    ['Ito na ang drafting phase ng Game {gameNumber}! Welcome, partner {partner}!', 'Salamat, {partner}! Tingnan natin kung sino ang unang magpapakita ng bagong diskarte.'],
    ['Welcome sa drafting phase natin, partner {partner}! Game {gameNumber}, at mainit pa rin ang serye!', 'Salamat, {partner}! Kailangan ng {winsNeeded} panalo, kaya bawat pick dito, kailangang tama.'],
    ['Partner {partner}, welcome sa drafting phase natin! Ano kaya ang unang ban ngayong Game {gameNumber}?', 'Salamat, {partner}! Yan ang aabangan natin — doon makikita kung ano ang kinatatakutan ng bawat team.'],
    ['Mga ka-TCC, balik na tayo! Welcome sa drafting phase natin, partner {partner}!', 'Salamat, {partner}! Game {gameNumber} ng {stage} — {teamA} at {teamB}, handa na sa susunod na round.'],
    ['Welcome sa drafting phase natin, partner {partner}! Game {gameNumber} ng {format}!', 'Maraming salamat, {partner}! Panibagong draft, panibagong chess match sa pagitan ng {teamA} at {teamB}.'],
  ],
  DRAFT_START_FIRST: [
    ['Magandang araw, mga ka-TCC! Welcome sa drafting phase natin, partner {partner}!', 'Salamat, {partner}! Game {gameNumber} ng {format} — {teamA} laban sa {teamB}. Dito na magsisimula ang lahat!'],
    ['Welcome sa drafting phase natin, partner {partner}! Simula na ng {stage} ng {tournament}!', 'Salamat, {partner}! Unang draft ng serye — dito natin makikita ang game plan ng {teamA} at {teamB}.'],
    ['Ako si {me}, at welcome sa drafting phase natin, partner {partner}!', 'Salamat, {partner}! Game {gameNumber}, {blueTeam} sa blue side at {redTeam} sa red side. Tara, simulan na natin ang draft!'],
    ['Mga ka-TCC, welcome sa {tournament}! At welcome sa drafting phase natin, partner {partner}!', 'Salamat, {partner}! Excited na ako — unang draft ng {format} sa pagitan ng {teamA} at {teamB}!'],
    ['Handa na ang lahat! Welcome sa drafting phase natin, partner {partner}!', 'Maraming salamat, {partner}! Unang draft, unang diskarte — sino kaya ang mas handa ngayong Game {gameNumber}?'],
    ['Welcome sa drafting phase natin, partner {partner}! Game {gameNumber} ng {format}, {teamA} kontra {teamB}!', 'Salamat, {partner}! Kailangan ng {winsNeeded} panalo para makuha ang serye — kaya bawat pick, mahalaga.'],
    ['Magandang araw sa lahat ng nanonood! Partner {partner}, welcome sa drafting phase natin!', 'Salamat, {partner}! At anong klaseng serye ang naghihintay sa atin — {teamA} laban sa {teamB}!'],
  ],
  DRAFT_START_MATCHPOINT: [
    ['Welcome sa drafting phase natin, partner {partner}! Match point ang {mpTeam}!', 'Salamat, {partner}! {seriesScore} — isang panalo na lang ang kailangan ng {mpTeam}. Pressure draft ito!'],
    ['Partner {partner}, welcome sa drafting phase natin! Game {gameNumber}, at nasa match point ang {mpTeam}.', 'Salamat, {partner}! Kung ako ang kabilang team, ito na ang draft na hindi pwedeng magkamali.'],
    ['Welcome sa drafting phase natin, partner {partner}! Ito na ba ang huling draft ng serye?', 'Salamat, {partner}! Match point ang {mpTeam} — kaya bawat ban at pick dito, may bigat.'],
    ['Welcome sa drafting phase natin, partner {partner}! {seriesScore}, at isang panalo na lang para sa {mpTeam}!', 'Salamat, {partner}! Kailangan ng kalaban ng sagot — at magsisimula ang sagot na yan dito sa draft.'],
  ],
  DRAFT_START_DECIDER: [
    ['Welcome sa drafting phase natin, partner {partner}! Deciding game na ito!', 'Salamat, {partner}! {seriesScore} — ang huling draft ng serye. Lahat nakataya!'],
    ['Partner {partner}, welcome sa drafting phase natin — Game {gameNumber}, winner-take-all!', 'Salamat, {partner}! Wala nang bukas — ang mananalo dito, siya ang aabante.'],
    ['Welcome sa drafting phase natin, partner {partner}! Ito na ang pinakamahalagang draft ng serye!', 'Salamat, {partner}! Tabla ang {teamA} at {teamB}. Sino kaya ang may huling alas?'],
    ['Welcome sa drafting phase natin, partner {partner}! Game {gameNumber} na, at tabla ang serye!', 'Salamat, {partner}! Sa deciding game, minsan ang draft na ang nagdedesisyon ng lahat.'],
  ],

  // ── Game start (automatic on Start game) — always says the game number ──
  GAME_START: [
    ['Simulan na natin ang Game {gameNumber} ng {stage}!', '{teamA} laban sa {teamB} — tara na, mga ka-TCC!'],
    ['Simula na ang Game {gameNumber} ng {stage} — live na!', 'Sino ang unang makakakuha ng momentum, {partner}?'],
    ['At magsisimula na ang laro! Welcome sa Game {gameNumber}, mga ka-TCC!', '{seriesScore} ang serye — tingnan natin kung sino ang aangat dito.'],
    ['Welcome sa Game {gameNumber}! Simula na ang laban, mga ka-TCC!', 'Bagong game, bagong pagkakataon para sa {teamA} at {teamB}.'],
    ['Game {gameNumber}, let the battle begin! Welcome sa laro, mga ka-TCC!', 'Kumpleto na ang draft — oras na para patunayan ito sa Land of Dawn.'],
    ['Nandito na tayo sa Game {gameNumber}! Welcome sa laro, mga ka-TCC!', '{blueTeam} sa blue side, {redTeam} sa red side — {seriesScore} ang serye.'],
    ['Tapos na ang draft, simula na ang laban! Welcome sa Game {gameNumber}!', 'Sa {format}, bawat game ay ginto. Tara, panoorin natin!'],
    ['Welcome sa Game {gameNumber} ng {format}, mga ka-TCC! Ito na ang aksyon!', 'Kailangan ng {winsNeeded} panalo para makuha ang serye. {seriesScore} ngayon.'],
    ['Game {gameNumber}, simula na! Welcome sa laro, mga ka-TCC!', 'Maghanda na kayo ng meryenda — dahil siguradong mainit ito!'],
    ['Ayan na, pasok na ang sampung bayani! Welcome sa Game {gameNumber}!', '{teamA} at {teamB} — sino kaya ang unang makakakuha ng momentum?'],
  ],
  GAME_START_FIRST: [
    ['At magsisimula na ang laro! Welcome sa Game {gameNumber}, mga ka-TCC!', 'Unang laro ng {format} — {teamA} laban sa {teamB}. Let the battle begin!'],
    ['Welcome sa Game {gameNumber} ng {stage}! Ito na, mga ka-TCC — simula na ang laban!', 'Kumpleto na ang draft, nasa Land of Dawn na ang sampung bayani. Tara na!'],
    ['Game {gameNumber}, mga ka-TCC! Welcome sa unang laro ng serye!', '{blueTeam} sa blue, {redTeam} sa red. Sino kaya ang unang makakapuntos?'],
    ['Ito na! Welcome sa Game {gameNumber} ng {tournament}!', 'Kailangan ng {winsNeeded} panalo para umabante — at magsisimula ang lahat ngayon!'],
    ['Simula na ang Game {gameNumber}! Welcome sa laro, mga ka-TCC!', 'Unang laro, pero napakahalaga ng momentum. Good luck sa {teamA} at {teamB}!'],
  ],
  GAME_START_MATCHPOINT: [
    ['Welcome sa Game {gameNumber}, mga ka-TCC! Match point ang {mpTeam}!', 'Isang panalo na lang para sa {mpTeam} — pero hindi pa sumusuko ang kalaban!'],
    ['Simula na ang Game {gameNumber}! Ito na ba ang huling laro ng serye?', 'Nasa match point ang {mpTeam}. {seriesScore}. Lahat ng mata, nasa larong ito!'],
    ['Game {gameNumber}, welcome sa laro! Pressure game ito, mga ka-TCC!', 'Match point ang {mpTeam} — kailangang lumaban nang todo ng kabila para manatiling buhay.'],
    ['At magsisimula na ang Game {gameNumber}! Match point, mga ka-TCC!', 'Kaya bang tapusin ng {mpTeam} ang serye ngayon? Abangan natin!'],
  ],
  GAME_START_DECIDER: [
    ['DECIDING GAME! Welcome sa Game {gameNumber}, mga ka-TCC!', '{seriesScore} — ang mananalo dito, siya ang aabante. Lahat nakataya!'],
    ['Welcome sa Game {gameNumber}, ang winner-take-all! Simula na!', 'Isang laro na lang ang magdedesisyon sa pagitan ng {teamA} at {teamB}.'],
    ['Ito na ang huling laro! Welcome sa Game {gameNumber}, mga ka-TCC!', 'Wala nang bukas — iiwan na ng dalawang team ang lahat sa larong ito!'],
    ['Game {gameNumber}, ang deciding game! Simula na ang laban!', 'Huwag kayong kukurap, mga ka-TCC — bawat desisyon dito, pwedeng tumapos ng serye.'],
  ],

  // ── Single kill (+1 Kill: killer and victim chosen by the operator) ───────
  KILL: [
    ['Napatay ni {player} si {victim}!', 'Isa pang kill para sa {team} — {kills} na ang kills nila.'],
    ['Bagsak si {victim}! {player} ang tumapos.', 'Kailangang mag-ingat ng {enemy} sa rotation nila.'],
    ['{player} gamit ang {hero}, pinatumba si {victim}!', 'Malinis ang execution ng {team}.'],
    ['Pick-off! Tinamaan ni {player} si {victim}.', 'Isang player down para sa {enemy} — window yan para sa {team}.'],
    ['Kill para kay {player}!', 'Si {victim} ang nabiktima — {kda} na ang KDA ni {player}.'],
    ['Hindi nakatakas si {victim}!', 'Sinundan siya ni {player} hanggang dulo.'],
    ['Bumagsak ang {victimHero} ni {victim}!', 'Si {player} ang may kill — tuloy ang pressure ng {team}.'],
    ['{player}, may kill na naman!', 'Wala nang nagawa si {victim}. {blueTeam} {blueKills}, {redTeam} {redKills} na ang kills.'],
  ],

  // ── Kill streaks that name the players who died (picked in the controller) ──
  FIRST_BLOOD_VICTIMS: [
    ['FIRST BLOOD! Si {victim} ang unang bumagsak — kay {player} ang kill!', 'Unang dugo para sa {team}. Malaking simula ito!'],
    ['Unang patay ng laro: si {victim}! {player} ang may first blood!', 'Maagang lamang para sa {team}.'],
  ],
  DOUBLE_KILL_VICTIMS: [
    ['DOUBLE KILL! {player} — bagsak sina {victims}!', 'Dalawang player agad ang nawala sa {enemy}!'],
    ['Dalawa agad para kay {player}: {victims}!', 'Hindi nakaporma ang {enemy}!'],
  ],
  TRIPLE_KILL_VICTIMS: [
    ['TRIPLE KILL! Pinatumba ni {player} sina {victims}!', 'Tatlo ang down — malaking butas yan para sa {enemy}!'],
    ['Tatlo na kay {player}! {victims} — lahat bumagsak!', 'Ang lakas ng teamfight ng {team}!'],
  ],
  MANIAC_VICTIMS: [
    ['MANIAC! Apat na — {victims}! {player}, isa na lang!', 'Isang kill na lang para sa SAVAGE, mga ka-TCC!'],
    ['APAT NA! Bagsak sina {victims} kay {player}!', 'Isa na lang ang natitira sa {enemy}!'],
  ],

  // ── Savage continuation (more kills inside the 10-second window) ─────────
  SAVAGE_MORE: [
    ['HINDI PA TAPOS! Dagdag pa si {player}: {victims}!', 'Tuloy ang savage — wala nang makakapigil sa kanya!'],
    ['SAVAGE PA RIN! {player}, may {victimCount} pa!', 'Si {victims} ang dagdag sa listahan. Grabe ang performance na ito!'],
    ['Ayaw tumigil ni {player}! Bumagsak din si {victims}!', 'Ito na yata ang pinakamagandang laro niya ngayong torneo.'],
  ],

  // ── Draft play-by-play (every lock) ───────────────────────────────────────
  DRAFT_BAN_NONE: [
    ['Walang ibinan ang {team}!', 'Kumpiyansa sila — handa silang harapin ang kahit anong hero.'],
    ['Skip ang ban ng {team}.', 'Interesante yan — mukhang may plano silang hindi pa natin nakikita.'],
    ['Walang ban mula sa {team} ngayon.', 'Bukas pa ang lahat ng opsyon para sa {enemy}.'],
  ],
  DRAFT_BAN: [
    ['Binan ng {team} ang {hero} — {banReason}.', 'Matalinong ban yan. Ayaw nilang makaharap ang {hero} ngayong Game {gameNumber}.'],
    ['Ban mula sa {team}: {hero}!', 'Tama lang — {banReason}.'],
    ['Wala munang {hero} sa larong ito — ibinan ng {team}.', 'Malinaw ang dahilan: {banReason}.'],
    ['Tinanggal ng {team} ang {hero} sa draft.', 'Delikadong {heroClass} yan — {banReason}.'],
    ['Ayan, {hero} ang ban ng {team}.', 'Respeto sa {hero} yan — {banReason}.'],
    ['Ibinan ng {team} ang {hero}!', 'Hindi na kailangang ipaliwanag — {banReason}.'],
    ['Isa pang ban mula sa {team}: {hero}.', 'Paunti nang paunti ang mga opsyon ng {enemy}.'],
    ['Locked ang ban: {hero}!', 'Desisyon ng {team} yan — {banReason}.'],
  ],
  DRAFT_BAN_TARGET: [
    ['TARGET BAN! Binan ng {team} ang {hero}!', 'Signature hero yan ni {targetPlayer} ng {enemy} — ayaw nilang makita yan sa kabila!'],
    ['Binan ng {team} ang {hero} — hero yan ni {targetPlayer}!', '{targetRecord} Kaya hindi na nila ito pinalampas.'],
    ['Diretso kay {targetPlayer}! Ibinan ng {team} ang {hero}.', 'Kailangang mag-adjust ni {targetPlayer} — wala na ang isa sa mga paborito niyang hero.'],
    ['Respeto kay {targetPlayer}! Ban agad ang {hero}.', 'Kapag nasa kamay niya ang {hero}, delikado talaga — kaya tama ang desisyon ng {team}.'],
    ['Hindi hinayaan ng {team}! Ban ang {hero}.', 'Alam nilang comfort pick yan ni {targetPlayer} ng {enemy}.'],
  ],
  DRAFT_BAN_HISTORY: [
    ['Binan ng {team} ang {hero} — ito ang ginamit ng {enemy} noong Game {prevGame}!', 'Natuto sila — hindi na nila hahayaang makuha ulit yan.'],
    ['Adjustment mula sa {team}: ban ang {hero}.', 'Naaalala niyo? Nasa draft ng {enemy} ang {hero} noong Game {prevGame}.'],
    ['Wala nang {hero} para sa {enemy}! Ibinan ng {team}.', 'Galing sa Game {prevGame} ang aral na yan.'],
  ],
  DRAFT_PICK: [
    ['Kinuha ng {team} ang {hero} para kay {player}!', 'Sa {position} yan — {pickHype}.'],
    ['{team} locks in {hero}!', 'Para kay {player} yan — {pickHype}.'],
    ['Ayan, {hero} para sa {team}!', 'Hawak ni {player} bilang {position} — {pickHype}.'],
    ['Pick ng {team}: {hero}!', 'Isang {heroClass} — {pickHype}.'],
    ['{hero} ang pinili ng {team}!', 'Magandang pick yan — {pickHype}.'],
    ['Locked in: {hero} para sa {team}!', 'Abangan natin si {player} dito — {pickHype}.'],
    ['Ayan na ang {hero} sa {team}!', 'Bagay sa plano nila — {pickHype}.'],
  ],
  DRAFT_PICK_SIGNATURE: [
    ['NAKUHA NI {player} ANG {hero}! Hindi ito binan ng {enemy}!', 'Signature hero niya yan — {poolRecord}'],
    ['ITO NA! {hero} para kay {player}!', 'Ito ang hero na kinatatakutan ng lahat — at pinalampas ito ng {enemy}!'],
    ['Pinalampas ng {enemy} ang {hero} — at agad itong kinuha para kay {player}!', 'Delikado ito, mga ka-TCC. Comfort pick ni {player} yan!'],
    ['{player} sa {hero}! Ito ang pinakaabangan natin!', '{poolRecord} Ngayon, makikita natin ulit kung bakit.'],
    ['GRABE! Ibinigay ng {team} ang {hero} kay {player}!', 'Hindi ito binan — at baka pagsisihan yan ng {enemy}!'],
  ],

  // ── Draft talk between locks: speculation, meta, story, matchups ─────────
  DRAFT_TALK: [
    ['Mainit ang draft, mga ka-TCC.', 'Bawat ban at pick, may mensahe sa kabilang team.'],
    ['{phaseName} na tayo.', 'Dito madalas makikita ang tunay na plano ng dalawang team.'],
    ['Draft pa lang, pero ramdam na ang tensyon.', 'Sino kaya ang mas handa ngayong Game {gameNumber}?'],
    ['Tingnan natin ang mga natitirang hero.', 'Paunti nang paunti ang mga opsyon — at doon nagsisimula ang chess match.'],
    ['Para sa mga bagong nanonood: Game {gameNumber} ito ng {format}.', '{seriesScore} ang serye — kaya mahalaga ang bawat desisyon sa draft.'],
    ['Abangan natin ang mga counter-pick.', 'Sa ganitong level, isang pick lang ang pwedeng sumira sa buong plano ng kalaban.'],
    ['Pansinin niyo ang pacing ng draft.', 'Ang team na kalmado sa draft, madalas kalmado rin sa laro.'],
    ['Sa {phaseName}, bawat segundo mahalaga.', 'Nag-uusap na siguro nang husto ang {blueTeam} at {redTeam} sa kani-kanilang booth.'],
  ],
  DRAFT_TALK_BAN: [
    ['Ano kaya ang ibaban ng {team}?', 'Baka ang {candHero} — signature hero yan ni {candPlayer} ng {enemy}.'],
    ['Kung ako ang {team}, iisipin kong i-ban ang {candHero}.', 'Tama — delikado si {candPlayer} kapag nasa kanya ang hero na yan.'],
    ['Bukas pa rin ang {candHero} sa draft, mga ka-TCC.', 'Abangan natin kung hahayaan ng {team} na makuha ito ni {candPlayer}.'],
    ['Turn ng {team} para mag-ban.', 'Kung babantayan nila si {candPlayer}, ang {candHero} ang dapat nilang tanggalin. {candRecord}'],
  ],
  DRAFT_TALK_PICK: [
    ['Turn ng {team} para pumili.', 'Bukas pa ang {candHero} — paborito yan ni {candPlayer}! Kukunin kaya nila?'],
    ['Abangan natin ang susunod na pick ng {team}.', 'Kung ako sila, ibibigay ko na ang {candHero} kay {candPlayer}.'],
    ['Nandiyan pa ang {candHero}, mga ka-TCC.', 'At alam natin kung sino ang gustong gumamit niyan — si {candPlayer} ng {team}! {candRecord}'],
  ],
  DRAFT_TALK_META: [
    ['Hindi pa nagagalaw ang {metaHero} sa draft na ito.', 'Isa yan sa pinakasikat na hero sa {tournament} — {metaCount} beses nang na-pick o na-ban.'],
    ['Nandiyan pa ang {metaHero}, mga ka-TCC!', 'Sino kaya ang unang kukuha o magbaban nito?'],
    ['Meta check: {metaHero}.', '{metaCount} beses na itong lumabas sa draft ngayong torneo — ito na kaya ang susunod?'],
  ],
  DRAFT_TALK_STORY: [
    ['Balikan natin ang Game {prevGame}: nanalo ang {prevWinner}.', 'Gamit nila ang {prevWinnerPicks} — tingnan natin kung kukunin ulit nila ang mga yan.'],
    ['Noong Game {prevGame}, {prevWinner} ang nagwagi.', 'Kaya ang tanong: may sagot na ba ang {prevLoser} sa draft na ito?'],
    ['Hindi pa nakakalimutan ng {prevLoser} ang Game {prevGame}.', 'Sa draft na ito, makikita natin kung paano sila babawi.'],
  ],
  DRAFT_TALK_MATCHUP: [
    ['Tingnan natin ang {position}: {blueHero} ni {bluePlayer} laban sa {redHero} ni {redPlayer}.', 'Isa yan sa mga duel na aabangan natin ngayong Game {gameNumber}!'],
    ['Matchup check sa {position}!', '{bluePlayer} sa {blueHero}, kontra {redPlayer} sa {redHero}. Sino kaya ang mananaig?'],
    ['Kumpleto na ang draft, mga ka-TCC.', 'Sa {position}, {blueHero} kontra {redHero} — ito ang laban na hindi niyo dapat palampasin.'],
  ],

  // ── Post-game recap, break chat, in-game banter ──────────────────────────
  POSTGAME_TALK: [
    ['Panalo ang {winner} sa Game {gameNumber}!', 'Series score: {winner} {winnerScore}, {loser} {loserScore}.'],
    ['Pag-usapan natin ang performance ni {spotPlayer}.', '{spotKda} ang KDA niya gamit ang {spotHero} — malaking dahilan ng panalo.'],
    ['MVP candidate: {spotPlayer}!', 'Sa {spotHero}, nagtapos siya sa {spotKda}. Grabe ang laro niya!'],
    ['Ano kaya ang adjustment ng {loser} sa susunod na game?', 'Kailangan nilang baguhin ang approach sa draft at sa mga teamfight.'],
    ['{winnerScore}-{loserScore} na ang serye.', 'Kailangan ng {winsNeeded} panalo para makuha ito — tuloy ang laban!'],
  ],
  POSTGAME_TALK_SERIES: [
    ['Tapos na ang serye — {winner} ang nanalo, {winnerScore}-{loserScore}!', 'Isang magandang serye mula sa dalawang team.'],
    ['Pag-usapan natin si {spotPlayer}.', 'Sa {spotHero}, {spotKda} — isa sa mga bida sa panalo ng {winner}.'],
    ['Saludo tayo sa {loser}.', 'Lumaban sila hanggang dulo — babalik sila nang mas malakas.'],
  ],
  POSTGAME_TALK_CHAMPION: [
    ['{winner}, ang mga kampeon ng {tournament}!', 'Hindi ito makakalimutan ng mga fans — congratulations!'],
    ['Si {spotPlayer} — anong laro!', '{spotKda} sa {spotHero} sa championship game. Pang-kampeon na laro!'],
    ['Salamat sa {loser} sa isang napakagandang Grand Final.', 'Pero ngayong araw, sa {winner} ang korona!'],
  ],
  BREAK_TALK: [
    ['Habang naka-break tayo, {seriesScore} ang serye.', 'Abangan niyo ang susunod na game — babalik kami agad!'],
    ['Salamat sa patuloy na pagsama, mga ka-TCC!', 'Huwag kalimutang i-follow ang TCC Esports habang naghihintay.'],
    ['Sino ang manok niyo sa susunod na game? I-comment niyo na!', 'Babalik kami agad pagkatapos ng break.'],
    ['Ilang sandali na lang, mga ka-TCC.', 'Pagbalik natin, Game {nextGame} na!'],
    ['Panoorin muna natin ang mga highlight.', 'Ang daming magagandang play sa seryeng ito!'],
  ],
  BANTER_PLAYER: [
    ['Tingnan natin si {spotPlayer} ng {spotTeam}.', 'Sa {spotHero}, {spotKda} ang KDA niya ngayon.'],
    ['Player spotlight: {spotPlayer}!', 'Hawak ang {spotHero} bilang {position} — {spotKda} sa ngayon.'],
    ['Si {spotPlayer}, tahimik pero epektibo.', '{spotKda} gamit ang {spotHero}. Abangan natin siya sa susunod na teamfight.'],
  ],
  BANTER_MATCHUP: [
    ['Sa {position}, {blueHero} ni {bluePlayer} kontra {redHero} ni {redPlayer}.', 'Isa yan sa mga duel na pwedeng magdesisyon ng laro.'],
    ['Matchup check sa {position}!', '{bluePlayer} at {redPlayer} — sino kaya ang mas makakaapekto sa susunod na teamfight?'],
  ],
  BANTER_TIME: [
    ['Nasa ika-{gameMinute} minuto na tayo ng laro.', 'Dito madalas nagsisimula ang mga malalaking teamfight.'],
    ['{gameMinute} minuto na ang laro, mga ka-TCC.', 'Bantayan ang mga objective — dito na nagkakaroon ng malalaking desisyon.'],
    ['Ika-{gameMinute} minuto.', 'Kills: {blueTeam} {blueKills}, {redTeam} {redKills}. Tuloy ang laban!'],
  ],

  // ── Break loop (automatic on Go to break) ─────────────────────────────────
  BREAK_START: [
    ['Mag-break muna tayo, mga ka-TCC!', 'Babalik kami pagkalipas ng {breakMins} minuto — huwag kayong aalis!'],
    ['Pahinga muna sandali, mga ka-TCC!', 'Habang naghihintay, panoorin muna natin ang mga highlight. Babalik kami agad!'],
    ['Break time muna tayo, partner {partner}!', 'Tama, {partner}. Kuha muna kayo ng tubig at meryenda, mga ka-TCC — babalik kami sa loob ng {breakMins} minuto!'],
    ['Sandaling pahinga lang, mga ka-TCC. Huwag kayong aalis!', 'Panoorin muna natin ang mga pinakamagandang play — babalik kami agad.'],
    ['Mag-break muna tayo sandali.', 'Paalala lang, mga ka-TCC: {breakMessage}'],
    ['Okay, mga ka-TCC, maikling break muna tayo.', 'Mga {breakMins} minuto lang — i-comment niyo muna kung sino ang MVP niyo so far!'],
    ['Pahinga muna ang mga player — at pati kami, mga ka-TCC!', 'Stay tuned, babalik kami agad pagkatapos ng break.'],
    ['Partner {partner}, break muna tayo sandali.', 'Sige, {partner}! Mga ka-TCC, panoorin muna natin ang highlights — babalik kami agad!'],
  ],
  BREAK_START_NEXT: [
    ['Mag-break muna tayo, mga ka-TCC! Pagbalik natin, Game {nextGame} na!', '{seriesScore} ang serye — siguradong may adjustment ang dalawang team. Huwag kayong aalis!'],
    ['Break muna tayo bago ang Game {nextGame}!', 'Kuha muna kayo ng meryenda — babalik kami pagkalipas ng {breakMins} minuto.'],
    ['Sandaling pahinga muna, mga ka-TCC. Babalik tayo para sa Game {nextGame}!', 'Habang naghihintay, panoorin muna natin ang highlights ng nakaraang laro.'],
    ['Okay, partner {partner}, break muna tayo bago ang Game {nextGame}.', 'Tama, {partner}. Mga ka-TCC, {seriesScore} — abangan niyo ang sagot ng bawat team pagbalik natin!'],
    ['Mag-break muna tayo! Game {nextGame} ng {format}, abangan niyo pagbalik namin!', 'Kailangan ng {winsNeeded} panalo para makuha ang serye — kaya siguradong mainit ang susunod na laro.'],
    ['Pahinga muna, mga ka-TCC! Mga {breakMins} minuto bago ang Game {nextGame}.', 'Huwag kalimutang i-follow ang TCC Esports habang naghihintay!'],
  ],
  BREAK_START_PAUSE: [
    ['Sandaling pause muna tayo, mga ka-TCC.', 'Huwag kayong mag-alala — babalik agad ang laban. Stay tuned!'],
    ['May maikling pause muna sa Game {gameNumber}.', 'Habang inaayos ang lahat, panoorin muna natin ang ilang highlight.'],
    ['Pause muna tayo sandali, partner {partner}.', 'Tama, {partner}. Mga ka-TCC, huwag kayong aalis — itutuloy natin agad ang Game {gameNumber}!'],
    ['Teka lang, mga ka-TCC — maikling pause muna sa laban.', 'Babalik tayo agad sa Game {gameNumber}. Huwag kayong aalis!'],
  ],
  GAME_INTRO: [
    ['Welcome back, mga ka-TCC! Game {gameNumber} na ng {stage} — {teamA} laban sa {teamB}!', '{format} ito, at ang score ngayon: {seriesScore}.'],
    ['Game {gameNumber} ng {format}! {blueTeam} sa blue side, {redTeam} sa red side.', '{seriesScore} ang score. Sino kaya ang aangat dito?'],
    ['Let the game begin! Game {gameNumber}, {teamA} kontra {teamB}!', 'Kailangan ng {winsNeeded} panalo para makuha ang serye. {seriesScore} ngayon.'],
    ['Andito na tayo sa Game {gameNumber} ng {tournament}!', '{blueTeam} sa blue, {redTeam} sa red — {format}, {seriesScore}.'],
    ['Balik tayo sa aksyon! Game {gameNumber} na, mga ka-TCC!', 'Bagong draft, bagong pagkakataon para sa {teamA} at {teamB}.'],
    ['Handa na ang dalawang team para sa Game {gameNumber}!', 'Sa {format}, bawat game ay ginto. {seriesScore} ang serye ngayon.'],
  ],
  GAME_INTRO_FIRST: [
    ['Ito na, mga ka-TCC! Game 1 ng {format} sa pagitan ng {teamA} at {teamB}!', 'Unang laro pa lang, pero napakahalaga ng momentum. Let the game begin!'],
    ['Simulan na natin ang {stage}! {teamA} laban sa {teamB}!', '{format} ito — kailangan ng {winsNeeded} panalo para umabante.'],
    ['Welcome sa {tournament}! Game 1, {blueTeam} sa blue at {redTeam} sa red!', 'Sino kaya ang unang makakapuntos sa seryeng ito?'],
    ['Game 1, mga ka-TCC! Dito magsisimula ang kuwento ng {format} na ito.', '{teamA} at {teamB} — parehong gutom sa panalo!'],
  ],
  GAME_INTRO_MATCHPOINT: [
    ['Match point para sa {mpTeam}! Game {gameNumber} na!', 'Isang panalo na lang, at tapos na ang serye. {seriesScore}.'],
    ['Ito na ba ang huling laro? Match point ang {mpTeam}!', 'Kailangang lumaban nang todo ng kabila para manatiling buhay.'],
    ['Game {gameNumber}, at nasa match point ang {mpTeam}!', 'Pressure game ito, mga ka-TCC. {seriesScore} ang serye.'],
  ],
  GAME_INTRO_DECIDER: [
    ['DECIDING GAME! Game {gameNumber}, lahat nakataya!', '{seriesScore} — ang mananalo dito, siya ang aabante!'],
    ['Ito na ang Game {gameNumber}, ang winner-take-all!', '{teamA} at {teamB}, isang laro na lang ang magdedesisyon.'],
    ['Wala nang bukas! Deciding game sa pagitan ng {teamA} at {teamB}!', 'Hindi ako makapaniwala sa ganda ng seryeng ito, mga ka-TCC!'],
  ],
  DRAFT_COMPLETE: [
    ['Kumpleto na ang draft! {blueTeam}: {bluePicks}.', 'At sa {redTeam}: {redPicks}. Tingnan natin kung aling draft ang mas papasok.'],
    ['Draft locked! {blueTeam} pumili ng {bluePicks}.', '{redTeam} naman, {redPicks}. Ito ang lineup na magdedesisyon ng Game {gameNumber}.'],
    ['Tapos na ang draft phase para sa Game {gameNumber}!', 'Draft pa lang, kita mo na ang plano ng dalawang team.'],
    ['Ito na ang mga hero, mga ka-TCC!', '{blueTeam} na may {bluePicks}, laban sa {redTeam} na may {redPicks}.'],
    ['Locked in na ang lahat! Abangan natin kung sino ang mas handa.', 'Sa huli, execution pa rin ang magdedesisyon — hindi lang ang draft.'],
  ],
  FIRST_BLOOD: [
    ['FIRST BLOOD! {player} sa {hero} ang nagbukas ng laban para sa {team}!', 'Maagang lamang ang {team}, at ramdam mo agad ang kumpiyansa nila.'],
    ['Ayan na! First blood para sa {team}, galing kay {player}!', '{enemy}, kailangan nilang mag-ingat sa positioning simula ngayon.'],
    ['Unang dugo ng laro, mga ka-TCC! {player} ang may-ari ng first blood!', 'Malaking bagay yan sa early game — extra gold agad para sa {team}.'],
    ['FIRST BLOOD! Walang sinayang na oras si {player}!', 'Ganyan mag-umpisa ang {team} — agresibo at kumpiyansa.'],
    ['Bumagsak ang unang biktima! First blood kay {player}!', 'Tingnan natin kung paano sasagot ang {enemy} dito.'],
    ['Ang bilis! First blood agad para sa {team}!', '{player}, ikaw na ang nagbigay ng tono sa larong ito.'],
    ['FIRST BLOOD! {hero} ni {player}, pumasok sa tamang oras!', 'Ganyan ang timing, mga ka-TCC. Isang maling hakbang lang, kill agad.'],
    ['Nauna ang {team}! {player} sa first blood!', 'Early lead yan, pero mahaba pa ang laro — makakabawi pa ang {enemy}.'],
  ],
  DOUBLE_KILL: [
    ['DOUBLE KILL! {player}, dalawa agad!', 'May {kills} kills na ngayon ang {team} — ramdam na ang pressure.'],
    ['Dalawa! Double kill para kay {player}!', 'Naku, maling positioning yun para sa {enemy}.'],
    ['DOUBLE KILL! Hindi pinalampas ni {player} ang pagkakataon!', 'Ganyan ang tamang follow-up — clean na clean.'],
    ['{player} sa {hero}, DOUBLE KILL!', 'Dalawang player ng {enemy} ang nasa respawn timer ngayon.'],
    ['Isa, dalawa! Double kill, {player}!', 'Ang lakas ng damage output — sa {team} ang momentum.'],
    ['DOUBLE KILL para sa {team}!', '{player}, nag-iinit na! Abangan natin kung may kasunod pa yan.'],
    ['Grabe ang pick-off! Double kill kay {player}!', 'Kailangan ng {enemy} na mag-regroup bago pa lumala.'],
  ],
  TRIPLE_KILL: [
    ['TRIPLE KILL! Hindi mapigilan si {player}!', 'Ang KDA niya ngayon, {kda}. Grabe ang impact!'],
    ['Tatlo na! TRIPLE KILL para sa {team}!', '{player}, nagliliyab! Sino pa ang haharang?'],
    ['TRIPLE KILL! Ano ba yan, {player}!', 'Halos wala nang natira sa {enemy} sa teamfight na yan!'],
    ['{hero} ni {player}, TRIPLE KILL!', 'Ganyan ang tinatawag nating takeover, mga ka-TCC.'],
    ['Isa, dalawa, TATLO! Triple kill, {player}!', 'Bukas ang mapa para sa {team} ngayon — objective agad!'],
    ['TRIPLE KILL! Pang-highlight yan!', '{player} ang bida ng teamfight na ito, walang duda.'],
    ['TRIPLE! {player}, naghahanap pa ng isa!', 'Delikado ang {enemy}, kailangan nilang umatras agad.'],
  ],
  MANIAC: [
    ['MANIAC! {player}, apat na ang bumagsak!', 'Isa na lang, SAVAGE na! {enemy}, delikado kayo!'],
    ['MANIAC! Ano ba yan, {player}!', 'Halos buong {enemy} ang nalinis sa isang teamfight!'],
    ['APAT! MANIAC para kay {player}!', 'Isang kill na lang ang layo sa Savage, mga ka-TCC!'],
    ['{hero} ni {player}, MANIAC!', 'Hindi makapaniwala ang {enemy} — apat agad ang nawala!'],
    ['MANIAC! Walang preno si {player}!', 'Ganyan ang carry performance — sa {team} ang laro ngayon.'],
    ['Hala! MANIAC! {player}, nasaan ang huling biktima?', 'Tingnan niyo ang positioning — perpekto para sa cleanup!'],
  ],
  SAVAGE: [
    ['SAVAGEEE! {player} nilinis ang buong {enemy}!', 'Pang-highlight reel yan, mga ka-TCC! Sa {team} ang sandaling ito!'],
    ['SAVAGE! GRABE! Limang kills para kay {player}!', 'Walang natira sa {enemy} — bukas ang buong mapa para sa {team}!'],
    ['SAVAGE! ANO BA YAN! {player}, HALIMAW!', 'Isa sa pinakamagandang plays ng tournament na ito!'],
    ['{hero} ni {player}, SAVAGE!', 'Lima! Lima ang bumagsak! Hindi ako makapaniwala!'],
    ['SAVAGE! Tumayo ang buong crowd para kay {player}!', '{team}, ito na ang pagkakataon — itulak niyo na!'],
    ['SAVAGEEE! Wipeout para sa {enemy}!', '{player}, ikaw ang hari ng teamfight na ito!'],
  ],
  OBJECTIVE_CONTEST: [
    ['Nagtitipon na ang dalawang team sa {objective}!', 'Sino kaya ang makakakuha ng {objective}? Abangan natin!'],
    ['Sino kaya ang makakakuha ng {objective}?', 'Isang maling galaw lang, pwedeng maagaw ito!'],
    ['Mainit sa {objective} ngayon, mga ka-TCC!', '{blueTeam} o {redTeam} — sino kaya ang makakakuha ng {objective}?'],
    ['Ito na ang labanan para sa {objective}!', 'Kritikal ang huling hit dito — sino kaya ang makakakuha?'],
    ['Bantay-sarado ang {objective}!', 'Sino kaya ang unang gagalaw? Sino kaya ang makakakuha ng {objective}?'],
    ['Usapang {objective} na tayo!', 'Kung makuha ito ng {leader}, mas lalaki pa ang lamang nila.'],
    ['Naka-setup na ang {team} sa {objective}!', 'Pero nandiyan ang {enemy} — sino kaya ang makakakuha?'],
    ['Lahat ng mata nasa {objective}!', 'Vision, timing, at huling hit — sino kaya ang makakakuha ng {objective}?'],
  ],
  TURTLE: [
    ['Turtle slain by {player}! Sa {team} ang Turtle!', 'Extra gold at experience para sa buong team — {objCount} Turtle na sila.'],
    ['TURTLE SLAIN! Nakuha ng {team} ang Turtle!', 'Slain by {player}. Malinis ang setup, walang nakalapit ang {enemy}.'],
    ['Sa {team} ang Turtle! Huling hit galing kay {player}.', 'Maliit na bagay, pero malaking tulong sa tempo.'],
    ['Bumagsak ang Turtle! {player} ang tumapos!', 'Ganyan ang tamang objective control — vision muna bago Turtle.'],
    ['TURTLE SECURED para sa {team}!', 'Extra gold para sa buong team — malaking tulong sa early game.'],
    ['Kinuha ng {team} ang Turtle!', 'Tingnan niyo ang rotation — sabay-sabay silang dumating dito.'],
    ['Turtle para sa {team}!', 'Tuloy-tuloy ang pag-ipon nila ng advantage, mga ka-TCC.'],
  ],
  TURTLE_STEAL: [
    ['TURTLE STEAL! Inagaw ng {team} ang Turtle!', 'Slain by {player}! Masakit yan para sa {enemy}!'],
    ['NAAGAW! Sa {team} napunta ang Turtle!', 'Ang ganda ng timing ni {player}! Hindi nila inaasahan yan!'],
    ['Ano ba yan! Naagaw ng {team} ang Turtle!', '{enemy} ang nagtrabaho, pero {team} ang nakinabang!'],
    ['TURTLE STOLEN! {player} ang tumapos!', 'Isang hit lang ang kailangan, at nakuha niya!'],
    ['Grabe! Inagaw ng {team} ang Turtle!', 'Pang-highlight yan — tamang-tama ang huling hit!'],
  ],
  LORD: [
    ['LORD SLAIN! Nakuha ng {team} ang Lord!', 'Slain by {player}. Lord push na ito — kailangan ng {enemy} ng malinis na depensa.'],
    ['Sa {team} ang Lord!', 'Ito na ang push na hinihintay nila — bantayan ang mga tower!'],
    ['Bumagsak ang Lord! {player} ang tumapos!', 'Malaking objective yan, sa {team} ang momentum.'],
    ['LORD SECURED para sa {team}!', 'Tingnan niyo ang setup — kontrolado nila ang buong area bago galawin ang Lord.'],
    ['Lord slain by {player}!', '{enemy}, kailangan nilang mag-defend nang sabay-sabay — walang pwedeng maiwan.'],
    ['Nakuha ng {team} ang Lord!', '{objCount} Lord na sila sa larong ito. Malapit na ba ang dulo?'],
  ],
  LORD_STEAL: [
    ['LORD STEAL! ANO BA YAN! Inagaw ng {team} ang Lord!', 'Slain by {player}! Hindi makapaniwala ang {enemy}!'],
    ['NAAGAW ANG LORD! {player}!', 'Grabe ang timing! {enemy} ang nagtrabaho, {team} ang nakakuha!'],
    ['STEAL! STEAL! Sa {team} ang Lord!', 'Ito ang klase ng play na nagbabago ng buong laro!'],
    ['LORD STOLEN! Pinaghirapan ng {enemy}, kinuha ng {team}!', '{player}, napakalinis ng huling hit!'],
    ['HINDI KAPANI-PANIWALA! Lord steal para sa {team}!', 'Pang-highlight reel, mga ka-TCC! Replay natin yan mamaya!'],
  ],
  BUFF: [
    ['{objective} secured ng {team}!', 'Slain by {player} — tuloy-tuloy ang farm at tempo nila.'],
    ['Nakuha ni {player} ang {objective} para sa {team}.', 'Maliit na detalye, pero malaking tulong sa jungle control.'],
    ['{objective} para sa {team}!', 'Malinis ang jungle pathing — kontrolado nila ang tempo.'],
    ['{objective} slain by {player}!', 'Ganyan ang disiplina sa jungle, mga ka-TCC.'],
  ],
  BUFF_STEAL: [
    ['{objectiveUpper} STEAL! Inagaw ng {team} ang {objective}!', 'Slain by {player}! Pasok sa jungle ng kalaban, labas na may premyo!'],
    ['Naagaw ang {objective}! {player} ang tumapos!', 'Masakit yan sa {enemy} — nasira ang buong pathing nila.'],
    ['Ay! Ninakaw ng {team} ang {objective}!', 'Ganyan ang invade — matapang at may tamang timing.'],
    ['Sa {team} napunta ang {objective} ng {enemy}!', '{player}, ang lakas ng loob! Kumpiyansa ang galaw na yan.'],
  ],
  GOLD_UPDATE: [
    ['Tingnan natin ang gold: lamang ang {leader} ng {gold}.', 'Kung tuloy-tuloy ito, kontrolado ng {leader} ang tempo ng laro.'],
    ['Lamang ang {leader} ng {gold} gold ngayon.', 'Kills: {blueTeam} {blueKills}, {redTeam} {redKills}. Numbers don\'t lie, mga ka-TCC.'],
    ['Gold check! {leader}, {gold} ang abante.', '{trailer}, kailangan ng pick-off o objective para makahabol.'],
    ['Lumalaki ang agwat: {gold} gold lead para sa {leader}.', 'Item advantage na yan — mas malakas sila sa susunod na teamfight.'],
    ['{gold} gold ang lamang ng {leader}.', 'Hindi pa huli para sa {trailer} — isang magandang teamfight lang ang kailangan.'],
    ['Silipin natin ang ekonomiya: {leader}, plus {gold}.', 'Kapag ganyan ang lamang, sila ang magdidikta kung saan ang laban.'],
  ],
  GOLD_EVEN: [
    ['Pantay ang gold ng dalawang team ngayon!', 'Napakadikit ng labanan — kahit sino pwedeng manalo.'],
    ['Dead even ang ekonomiya, mga ka-TCC!', 'Kills: {blueTeam} {blueKills}, {redTeam} {redKills}. Sino ang unang bibitaw?'],
    ['Walang lamang sa gold!', 'Ganito kadikit ang laban — bawat objective, ginto ang halaga.'],
  ],
  SPELL_USED: [
    ['Ginamit ni {player} ang {spell}!', 'Window yan para sa {enemy} habang naka-cooldown pa.'],
    ['Wala nang {spell} si {player}!', 'Naku, {enemy}, ito na ang pagkakataon niyo!'],
    ['{spell} ni {player}, nagamit na!', 'Bantayan natin ang timer sa screen — delikado siya habang wala pa yan.'],
    ['Ayan, {spell} na! Napilitang gumamit si {player}.', 'Kung tama ang tracking ng {enemy}, pwede silang mag-engage agad.'],
    ['Spell watch: naka-cooldown ang {spell} ni {player}.', 'Clutch o kapalpakan? Malalaman natin sa susunod na engagement!'],
  ],
  // Filled from MORE below (spells, Retribution battles, Level 15, skill names).
  SPELL_USED_ESCAPE: [],
  SPELL_USED_RETRI: [],
  OBJECTIVE_RETRI_BOTH: [],
  OBJECTIVE_RETRI_DOWN: [],
  INVADE_RETRI_DOWN: [],
  BANTER_RETRI: [],
  LEVEL_MAX: [],
  LEVEL_MAX_RECORD: [],
  LEVEL_MAX_FIRST: [],
  MULTIKILL_ULT: [],
  DRAFT_PICK_SKILL: [],
  INSTANT_REPLAY: [
    ['Tingnan muna natin ang instant replay! {replayTitle}!', 'Panoorin niyo ulit, mga ka-TCC — ganyan kalinis ang execution!'],
    ['Tingnan muna natin ang instant replay, mga ka-TCC! {replayTitle}!', '{replayDesc}'],
    ['Grabe yun! Tingnan muna natin ang instant replay.', '{replayTitle} — perpekto ang timing!'],
    ['Tingnan muna natin ang instant replay — dahan-dahanin natin ito!', '{replayTitle}! Dito nagsimula ang lahat!'],
    ['Tingnan muna natin ang instant replay ng play ni {player}!', '{replayTitle} — pang-highlight reel yan!'],
    ['Hindi pwedeng palampasin ito! Tingnan muna natin ang instant replay!', 'Ito ang klase ng play na pinag-uusapan hanggang bukas!'],
    ['Tingnan muna natin ang instant replay, partner {partner}! {replayTitle}!', 'Sige, {partner} — pansinin niyo ang positioning dito, mga ka-TCC!'],
    ['Ay, grabe! Tingnan muna natin ang instant replay!', 'Kahit ilang beses panoorin, nakakakilabot pa rin!'],
    ['Tingnan muna natin ang instant replay, mga ka-TCC!', 'Panoorin niyo ulit — ganyan kalinis ang execution!'],
    ['Teka lang — tingnan muna natin ang instant replay!', 'Dahan-dahanin natin — dito nagsimula ang lahat!'],
    ['Tingnan muna natin ang instant replay! Panoorin niyo ang timing dito.', 'Bawat galaw, sakto. Bawat skill, tama ang timing!'],
    ['Tingnan muna natin ang instant replay ng play na yan!', 'Pang-highlight reel yan, mga ka-TCC!'],
  ],
  GAME_RESULT: [
    ['At panalo ang {winner} sa Game {gameNumber}!', 'Series score: {winner} {winnerScore}, {loser} {loserScore}. Tuloy ang laban!'],
    ['GG! {winner} ang kumuha ng Game {gameNumber}!', '{winnerScore}-{loserScore} na ang serye. Makakabawi kaya ang {loser}?'],
    ['Bumagsak ang base! {winner} wins Game {gameNumber}!', 'Ngayon, {winnerScore}-{loserScore} para sa {winner} sa {format} na ito.'],
    ['Tapos na ang Game {gameNumber} — sa {winner} ang panalo!', '{loser}, kailangan nilang mag-adjust sa susunod na draft.'],
  ],
  GAME_RESULT_MATCHPOINT: [
    ['Panalo ang {winner}! Match point na sila!', '{winnerScore}-{loserScore}. Isang panalo na lang para sa {winner}!'],
    ['GG! {winner} sa Game {gameNumber}, at nasa match point na!', '{loser}, kailangan niyo nang manalo sa susunod para manatiling buhay.'],
  ],
  GAME_RESULT_TIED: [
    ['Panalo ang {winner}! Tabla na ang serye!', '{winnerScore}-{loserScore} — balik sa simula ang laban!'],
    ['Bumawi ang {winner}! Game {gameNumber} sa kanila!', 'Tabla sa {winnerScore}-{loserScore}. Ang ganda ng seryeng ito!'],
  ],
  SERIES_VICTORY: [
    ['{winner} wins the series, {winnerScore}-{loserScore}!', 'Abante ang {winner}. Salamat sa magandang laban, {loser}!'],
    ['TAPOS NA! {winner} ang nanalo sa {format}!', 'Final score: {winnerScore}-{loserScore}. Congratulations, {winner}!'],
    ['Pasok ang {winner}! {winnerScore}-{loserScore} ang final!', 'Hindi madaling kalaban ang {loser}, pero mas handa ang {winner} ngayon.'],
    ['Series point, converted! {winner} ang panalo!', '{winnerScore}-{loserScore} sa {stage}. Saludo sa parehong team!'],
  ],
  SERIES_VICTORY_CHAMPION: [
    ['AT YAN NA! {winner} ang CHAMPION ng {tournament}!', 'Final score {winnerScore}-{loserScore} sa {format}. Congratulations, {winner}!'],
    ['MGA KAMPEON! {winner}, kayo ang hari ng {tournament}!', '{winnerScore}-{loserScore} sa Grand Final! Isang napakagandang tournament!'],
    ['CHAMPIONS! {winner} ang nag-uwi ng tropeo!', 'Saludo kami sa {loser} — pero ngayong gabi, sa {winner} ang korona!'],
    ['Hindi na mapipigilan! {winner}, CHAMPIONS ng {tournament}!', '{winnerScore}-{loserScore} sa {format}! Let the celebration begin, mga ka-TCC!'],
  ],
  IDLE_BANTER: [
    ['Abangan natin kung may mag-iinvade — mainit ang jungle ngayon.', 'Isang maling rotation lang, makukuha ng kalaban ang buff mo, {partner}.'],
    ['Mukhang may nagbabalak mag-invade, mga ka-TCC.', 'Kapag sabay-sabay silang nawala sa mapa, siguradong may papasukin silang jungle.'],
    ['Habang tahimik ang mapa, lamang ang {leader} ng {gold}.', 'Kailangan ng {trailer} ng pick-off para makabawi.'],
    ['Objectives check: {blueTeam}, {blueTurtles} Turtle at {blueLords} Lord.', '{redTeam} naman, {redTurtles} Turtle at {redLords} Lord.'],
    ['Kills ngayon: {blueTeam} {blueKills}, {redTeam} {redKills}.', 'Vision at rotation ang susi sa ganitong phase ng laro.'],
    ['Spell watch: {spellWatch}.', 'Yan ang window para mag-engage, kung babantayan nang maayos.'],
    ['Medyo kalmado muna ang laban, mga ka-TCC.', 'Pero huwag kayong kumurap — isang maling face-check lang, gulo agad.'],
    ['Napakaimportante ng vision sa ganitong sitwasyon.', 'Ang team na unang makakakita, siya ang unang makakapagdesisyon.'],
    ['Tingnan niyo ang wave management dito.', 'Maliliit na detalye, pero dito nananalo ang mga championship team.'],
    ['Game {gameNumber} ng {format}, {seriesScore}.', 'Malaki ang nakataya sa larong ito para sa dalawang team.'],
    ['Sino kaya ang unang gagalaw?', 'Sa ganitong sitwasyon, pasensya ang pinakamahalagang armas.'],
    ['Abangan natin ang susunod na objective.', 'Doon madalas nagkakagulo — at doon nananalo ang laro.'],
  ],
};

/** Extra variety for the most frequent calls (merged into BUILTIN below). */
const MORE: Partial<Record<ScriptKey, Pair[]>> = {
  SPELL_USED_ESCAPE: [
    ['Ginamit na ni {player} ang {spell}!', 'Delikado siya ngayon — {cooldown} seconds bago bumalik ang {spell} niya.'],
    ['Wala nang {spell} si {player}!', 'Kapag nahuli ulit yan sa susunod na {cooldown} seconds, wala na siyang pang-takas.'],
    ['Nasunog ang {spell} ni {player}!', 'Bantayan niyo yan, {enemy} — {cooldown} seconds siyang walang escape.'],
    ['{spell} ni {player}, nagamit na para makaligtas!', 'Pero ngayon, exposed siya. {cooldown} seconds bago niya ulit magamit yan.'],
    ['Ayan, {spell} agad ni {player}!', 'Malaking window yan para sa {enemy} — hanapin niyo siya habang wala pa yan!'],
  ],
  SPELL_USED_RETRI: [
    ['Ginamit na ni {player} ang Retribution!', 'Walang retri ang jungler ng {team} sa susunod na {cooldown} seconds — pagkakataon yan ng {enemy}!'],
    ['Wala nang retri si {player}!', '{cooldown} seconds yan. Kung may objective na malapit, delikado ang {team}.'],
    ['Nasunog ang Retribution ni {player}!', 'Bantayan natin — {cooldown} seconds bago bumalik ang retri niya.'],
    ['Retri ni {player}, nagamit na!', 'Kung matalino ang {enemy}, gagalaw sila sa objective habang wala pa yan.'],
  ],
  OBJECTIVE_RETRI_BOTH: [
    ['Parehong may Retribution ang junglers — {blueJungler} at {redJungler}!', 'Sino kaya ang mananalo sa retribution battle para sa {objective}?'],
    ['Handa ang retri ni {blueJungler} at ni {redJungler}!', 'Timing ang labanan dito — isang maling pindot lang, mawawala ang {objective}.'],
    ['Retri versus retri sa {objective}, mga ka-TCC!', '{blueJungler} o {redJungler} — sino ang mas mabilis ang daliri?'],
    ['Naka-ready ang Retribution nina {blueJungler} at {redJungler}!', 'Abangan natin kung sino ang mananalo sa retri para sa {objective}!'],
  ],
  OBJECTIVE_RETRI_DOWN: [
    ['Walang retri si {downJungler} ng {downTeam} — {retriSecs} seconds pa!', 'Malaking advantage yan sa {upTeam} para sa {objective}!'],
    ['Naka-cooldown ang Retribution ni {downJungler}!', '{retriSecs} seconds pa — ito ang tamang oras ng {upTeam} para sa {objective}.'],
    ['May retri si {upJungler}, wala si {downJungler}!', 'Kung ngayon gagalaw ang {upTeam} sa {objective}, halos sigurado na yan.'],
    ['Delikado ang {downTeam} sa {objective} — wala pang retri si {downJungler}!', '{retriSecs} seconds pa bago bumalik. Kailangan nilang pigilan ang {upTeam}.'],
  ],
  INVADE_RETRI_DOWN: [
    ['Walang retri si {downJungler} ng {downTeam} ngayon — {retriSecs} seconds pa!', 'Sa invade na ito, malaking bagay yan para sa {upTeam}.'],
    ['Naka-cooldown pa ang Retribution ni {downJungler}!', 'Kaya pala ngayon ang galaw — si {upJungler} lang ang may retri sa jungle.'],
    ['Invade habang wala pang retri si {downJungler}!', '{retriSecs} seconds pa — hirap ang {downTeam} na ipagtanggol ang jungle nila.'],
  ],
  BANTER_RETRI: [
    ['Spell watch: wala pang retri si {downJungler} ng {downTeam}.', '{retriSecs} seconds pa — bantayan natin ang mga objective.'],
    ['Naka-cooldown pa ang Retribution ni {downJungler}.', 'Kung ako ang {upTeam}, gagalaw na ako sa jungle ngayon.'],
    ['Tingnan niyo, wala pang retri si {downJungler}.', 'Sa ganitong window nanakaw ang Turtle at Lord, mga ka-TCC.'],
  ],
  LEVEL_MAX: [
    ['Level 15 na si {player}, {levelTime} sa orasan!', 'Max level na — pero hindi pa natalo ang record na {prevTime} ni {prevPlayer}.'],
    ['Max level para kay {player} sa {levelTime}!', 'Malapit, pero ang tournament best ay {prevTime} pa rin, gawa ni {prevPlayer}.'],
    ['Level 15 na ang {hero} ni {player}!', 'Kumpleto na ang skills niya — {levelTime} ang oras.'],
  ],
  LEVEL_MAX_RECORD: [
    ['LEVEL 15 NA SI {player} sa {levelTime}! BAGONG RECORD!', 'Tinalo niya ang dating {prevTime} ni {prevPlayer}! Ang bilis ng farm!'],
    ['NEW BEST TIME! {player}, Level 15 sa {levelTime}!', 'Wasak ang lumang record na {prevTime} ni {prevPlayer} — grabe ang tempo ng {team}!'],
    ['Bagong record, mga ka-TCC! {levelTime} lang, Level 15 na si {player}!', 'Dati, {prevTime} ang pinakamabilis — si {prevPlayer} pa yun. Ngayon, kay {player} na!'],
  ],
  LEVEL_MAX_FIRST: [
    ['Si {player} ang unang umabot ng Level 15 sa tournament na ito — {levelTime}!', 'Yan na ang record na kailangang talunin, mga ka-TCC.'],
    ['Level 15 sa {levelTime}! {player}, max level na!', 'Unang record sa tournament — tingnan natin kung may makakatalo dito.'],
  ],
  MULTIKILL_ULT: [
    ['Ang {heroUlt} ni {player}, walang nakaligtas!', '{kda} na siya ngayon — ganyan maglaro ng {hero}!'],
    ['Pasok na pasok ang {heroUlt}!', '{player}, sinamantala ang teamfight — {kda}!'],
    ['{heroUlt}! Sakto ang timing ni {player}!', 'Yan ang dahilan kung bakit kinuha ng {team} ang {hero}.'],
  ],
  DRAFT_PICK_SKILL: [
    ['Nakuha ng {team} ang {hero} para kay {player}!', 'Abangan ang {heroUlt} niyan sa teamfight — delikado sa {enemy}.'],
    ['{hero} para kay {player}!', 'Pag pumasok ang {heroUlt}, gulo agad sa backline ng {enemy}.'],
    ['Lock in: {hero} para sa {team}!', 'Bantayan ang {heroSkill} at ang {heroUlt} niyan — kailangang maging maingat ang {enemy}.'],
  ],
  GAME_INTRO: [
    ['Game {gameNumber}! Handa na ba kayo, mga ka-TCC?', '{teamA} laban sa {teamB}, {seriesScore} ang serye — let the game begin!'],
    ['Bagong laro, bagong kuwento! Game {gameNumber} ng {stage}!', 'Sino kaya ang mas nakapag-adjust mula sa nakaraang game?'],
  ],
  DRAFT_COMPLETE: [
    ['Locked na ang lineups para sa Game {gameNumber}!', 'Sa {blueTeam}: {bluePicks}. Sa {redTeam}: {redPicks}.'],
    ['Draft done! Ngayon, execution na ang pag-uusapan.', 'Parehong may malinaw na plano ang dalawang team — tingnan natin kung sino ang mas handa.'],
  ],
  FIRST_BLOOD: [
    ['First blood! Walang takas kay {player}!', 'Unang kill, unang gold, unang kumpiyansa — sa {team} lahat yan.'],
    ['Ayan ang unang bumagsak — FIRST BLOOD para sa {team}!', 'Maagang pressure, mga ka-TCC. Tingnan natin kung matatag ang {enemy}.'],
    ['FIRST BLOOD! Ang ganda ng engage ni {player}!', 'Sa ganitong level ng laro, malaking bagay ang unang kill.'],
    ['Hindi pa nag-iinit ang laro, may first blood na si {player}!', '{enemy}, gising na! Kailangan niyo nang mag-adjust.'],
    ['FIRST BLOOD para kay {player} sa {hero}!', 'Swak ang pick na yan — agad nagbunga!'],
  ],
  DOUBLE_KILL: [
    ['DOUBLE KILL! Ang linis ng combo ni {player}!', 'Dalawang bumagsak, isang player lang ang may gawa!'],
    ['Double kill! Hindi tumigil si {player}!', 'Momentum shift yan para sa {team}, mga ka-TCC.'],
    ['DOUBLE KILL para kay {player} sa {hero}!', 'Ang ganda ng positioning — perpekto ang anggulo ng engage.'],
    ['Dalawa agad ang nalagas sa {enemy}!', 'DOUBLE KILL, {player}! Lumalaki ang lamang ng {team}.'],
  ],
  TRIPLE_KILL: [
    ['TRIPLE KILL! Walang awa si {player}!', 'Tatlo! Ang {enemy}, nawalan ng sagot!'],
    ['TRIPLE KILL para sa {team}!', 'Teamfight won! {player}, ikaw ang nagbuhat diyan!'],
    ['Tatlong kills kay {player}! TRIPLE!', 'Malaking swing yan — bukas ang daan papunta sa objective.'],
  ],
  MANIAC: [
    ['MANIAC! Lumilipad si {player}!', 'Apat na bagsak! Sino pa ang natitira sa {enemy}?'],
    ['MANIAC para sa {team}!', '{player}, isang hakbang na lang mula sa Savage!'],
    ['Ano ba yan! MANIAC, {player}!', 'Hindi ito ordinaryong teamfight — clinic yan, mga ka-TCC!'],
  ],
  SAVAGE: [
    ['SAVAGE! WALANG NATIRA! {player}!', 'Isusulat ito sa kasaysayan ng {tournament}!'],
    ['SAVAGEEE para kay {player} sa {hero}!', 'Ang buong {enemy}, nasa respawn screen! Grabe!'],
    ['LIMA! SAVAGE! Ang {team}, nagdiriwang!', '{player}, pang-MVP ang performance na yan!'],
  ],
  OBJECTIVE_CONTEST: [
    ['Mukhang may sasabog na gulo sa {objective}!', 'Sino kaya ang makakakuha? Abangan ang huling hit!'],
    ['Ito ang sandaling hinihintay natin — {objective} contest!', 'Sino kaya ang makakakuha ng {objective}? Pigil-hininga, mga ka-TCC!'],
    ['Lumalapit na ang dalawang team sa {objective}.', 'Kung sino ang mas disiplinado, siya ang makakakuha.'],
    ['{objective} on the line!', 'Sino kaya ang makakakuha — {blueTeam} o {redTeam}?'],
  ],
  TURTLE: [
    ['Turtle down! Slain by {player}!', 'Bonus gold para sa {team} — malaking tulong sa item timing.'],
    ['Nakuha na ang Turtle! Sa {team} ito!', 'Ganyan ang tamang objective trade, mga ka-TCC.'],
    ['TURTLE SLAIN by {player}!', 'Panalo ang {team} sa contest na ito — malinis!'],
  ],
  TURTLE_STEAL: [
    ['STEAL! Turtle para sa {team}!', 'Slain by {player} — sakto ang huling hit!'],
    ['Inagaw ng {team} ang Turtle sa huling segundo!', 'Hindi inaasahan ng {enemy} — ang sakit niyan!'],
  ],
  LORD: [
    ['LORD DOWN! Slain by {player}!', 'Push time para sa {team}! Handa na ba ang depensa ng {enemy}?'],
    ['Sa {team} ang Lord, at dito na magsisimula ang siege!', 'Bawat tower ngayon ay nasa panganib, mga ka-TCC.'],
    ['LORD SLAIN! {player} ang huling tumama!', 'Malaking momentum para sa {team} — baka ito na ang game-winning play!'],
  ],
  LORD_STEAL: [
    ['ANO BA YAN! NAAGAW ANG LORD!', 'Slain by {player}! Ang {team} ang nakinabang!'],
    ['NAAGAW ANG {objectiveUpper}! SA {team}!', 'Slain by {player} — hindi nila inaasahan yan!'],
    ['LORD STEAL ng {team}!', 'Ang tapang ni {player}! Pumasok, tumama, nakuha!'],
  ],
  BUFF: [
    ['{objective} para kay {player}!', 'Malinis na jungle rotation para sa {team}.'],
    ['Nakuha ng {team} ang {objective}!', 'Tuloy ang farm, tuloy ang pressure.'],
  ],
  BUFF_STEAL: [
    ['Invade! Naagaw ng {team} ang {objective}!', 'Slain by {player} — nasa teritoryo pa mismo ng {enemy}!'],
    ['{objectiveUpper} STEAL ni {player}!', 'Grabe ang tapang — pasok sa jungle ng {enemy}, labas na may premyo!'],
  ],
  GOLD_UPDATE: [
    ['Abante ang {leader} sa gold — {gold}!', 'Pero hindi pa tapos ang laro. Isang Lord lang, pwedeng mabaliktad.'],
    ['Lamang ng {gold} ang {leader}, mga ka-TCC.', 'Kailangang mag-ingat ng {trailer} — bawat death ngayon ay mas masakit.'],
    ['Gold update: {leader}, plus {gold}.', 'Kitang-kita sa mapa — mas mabilis ang rotations nila.'],
  ],
  SPELL_USED: [
    ['Nasunog na ang {spell} ni {player}!', 'Ito na ang pagkakataon ng {enemy} na samantalahin yan.'],
    ['{player}, ginamit ang {spell}!', 'Clutch? Oo. Pero ngayon, wala na siyang panangga.'],
  ],
  INSTANT_REPLAY: [
    ['Tingnan muna natin ang instant replay! Ganito ang nangyari.', '{replayDesc}'],
    ['Teka, teka — tingnan muna natin ang instant replay! {replayTitle}!', 'Bawat galaw, sakto. Bawat skill, tama ang timing!'],
    ['Tingnan muna natin ang instant replay, mga ka-TCC — panoorin niyo ang timing dito!', '{replayTitle}! Walang sinayang na segundo!'],
  ],
  GAME_RESULT: [
    ['Victory para sa {winner} sa Game {gameNumber}!', 'Score: {winnerScore}-{loserScore}. Abangan ang susunod na laro!'],
    ['Tapos na! {winner} ang wagi sa Game {gameNumber}!', 'Kailangan ng {loser} ng sagot sa susunod na draft.'],
  ],
  SERIES_VICTORY: [
    ['Congratulations, {winner}! Panalo sa serye, {winnerScore}-{loserScore}!', 'Isang hakbang palapit sa kampeonato!'],
    ['{winner} ang umabante! {winnerScore}-{loserScore} sa {format}!', 'Magandang laban, {loser} — babalik kayo nang mas malakas.'],
  ],
  IDLE_BANTER: [
    ['Pansinin niyo ang map awareness ng dalawang team.', 'Walang gustong mahuli — lahat naghihintay ng tamang pagkakataon.'],
    ['Kills: {blueTeam} {blueKills}, {redTeam} {redKills}.', 'Pero hindi lang kills ang sukatan — objectives ang nananalo ng laro.'],
    ['Ang {leader}, kontrolado ang tempo ngayon.', 'Lamang ng {gold} gold, at ramdam mo ang kumpiyansa nila.'],
    ['Para sa mga nanonood, salamat sa pagsama sa {tournament}!', 'Tuloy-tuloy ang aksyon dito sa TCC Esports, mga ka-TCC!'],
    ['Mahalaga ngayon ang komunikasyon ng bawat team.', 'Isang maling tawag lang, pwedeng mawala ang buong laro.'],
    ['Tahimik pero tensyonado ang mapa ngayon.', 'Parang chess — bawat galaw, may kahulugan.'],
  ],
};
for (const [k, pairs] of Object.entries(MORE)) BUILTIN[k as ScriptKey].push(...(pairs ?? []));

// ── Placeholder filling ─────────────────────────────────────────────────────

export type ScriptVars = Partial<Record<string, string>>;

export function scriptVars(f: CommentaryFacts): ScriptVars {
  const v: ScriptVars = {
    blueTeam: f.blueTeam,
    redTeam: f.redTeam,
    teamA: f.teamA,
    teamB: f.teamB,
    seriesScore: f.seriesScore,
    gameNumber: String(f.gameNumber),
    format: f.format,
    winsNeeded: String(f.winsNeeded),
    tournament: f.tournament,
    stage: f.stage || undefined,
    blueKills: String(f.kills.blue),
    redKills: String(f.kills.red),
    blueTurtles: String(f.turtles.blue),
    redTurtles: String(f.turtles.red),
    blueLords: String(f.lords.blue),
    redLords: String(f.lords.red),
    team: f.actorTeam,
    enemy: f.enemyTeam,
    objective: f.objective,
    objectiveUpper: f.objective?.toUpperCase(),
    effect: f.mapEffect?.label,
    tier: f.turret?.tier,
    turretCount: f.turret ? String(f.turret.count) : undefined,
    spellWatch: f.spellCooldowns?.[0],
  };
  if (f.gold.leader) {
    v.leader = f.gold.leader;
    v.trailer = f.gold.leader === f.blueTeam ? f.redTeam : f.blueTeam;
    v.gold = formatGold(f.gold.diff);
  }
  if (f.actor) {
    v.player = f.actor.ign;
    v.hero = f.actor.hero ?? undefined;
    v.kda = `${f.actor.kills}/${f.actor.deaths}/${f.actor.assists}`;
    v.spell = f.actor.spell ?? undefined;
    v.kills = String(f.actor.side === 'blue' ? f.kills.blue : f.kills.red);
  }
  const side = f.actor?.side ?? (f.actorTeam === f.blueTeam ? 'blue' : f.actorTeam === f.redTeam ? 'red' : null);
  if (side && f.objective === 'Turtle') v.objCount = String(f.turtles[side]);
  if (side && f.objective === 'Lord') v.objCount = String(f.lords[side]);
  if (f.draft?.bluePicks.length) v.bluePicks = f.draft.bluePicks.join(', ');
  if (f.draft?.redPicks.length) v.redPicks = f.draft.redPicks.join(', ');
  if (f.result) {
    v.winner = f.result.winner;
    v.loser = f.result.loser;
    v.winnerScore = String(f.result.winnerScore);
    v.loserScore = String(f.result.loserScore);
  }
  if (f.replay) {
    // The default headline "Instant Replay" adds nothing after "Tingnan muna natin ang instant replay".
    v.replayTitle = f.replay.title && !/^\s*instant replay\s*$/i.test(f.replay.title) ? f.replay.title : undefined;
    v.replayDesc = f.replay.description || undefined;
  }
  if (f.victim) {
    v.victim = f.victim.ign;
    v.victimHero = f.victim.hero || undefined;
  }
  if (f.victims?.length) {
    const list = f.victims;
    v.victims = list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} at ${list[list.length - 1]}`;
    v.victimCount = String(list.length);
    v.victim ??= list[0];
  }
  if (f.draftCall) {
    const c = f.draftCall;
    v.hero = c.hero;
    v.heroClass = c.heroClass;
    v.banReason = c.reason;
    v.pickHype = c.hype;
    v.targetPlayer = c.target?.player;
    v.targetRecord = c.target?.record || undefined;
    v.prevGame = c.prevGame ? String(c.prevGame) : undefined;
    v.poolRecord = c.signature?.record || undefined;
    v.position = c.position;
    v.player ??= c.player;
  }
  if (f.draftTalk) {
    const t = f.draftTalk;
    v.team = t.team;
    v.enemy = t.enemy;
    v.phaseName = t.kind === 'done' ? undefined : t.phase;
    v.candHero = t.candHero;
    v.candPlayer = t.candPlayer;
    v.candRecord = t.candRecord;
    v.metaHero = t.metaHero;
    v.metaCount = t.metaCount ? String(t.metaCount) : undefined;
  }
  if (f.matchup) Object.assign(v, { position: f.matchup.position, blueHero: f.matchup.blueHero, redHero: f.matchup.redHero, bluePlayer: f.matchup.bluePlayer, redPlayer: f.matchup.redPlayer });
  if (f.story) {
    v.prevGame ??= String(f.story.prevGame);
    v.prevWinner = f.story.prevWinner;
    v.prevLoser = f.story.prevLoser;
    v.prevWinnerPicks = f.story.prevWinnerPicks || undefined;
  }
  if (f.spotlight) {
    v.spotPlayer = f.spotlight.player;
    v.spotHero = f.spotlight.hero;
    v.spotKda = f.spotlight.kda;
    v.spotTeam = f.spotlight.team;
    v.position ??= f.spotlight.position;
  }
  if (f.gameMinute) v.gameMinute = String(f.gameMinute);
  if (f.nextGame && !f.breakInfo) v.nextGame = String(f.nextGame);
  if (f.breakInfo) {
    if (f.breakInfo.minutes) v.breakMins = String(f.breakInfo.minutes);
    v.breakMessage = f.breakInfo.message || undefined;
    if (f.breakInfo.nextGame) v.nextGame = String(f.breakInfo.nextGame);
  }
  // Real skill names of the hero in the line (never "1st skill / ultimate").
  const sk = heroSkills(v.hero);
  if (sk) {
    v.heroUlt = sk.ult || undefined;
    v.heroSkill = sk.skills.length ? pickRandom(sk.skills) : undefined;
  }
  if (f.spellUse) v.cooldown = String(f.spellUse.cooldown);
  if (f.retri) {
    const { blue, red } = f.retri;
    if (blue) v.blueJungler = blue.player;
    if (red) v.redJungler = red.player;
    const down = blue && !blue.ready ? blue : red && !red.ready ? red : null;
    const up = down === blue ? red : blue;
    if (down && up && up.ready) {
      v.downJungler = down.player;
      v.downTeam = down.team;
      v.retriSecs = String(down.secs);
      v.upJungler = up.player;
      v.upTeam = up.team;
    }
  }
  if (f.level) {
    v.levelTime = f.level.time;
    v.prevTime = f.level.prevTime;
    v.prevPlayer = f.level.prevPlayer;
  }
  // Match point team (for intros).
  const need = f.winsNeeded;
  if (f.scoreA === need - 1 && f.scoreB < need - 1) v.mpTeam = f.teamA;
  if (f.scoreB === need - 1 && f.scoreA < need - 1) v.mpTeam = f.teamB;
  return v;
}

const PLACEHOLDER = /\{(\w+)\}/g;

/** Fill a template. Returns null when any placeholder is unknown or has no value. */
export function fillTemplate(text: string, vars: ScriptVars): string | null {
  let ok = true;
  const out = text.replace(PLACEHOLDER, (_, key: string) => {
    const val = vars[key];
    if (val === undefined || val === null || val === '') {
      ok = false;
      return '';
    }
    return val;
  });
  return ok ? tidy(out) : null;
}

/** Placeholders used by a template that aren't in the allowed list (used to validate AI output). */
export const unknownPlaceholders = (text: string) =>
  [...text.matchAll(PLACEHOLDER)].map((m) => m[1]).filter((k) => !(k in SCRIPT_PLACEHOLDERS));

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/\s([,.!?])/g, '$1').trim();

// ── Choosing a script for an event ──────────────────────────────────────────

/** Where the series stands at the start of a game. */
function seriesMoment(f: CommentaryFacts): 'FIRST' | 'DECIDER' | 'MATCHPOINT' | null {
  const need = f.winsNeeded;
  if (f.gameNumber === 1) return 'FIRST';
  if (f.scoreA === need - 1 && f.scoreB === need - 1) return 'DECIDER';
  if (f.scoreA === need - 1 || f.scoreB === need - 1) return 'MATCHPOINT';
  return null;
}

/** Most specific script keys first; generic keys are the fallback pool. */
export function scriptKeysFor(event: GameEvent, f: CommentaryFacts): { primary: ScriptKey[]; fallback: ScriptKey[] } {
  const need = f.winsNeeded;
  switch (event.type) {
    case 'DRAFT_START':
    case 'GAME_START': {
      const moment = seriesMoment(f);
      const base = event.type;
      if (moment === 'MATCHPOINT' || moment === 'DECIDER') return { primary: [`${base}_${moment}` as ScriptKey], fallback: [base] };
      // Lower bracket / single elimination / grand final: the loser goes home — say so most of the time.
      if (base === 'GAME_START' && f.elimination && Math.random() < 0.7) return { primary: ['GAME_START_ELIMINATION'], fallback: ['GAME_START'] };
      if (moment) return { primary: [`${base}_${moment}` as ScriptKey], fallback: [base] };
      return { primary: [base], fallback: [] };
    }
    case 'TRIPLE_KILL':
    case 'MANIAC':
    case 'SAVAGE':
      // Now and then the call names the hero's ultimate (its real name).
      if (f.actor?.skills?.ult && !f.continuation && Math.random() < 0.3) return { primary: ['MULTIKILL_ULT'], fallback: [event.type as ScriptKey] };
      if (event.type === 'SAVAGE') return f.continuation ? { primary: ['SAVAGE_MORE'], fallback: ['SAVAGE'] } : { primary: ['SAVAGE'], fallback: [] };
      return (f.victims?.length || f.victim) && Math.random() < 0.6 ? { primary: [(event.type + '_VICTIMS') as ScriptKey], fallback: [event.type as ScriptKey] } : { primary: [event.type as ScriptKey], fallback: ['IDLE_BANTER'] };
    case 'FIRST_BLOOD':
    case 'DOUBLE_KILL':
      // Name the players who died most of the time when the operator picked them.
      return (f.victims?.length || f.victim) && Math.random() < 0.6 ? { primary: [(event.type + '_VICTIMS') as ScriptKey], fallback: [event.type as ScriptKey] } : { primary: [event.type as ScriptKey], fallback: ['IDLE_BANTER'] };
    case 'DRAFT_BAN': {
      if (event.data?.none) return { primary: ['DRAFT_BAN_NONE'], fallback: [] };
      const c = f.draftCall;
      const keys: ScriptKey[] = [];
      if (c?.target) keys.push('DRAFT_BAN_TARGET');
      if (c?.prevGame) keys.push('DRAFT_BAN_HISTORY');
      return keys.length ? { primary: keys, fallback: ['DRAFT_BAN'] } : { primary: ['DRAFT_BAN'], fallback: [] };
    }
    case 'DRAFT_PICK':
      if (f.draftCall?.signature) return { primary: ['DRAFT_PICK_SIGNATURE'], fallback: ['DRAFT_PICK'] };
      // Sometimes: what the hero's skills (by name) bring to the team.
      return heroSkills(f.draftCall?.hero)?.ult && Math.random() < 0.3 ? { primary: ['DRAFT_PICK_SKILL'], fallback: ['DRAFT_PICK'] } : { primary: ['DRAFT_PICK'], fallback: [] };
    case 'SPELL_USED':
      if (f.spellUse?.retri) return { primary: ['SPELL_USED_RETRI'], fallback: ['SPELL_USED'] };
      if (f.spellUse?.escape && Math.random() < 0.8) return { primary: ['SPELL_USED_ESCAPE'], fallback: ['SPELL_USED'] };
      return { primary: ['SPELL_USED'], fallback: [] };
    case 'OBJECTIVE_CONTEST': {
      // Who wins the Retribution battle? Or: one jungler has no retri.
      const r = f.retri;
      const down = r && ((r.blue && !r.blue.ready && r.red?.ready) || (r.red && !r.red.ready && r.blue?.ready));
      if (down) return { primary: ['OBJECTIVE_RETRI_DOWN'], fallback: ['OBJECTIVE_CONTEST'] };
      if (r?.blue?.ready && r.red?.ready && Math.random() < 0.75) return { primary: ['OBJECTIVE_RETRI_BOTH'], fallback: ['OBJECTIVE_CONTEST'] };
      return { primary: ['OBJECTIVE_CONTEST'], fallback: [] };
    }
    case 'LEVEL_MAX':
      if (f.level?.best) return f.level.prevTime ? { primary: ['LEVEL_MAX_RECORD'], fallback: ['LEVEL_MAX_FIRST'] } : { primary: ['LEVEL_MAX_FIRST'], fallback: [] };
      return { primary: ['LEVEL_MAX'], fallback: [] };
    case 'DRAFT_TALK': {
      // Prefer something specific (speculation, meta, story, matchup); plain draft talk now and then.
      const t = f.draftTalk;
      const options: ScriptKey[] = [];
      if (t?.candHero && t.kind !== 'done') options.push(t.kind === 'ban' ? 'DRAFT_TALK_BAN' : 'DRAFT_TALK_PICK', t.kind === 'ban' ? 'DRAFT_TALK_BAN' : 'DRAFT_TALK_PICK');
      if (t?.metaHero && t.kind !== 'done') options.push('DRAFT_TALK_META');
      if (f.story) options.push('DRAFT_TALK_STORY');
      if (f.matchup) options.push('DRAFT_TALK_MATCHUP', 'DRAFT_TALK_MATCHUP');
      return options.length && Math.random() < 0.8 ? { primary: [pickRandom(options)], fallback: ['DRAFT_TALK'] } : { primary: ['DRAFT_TALK'], fallback: [] };
    }
    case 'IDLE_BANTER': {
      if (f.mode === 'break') return { primary: ['BREAK_TALK'], fallback: ['BREAK_START'] };
      if (f.mode === 'postgame') {
        if (f.result?.isChampionship) return { primary: ['POSTGAME_TALK_CHAMPION'], fallback: ['SERIES_VICTORY_CHAMPION'] };
        if (f.result?.seriesOver) return { primary: ['POSTGAME_TALK_SERIES'], fallback: ['SERIES_VICTORY'] };
        return { primary: ['POSTGAME_TALK'], fallback: ['GAME_RESULT'] };
      }
      const options: ScriptKey[] = ['IDLE_BANTER', 'IDLE_BANTER'];
      if (f.spotlight) options.push('BANTER_PLAYER', 'BANTER_PLAYER');
      if (f.matchup) options.push('BANTER_MATCHUP');
      if (f.gameMinute) options.push('BANTER_TIME');
      if (f.mapEffect && f.mapEffect.id !== 'flyingCloud') options.push('BANTER_MAP');
      const r = f.retri;
      if (r && ((r.blue && !r.blue.ready && r.red?.ready) || (r.red && !r.red.ready && r.blue?.ready))) options.push('BANTER_RETRI', 'BANTER_RETRI');
      return { primary: [pickRandom(options)], fallback: ['IDLE_BANTER'] };
    }
    case 'BREAK_START':
      if (f.breakInfo?.midGame) return { primary: ['BREAK_START_PAUSE'], fallback: ['BREAK_START'] };
      return f.breakInfo?.nextGame ? { primary: ['BREAK_START_NEXT', 'BREAK_START'], fallback: [] } : { primary: ['BREAK_START'], fallback: [] };
    case 'GAME_INTRO': {
      const [sa, sb] = [f.scoreA, f.scoreB];
      if (f.gameNumber === 1) return { primary: ['GAME_INTRO_FIRST', 'GAME_INTRO'], fallback: [] };
      if (sa === need - 1 && sb === need - 1) return { primary: ['GAME_INTRO_DECIDER'], fallback: ['GAME_INTRO'] };
      if (sa === need - 1 || sb === need - 1) return { primary: ['GAME_INTRO_MATCHPOINT'], fallback: ['GAME_INTRO'] };
      return { primary: ['GAME_INTRO'], fallback: [] };
    }
    case 'TURTLE':
      if (f.steal) return { primary: ['TURTLE_STEAL'], fallback: ['TURTLE'] };
      return f.healingTurtle ? { primary: ['TURTLE_HEALING'], fallback: ['TURTLE'] } : { primary: ['TURTLE'], fallback: [] };
    case 'TURRET':
      return f.turret?.golden ? { primary: ['TURRET_GOLDEN'], fallback: ['TURRET'] } : { primary: ['TURRET'], fallback: [] };
    case 'WISP_REVEAL':
      return { primary: ['WISP_REVEAL'], fallback: [] };
    case 'INVADE': {
      const r = f.retri;
      const down = r && ((r.blue && !r.blue.ready && r.red?.ready) || (r.red && !r.red.ready && r.blue?.ready));
      if (down && Math.random() < 0.7) return { primary: ['INVADE_RETRI_DOWN'], fallback: [f.invade === 'buff' ? 'INVADE_BUFF' : 'INVADE'] };
      return f.invade === 'buff' ? { primary: ['INVADE_BUFF'], fallback: ['INVADE'] } : { primary: ['INVADE'], fallback: [] };
    }
    case 'MAP_EFFECT': {
      const id = f.mapEffect?.id;
      const key: ScriptKey = id === 'revealingWisps' ? 'MAP_EFFECT_WISPS' : id === 'healingTurtle' ? 'MAP_EFFECT_TURTLE' : id === 'goldenTurret' ? 'MAP_EFFECT_TURRET' : id === 'flyingCloud' ? 'MAP_EFFECT_CLOUD' : 'MAP_EFFECT';
      return { primary: [key], fallback: ['MAP_EFFECT'] };
    }
    case 'LORD':
      return f.steal ? { primary: ['LORD_STEAL'], fallback: ['LORD'] } : { primary: ['LORD'], fallback: [] };
    case 'BUFF':
      return f.steal ? { primary: ['BUFF_STEAL'], fallback: ['BUFF'] } : { primary: ['BUFF'], fallback: [] };
    case 'GOLD_UPDATE':
      return f.gold.leader ? { primary: ['GOLD_UPDATE'], fallback: ['GOLD_EVEN'] } : { primary: ['GOLD_EVEN'], fallback: [] };
    case 'GAME_RESULT': {
      const r = f.result;
      if (r && r.winnerScore === need - 1 && r.loserScore < need - 1) return { primary: ['GAME_RESULT_MATCHPOINT', 'GAME_RESULT'], fallback: [] };
      if (r && r.winnerScore === r.loserScore) return { primary: ['GAME_RESULT_TIED'], fallback: ['GAME_RESULT'] };
      return { primary: ['GAME_RESULT'], fallback: [] };
    }
    case 'SERIES_VICTORY':
      return f.result?.isChampionship ? { primary: ['SERIES_VICTORY_CHAMPION'], fallback: ['SERIES_VICTORY'] } : { primary: ['SERIES_VICTORY'], fallback: [] };
    default:
      return { primary: [event.type as ScriptKey], fallback: ['IDLE_BANTER'] };
  }
}

export interface TemplateLine {
  casterId: string;
  text: string;
}

/** Keys whose follow-up line holds the point of the call — never replaced by a persona reply. */
const KEEP_FOLLOW = /^(SPELL_USED_|OBJECTIVE_RETRI_|INVADE_RETRI|LEVEL_MAX|MULTIKILL_ULT|DRAFT_PICK_SKILL|DRAFT_TALK_|DRAFT_BAN_TARGET|DRAFT_BAN_HISTORY|DRAFT_PICK_SIGNATURE|POSTGAME_TALK|BANTER_|BREAK_TALK|MAP_EFFECT|TURRET|WISP_REVEAL|TURTLE_HEALING|INVADE|GAME_START_ELIMINATION)/;

/** Every instant replay opens with this call (templates, library and AI lines). */
export const REPLAY_LEAD = /tingnan muna natin ang instant replay/i;

/** Lines a key's lead MUST contain — also filters pre-generated library entries. */
function leadFits(key: ScriptKey, leadTemplate: string) {
  if (key.startsWith('DRAFT_START')) return leadTemplate.includes('{partner}');
  if (key.startsWith('GAME_START')) return leadTemplate.includes('{gameNumber}');
  if (key === 'INSTANT_REPLAY') return REPLAY_LEAD.test(leadTemplate);
  return true;
}

/** On-air name of a caster (Settings display name, else the persona name). */
export const casterName = (id: string, names: Record<string, string> = {}) => names[id]?.trim() || CASTER_BY_ID[id]?.name || id;

/**
 * Pick a pre-written shoutcast for this event from the built-in + pre-generated
 * library, skipping lines used recently. Returns [] if nothing fits.
 */
/** Compose one fresh, in-character line for a caster from the 30k+ line generator. */
function personaLine(casterId: string, group: LineGroup, vars: ScriptVars, recentlyUsed: Set<string>, avoid: Set<string>, noOpener = false) {
  if (!(casterId in PERSONA_VOICE)) return null;
  return composeLine(casterId as CasterId, group, (t) => fillTemplate(t, vars), recentlyUsed, avoid, { noOpener });
}

/** "Salamat, Direk Ken!" — how a caster answers when the other caster just spoke to them by name. */
function acknowledgement(casterId: string, group: LineGroup, vars: ScriptVars, core: string) {
  const acks = PERSONA_ACK[casterId as CasterId];
  if (!acks) return '';
  const pool = (group === 'DRAFTSTART' || group === 'GAMESTART' ? acks.greet : acks.agree)
    .map((t) => fillTemplate(t, vars))
    .filter((t): t is string => Boolean(t) && t!.split(/[ ,!.]/)[0].toLowerCase() !== core.split(/[ ,!.]/)[0].toLowerCase());
  return pool.length ? pickRandom(pool) : '';
}

/**
 * Build a turn-based exchange for this event from the pre-shoutcast library:
 *   1. the lead caster makes the call (event library: built-in + Gemini pre-generated)
 *   2. the partner answers in character (their persona pool, or the paired follow-up)
 *   3. on big moments, sometimes the lead caster closes with their own angle
 * Lines are always spoken one after another — never overlapping.
 * Returns the ids used so the engine can avoid repeating them soon.
 */
export function templateLines(
  event: GameEvent,
  facts: CommentaryFacts,
  pair: string[],
  extra: ScriptEntry[] = [],
  recentlyUsed: Set<string> = new Set(),
  names: Record<string, string> = {},
  flow: { lead?: string; bridge?: boolean } = {},
): { lines: TemplateLine[]; ids: string[] } {
  const base = scriptVars(facts);
  const { primary, fallback } = scriptKeysFor(event, facts);
  // Keep the conversation going: the caster who didn't speak last opens the next topic.
  const [first, second] = flow.lead && pair.includes(flow.lead) && pair.length > 1 ? [flow.lead, pair.find((p) => p !== flow.lead)!] : leadCaster(pair, event.type);
  // {partner} is always the OTHER caster: the lead talks to the second caster, the reply talks back to the lead.
  const leadVars: ScriptVars = { ...base, me: casterName(first, names), partner: casterName(second, names) };
  const followVars: ScriptVars = { ...base, me: casterName(second, names), partner: casterName(first, names) };

  const candidates = (keys: ScriptKey[]) => {
    const out: { id: string; key: ScriptKey; lead: string; follow: string }[] = [];
    for (const key of keys) {
      const entries: Pair[] = [...BUILTIN[key], ...extra.filter((e) => e.key === key).map((e) => [e.lead, e.follow] as Pair)];
      for (const [leadT, followT] of entries) {
        if (!leadFits(key, leadT)) continue;
        const lead = fillTemplate(leadT, leadVars);
        const follow = fillTemplate(followT, followVars);
        if (lead && follow) out.push({ id: `${key}|${leadT}`, key, lead, follow });
      }
    }
    return out;
  };

  let pool = candidates(primary);
  if (!pool.length) pool = candidates(fallback);
  if (!pool.length) return { lines: [], ids: [] };
  const fresh = pool.filter((c) => !recentlyUsed.has(c.id));
  const choice = pickRandom(fresh.length ? fresh : pool);
  const group = groupForKey(choice.key);
  const ids = [choice.id];
  const said = new Set([choice.lead]);

  // 2. Partner answers in character (70%), otherwise the paired follow-up line.
  //    Calls whose second line carries the information (speculation, target bans,
  //    signature picks, recaps, spotlights) always keep it.
  const keepFollow = KEEP_FOLLOW.test(choice.key);
  //    If the lead spoke to them by name, they answer by name first ("Salamat, Direk Ken!").
  let follow = choice.follow;
  const addressed = choice.lead.includes(casterName(second, names));
  // The paired follow-up was written for this call, so it answers it directly — use it most of
  // the time; an in-character reply now and then (always acknowledging the partner first).
  const reply = !keepFollow && Math.random() < 0.3 ? personaLine(second, group, followVars, recentlyUsed, said, addressed) : null;
  if (reply) {
    const ack = addressed || Math.random() < 0.7 ? acknowledgement(second, group, followVars, reply.text) : '';
    follow = ack ? `${ack} ${reply.text}` : reply.text;
    ids.push(reply.id);
  }
  said.add(follow);
  // Picking up from what the partner just said ("Tama ka diyan, Mika. …") so viewers can follow the conversation.
  const bridge = flow.bridge ? fillTemplate(pickRandom(BRIDGES), leadVars) : null;
  const lines: TemplateLine[] = [
    { casterId: first, text: bridge ? `${bridge} ${choice.lead}` : choice.lead },
    { casterId: second, text: follow },
  ];

  // 3. Big moments: the lead caster sometimes closes the exchange.
  if ((MAJOR_GROUPS.has(group) && Math.random() < 0.45) || (keepFollow && Math.random() < 0.3)) {
    const closer = personaLine(first, group, leadVars, recentlyUsed, said);
    if (closer) {
      lines.push({ casterId: first, text: closer.text });
      ids.push(closer.id);
    }
  }
  return { lines, ids };
}

/** How the next caster picks up from the partner before a new topic. */
const BRIDGES = [
  'Tama ka diyan, {partner}.',
  'Oo nga, {partner}.',
  'Dagdag ko lang diyan, {partner}.',
  'Sang-ayon ako diyan.',
  'Ito pa, {partner}.',
  'At habang pinag-uusapan natin yan…',
  'Uy, may napansin pa ako.',
  'Speaking of which…',
  'Kaya nga, {partner}.',
  'Exactly, {partner}.',
];

/** Event call pairs written by hand. */
export const eventPairCount = () => Object.values(BUILTIN).reduce((n, arr) => n + arr.length, 0);

/** Built-in library size (shown in the booth): event call pairs + every unique caster line the generator can say. */
export const builtinCount = () => eventPairCount() + libraryStats().total;

export const builtinExamples = (key: ScriptKey) => BUILTIN[key];
