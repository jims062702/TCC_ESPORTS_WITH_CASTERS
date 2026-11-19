import type { GameEvent, ScriptEntry } from '@/types';
import type { CommentaryFacts } from './facts';
import { leadCaster, type CasterId } from './casters';
import { MAJOR_GROUPS, PERSONA_VOICE, composeLine, groupForKey, libraryStats, type LineGroup } from './personaLines';
import { SPELL_COOLDOWN } from '@/lib/constants';
import { formatGold, pickRandom } from '@/lib/utils';

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
  'LORD',
  'LORD_STEAL',
  'BUFF',
  'BUFF_STEAL',
  'GOLD_UPDATE',
  'GOLD_EVEN',
  'SPELL_USED',
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
};

type Pair = [string, string];

const BUILTIN: Record<ScriptKey, Pair[]> = {
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
    ['Buff secured ng {team}!', 'Slain by {player} — tuloy-tuloy ang farm at tempo nila.'],
    ['Nakuha ni {player} ang buff para sa {team}.', 'Maliit na detalye, pero malaking tulong sa jungle control.'],
    ['Buff para sa {team}!', 'Malinis ang jungle pathing — kontrolado nila ang tempo.'],
    ['Buff slain by {player}!', 'Ganyan ang disiplina sa jungle, mga ka-TCC.'],
  ],
  BUFF_STEAL: [
    ['BUFF STEAL! Inagaw ng {team} ang buff!', 'Slain by {player}! Pasok sa jungle ng kalaban, labas na may premyo!'],
    ['Naagaw ang buff! {player} ang tumapos!', 'Masakit yan sa {enemy} — nasira ang buong pathing nila.'],
    ['Ay! Ninakaw ng {team} ang buff!', 'Ganyan ang invade — matapang at may tamang timing.'],
    ['Sa {team} napunta ang buff ng {enemy}!', '{player}, ang lakas ng loob! Kumpiyansa ang galaw na yan.'],
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
    ['Ginamit ni {player} ang {spell}!', 'Mga {cooldown} segundo bago bumalik yan — window yan para sa {enemy}.'],
    ['Wala nang {spell} si {player}!', 'Naku, {enemy}, ito na ang pagkakataon niyo!'],
    ['{spell} ni {player}, nagamit na!', 'Bantayan natin ang cooldown — {cooldown} segundo ang hihintayin.'],
    ['Ayan, {spell} na! Napilitang gumamit si {player}.', 'Kung tama ang tracking ng {enemy}, pwede silang mag-engage agad.'],
    ['Spell watch: naka-cooldown ang {spell} ni {player}.', 'Clutch o kapalpakan? Malalaman natin sa susunod na engagement!'],
  ],
  INSTANT_REPLAY: [
    ['Balikan natin yan! {replayTitle}!', 'Panoorin niyo ulit, mga ka-TCC — ganyan kalinis ang execution!'],
    ['INSTANT REPLAY! {replayTitle}!', '{replayDesc}'],
    ['Replay natin yan! Tingnan niyo ang positioning dito.', '{replayTitle} — perpekto ang timing!'],
    ['Ulitin natin! {replayTitle}!', 'Dahan-dahanin natin — dito nagsimula ang lahat!'],
    ['Ito ang replay na hinihintay niyo! {replayTitle}!', 'Kahit ilang beses panoorin, nakakakilabot pa rin!'],
    ['Balikan natin ang play ni {player}!', '{replayTitle} — pang-highlight reel yan!'],
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
    ['Buff para kay {player}!', 'Malinis na jungle rotation para sa {team}.'],
    ['Nakuha ng {team} ang buff!', 'Tuloy ang farm, tuloy ang pressure.'],
  ],
  BUFF_STEAL: [
    ['Invade! Naagaw ng {team} ang buff!', 'Slain by {player} — nasa teritoryo pa mismo ng {enemy}!'],
    ['BUFF STEAL ni {player}!', 'Grabe ang tapang — pasok sa jungle ng {enemy}, labas na may premyo!'],
  ],
  GOLD_UPDATE: [
    ['Abante ang {leader} sa gold — {gold}!', 'Pero hindi pa tapos ang laro. Isang Lord lang, pwedeng mabaliktad.'],
    ['Lamang ng {gold} ang {leader}, mga ka-TCC.', 'Kailangang mag-ingat ng {trailer} — bawat death ngayon ay mas masakit.'],
    ['Gold update: {leader}, plus {gold}.', 'Kitang-kita sa mapa — mas mabilis ang rotations nila.'],
  ],
  SPELL_USED: [
    ['Nasunog na ang {spell} ni {player}!', 'May {cooldown} segundo ang {enemy} para samantalahin yan.'],
    ['{player}, ginamit ang {spell}!', 'Clutch? Oo. Pero ngayon, wala na siyang panangga.'],
  ],
  INSTANT_REPLAY: [
    ['Panoorin natin ulit, mga ka-TCC! {replayTitle}!', 'Bawat galaw, sakto. Bawat skill, tama ang timing!'],
    ['Hindi pwedeng hindi natin ito balikan! {replayTitle}!', 'Ito ang klase ng play na pinag-uusapan hanggang bukas!'],
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
    v.spell = f.actor.spell;
    v.cooldown = String(SPELL_COOLDOWN[f.actor.spell as keyof typeof SPELL_COOLDOWN] ?? 90);
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
    v.replayTitle = f.replay.title || undefined;
    v.replayDesc = f.replay.description || undefined;
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

/** Most specific script keys first; generic keys are the fallback pool. */
export function scriptKeysFor(event: GameEvent, f: CommentaryFacts): { primary: ScriptKey[]; fallback: ScriptKey[] } {
  const need = f.winsNeeded;
  switch (event.type) {
    case 'GAME_INTRO': {
      const [sa, sb] = [f.scoreA, f.scoreB];
      if (f.gameNumber === 1) return { primary: ['GAME_INTRO_FIRST', 'GAME_INTRO'], fallback: [] };
      if (sa === need - 1 && sb === need - 1) return { primary: ['GAME_INTRO_DECIDER'], fallback: ['GAME_INTRO'] };
      if (sa === need - 1 || sb === need - 1) return { primary: ['GAME_INTRO_MATCHPOINT'], fallback: ['GAME_INTRO'] };
      return { primary: ['GAME_INTRO'], fallback: [] };
    }
    case 'TURTLE':
      return f.steal ? { primary: ['TURTLE_STEAL'], fallback: ['TURTLE'] } : { primary: ['TURTLE'], fallback: [] };
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

/**
 * Pick a pre-written shoutcast for this event from the built-in + pre-generated
 * library, skipping lines used recently. Returns [] if nothing fits.
 */
/** Compose one fresh, in-character line for a caster from the 30k+ line generator. */
function personaLine(casterId: string, group: LineGroup, vars: ScriptVars, recentlyUsed: Set<string>, avoid: Set<string>) {
  if (!(casterId in PERSONA_VOICE)) return null;
  return composeLine(casterId as CasterId, group, (t) => fillTemplate(t, vars), recentlyUsed, avoid);
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
): { lines: TemplateLine[]; ids: string[] } {
  const vars = scriptVars(facts);
  const { primary, fallback } = scriptKeysFor(event, facts);

  const candidates = (keys: ScriptKey[]) => {
    const out: { id: string; key: ScriptKey; lead: string; follow: string }[] = [];
    for (const key of keys) {
      const entries: Pair[] = [...BUILTIN[key], ...extra.filter((e) => e.key === key).map((e) => [e.lead, e.follow] as Pair)];
      for (const [leadT, followT] of entries) {
        const lead = fillTemplate(leadT, vars);
        const follow = fillTemplate(followT, vars);
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
  const [first, second] = leadCaster(pair, event.type);
  const group = groupForKey(choice.key);
  const ids = [choice.id];
  const said = new Set([choice.lead]);

  // 2. Partner answers in character (70%), otherwise the paired follow-up line.
  let follow = choice.follow;
  const reply = Math.random() < 0.7 ? personaLine(second, group, vars, recentlyUsed, said) : null;
  if (reply) {
    follow = reply.text;
    ids.push(reply.id);
  }
  said.add(follow);
  const lines: TemplateLine[] = [
    { casterId: first, text: choice.lead },
    { casterId: second, text: follow },
  ];

  // 3. Big moments: the lead caster sometimes closes the exchange.
  if (MAJOR_GROUPS.has(group) && Math.random() < 0.45) {
    const closer = personaLine(first, group, vars, recentlyUsed, said);
    if (closer) {
      lines.push({ casterId: first, text: closer.text });
      ids.push(closer.id);
    }
  }
  return { lines, ids };
}

/** Event call pairs written by hand. */
export const eventPairCount = () => Object.values(BUILTIN).reduce((n, arr) => n + arr.length, 0);

/** Built-in library size (shown in the booth): event call pairs + every unique caster line the generator can say. */
export const builtinCount = () => eventPairCount() + libraryStats().total;

export const builtinExamples = (key: ScriptKey) => BUILTIN[key];
