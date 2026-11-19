import type { CasterId } from './casters';

// ─────────────────────────────────────────────────────────────────────────────
// Per-caster "pre-shoutcasts": in-character reactions written for each of the
// eight personas, in the rhythm of Filipino MPL-style Taglish casting —
// the hype caller explodes first, then the analyst/stat/clutch/story voice
// follows with their own angle. Only {placeholders} from the fact sheet are
// used, so nothing is invented. Objective steals are never credited to a
// battle spell: any hero can land the last hit ("slain by {player}").
// ─────────────────────────────────────────────────────────────────────────────

export type LineGroup =
  | 'DRAFTBAN'
  | 'DRAFTPICK'
  | 'DRAFTTALK'
  | 'DRAFTSTART'
  | 'GAMESTART'
  | 'BREAK'
  | 'INTRO'
  | 'DRAFT'
  | 'KILL'
  | 'BIGKILL'
  | 'OBJECTIVE'
  | 'STEAL'
  | 'CONTEST'
  | 'GOLD'
  | 'EVEN'
  | 'SPELL'
  | 'REPLAY'
  | 'RESULT'
  | 'VICTORY'
  | 'CHAMPION'
  | 'BANTER';

/** Groups where a third "closing" line from the lead caster adds to the moment. */
export const MAJOR_GROUPS = new Set<LineGroup>(['BIGKILL', 'STEAL', 'REPLAY', 'VICTORY', 'CHAMPION', 'DRAFT', 'INTRO', 'DRAFTSTART', 'GAMESTART']);

export function groupForKey(key: string): LineGroup {
  if (key.startsWith('DRAFT_BAN')) return 'DRAFTBAN';
  if (key.startsWith('DRAFT_PICK')) return 'DRAFTPICK';
  if (key.startsWith('DRAFT_TALK')) return 'DRAFTTALK';
  if (key === 'POSTGAME_TALK_CHAMPION') return 'CHAMPION';
  if (key === 'POSTGAME_TALK_SERIES') return 'VICTORY';
  if (key === 'POSTGAME_TALK') return 'RESULT';
  if (key === 'BREAK_TALK') return 'BREAK';
  if (key.startsWith('BANTER_')) return 'BANTER';
  if (key.startsWith('DRAFT_START')) return 'DRAFTSTART';
  if (key.startsWith('GAME_START')) return 'GAMESTART';
  if (key.startsWith('BREAK_START')) return 'BREAK';
  if (key.startsWith('GAME_INTRO')) return 'INTRO';
  if (key === 'DRAFT_COMPLETE') return 'DRAFT';
  if (key === 'KILL' || key.startsWith('FIRST_BLOOD') || key.startsWith('DOUBLE_KILL') || key.startsWith('TRIPLE_KILL')) return 'KILL';
  if (key.startsWith('MANIAC') || key.startsWith('SAVAGE')) return 'BIGKILL';
  if (key.endsWith('_STEAL')) return 'STEAL';
  if (key === 'TURTLE' || key === 'LORD' || key === 'BUFF') return 'OBJECTIVE';
  if (key === 'OBJECTIVE_CONTEST') return 'CONTEST';
  if (key === 'GOLD_UPDATE') return 'GOLD';
  if (key === 'GOLD_EVEN') return 'EVEN';
  if (key === 'SPELL_USED') return 'SPELL';
  if (key === 'INSTANT_REPLAY') return 'REPLAY';
  if (key.startsWith('GAME_RESULT')) return 'RESULT';
  if (key === 'SERIES_VICTORY_CHAMPION') return 'CHAMPION';
  if (key === 'SERIES_VICTORY') return 'VICTORY';
  return 'BANTER';
}

export const PERSONA_LINES: Record<CasterId, Partial<Record<LineGroup, string[]>>> = {
  // ── Kuya Marco — macro analyst ────────────────────────────────────────────
  marco: {
    INTRO: [
      'Ang susi sa larong ito: vision control at disiplinadong rotation.',
      'Abangan natin kung sino ang unang makakakontrol ng tempo sa early game.',
      'Para sa akin, ang team na mas maayos mag-rotate ang mananalo dito.',
      'Pakinggan niyo, mga ka-TCC — sa ganitong level, maliliit na detalye ang nagdedesisyon.',
    ],
    DRAFT: [
      'Kung titingnan ang mga hero, parehong may malinaw na plano ang dalawang team.',
      'Ang tanong sa draft na ito: sino ang mas maagang aabot sa power spike?',
      'Maganda ang balanse ng mga lineup — may frontline, may damage, may control.',
      'Ngayon, execution na — dito natin makikita kung sino ang mas handa sa macro.',
    ],
    KILL: [
      'Tingnan niyo ang positioning — napalayo sa team, kaya na-pick off.',
      'Ganyan ang resulta ng magandang vision — nakita nila agad ang galaw ng {enemy}.',
      'Dito makikita natin ang halaga ng rotation — dumating sa tamang oras ang {team}.',
      'Hindi lang mechanics yan — maganda ang setup bago pa ang engage.',
      'Isang maling face-check lang, at nagbayad agad ang {enemy}.',
      'Pansinin niyo, sabay-sabay ang galaw ng {team} — walang naiwan.',
    ],
    BIGKILL: [
      'Ito ang tinatawag nating perfect teamfight execution — sabay-sabay ang skills.',
      'Tingnan niyo, hinintay muna nila ang key skills ng {enemy} bago pumasok.',
      'Disiplina. Hindi sila nagmadali, at ayan ang bunga.',
      'Kapag nagkalat ang team sa teamfight, ganyan ang mangyayari — sunod-sunod ang bagsak.',
    ],
    OBJECTIVE: [
      'Ganyan ang tamang objective setup — ward muna, clear ng wave, saka {objective}.',
      'Na-convert nila ang advantage sa {objective} — ito ang macro play.',
      'Dahil sa {objective} na yan, mas madali na para sa {team} ang mag-siege.',
      'Tamang timing — hindi agad nakarating ang {enemy} sa pit.',
    ],
    STEAL: [
      'Tama ang setup ng {enemy}, pero sa huling hit, kulang ang kontrol.',
      'Leksyon yan — huwag galawin ang {objective} kung hindi kontrolado ang paligid.',
      'Ganyan kahalaga ang pagbasa sa HP ng objective — sa huling hit lang nagkakatalo.',
    ],
    CONTEST: [
      'Ang tanong dito: sino ang may mas magandang vision sa paligid ng {objective}?',
      'Wave management muna bago {objective} — doon nagsisimula ang tamang setup.',
      'Huwag basta papasok — hintayin ang tamang engage bago galawin ang {objective}.',
    ],
    GOLD: [
      'Ang {gold} na lamang ay hindi lang numero — mas maagang item spike yan.',
      'Dahil sa lamang na yan, kaya nang mag-invade ng {leader} sa jungle.',
      'Kailangan ng {trailer} na mag-farm nang ligtas at maghintay ng pagkakamali.',
    ],
    EVEN: [
      'Pantay ang laban — kaya ang bawat objective, napakahalaga ngayon.',
      'Sa ganitong sitwasyon, ang unang magkakamali, siya ang malulugi.',
    ],
    SPELL: ['Kapag naka-cooldown ang {spell}, mas madaling i-engage si {player}.'],
    REPLAY: [
      'Tingnan niyo sa replay — ang anggulo ng engage, perpekto.',
      'Dito sa replay, makikita ang tamang pagbasa sa cooldowns ng kalaban.',
      'Pansinin ang positioning bago ang play — doon nanggaling ang lahat.',
    ],
    RESULT: ['Ang pagkakaiba sa larong ito: mas disiplinado ang {winner} sa macro.', 'Kailangang balikan ng {loser} ang rotations nila para sa susunod na game.'],
    VICTORY: ['Mula draft hanggang execution, mas handa ang {winner} sa seryeng ito.'],
    CHAMPION: ['Karapat-dapat. Sa buong tournament, pinakadisiplinado ang {winner}.'],
    BANTER: [
      'Pansinin niyo ang wave management — maliliit na detalye, malaking epekto.',
      'Ngayon ang tamang oras para mag-ward sa paligid ng mga objective.',
      'Ang team na may vision, siya ang may kontrol ng laro.',
      'Abangan ang susunod na power spike — doon madalas nagsisimula ang gulo.',
    ],
  },

  // ── Direk Ken — hype play-by-play ─────────────────────────────────────────
  ken: {
    INTRO: ['ITO NA! Let the game begin, mga ka-TCC!', 'Handa na ba kayo?! Dahil handa na ang {teamA} at {teamB}!', 'Init na init na! Simulan na natin ito!'],
    DRAFT: ['Locked in na! Wala nang atrasan!', 'Pang-gyera ang mga lineup na ito, mga ka-TCC!'],
    KILL: ['PATAY! Walang takas!', 'ANG LAKAS! Hindi nakaporma ang {enemy}!', 'LINIS! Ang bilis ng pangyayari!', 'GRABEEE! Pasok na pasok ang combo!', 'Ayun na! Bagsak agad!'],
    BIGKILL: [
      'WALA NA! WALA NANG NATIRA! ANO BA YAN!',
      'HINDI AKO MAKAPANIWALA! Ang lakas ng {team}!',
      'ITO NA, ITO NA! Pang-highlight reel ito!',
      'SIGE PA! Wala nang makakapigil!',
      'TUMAYO KAYO, MGA KA-TCC! GRABE YAN!',
    ],
    OBJECTIVE: ['NAKUHA! Sa {team} ang {objective}!', 'Ayun na! Malinis ang kuha ng {objective}!', 'Push na yan! Wala nang atrasan, {team}!'],
    STEAL: ['NAAGAW! NAAGAW ANG {objectiveUpper}! ANO BA YAN!', 'HINDI KAPANI-PANIWALA! Steal ng {team}!', 'NAKAW! Ang lakas ng loob ni {player}!'],
    CONTEST: ['ITO NA ANG LABANAN! Sino kaya ang makakakuha ng {objective}?!', 'Mainit! Mainit sa {objective}! Ito na, mga ka-TCC!'],
    GOLD: ['Pero hindi pa tapos ang laban! Isang teamfight lang, babaliktad yan!', 'Lamang man ang {leader}, buhay pa ang pag-asa ng {trailer}!'],
    EVEN: ['Dikit na dikit! Ganito ang gusto natin, mga ka-TCC!'],
    SPELL: ['Ginamit na ang {spell}! Wala nang pantakas!'],
    REPLAY: ['Panoorin niyo ulit — GRABE TALAGA!', 'Kahit ilang beses natin panoorin, nakakakilabot pa rin!', 'Slow-mo pa lang, ramdam mo na ang lakas!'],
    RESULT: ['GG! Ang ganda ng laban na yan!', 'Hindi pa tapos ang serye! Abangan ang susunod!'],
    VICTORY: ['PASOK! Abante ang {winner}! Ang ganda ng laban!', 'Tapos na! {winner}! Ang lakas niyo!'],
    CHAMPION: ['CHAMPIONS! CHAMPIONS! {winner}, KAYO ANG HARI!', 'ITO NA ANG SANDALI! MGA KAMPEON, {winner}!'],
    BANTER: ['Tahimik ngayon, pero ramdam ko — may sasabog na gulo!', 'Abangan niyo lang, mga ka-TCC — konting tiis, aksyon na ulit!'],
  },

  // ── Ate Lyka — tempo & stats ──────────────────────────────────────────────
  lyka: {
    INTRO: ['Series check: {seriesScore}. Kailangan ng {winsNeeded} panalo para umabante.', 'Game {gameNumber} na — at bawat game sa {format}, ginto ang halaga.'],
    DRAFT: [
      'Abangan natin ang kill count sa unang ilang minuto — doon makikita kung sino ang tama ang plano.',
      'Ngayon, tingnan natin kung paano isasalin ng dalawang team ang draft sa gold at objectives.',
    ],
    KILL: ['Ngayon, {team} na may {kills} kills sa larong ito.', '{player} ngayon: {kda} ang KDA. Numbers don\'t lie!', 'Kills: {blueTeam} {blueKills}, {redTeam} {redKills}. Gumagalaw ang scoreboard!'],
    BIGKILL: ['Tingnan natin ang epekto: {blueTeam} {blueKills}, {redTeam} {redKills} sa kills.', '{player}, {kda} na ang KDA — sa kanya ang laro ngayon.'],
    OBJECTIVE: [
      'Objectives: {blueTeam} {blueTurtles} Turtle at {blueLords} Lord; {redTeam} {redTurtles} Turtle at {redLords} Lord.',
      'Dagdag gold at tempo ito para sa {team} — kontrolado nila ang orasan.',
    ],
    STEAL: ['Sa tempo, masakit ito — nasayang ang buong setup ng {enemy}.'],
    CONTEST: ['Ang mananalo sa {objective} na ito, malaki ang dagdag sa gold.'],
    GOLD: ['Sa kasalukuyan, {leader} plus {gold} — at kontrolado nila ang tempo.', 'Lamang ang {leader} ng {gold}, at ramdam yan sa items nila.', 'Kailangang tumigil ng {trailer} sa pagbibigay ng kills para hindi lumaki ang agwat.'],
    EVEN: ['Pantay ang gold — kahit sino, pwedeng manalo.', 'Kills: {blueTeam} {blueKills}, {redTeam} {redKills}, at dikit pa rin ang gold.'],
    SPELL: ['Mga {cooldown} segundo ang cooldown ng {spell} — bilangin natin.'],
    REPLAY: ['Dahil sa play na yan, gumalaw ang scoreboard: {blueKills} laban sa {redKills}.'],
    RESULT: ['Series score ngayon: {winner} {winnerScore}, {loser} {loserScore}.', 'Kailangan ng {winsNeeded} panalo — ang {winner} ngayon ay may {winnerScore}.'],
    VICTORY: ['Final: {winnerScore}-{loserScore}. Malinis ang numero ng {winner} sa seryeng ito.'],
    CHAMPION: ['{winnerScore}-{loserScore} sa Grand Final. Sumasang-ayon ang mga numero — {winner} ang kampeon!'],
    BANTER: [
      'Stats check: {blueTeam} {blueKills} kills, {redTeam} {redKills} kills.',
      'Habang tahimik, {leader} pa rin ang lamang ng {gold}.',
      'Objectives: {blueTeam} {blueTurtles} Turtle at {blueLords} Lord; {redTeam} {redTurtles} Turtle at {redLords} Lord.',
    ],
  },

  // ── Trixie — clutch & spell watcher ───────────────────────────────────────
  trixie: {
    INTRO: ['Abangan natin ang clutch plays — isang tamang spell lang, pwedeng magbago ang laro!', 'Sino kaya ang magiging clutch player natin ngayong game?'],
    DRAFT: ['Abangan natin kung sino ang magiging clutch sa mga lineup na ito.'],
    KILL: ['Naku, maling positioning yun! Sayang!', 'Clutch o kapalpakan? Sa tingin ko, clutch yan!', 'Hala, nag-face-check! Huwag ganun, mga lods!', 'Ang ganda ng timing — sakto ang skills!'],
    BIGKILL: ['Clutch na clutch! Walang sinayang na skill!', 'Naku, {enemy} — sabay-sabay kayong nahuli sa maling posisyon!'],
    OBJECTIVE: ['Tingnan niyo ang positioning sa paligid ng {objective} — walang butas!'],
    STEAL: ['CLUTCH! Ang ganda ng huling hit ni {player}!', 'Naku, {enemy}, akala niyo kayo na — hindi pa pala!', 'Ganyan ang clutch — tamang oras, tamang hit!'],
    CONTEST: ['Bantayan natin ang mga battle spell — isang tamang gamit lang, pwedeng mabaliktad ang laban sa {objective}!', 'Sino kaya ang makakakuha ng {objective}? Ako, kinakabahan na!'],
    GOLD: ['Pero tandaan, isang clutch play lang, mababaliktad ang lahat!'],
    EVEN: ['Ganito ang gusto ko — dikit na laban, clutch plays ang magdedesisyon!'],
    SPELL: [
      'Naku, wala nang {spell} si {player}! Delikado!',
      'Spell watch: {cooldown} segundo bago bumalik ang {spell} ni {player}.',
      'Tama ba ang gamit ng {spell}? Sa tingin ko, clutch!',
      'Ngayon ang window para sa {enemy} — habang wala ang {spell}.',
    ],
    REPLAY: ['Pansinin niyo ang timing ng skills sa replay — clutch talaga!', 'Balikan natin — tingnan niyo kung paano iniwasan ang skills!'],
    RESULT: ['Clutch plays ang nagpanalo sa {winner} sa larong ito!'],
    VICTORY: ['Ang dami nilang clutch moments sa seryeng ito — karapat-dapat ang {winner}!'],
    CHAMPION: ['Clutch hanggang dulo! Congrats, {winner}!'],
    BANTER: ['Spell watch: {spellWatch}.', 'Abangan natin ang susunod na clutch moment — ramdam ko, malapit na!', 'Sana walang mag-face-check sa bush — delikado ngayon!'],
  },

  // ── Coach Rafa — draft & meta ─────────────────────────────────────────────
  rafa: {
    INTRO: ['Para sa akin, ang adjustments sa draft ang magdedesisyon ng larong ito.', 'Siguradong may binago ang dalawang coaching staff para sa Game {gameNumber}.', 'Bagong game, bagong game plan — abangan natin ang adjustments.'],
    DRAFT: [
      'Kung ako ang coach, masaya ako sa mga pinili — may malinaw na win condition.',
      'Ang {blueTeam}, pumili ng {bluePicks}. Malinaw ang identity ng lineup nila.',
      'Sa {redTeam}, {redPicks} — may sagot sila sa iba\'t ibang sitwasyon.',
      'Ang tanong sa draft: sino ang mas malakas pagdating ng late game?',
      'Tingnan natin kung tatama ang counter-picks sa aktwal na laro.',
    ],
    KILL: ['Ganyan ang lakas ng hero pick na yan sa ganitong phase ng laro.', 'Win condition ng draft nila — at gumagana!'],
    BIGKILL: ['Ito ang dahilan kung bakit nila pinili ang lineup na yan — teamfight!', 'Kumpleto ang combo — draft at execution, nagtugma!'],
    OBJECTIVE: ['Bahagi ng game plan yan — objective-focused ang galaw nila.'],
    STEAL: ['Hindi yan maihahanda sa draft — instinct at timing na yan.'],
    CONTEST: ['Sino ang mas malakas sa teamfight sa {objective}? Malalaman natin ngayon.'],
    GOLD: ['Kapag tuloy-tuloy ito, papalapit na ang power spike ng {leader}.'],
    EVEN: ['Pantay pa, kaya scaling at execution ang magdedesisyon sa dulo.'],
    SPELL: ['Mahalaga ang spell tracking — bahagi yan ng preparation ng bawat team.'],
    REPLAY: ['Kitang-kita sa replay kung bakit malakas ang hero na yan sa ganitong sitwasyon.'],
    RESULT: ['Siguradong may adjustments ang {loser} sa susunod na draft.', 'Panalo ang game plan ng {winner} — mula draft hanggang dulo.'],
    VICTORY: ['Ang preparation ng {winner}, kitang-kita sa bawat draft ng seryeng ito.'],
    CHAMPION: ['Pinakamahusay na preparation, pinakamahusay na execution — {winner} ang kampeon!'],
    BANTER: ['Sa meta ngayon, napakahalaga ng flexible na draft.', 'Abangan natin kung sino ang mas maagang aabot sa core items.'],
  },

  // ── Tito Jun — veteran storyteller ────────────────────────────────────────
  jun: {
    INTRO: [
      'Ito ang klase ng serye na pag-uusapan natin sa mga susunod na taon.',
      'Dalawang team na gutom sa panalo — ito ang esports na gusto natin.',
      'Bilog ang bola, sabi nga nila — kahit sino, pwedeng manalo dito.',
    ],
    DRAFT: ['Sa dami ng seryeng napanood ko, alam kong draft pa lang, kalahati na ng laban.'],
    KILL: ['Ganyan ang laro ng mga gutom sa panalo!', 'Ramdam mo ang init — ganito ang mga klasikong laban!'],
    BIGKILL: ['Sa tagal ko sa casting, bihira akong makakita ng ganyan!', 'Iyan ang play na ikukuwento ng {team} sa mga susunod na taon!'],
    OBJECTIVE: ['Sa ganitong laro, ang objectives ang nagsusulat ng kuwento.'],
    STEAL: ['Ito ang mga sandaling hindi malilimutan ng {enemy}!'],
    CONTEST: ['Dito nasusubok ang puso ng isang team — sino kaya ang makakakuha ng {objective}?'],
    GOLD: ['Pero sa esports, walang lamang na sigurado — tanong lang kung kailan babawi ang {trailer}.'],
    EVEN: ['Ito ang klase ng laban na gusto ng lahat — walang gustong bumitaw.'],
    REPLAY: ['Ito ang play na babalik-balikan ng mga fans.'],
    RESULT: ['Hindi pa tapos ang kuwento — may susunod pang kabanata ang seryeng ito.', 'Ang {loser}, may pagkakataon pang bumangon. Abangan natin ang sagot nila.'],
    VICTORY: ['Isang kabanata ang natapos — at ang {winner} ang nagsulat ng huling pahina.', 'Saludo sa {loser} — pinahirapan nila ang {winner} hanggang dulo.'],
    CHAMPION: ['Isusulat ang pangalan ng {winner} sa kasaysayan ng {tournament}!', 'Mula umpisa hanggang dulo, pinatunayan ng {winner} na sila ang hari.'],
    BANTER: [
      'Ang ganda ng community natin, mga ka-TCC — salamat sa suporta!',
      'Sa ganitong laro, pasensya at tiwala sa teammates ang susi.',
      'Bawat team dito ay may sariling kuwento — at isinusulat nila ito ngayon.',
    ],
  },

  // ── Bea — jungle & objectives ─────────────────────────────────────────────
  bea: {
    INTRO: ['Abangan natin ang jungle pathing — doon madalas nagsisimula ang tempo.', 'Ang unang Turtle ang madalas magbukas ng laro — abangan natin.'],
    DRAFT: ['Sa jungle, abangan natin kung sino ang mas mabilis mag-farm at mag-invade.'],
    KILL: ['Ganyan ang tamang gank timing!', 'Dahil sa kill na yan, bukas ang jungle ng {enemy} para ma-invade.'],
    BIGKILL: ['Wipeout! Libre na ang lahat ng objective para sa {team}!', 'Ngayon, buong mapa ang hawak ng {team} — Lord, Turtle, lahat!'],
    OBJECTIVE: [
      '{objective} slain by {player}! Ganyan ang tamang timing.',
      'Malinis ang kuha — kontrolado ng {team} ang paligid ng pit.',
      'Abangan ang susunod na spawn — doon ulit ang gulo.',
      'Ganyan mag-secure ng {objective} — bawas ang risk, sigurado ang kuha.',
    ],
    STEAL: [
      'STEAL! Slain by {player}! Kahit sinong hero, pwedeng tumama ng huling hit!',
      'Inagaw ng {team} ang {objective} — malaking dagok sa {enemy}!',
      'Ganyan ang tamang pagbasa sa HP ng {objective} — huling hit, nakuha!',
    ],
    CONTEST: [
      'Sino kaya ang makakakuha ng {objective}? Tingnan natin ang HP bar!',
      'Abangan ang huling hit sa {objective} — kahit sino pwedeng umagaw!',
      'Nagse-setup na ang dalawang team — sino kaya ang makakakuha ng {objective}?',
      'Ang team na mas maraming tao sa {objective}, siya ang may kalamangan.',
    ],
    GOLD: ['Dahil sa lamang na yan, kaya nang mag-invade ng {leader} sa jungle.'],
    EVEN: ['Pantay ang gold — ang susunod na objective ang magbubukas ng laro.'],
    SPELL: ['Wala nang {spell} si {player} — magandang pagkakataon para sa objective!'],
    REPLAY: ['Pansinin niyo sa replay ang positioning sa paligid ng pit!'],
    RESULT: ['Objective control ang nagpanalo sa {winner} sa larong ito.'],
    VICTORY: ['Ang objective control ng {winner}, top-tier sa buong serye.'],
    CHAMPION: ['Kontrolado ang mapa, kontrolado ang tournament — {winner}, champions!'],
    BANTER: [
      'Abangan ang susunod na Turtle o Lord spawn — doon magkakagulo.',
      'Tingnan ang jungle — sino kaya ang mas maraming buff na nakuha?',
      'Objectives: {blueTeam} {blueTurtles} Turtle, {redTeam} {redTurtles} Turtle.',
    ],
  },

  // ── Mika — host & crowd hype ──────────────────────────────────────────────
  mika: {
    INTRO: [
      'Magandang araw, mga ka-TCC! Salamat sa pagsama sa {tournament}!',
      'Welcome back sa {stage}! Ingay naman diyan, mga ka-TCC!',
      'Ready na ba kayo? Game {gameNumber}, {teamA} laban sa {teamB}!',
      'I-comment niyo na kung sino ang manok niyo sa Game {gameNumber}!',
    ],
    DRAFT: ['Tapos na ang draft! Sino sa tingin niyo ang may mas magandang lineup? Comment na!'],
    KILL: ['Ang ingay ng chat, mga ka-TCC!', 'Shoutout sa mga fans ng {team} — kayo ang may kill na yan!'],
    BIGKILL: ['Hindi pa ako nakakita ng ganyan ngayong araw! Ang lakas!', 'MVP candidate na ba si {player}? I-comment niyo na!'],
    OBJECTIVE: ['Malaking objective para sa {team}! Ingay para sa kanila!'],
    STEAL: ['Ang ingay ng chat! Hindi makapaniwala ang lahat!'],
    CONTEST: ['Sino kaya ang makakakuha ng {objective}? Comment na, mga ka-TCC!'],
    GOLD: ['Fans ng {trailer}, huwag mag-alala — mahaba pa ang laban!'],
    EVEN: ['Dikit na dikit! Huwag kayong aalis sa panonood, mga ka-TCC!'],
    REPLAY: ['I-clip niyo na yan, mga ka-TCC — pang-highlight yan!'],
    RESULT: ['Congratulations, {winner}! Pero huwag muna kayong aalis — may susunod pa!', 'Fans ng {loser}, may pag-asa pa! Abangan ang susunod na game!'],
    VICTORY: ['Congratulations, {winner}! Ang galing niyo!', 'Palakpakan natin ang {winner} at {loser} — ang ganda ng serye!'],
    CHAMPION: ['MGA KA-TCC, PALAKPAKAN NATIN ANG ATING MGA KAMPEON — {winner}!', 'Congratulations, {winner}, champions ng {tournament}! Salamat sa lahat ng nanood!'],
    BANTER: [
      'Salamat sa lahat ng nanonood ngayon, mga ka-TCC!',
      'Huwag kalimutang i-follow ang TCC Esports para sa susunod na laban!',
      'Sino ang MVP para sa inyo sa larong ito? I-comment niyo!',
    ],
  },
};

// ── Phase announcements: drafting-phase welcome, game start, going to break ──
// Spoken right after the lead caster's call. When the lead greeted this caster
// by name, PERSONA_ACK adds "Salamat, partner …!" in front of the line.
const PHASE_LINES: Record<CasterId, Partial<Record<LineGroup, string[]>>> = {
  marco: {
    DRAFTSTART: [
      'Sa draft na ito, abangan natin kung sino ang uunahin sa ban — doon makikita ang respeto sa kalaban.',
      'Para sa akin, flexibility ang susi — ang team na may maraming opsyon, siya ang may kontrol.',
      'Abangan natin ang mga hero na pang-objective control — malaki ang epekto niyan sa mid game.',
      'Simple lang ang tanong: sino ang mas handa sa draft na ito?',
      'Tingnan natin kung sino ang mag-iisip ng tempo, at kung sino ang mag-iisip ng late game.',
    ],
    GAMESTART: [
      'Ngayon, execution na — tingnan natin kung paano isasalin ng dalawang team ang draft sa laro.',
      'Abangan natin ang unang rotation — doon makikita kung sino ang may mas malinaw na plano.',
      'Sa unang ilang minuto, vision at jungle control ang babantayan ko.',
      'Pasensya at disiplina — yan ang kailangan ng dalawang team sa early game.',
    ],
    BREAK: [
      'Magandang pagkakataon ito para mag-adjust ang dalawang team.',
      'Sa ganitong break, pinag-uusapan ng mga team ang maliliit na pagkakamali — abangan natin ang epekto niyan pagbalik.',
      'Pagbalik natin, bantayan ang rotation at vision — doon madalas makikita ang adjustment.',
    ],
  },
  ken: {
    DRAFTSTART: [
      'Hindi na ako makapaghintay — tara, simulan na ang draft!',
      'Init na init na ang desk, mga ka-TCC! Draft na!',
      'Ito na! Sino kaya ang unang ilo-lock?',
      'Ramdam ko na — pang-gyera ang draft na ito!',
    ],
    GAMESTART: [
      'ITO NA, ITO NA! Simula na ang gyera sa Land of Dawn!',
      'Handa na ba kayo, mga ka-TCC?! Dahil handa na ang {teamA} at {teamB}!',
      "LET'S GO! Init na init na!",
      'Simula na! Sino kaya ang unang makakakuha ng first blood?',
    ],
    BREAK: [
      'Konting tiis lang, mga ka-TCC — babalik ang aksyon!',
      'Pahinga muna, pero ramdam ko na — mas iinit pa pagbalik natin!',
      'Huwag kayong aalis, ha! Pagbalik natin, gyera ulit!',
    ],
  },
  lyka: {
    DRAFTSTART: [
      'Game {gameNumber} na, at {seriesScore} ang serye — kaya bawat pick, may bigat.',
      'Kailangan ng {winsNeeded} panalo para umabante — abangan natin kung paano ito makikita sa draft.',
      'Para sa record: {seriesScore}. Tingnan natin kung paano babaguhin ng draft na ito ang numero.',
    ],
    GAMESTART: [
      '{seriesScore} ang serye — at magsisimula na ang bagong bilangan.',
      'Kailangan ng {winsNeeded} panalo para makuha ang serye. Abangan natin ang unang kills!',
      'Zero-zero ang kills, pantay ang gold — malinis na simula para sa dalawang team.',
    ],
    BREAK: [
      'Habang break, tandaan: {seriesScore} ang serye.',
      'Pagbalik natin, bantayan ang numbers — doon makikita kung sino ang nag-adjust.',
      'Kailangan ng {winsNeeded} panalo para makuha ang serye — tandaan niyo yan habang naghihintay.',
    ],
  },
  trixie: {
    DRAFTSTART: [
      'Abangan natin ang mga ban — minsan, dito pa lang may clutch na desisyon na!',
      'Kinakabahan na ako sa draft na ito, totoo lang!',
      'Sana may last-pick na surprise hero — para mas masaya!',
    ],
    GAMESTART: [
      'Abangan natin ang unang invade — dito madalas nagkakaroon ng maagang clutch!',
      'Ingat sa face-check, mga lods — maaga pa pero delikado na!',
      'Kinakabahan na ako agad — sana walang mahuli sa jungle!',
    ],
    BREAK: [
      'Kuha muna kayo ng tubig, mga lods — kinakabahan pa rin ako!',
      'Break muna — pero huwag kayong aalis, baka ma-miss niyo ang clutch play pagbalik!',
    ],
  },
  rafa: {
    DRAFTSTART: [
      'Kung ako ang coach, ang unang tanong ko: ano ang win condition natin ngayong Game {gameNumber}?',
      'Draft pa lang, kalahati na ng laban — kaya panoorin natin nang mabuti ang bawat ban.',
      'Abangan natin ang unang dalawang ban — madalas, doon na makikita ang buong plano.',
      'Sa draft nananalo ang mga handang team — tingnan natin kung sino ang mas handa ngayon.',
    ],
    GAMESTART: [
      'Ngayon natin malalaman kung gagana ang game plan ng bawat team.',
      'Kung ako ang coach, simple ang bilin ko: sundin ang plano at huwag mag-panic.',
      'Draft, tapos na. Ngayon, execution na ang labanan.',
    ],
    BREAK: [
      'Sa break, dito pumapasok ang coaching — abangan ang mga adjustment.',
      'Kung ako ang coach, ito na ang oras para ayusin ang plano.',
    ],
  },
  jun: {
    DRAFTSTART: [
      'Bawat draft, may kuwento — at ang kuwento ng Game {gameNumber}, magsisimula ngayon.',
      'Mga kaibigan, dito nagsisimula ang lahat — sa tahimik pero matinding labanan ng draft.',
      'Sa {stage} na ito, bawat desisyon ay isusulat sa kasaysayan ng {tournament}.',
    ],
    GAMESTART: [
      'Mga kaibigan, simula na ang panibagong kabanata ng seryeng ito.',
      'Bawat game, may sariling kuwento — at ang kuwento ng Game {gameNumber}, nagsisimula na.',
      'Ito ang esports na gusto natin — dalawang team, isang pangarap.',
    ],
    BREAK: [
      'Mga kaibigan, magpahinga muna tayo sandali — marami pang kuwentong isusulat dito.',
      'Salamat sa pagsama sa amin — babalik kami agad.',
    ],
  },
  bea: {
    DRAFTSTART: [
      'Abangan natin kung sino ang kukuha ng malakas na jungler — malaking bagay yan sa Turtle at Lord.',
      'Para sa akin, ang draft na may magandang objective control ang mananaig ngayong game.',
      'Tingnan natin kung sino ang mag-iisip ng early Turtle sa draft na ito.',
    ],
    GAMESTART: [
      'Abangan natin ang unang Turtle — malaking bagay ang maagang objective.',
      'Bantay-sarado ang jungle sa simula — sino kaya ang unang makaka-invade?',
      'Unang buff, unang Turtle — doon magsisimula ang labanan sa mapa.',
    ],
    BREAK: [
      'Habang break, isipin niyo: aling team ang mas maganda ang kontrol sa mga objective?',
      'Pagbalik natin, bantayan ang Turtle at Lord — doon madalas nagbabago ang laro.',
    ],
  },
  mika: {
    DRAFTSTART: [
      'I-comment niyo na kung anong hero ang gusto niyong makita sa draft na ito!',
      'Ingay naman diyan para sa {teamA} at {teamB}! Simula na ang draft!',
      'Sino ang manok niyo ngayong Game {gameNumber}? Comment na, mga ka-TCC!',
    ],
    GAMESTART: [
      'Ingay naman diyan, mga ka-TCC! Simula na ang Game {gameNumber}!',
      'I-comment niyo na kung sino ang mananalo sa Game {gameNumber}!',
      'Good luck sa {teamA} at {teamB}! Enjoy sa panonood, mga ka-TCC!',
    ],
    BREAK: [
      'Habang naghihintay, i-follow niyo muna ang TCC Esports, mga ka-TCC!',
      'Panoorin muna natin ang mga highlight habang naghihintay!',
      'I-comment niyo kung sino ang MVP niyo so far!',
    ],
  },
};
for (const [id, groups] of Object.entries(PHASE_LINES)) Object.assign(PERSONA_LINES[id as CasterId], groups);

// ── Draft play-by-play reactions (after a ban / pick call, or during draft talk) ──
const DRAFT_LINES: Record<CasterId, Partial<Record<LineGroup, string[]>>> = {
  marco: {
    DRAFTBAN: ['Disiplinadong ban — inaalis nila ang pinakamalaking banta.', 'Ganyan ang paghahanda: alam nila kung ano ang kinatatakutan nila.'],
    DRAFTPICK: ['Tingnan natin kung paano gagamitin ng {team} ang {hero} sa rotation.', 'Maganda ang timing ng pick na yan sa draft.'],
    DRAFTTALK: ['Sa draft, binabasa ng bawat team ang isa\'t isa — parang chess.', 'Pansinin niyo kung sino ang nagbibigay ng priority sa jungle at roam.'],
  },
  ken: {
    DRAFTBAN: ['Ban na! Wala nang atrasan!', 'Ayan! Tinanggal agad!'],
    DRAFTPICK: ['LOCKED IN! {hero}!', 'ITO NA! {hero} para kay {player}!', 'Pang-gyera ang pick na yan!'],
    DRAFTTALK: ['Init na init na ang draft, mga ka-TCC!', 'Ramdam ko na ang laban kahit draft pa lang!'],
  },
  lyka: {
    DRAFTBAN: ['Isa na namang ban — paunti nang paunti ang opsyon.'],
    DRAFTPICK: ['{player} sa {hero} — abangan natin ang numero niya ngayong game.'],
    DRAFTTALK: ['Para sa record: {seriesScore} ang serye ngayon.', 'Kailangan ng {winsNeeded} panalo — kaya bawat draft, may bigat.'],
  },
  trixie: {
    DRAFTBAN: ['Ay, sayang! Gusto ko pa naman makita ang {hero}!', 'Ban agad? Takot sila diyan, mga lods!'],
    DRAFTPICK: ['Ay, gusto ko yan! Clutch hero ang {hero}!', 'Naku, delikado ang {hero} kapag maganda ang timing!'],
    DRAFTTALK: ['Kinakabahan ako sa susunod na pick, totoo lang!', 'Abangan natin kung may surprise pick!'],
  },
  rafa: {
    DRAFTBAN: ['Kung ako ang coach, ganyan din ang ban ko.', 'Ban pa lang, kita mo na ang paghahanda ng {team}.'],
    DRAFTPICK: ['Kung ako ang coach, masaya ako sa pick na yan.', 'Malinaw ang win condition — at ang {hero} ang isa sa mga susi.'],
    DRAFTTALK: ['Kung ako ang coach, ang tanong ko ngayon: ano ang kulang sa lineup?', 'Draft pa lang, kalahati na ng laban — tandaan niyo yan.'],
  },
  jun: {
    DRAFTBAN: ['Isang ban na may kuwento — respeto sa kalaban yan.'],
    DRAFTPICK: ['Mga kaibigan, abangan natin kung anong kuwento ang isusulat ni {player} gamit ang {hero}.'],
    DRAFTTALK: ['Bawat draft, may kuwento — at isinusulat pa lang natin ang kabanatang ito.'],
  },
  bea: {
    DRAFTBAN: ['Pansinin niyo kung ilang jungle hero na ang natatanggal.'],
    DRAFTPICK: ['Abangan natin kung paano makakatulong ang {hero} sa kontrol ng Turtle at Lord.'],
    DRAFTTALK: ['Ang tanong ko: sino ang mas malakas sa early objectives sa draft na ito?'],
  },
  mika: {
    DRAFTBAN: ['Sino dito ang nalungkot na banned ang {hero}? Comment na!'],
    DRAFTPICK: ['Fans ng {hero}, ingay naman diyan!', 'I-comment niyo kung gusto niyo ang pick na yan!'],
    DRAFTTALK: ['Ano ang gusto niyong makita sa draft na ito? Comment na, mga ka-TCC!'],
  },
};
for (const [id, groups] of Object.entries(DRAFT_LINES)) Object.assign(PERSONA_LINES[id as CasterId], groups);

/**
 * How each caster answers when the other caster just spoke to them by name.
 * greet — after "Welcome sa drafting phase natin, partner …!"; agree — otherwise.
 */
export const PERSONA_ACK: Record<CasterId, { greet: string[]; agree: string[] }> = {
  marco: { greet: ['Salamat, {partner}.', 'Salamat, partner {partner}.', 'Maraming salamat, {partner}.'], agree: ['Tama, {partner}.', 'Sige, {partner}.'] },
  ken: { greet: ['Salamat, partner {partner}!', 'Yes, partner {partner}!', 'Ayos, salamat {partner}!'], agree: ['Tama ka, {partner}!', 'Sige, {partner}!'] },
  lyka: { greet: ['Salamat, {partner}!', 'Hi, partner {partner}!', 'Thank you, {partner}!'], agree: ['Tama, {partner}!', 'Sige, {partner}!'] },
  trixie: { greet: ['Hi, {partner}!', 'Salamat, partner {partner}!', 'Uy, salamat {partner}!'], agree: ['Tama, {partner}!', 'Sige, {partner}!'] },
  rafa: { greet: ['Salamat, {partner}.', 'Salamat, partner {partner}.', 'Maraming salamat, {partner}.'], agree: ['Tama, {partner}.', 'Sige, {partner}.'] },
  jun: { greet: ['Salamat, {partner}.', 'Maraming salamat, partner {partner}.', 'Salamat, kaibigan kong {partner}.'], agree: ['Tama ka, {partner}.', 'Sige, {partner}.'] },
  bea: { greet: ['Salamat, {partner}!', 'Hi, partner {partner}!', 'Thank you, {partner}!'], agree: ['Tama, {partner}!', 'Sige, {partner}!'] },
  mika: { greet: ['Salamat, partner {partner}!', 'Hello, {partner}!', 'Thank you, partner {partner}!'], agree: ['Tama, {partner}!', 'Sige, {partner}!'] },
};

export const personaLineCount = () =>
  Object.values(PERSONA_LINES).reduce((n, groups) => n + Object.values(groups).reduce((m, arr) => m + (arr?.length ?? 0), 0), 0);

// ─────────────────────────────────────────────────────────────────────────────
// 30,000+ line generator (zero storage, zero API calls).
//
// Every caster line = [opener] + core + [closer]:
//   • core     — the statement: the caster's own lines above + shared group lines
//   • opener   — a short, complete interjection in that caster's voice (hype or calm)
//   • closer   — a short, complete sign-off in that caster's voice
// Each part is a full sentence, so every combination reads naturally. The exact
// number of unique combinations is computed by libraryStats().
// ─────────────────────────────────────────────────────────────────────────────

/**
 * hype      — action calls (kills, objectives, steals, replays)
 * celebrate — game intros, results, series wins, champions (no "PATAY!"-style calls)
 * calm      — draft, contests, gold, spells, desk banter
 */
export type Mood = 'hype' | 'celebrate' | 'calm';

export const GROUP_MOOD: Record<LineGroup, Mood> = {
  DRAFTBAN: 'calm',
  DRAFTPICK: 'celebrate',
  DRAFTTALK: 'calm',
  DRAFTSTART: 'calm',
  GAMESTART: 'celebrate',
  BREAK: 'calm',
  INTRO: 'celebrate',
  DRAFT: 'calm',
  KILL: 'hype',
  BIGKILL: 'hype',
  OBJECTIVE: 'hype',
  STEAL: 'hype',
  CONTEST: 'calm',
  GOLD: 'calm',
  EVEN: 'calm',
  SPELL: 'calm',
  REPLAY: 'hype',
  RESULT: 'celebrate',
  VICTORY: 'celebrate',
  CHAMPION: 'celebrate',
  BANTER: 'calm',
};

export const LINE_GROUPS = Object.keys(GROUP_MOOD) as LineGroup[];

interface PersonaVoice {
  openers: Record<Mood, string[]>;
  closers: Record<Mood, string[]>;
}

export const PERSONA_VOICE: Record<CasterId, PersonaVoice> = {
  marco: {
    openers: {
      hype: ['Ang ganda niyan!', 'Malinis!', 'Ayan na!', 'Tama ang basa!', 'Wow.', 'Napakaganda.', 'Ayan ang disiplina!', 'Textbook!'],
      celebrate: ['Ayan na tayo!', 'Magandang laban ito.', 'Okay, mga ka-TCC.', 'Napakaganda.', 'Ito na.', 'Tama yan.', 'Exactly.', 'Handa na tayo.'],
      calm: ['Okay, himayin natin.', 'Pansinin niyo ito.', 'Tama yan.', 'Exactly.', 'Ganito yan, mga ka-TCC.', 'Dahan-dahan lang tayo.', 'Tingnan natin.', 'Analysis time.'],
    },
    closers: {
      hype: ['Disiplina yan.', 'Ganyan ang macro.', 'Tandaan niyo yan.', 'Detalye ang nagpanalo diyan.', 'Simple pero epektibo.'],
      celebrate: ['Disiplina ang susi.', 'Tandaan niyo yan.', 'Ganyan ang tamang laro.', 'Detalye ang nagdedesisyon.', 'Respeto sa parehong team.'],
      calm: ['Vision is everything.', 'Tandaan niyo yan.', 'Maliit na detalye, malaking epekto.', 'Ganyan ang tamang laro.', 'Pasensya ang susi.'],
    },
  },
  ken: {
    openers: {
      hype: ['GRABE!', 'ANO BA YAN!', 'ITO NA, ITO NA!', 'PATAY!', 'ANG LAKAS!', 'SIGE PA!', 'LINIS!', 'HALA!'],
      celebrate: ['ITO NA, ITO NA!', 'GRABE!', "LET'S GO!", 'WOOO!', 'AYAN NA!', 'INGAY, MGA KA-TCC!', 'ANG GANDA!', 'SIGAW NAMAN DIYAN!'],
      calm: ['Okay, okay!', 'Abangan niyo!', 'Teka lang!', 'Ayos!', 'Ramdam ko na!', 'Hoy, hoy!', 'Ito na!', 'Uy!'],
    },
    closers: {
      hype: ['GRABE TALAGA!', 'WALANG TAKAS!', 'ANG LAKAS!', 'Pang-highlight yan!', 'Init na init!'],
      celebrate: ['GRABE TALAGA!', 'Init na init!', 'Ito ang gusto natin!', 'Ramdam niyo ba yan?!', "LET'S GO!"],
      calm: ['Abangan niyo yan!', 'Ramdam ko, may gulo na!', 'Konting tiis lang!', 'Hindi pa tapos ito!', 'Handa na ako!'],
    },
  },
  lyka: {
    openers: {
      hype: ['Ayan ang numbers!', 'Boom!', 'Check!', 'Nakita niyo yun?', 'Wow!', 'Uy!', 'Grabe ang numero!', 'Ayan na!'],
      celebrate: ['Okay, scoreboard!', 'Ayan na!', 'Wow!', 'Check!', 'Para sa record.', 'Uy!', 'Numbers time!', 'Ito na!'],
      calm: ['Numbers check.', 'Quick stat lang.', 'Tingnan natin ang stats.', 'Ito ang numero.', 'Data muna tayo.', 'Tempo check.', 'Okay, scoreboard.', 'Sa record.'],
    },
    closers: {
      hype: ["Numbers don't lie.", 'Kitang-kita sa stats.', 'Tempo is king.', 'Bilangin natin!', 'Data ang nagsasalita.'],
      celebrate: ["Numbers don't lie.", 'Tandaan ang numero.', 'Kitang-kita sa stats.', 'Data ang nagsasalita.', 'Ganyan ang numbers.'],
      calm: ["Numbers don't lie.", 'Tandaan ang numero.', 'Tempo is king.', 'Bantayan natin ang scoreboard.', 'Data ang nagsasalita.'],
    },
  },
  trixie: {
    openers: {
      hype: ['Clutch!', 'Naku po!', 'Hala siya!', 'Wow, clutch!', 'Ay grabe!', 'Yes!', 'Ang galing!', 'Uy, uy!'],
      celebrate: ['Yes!', 'Ay grabe!', 'Wow!', 'Uy, uy!', 'Kinikilig ako!', 'Hala siya!', 'Ang galing!', 'Ayan na!'],
      calm: ['Spell watch.', 'Naku, mga lods.', 'Hmm.', 'Teka, teka.', 'Ay, delikado.', 'Bantayan natin.', 'Alam niyo ba?', 'Ingat, ingat.'],
    },
    closers: {
      hype: ['Clutch o clutch?', 'Galing!', 'Hala siya!', 'Ang linis!', 'Kinilig ako dun!'],
      celebrate: ['Galing!', 'Ang saya nito!', 'Kinikilig ako!', 'Grabe, ang ganda!', 'Yes, yes!'],
      calm: ['Huwag mag-face-check!', 'Ingat sa spells!', 'Kinakabahan ako!', 'Bantayan ang cooldowns!', 'Clutch o kapalpakan?'],
    },
  },
  rafa: {
    openers: {
      hype: ['Gumagana ang plano!', 'Ayan ang execution!', 'Textbook!', 'Ganyan dapat!', 'Perfect!', 'Yan ang win condition!', 'Nagbunga!', 'Malinis ang plano!'],
      celebrate: ['Okay.', 'Pakinggan niyo ito.', 'Malinaw ito.', 'Ito ang take ko.', 'Ayan na.', 'Strategically.', 'Mahalaga ito.', 'Tingnan natin.'],
      calm: ['Ito ang take ko.', 'Game plan check.', 'Pakinggan niyo ito.', 'Strategically.', 'Malinaw ito.', 'Coach mode muna tayo.', 'Sa tingin ko.', 'Tingnan natin ang plano.'],
    },
    closers: {
      hype: ['Textbook yan.', 'Game plan, executed.', 'Win condition yan.', 'Preparation ang susi.', 'Ganyan ang coaching.'],
      celebrate: ['Preparation ang susi.', 'Ganyan ang coaching.', 'Adjustments ang labanan.', 'Plano muna bago laro.', 'Tandaan ang draft.'],
      calm: ['Tandaan ang draft.', 'Preparation ang susi.', 'Adjustments ang labanan.', 'Plano muna bago laro.', 'Ganyan ang coaching.'],
    },
  },
  jun: {
    openers: {
      hype: ['Ay, ang ganda!', 'Hindi ko malilimutan ito!', 'Kasaysayan ito!', 'Ganyan ang laban!', 'Napakaganda!', 'Ito ang esports!', 'Naku!', 'Ang sarap panoorin!'],
      celebrate: ['Ay, ang ganda!', 'Mga kaibigan.', 'Napakaganda nito.', 'Kasaysayan ito!', 'Ito ang esports!', 'Alam niyo.', 'Sa totoo lang.', 'Ang sarap panoorin!'],
      calm: ['Alam niyo, mga kaibigan.', 'Ito ang masasabi ko.', 'Hay naku.', 'Napakaganda nito.', 'Sa totoo lang.', 'Mga kaibigan.', 'Ganito ang kuwento.', 'Isipin niyo ito.'],
    },
    closers: {
      hype: ['Kasaysayan ito.', 'Ito ang esports.', 'Ang ganda ng kuwento.', 'Puso ang labanan.', 'Hindi ito malilimutan.'],
      celebrate: ['Bilog ang bola.', 'Ito ang esports.', 'Puso ang labanan.', 'Respeto sa parehong team.', 'Kasaysayan ito.'],
      calm: ['Bilog ang bola.', 'Ito ang esports.', 'Salamat sa laban.', 'Puso ang labanan.', 'Abangan ang susunod na kabanata.'],
    },
  },
  bea: {
    openers: {
      hype: ['Ayan ang kuha!', 'Pasok!', 'Nakuha!', 'Slain!', 'Ang linis!', 'Yes!', 'Ayan na!', 'Grabe ang timing!'],
      celebrate: ['Ayan na!', 'Okay!', 'Yes!', 'Ang ganda!', 'Ito na!', 'Uy!', 'Grabe!', 'Tara na!'],
      calm: ['Objective check.', 'Jungle update.', 'Bantayan natin ito.', 'Tingnan ang mapa.', 'Pit watch.', 'Okay, jungle talk.', 'Abangan natin.', 'Pansinin niyo.'],
    },
    closers: {
      hype: ['Objectives win games.', 'Kontrol ng mapa yan.', 'Huling hit ang susi.', 'Bantay-sarado!', 'Malinis ang jungle!'],
      celebrate: ['Objectives win games.', 'Kontrol ng mapa ang susi.', 'Ganyan ang tamang laro.', 'Respeto sa parehong team.', 'Ang saya nito!'],
      calm: ['Objectives win games.', 'Abangan ang spawn.', 'Huling hit ang susi.', 'Bantay-sarado ang pit.', 'Kontrol ng mapa ang labanan.'],
    },
  },
  mika: {
    openers: {
      hype: ['Ingay naman diyan!', 'Grabe kayo, chat!', 'Wooo!', 'Palakpakan natin!', 'Ay, ang saya!', 'Let\'s go!', 'Grabe!', 'Yes, yes!'],
      celebrate: ['Ingay naman diyan!', 'Wooo!', "Let's go!", 'Palakpakan natin!', 'Ay, ang saya!', 'Grabe kayo, chat!', 'Yes, yes!', 'Hello, mga ka-TCC!'],
      calm: ['Hello sa lahat ng nanonood!', 'Shoutout sa chat!', 'Okay, everyone!', 'Uy, chat!', 'Quick reminder!', 'Kumusta, mga ka-TCC?', 'Real talk!', 'Sige, mga ka-TCC!'],
    },
    closers: {
      hype: ['Comment na kayo!', 'Ang saya nito!', 'Palakpakan natin!', 'I-clip niyo na yan!', 'Ingay pa, chat!'],
      celebrate: ['Comment na kayo!', 'Ang saya nito!', 'Palakpakan natin!', 'Ingay pa, chat!', 'Salamat sa panonood!'],
      calm: ['Stay tuned!', 'Comment na kayo!', 'Salamat sa panonood!', 'Huwag aalis, ha!', 'Ang saya nito!'],
    },
  },
};

/** Role-neutral core statements every caster can say (combined with their own voice). */
export const SHARED_CORES: Record<LineGroup, string[]> = {
  DRAFTBAN: [
    'Malinaw ang mensahe ng ban na yan.',
    'Respeto sa {hero} yan.',
    'Ayaw nilang makaharap ang {hero} ngayong game.',
    'Matalinong ban, sa totoo lang.',
    'Isa-isang nababawasan ang mga opsyon ng {enemy}.',
  ],
  DRAFTPICK: [
    'Magandang pick yan para sa {team}.',
    'Abangan natin ang {hero} sa kamay ni {player}.',
    'Ayan na ang {hero}!',
    'Unti-unting nabubuo ang lineup ng {team}.',
    'Malakas na {heroClass} ang {hero} sa ganitong draft.',
  ],
  DRAFTTALK: [
    'Mainit ang draft ngayong Game {gameNumber}.',
    'Bawat pick at ban, may dahilan.',
    'Abangan natin ang susunod na desisyon.',
    'Paunti nang paunti ang mga hero na natitira.',
    '{seriesScore} ang serye — kaya mahalaga ang draft na ito.',
  ],
  DRAFTSTART: [
    'Simula na ang drafting phase ng Game {gameNumber}.',
    'Abangan natin ang mga ban at pick ng dalawang team.',
    'Dito makikita ang game plan ng {teamA} at {teamB}.',
    '{blueTeam} sa blue side, {redTeam} sa red side.',
    'Draft pa lang, mahalaga na ang bawat desisyon.',
    'Sino kaya ang unang magpapakita ng diskarte?',
    'Game {gameNumber} ng {format} — {seriesScore} ang serye.',
  ],
  GAMESTART: [
    'Simula na ang Game {gameNumber}.',
    'Kumpleto na ang draft — laban na!',
    '{blueTeam} sa blue side, {redTeam} sa red side.',
    'Abangan natin ang unang engagement.',
    'Bagong laro, bagong pagkakataon.',
    '{seriesScore} ang serye.',
    'Good luck sa parehong team.',
  ],
  BREAK: [
    'Sulit ang paghihintay, pangako yan.',
    'Babalik kami agad, mga ka-TCC.',
    'Panoorin muna natin ang mga highlight habang naghihintay.',
    'Kuha muna kayo ng tubig at meryenda.',
    'Babalik kami pagkalipas ng {breakMins} minuto.',
    'Huwag kayong aalis — babalik kami agad.',
    'Salamat sa patuloy na panonood, mga ka-TCC.',
  ],
  INTRO: [
    'Game {gameNumber} na ng {format}, at {seriesScore} ang serye.',
    'Simula na ang Game {gameNumber} — {teamA} laban sa {teamB}.',
    '{blueTeam} sa blue side, {redTeam} sa red side.',
    'Kailangan ng {winsNeeded} panalo para makuha ang serye.',
    'Bagong game, bagong pagkakataon para sa dalawang team.',
    'Ito ang {stage} ng {tournament}.',
    'Malaki ang nakataya sa larong ito.',
    'Parehong gutom sa panalo ang dalawang team.',
  ],
  DRAFT: [
    'Kumpleto na ang draft ng dalawang team.',
    'Sa blue side: {bluePicks}.',
    'Sa red side: {redPicks}.',
    'Execution na ang magdedesisyon mula dito.',
    'Tingnan natin kung aling lineup ang mas papasok sa laro.',
    'Parehong may malinaw na plano ang {blueTeam} at {redTeam}.',
    'Ang unang teamfight ang magpapakita kung sino ang mas handa.',
    'Locked in na ang lineups para sa Game {gameNumber}.',
  ],
  KILL: [
    '{player} ang may kill para sa {team}.',
    'Ramdam na ang pressure sa {enemy}.',
    '{team} ngayon, {kills} kills na.',
    'Malinis ang pagkakapatay na yan.',
    'Kailangang mag-regroup ng {enemy}.',
    'Momentum ngayon para sa {team}.',
    '{player} sa {hero}, nag-iinit na.',
    'Hindi pinalampas ng {team} ang pagkakataon.',
  ],
  BIGKILL: [
    '{player} ang bida ng teamfight na ito.',
    'Halos wala nang natira sa {enemy}.',
    'Bukas ang buong mapa para sa {team}.',
    '{player}, {kda} na ang KDA ngayon.',
    'Pang-highlight reel ang teamfight na yan.',
    'Kailangang mag-ingat ng {enemy} sa susunod na engage.',
    'Sa {team} ang sandaling ito.',
    'Napakalaking swing ng teamfight na yan.',
  ],
  OBJECTIVE: [
    '{objective} slain by {player}.',
    'Sa {team} ang {objective}.',
    'Malinis ang kuha ng {objective} para sa {team}.',
    'Dagdag advantage para sa {team} dahil sa {objective}.',
    'Kailangang sumagot ng {enemy} pagkatapos niyan.',
    'Tamang timing ang kuha ng {objective}.',
    'Kontrolado ng {team} ang paligid ng pit.',
    '{objCount} {objective} na ang {team} ngayon.',
  ],
  STEAL: [
    'Inagaw ng {team} ang {objective}.',
    'Slain by {player} — sa huling hit nakuha!',
    'Nasayang ang setup ng {enemy}.',
    'Hindi inaasahan ng {enemy} ang steal na yan.',
    'Ganyan kahalaga ang huling hit.',
    'Malaking dagok ito sa {enemy}.',
    'Sa {team} napunta ang pinaghirapan ng {enemy}.',
    'Kahit sinong hero, pwedeng tumama ng huling hit — at nakuha ng {team}.',
  ],
  CONTEST: [
    'Sino kaya ang makakakuha ng {objective}?',
    'Nagtitipon na ang dalawang team sa {objective}.',
    'Kritikal ang huling hit sa {objective}.',
    'Abangan natin ang labanan sa {objective}.',
    'Isang maling galaw lang, pwedeng maagaw ang {objective}.',
    'Lahat ng mata nasa {objective} ngayon.',
    '{blueTeam} o {redTeam} — sino kaya ang makakakuha?',
    'Mainit ang paligid ng {objective}.',
  ],
  GOLD: [
    'Lamang ang {leader} ng {gold}.',
    'Kailangan ng {trailer} na makahabol.',
    '{gold} ang agwat sa gold ngayon.',
    'Kontrolado ng {leader} ang tempo.',
    'Item advantage na ang hawak ng {leader}.',
    'Isang magandang teamfight lang ang kailangan ng {trailer}.',
    'Kills: {blueTeam} {blueKills}, {redTeam} {redKills}.',
    'Mas maagang power spike para sa {leader}.',
  ],
  EVEN: [
    'Pantay ang gold ng dalawang team.',
    'Kills: {blueTeam} {blueKills}, {redTeam} {redKills}.',
    'Walang lamang sa ekonomiya ngayon.',
    'Kahit sino, pwedeng manalo dito.',
    'Ang susunod na objective ang magbubukas ng laro.',
    'Dikit na dikit ang laban.',
  ],
  SPELL: [
    'Ginamit ni {player} ang {spell}.',
    'Naka-cooldown na ang {spell} ni {player}.',
    'Mga {cooldown} segundo bago bumalik ang {spell}.',
    'Window ito para sa {enemy}.',
    'Bantayan natin ang cooldown ng {spell}.',
    'Delikado ngayon si {player} habang wala ang {spell}.',
  ],
  REPLAY: [
    'Balikan natin ang play na yan.',
    'Pansinin ang positioning sa replay.',
    'Ganyan kalinis ang execution.',
    '{replayTitle}.',
    'Tingnan ang timing ng skills dito.',
    'Kahit ilang beses panoorin, ang ganda pa rin.',
    'Dito nagsimula ang lahat.',
  ],
  RESULT: [
    'Panalo ang {winner} sa Game {gameNumber}.',
    'Series score: {winner} {winnerScore}, {loser} {loserScore}.',
    'Kailangang mag-adjust ng {loser} sa susunod na game.',
    'Hindi pa tapos ang serye.',
    'Malaking panalo ito para sa {winner}.',
    'Abangan ang sagot ng {loser}.',
  ],
  VICTORY: [
    'Panalo ang {winner} sa serye, {winnerScore}-{loserScore}.',
    'Abante ang {winner}.',
    'Magandang laban, {loser}.',
    'Karapat-dapat ang panalo ng {winner}.',
    'Tapos na ang serye — {winner} ang wagi.',
    'Saludo sa parehong team.',
  ],
  CHAMPION: [
    '{winner} ang kampeon ng {tournament}!',
    'Congratulations, {winner}!',
    '{winnerScore}-{loserScore} sa Grand Final.',
    'Saludo kami sa {loser}.',
    'Isusulat ang {winner} sa kasaysayan ng {tournament}.',
    'Mga kampeon, {winner}!',
  ],
  BANTER: [
    'Tahimik muna ang mapa.',
    'Abangan ang susunod na objective.',
    'Mahalaga ang vision sa ganitong sitwasyon.',
    'Game {gameNumber}, {seriesScore} ang serye.',
    'Kills: {blueTeam} {blueKills}, {redTeam} {redKills}.',
    'Pasensya ang susi sa ganitong phase.',
    'Sino kaya ang unang gagalaw?',
    'Salamat sa lahat ng nanonood, mga ka-TCC.',
  ],
};

/** A core that already opens with a shouted call ("PATAY! …") gets no extra opener. */
const opensWithShout = (s: string) => /^[A-Z][A-Z0-9 ,'’-]*[!?]/.test(s);
const firstWord = (s: string) => s.toLowerCase().replace(/[^a-z0-9 -]/g, '').split(' ')[0];
const clash = (part: string, core: string) =>
  (part.toLowerCase().includes('ka-tcc') && core.toLowerCase().includes('ka-tcc')) || firstWord(part) === firstWord(core) || core.toLowerCase().includes(part.toLowerCase().replace(/[!.?]+$/, ''));

export const coresFor = (caster: CasterId, group: LineGroup) => [...(PERSONA_LINES[caster]?.[group] ?? []), ...SHARED_CORES[group]];

/** Sign-off closers that only make sense at the end of a game or the show — never while welcoming. */
const SIGN_OFF = /salamat sa (panonood|laban)|respeto sa parehong team/i;
const WELCOME_GROUPS = new Set<LineGroup>(['DRAFTSTART', 'GAMESTART', 'DRAFTPICK', 'DRAFTBAN', 'DRAFTTALK']);

function partsFor(caster: CasterId, group: LineGroup, core: string) {
  const voice = PERSONA_VOICE[caster];
  const mood = GROUP_MOOD[group];
  // Break lines are complete sign-posts ("Mag-break muna tayo…") — an extra interjection in front only muddles them.
  const openers = opensWithShout(core) || group === 'BREAK' ? [''] : ['', ...voice.openers[mood].filter((o) => !clash(o, core))];
  const closers = ['', ...voice.closers[mood].filter((c) => !clash(c, core) && !(WELCOME_GROUPS.has(group) && SIGN_OFF.test(c)))];
  return { openers, closers };
}

const MAX_WORDS = 30;
const joinParts = (...parts: string[]) => parts.filter(Boolean).join(' ');

/** Every unique line template a caster can say (for counting, browsing and export). */
export function* enumerateLines(caster: CasterId, group?: LineGroup): Generator<{ group: LineGroup; text: string }> {
  const seen = new Set<string>();
  for (const g of group ? [group] : LINE_GROUPS) {
    for (const core of coresFor(caster, g)) {
      const { openers, closers } = partsFor(caster, g, core);
      for (const o of openers)
        for (const c of closers) {
          const text = joinParts(o, core, c);
          if (seen.has(text)) continue;
          seen.add(text);
          yield { group: g, text };
        }
    }
  }
}

let statsCache: { perCaster: Record<string, number>; total: number } | null = null;

/** Exact number of unique line templates per caster (and total). Computed once. */
export function libraryStats() {
  if (statsCache) return statsCache;
  const perCaster: Record<string, number> = {};
  let total = 0;
  for (const caster of Object.keys(PERSONA_VOICE) as CasterId[]) {
    let n = 0;
    const it = enumerateLines(caster);
    while (!it.next().done) n++;
    perCaster[caster] = n;
    total += n;
  }
  statsCache = { perCaster, total };
  return statsCache;
}

/**
 * Compose one fresh line for a caster: picks a core that hasn't been used
 * recently, then (sometimes) wraps it with the caster's own opener/closer.
 * `fill` resolves {placeholders}; cores with unknown facts are skipped.
 */
export function composeLine(
  caster: CasterId,
  group: LineGroup,
  fill: (template: string) => string | null,
  recentlyUsed: Set<string>,
  avoidTexts: Set<string>,
  opts: { noOpener?: boolean } = {},
): { id: string; text: string } | null {
  const cores = coresFor(caster, group)
    .map((t) => ({ t, id: `C|${caster}|${t}`, text: fill(t) }))
    .filter((c): c is { t: string; id: string; text: string } => Boolean(c.text) && !avoidTexts.has(c.text!));
  if (!cores.length) return null;
  const fresh = cores.filter((c) => !recentlyUsed.has(c.id));
  const pool = fresh.length ? fresh : cores;
  const core = pool[Math.floor(Math.random() * pool.length)];
  const { openers, closers } = partsFor(caster, group, core.t);
  const pick = (arr: string[], chance: number) => (arr.length > 1 && Math.random() < chance ? arr[1 + Math.floor(Math.random() * (arr.length - 1))] : '');
  const opener = opts.noOpener ? '' : pick(openers, 0.5);
  let closer = pick(closers, 0.3);
  if (joinParts(opener, core.text, closer).split(/\s+/).length > MAX_WORDS) closer = '';
  return { id: core.id, text: joinParts(opener, core.text, closer) };
}
