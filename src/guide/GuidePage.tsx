import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Check, Clapperboard, Copy, Gamepad2, LifeBuoy, Mic2, MonitorPlay, Rocket, Trophy } from 'lucide-react';
import { Logo, ThemeToggle } from '@/components/Brand';
import { useToast } from '@/components/Toast';
import { cn, safeLocalGet, safeLocalSet } from '@/lib/utils';

// ─────────────────────────────────────────────────────────────────────────────
// /guide — step-by-step setup & operations guide (public, works before
// Firebase is configured). Progress is remembered in this browser.
// ─────────────────────────────────────────────────────────────────────────────

const PROGRESS_KEY = 'tcc-guide-progress';

function Copyable({ text, label }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(text);
        toast.success('Copied');
      }}
      className="group my-1 flex w-full items-center justify-between gap-3 rounded-lg border border-line bg-ink-950 px-3 py-2 text-left font-mono text-[13px] text-teal-glow hover:border-brand/60"
    >
      <span className="min-w-0 break-all">{label ?? text}</span>
      <Copy className="h-4 w-4 shrink-0 text-ink-400 group-hover:text-white" />
    </button>
  );
}

const K = ({ children }: { children: ReactNode }) => <kbd className="rounded border border-line bg-surface2 px-1.5 py-0.5 font-mono text-[12px]">{children}</kbd>;
const B = ({ children }: { children: ReactNode }) => <strong className="font-semibold text-fg">{children}</strong>;
const Tip = ({ children }: { children: ReactNode }) => <p className="mt-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-[13px]">💡 {children}</p>;
const Warn = ({ children }: { children: ReactNode }) => <p className="mt-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-[13px]">⚠️ {children}</p>;

interface Step {
  id: string;
  title: string;
  body: ReactNode;
}
interface Part {
  id: string;
  title: string;
  subtitle: string;
  icon: typeof Rocket;
  steps: Step[];
}

function useParts(origin: string): Part[] {
  return useMemo(
    () => [
      {
        id: 'setup',
        title: 'One-time setup',
        subtitle: 'Free accounts, install, Firebase, Cloudinary, Gemini and deploy.',
        icon: Rocket,
        steps: [
          {
            id: 'accounts',
            title: 'Create the free accounts & install the tools',
            body: (
              <ul className="list-disc space-y-1 pl-5">
                <li><B>Google account</B> → Firebase (database + login) and Google AI Studio (Gemini key).</li>
                <li><B>Cloudinary</B> (images & videos), <B>GitHub</B> and <B>Vercel</B> (hosting) — all free plans.</li>
                <li>Install <B>Node.js 20+</B>, <B>OBS Studio 30+</B> and <B>Microsoft Edge</B> (best free Philippine voices for the casters).</li>
              </ul>
            ),
          },
          {
            id: 'install',
            title: 'Install and run the project on your PC',
            body: (
              <>
                <p>Open a terminal in the project folder and run:</p>
                <Copyable text="npm install" />
                <Copyable text="copy .env.example .env" label="copy .env.example .env   (Windows)  —  cp .env.example .env (Mac/Linux)" />
                <Copyable text="npm run dev" />
                <p>Open <B>http://127.0.0.1:5180</B>. Until Firebase is connected the site shows a yellow notice — that&apos;s expected. If it says the port is in use, another app is already on 5180 — close it, or change <code>server.port</code> in <code>vite.config.ts</code>.</p>
              </>
            ),
          },
          {
            id: 'firebase',
            title: 'Create the Firebase project (database + login)',
            body: (
              <ol className="list-decimal space-y-1 pl-5">
                <li>Go to <B>console.firebase.google.com</B> → <B>Add project</B>.</li>
                <li><B>Build → Firestore Database → Create database</B> → Production mode → region <B>asia-southeast1</B> (Singapore).</li>
                <li><B>Build → Authentication → Get started</B> → enable <B>Email/Password</B> (and Google if you like). Add your organizer email under <B>Users → Add user</B>.</li>
                <li><B>Project settings → Your apps → Web (&lt;/&gt;)</B> → register the app → copy the six values into <code>.env</code> (<code>VITE_FIREBASE_API_KEY</code>, <code>…AUTH_DOMAIN</code>, <code>…PROJECT_ID</code>, <code>…STORAGE_BUCKET</code>, <code>…MESSAGING_SENDER_ID</code>, <code>…APP_ID</code>).</li>
                <li>Stop the dev server (<K>Ctrl</K>+<K>C</K>) and run <code>npm run dev</code> again.</li>
              </ol>
            ),
          },
          {
            id: 'rules',
            title: 'Publish the security rules',
            body: (
              <>
                <p>Firestore → <B>Rules</B> tab → replace everything with the contents of <code>firestore.rules</code> from the project folder → <B>Publish</B>.</p>
                <Tip>The rules let everyone <em>view</em> the tournament (site + overlays) but only admins can <em>change</em> anything.</Tip>
              </>
            ),
          },
          {
            id: 'admin',
            title: 'Make yourself an admin',
            body: (
              <ol className="list-decimal space-y-1 pl-5">
                <li>Open <B>{origin}/admin/login</B> and sign in.</li>
                <li>You&apos;ll see <B>&ldquo;Not an organizer yet&rdquo;</B> with your <B>UID</B> — click it to copy.</li>
                <li>Firestore → <B>Start collection</B> → ID <code>admins</code> → Document ID = <B>your UID</B> → add field <code>email</code> (string) → Save.</li>
                <li>Press <B>&ldquo;I&apos;ve added it — reload&rdquo;</B>. Repeat for each co-organizer.</li>
              </ol>
            ),
          },
          {
            id: 'cloudinary',
            title: 'Connect Cloudinary (logos, photos, carousel, videos)',
            body: (
              <ol className="list-decimal space-y-1 pl-5">
                <li>Cloudinary dashboard → copy your <B>Cloud name</B> → <code>VITE_CLOUDINARY_CLOUD_NAME</code>.</li>
                <li><B>Settings → Upload → Upload presets → Add</B>: Signing mode <B>Unsigned</B>, folder <code>tcc-esports</code>, allowed formats <code>jpg,png,webp,gif,mp4,webm,mov</code>.</li>
                <li>Preset name → <code>VITE_CLOUDINARY_UPLOAD_PRESET</code>. Restart <code>npm run dev</code>.</li>
              </ol>
            ),
          },
          {
            id: 'gemini',
            title: 'Add the Gemini key (AI casters)',
            body: (
              <>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Go to <B>aistudio.google.com/apikey</B> → <B>Create API key</B>.</li>
                  <li>Put it in <code>.env</code> as <code>GEMINI_API_KEY=…</code> (no <code>VITE_</code> prefix!). Optional: <code>GEMINI_MODEL</code>.</li>
                  <li>Restart <code>npm run dev</code>.</li>
                </ol>
                <Tip>The casters work even without Gemini — they have 57,000+ built-in Taglish lines. Gemini only adds custom narration for replays, series wins and draft breakdowns.</Tip>
              </>
            ),
          },
          {
            id: 'deploy',
            title: 'Put the site online (Vercel, free)',
            body: (
              <ol className="list-decimal space-y-1 pl-5">
                <li>Upload the project to a GitHub repository (the <code>.env</code> file stays private).</li>
                <li><B>vercel.com → Add New → Project</B> → import the repo (Vite is detected automatically).</li>
                <li><B>Settings → Environment Variables</B> → add every key from your <code>.env</code> → <B>Deploy</B>.</li>
                <li>Firebase → <B>Authentication → Settings → Authorized domains</B> → add your <code>*.vercel.app</code> domain.</li>
              </ol>
            ),
          },
        ],
      },
      {
        id: 'prepare',
        title: 'Prepare the tournament',
        subtitle: 'Teams, bracket, landing page carousel and media.',
        icon: Trophy,
        steps: [
          {
            id: 'teams',
            title: 'Add teams and players',
            body: (
              <p>
                <B>Admin → Teams &amp; Rosters</B> → New team (name, tag, logo) → Add player (photo, IGN, role, battle spell, starter). Want to test first? <B>Dashboard → Load sample data</B> creates 8 teams and a full bracket.
              </p>
            ),
          },
          {
            id: 'bracket',
            title: 'Create the tournament and generate the bracket',
            body: (
              <p>
                <B>Admin → Tournaments → New tournament</B> → choose single/double elimination, default format (e.g. Bo3) and final format (e.g. Bo5) → add teams in seed order → <B>Generate bracket</B>. Click any match to schedule it or change its format.
              </p>
            ),
          },
          {
            id: 'carousel',
            title: 'Add the Home carousel images',
            body: (
              <p>
                <B>Admin → Settings → Home carousel → Upload images</B> (you can pick several at once), add captions, reorder with the arrows, then <B>Save</B>. They rotate every 3 seconds on the Home section, with the left/right arrows on each side of the section and one dot per image at the bottom. Until you upload, 3 built-in TCC slides are shown.
              </p>
            ),
          },
          {
            id: 'site',
            title: 'Fill in the site settings',
            body: <p><B>Settings</B>: featured tournament, tagline, announcement, live stream URL, Facebook/Discord links, and each caster&apos;s display name + avatar.</p>,
          },
          {
            id: 'media',
            title: 'Upload highlight clips & hero portraits',
            body: (
              <p>
                <B>Media &amp; Replays</B>: upload highlight videos — they appear in the website&apos;s <B>Highlights</B> section (hover to preview, click to watch big) and can loop on the break screen. Use <B>Show on website</B> / <B>In break loop</B> per clip. Optionally upload hero portraits you have the rights to use (shown on the draft overlay).
              </p>
            ),
          },
        ],
      },
      {
        id: 'obs',
        title: 'Set up OBS',
        subtitle: 'Browser sources, scenes, replay buffer and the OBS connection.',
        icon: MonitorPlay,
        steps: [
          {
            id: 'obs-connect',
            title: 'Easiest: connect OBS and let the controller build everything',
            body: (
              <>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>
                    OBS 28 or newer → <B>Tools → WebSocket Server Settings</B> → tick <B>Enable WebSocket server</B> (port 4455) → <B>Show Connect Info</B> → copy the <B>Server Password</B>.
                  </li>
                  <li>
                    Open <B>Admin → Live Controller</B> → the <B>OBS</B> card → paste the password → <B>Connect</B>. It reconnects by itself every time you open the controller.
                  </li>
                  <li>
                    Press <B>Create all scenes in OBS</B>. It makes <B>Game Feed</B>, <B>Draft</B>, <B>In-game HUD</B>, <B>Instant Replay</B> (with the live HUD window), <B>Break</B> and <B>Casters</B>, with every overlay already inside.
                  </li>
                  <li>
                    Put your game capture (phone mirror, emulator window or capture card) in the <B>Game Feed</B> scene <B>once</B> — Draft and In-game HUD both use it.
                  </li>
                </ol>
                <Tip>
                  Prefer importing? <B>Download scene file</B> in the same card, then in OBS: <B>Scene Collection → Import</B> → pick the file → <B>Import</B> → <B>Scene Collection → TCC Esports</B>.
                </Tip>
                <p className="mt-2">
                  From then on you never click in OBS: <B>Go live / next draft → Draft</B>, <B>Start game → In-game HUD</B>, <B>Instant replay → Instant Replay → back to In-game HUD</B>, <B>Go to break → Break</B>, <B>End break → Draft</B>.
                </p>
                <Warn>OBS must run on the same computer as the controller page (the browser talks to <code>ws://127.0.0.1:4455</code>).</Warn>
              </>
            ),
          },
          {
            id: 'sounds',
            title: 'Sound effects & break music (automatic)',
            body: (
              <p>
                The overlays play their own sound in OBS — a stinger when the draft starts, when the game starts, into the instant replay and back to the game, plus an intense 5-minute gaming
                track during breaks that loops for long breaks. All generated live (original, no copyright). Keep <B>Control audio via OBS</B> ticked on the browser sources (the automatic setup
                does it) and set the level in the Audio Mixer. Flags: <code>?sound=0</code> mutes an overlay, <code>?music=0</code> turns off the break music, <code>?vol=0.5</code> sets the
                level. Try them in <B>Live Controller → OBS → Sound check</B>.
              </p>
            ),
          },
          {
            id: 'sources',
            title: 'Manual setup: add the overlays as Browser Sources (1920×1080)',
            body: (
              <>
                <p>In OBS: <B>Sources → + → Browser</B> → paste the URL → width 1920, height 1080 → tick <B>&ldquo;Refresh browser when scene becomes active&rdquo;</B>.</p>
                <Copyable text={`${origin}/overlay/draft`} />
                <Copyable text={`${origin}/overlay/hud`} />
                <Copyable text={`${origin}/overlay/replay`} />
                <Copyable text={`${origin}/overlay/break`} />
                <Copyable text={`${origin}/overlay/casters`} />
                <Warn>The overlays are <B>transparent (black in OBS) until a series is on air</B> in that phase — that&apos;s normal. To position them now, add <code>?demo=1</code> to the URL (sample teams, draft, banners and captions), then remove it before the show.</Warn>
                <Tip>Keep <code>npm run dev</code> running while OBS is open (or use your deployed Vercel URL). After changing a URL: right-click the source → Properties → <B>Refresh cache of current page</B>.</Tip>
              </>
            ),
          },
          {
            id: 'scenes',
            title: 'Create the scenes',
            body: (
              <ul className="list-disc space-y-1 pl-5">
                <li><B>Game Feed</B>: your game capture (nested in the next two)</li>
                <li><B>Draft</B>: Game Feed + <code>/overlay/draft</code></li>
                <li><B>In-game HUD</B>: Game Feed + <code>/overlay/hud</code></li>
                <li><B>Instant Replay</B> (top → bottom): <code>/overlay/replay</code>, the <B>In-game HUD</B> scene as a small live window (see below), Media Source named <code>Replay Media</code></li>
                <li><B>Break</B>: <code>/overlay/break</code></li>
                <li><B>Desk</B> (optional): camera + <code>/overlay/casters</code></li>
              </ul>
            ),
          },
          {
            id: 'replaybuffer',
            title: 'Turn on the 10-second Replay Buffer',
            body: (
              <p>
                <B>Settings → Output → Replay Buffer</B> → enable → Maximum Replay Time <B>10 s</B>. In <B>Settings → Hotkeys</B> set a key for &ldquo;Save Replay&rdquo;. Click <B>Start Replay Buffer</B> before the show.
              </p>
            ),
          },
          {
            id: 'websocket',
            title: 'Instant replays with OBS connected',
            body: (
              <p>
                Connected via <B>Live Controller → OBS</B> (step 1). Now one click saves the replay, plays it in the replay scene and — the moment the clip ends — cuts back to your <B>In-game HUD</B> scene. Pick that scene under <B>In-game HUD scene</B> and press <B>Set up live PiP in OBS</B>: the In-game HUD (live game + scoreboard) stays visible in a small window on the right during every replay. (Manual: in the replay scene click + → Scene → In-game HUD → Edit Transform → Position 1288, 220 · bounding box &ldquo;Scale to inner bounds&rdquo; 576×324, layered under the replay overlay.)
              </p>
            ),
          },
        ],
      },
      {
        id: 'casters',
        title: 'Run the AI casters',
        subtitle: 'The Caster Booth voices 8 Taglish casters — two per game, one voice at a time.',
        icon: Mic2,
        steps: [
          {
            id: 'booth-open',
            title: 'Open the Caster Booth in Microsoft Edge',
            body: (
              <>
                <p>On the streaming PC open <B>Edge</B> (its own window) → sign in →</p>
                <Copyable text={`${origin}/admin/booth`} />
                <Warn>Run the booth in Edge, not inside OBS — OBS browser sources can&apos;t reliably use the speech voices.</Warn>
              </>
            ),
          },
          {
            id: 'booth-start',
            title: 'Press "Start casting engine"',
            body: <p>Browsers only allow speech after a click, so press <B>Start casting engine</B> each time you open the booth. The Dashboard and Live Controller then show <B>&ldquo;Caster booth online&rdquo;</B>.</p>,
          },
          {
            id: 'booth-engine',
            title: 'Choose the voice engine (realistic vs basic)',
            body: (
              <>
                <p>
                  In <B>Quota &amp; behaviour → Voice engine</B> pick <B>Realistic</B> for original Gemini voices that perform like live casters (hype, emotion, Taglish), or <B>Basic</B> for free
                  browser voices (robotic). Realistic needs <code>GEMINI_API_KEY</code>.
                </p>
                <Warn>The free Gemini tier allows only a few realistic voice requests per day. Set a <B>Daily cap</B>, and enable billing in Google AI Studio for a full broadcast. When the quota runs out the casters switch to browser voices automatically.</Warn>
              </>
            ),
          },
          {
            id: 'booth-voices',
            title: 'Check every caster’s voice',
            body: (
              <p>
                Press <B>Test live voice</B> on each of the 8 casters and change the <B>Live</B> voice (Gemini) if you want a different sound. The <B>Backup</B> dropdown is the browser voice used when the realistic voice isn&apos;t available — Edge auto-picks the Philippine voices (James, Rosa, Angelo, Blessica). The two seated casters always get different voices.
              </p>
            ),
          },
          {
            id: 'booth-audio',
            title: 'Send the voices to the stream',
            body: (
              <p>
                In OBS add <B>Application Audio Capture</B> → choose the <B>msedge.exe</B> window (or use Desktop Audio). Set the level in the booth&apos;s <B>Volume</B> slider and the OBS mixer.
              </p>
            ),
          },
          {
            id: 'booth-awake',
            title: 'Keep the booth awake',
            body: (
              <p>
                Edge → <B>Settings → System and performance → Sleeping tabs</B> → add your site to <B>&ldquo;Never put these sites to sleep&rdquo;</B>. Don&apos;t minimise the booth window (put it on a second monitor or behind OBS).
              </p>
            ),
          },
          {
            id: 'booth-quota',
            title: 'Choose how much AI to use',
            body: (
              <>
                <p>
                  Defaults are tuned for the free tier: <B>Live AI only for replays with a description, series wins &amp; draft breakdowns</B>, 12 s cooldown, daily cap 200. Turn <B>Live Gemini calls</B> off to use only the built-in library (zero quota).
                </p>
                <Tip>Optional: <B>Pre-generate with Gemini</B> writes hundreds of extra lines in ~6 calls and saves them for the whole tournament. Browse all lines in <B>Caster line library</B>.</Tip>
              </>
            ),
          },
          {
            id: 'booth-test',
            title: 'Do a test run',
            body: <p>Press <B>Go live</B> on a series in the Live Controller — the casters open the draft on their own (&ldquo;Welcome sa drafting phase natin, partner …!&rdquo;). You should hear two casters taking turns and see the subtitles on the overlays. <B>Game intro</B> works as a manual test any time.</p>,
          },
        ],
      },
      {
        id: 'matchday',
        title: 'Match-day run sheet',
        subtitle: 'What to click, in order, during the broadcast.',
        icon: Gamepad2,
        steps: [
          { id: 'casters-on', title: 'Start the casters (one tab is enough)', body: <p>Press <B>Start</B> in the casters pill at the bottom-right of any admin page (or in the Caster Booth). They keep talking while you work in the Live Controller in the same tab — no second window. Every click takes over as soon as the current line is finished; between clicks they keep talking about the draft or the game. Starting them in one tab stops them in any other tab.</p> },
          { id: 'live', title: 'Put the series on air', body: <p><B>Live Controller</B> → pick the series → <B>Go live</B> → choose each team&apos;s <B>5 players and positions</B> (rosters can have up to 7) and the <B>coach</B> (or &ldquo;No coach&rdquo;) → <B>Go live</B>. The system seats two random casters (locked for the game); OBS cuts to <B>Draft</B> and the casters welcome each other: &ldquo;Welcome sa drafting phase natin, partner Ate Lyka!&rdquo;.</p> },
          { id: 'intro', title: 'Game intro (optional)', body: <p><B>Announcements → Game intro</B> plays an extra series intro whenever you want one.</p> },
          {
            id: 'draft',
            title: 'Run the draft',
            body: <p>Type a few letters and press <K>Enter</K> — the top matching hero locks and the box empties for the next one (↑/↓ pick another match). No ban from a team? Type <B>none</B> or press <B>No ban</B>. Two picks by the same side share one timer. A pick goes straight to the player who plays that hero&apos;s position (or whose signature hero it is); press <B>⇅</B> on two teammates to trade heroes. <B>Start Game</B> unlocks only when all 10 heroes are picked. The casters call every ban (&ldquo;Binan nila ang Freya para hindi mahirapan ang backline nila&rdquo;) and pick (&ldquo;NAKUHA NI … ANG Ling! Hindi ito binan!&rdquo;) and talk about what may come next. <B>Edit lineup</B> changes players before the game. When the picks are complete → <B>Start Game</B> (OBS cuts to <B>In-game HUD</B>). The casters announce it on their own (&ldquo;At magsisimula na ang laro! Welcome sa Game 2…&rdquo; — with special lines for match point and deciding games) and a GAME 2 graphic shows on the HUD.</p>,
          },
          {
            id: 'ingame',
            title: 'Call the game',
            body: (
              <ul className="list-disc space-y-1 pl-5">
                <li><B>+1 Kill</B>: pick the killer, then who died. <B>First Blood / Double / Triple / Maniac / Savage</B>: pick the player, then who died (up to 1 / 2 / 3 / 4 / 5 — only the ones not counted yet). One kill per victim. First Blood locks once recorded; Savage gives 10 seconds to add more kills (Savage +). (Keys 1–5 / 6–0 pick fast.)</li>
                <li>Before an objective press <B>Turtle / Lord / Purple Buff / Orange Buff fight</B> (&ldquo;Sino kaya ang makakakuha…?&rdquo;), then the side&apos;s button when it falls and pick who took it (tick <B>steal</B> in the same window).</li>
                <li>The <B>game clock</B> runs by itself; sync it to the in-game timer with ±seconds or Set mm:ss.</li>
                <li><B>Gold difference → Auto</B>: one-time setup (grab a frame from OBS, drag a box around the gold number, test read) — then it follows the game and you only press <B>Announce gold update</B>.</li>
                <li>Battle spell used? Click the spell icon in the player table — the cooldown countdown starts and the casters call it. Click again to reset.</li>
                <li>Fix K/D/A with ± if needed.</li>
              </ul>
            ),
          },
          { id: 'replay', title: 'Instant replay', body: <p>Type what happened (e.g. &ldquo;flickers in, steals Lord, escapes&rdquo;) → <B>Trigger instant replay</B>. With OBS connected everything is automatic — the replay plays with the In-game HUD small on the right, then OBS cuts back to the In-game HUD. Otherwise press your Save Replay hotkey, switch to the replay scene, and switch back to the In-game HUD after.</p> },
          { id: 'end', title: 'End the game', body: <p>Press <B>Blue wins</B> or <B>Red wins</B>. Stats go to the leaderboard and the series score updates. In <B>Post-game stats</B> type each player&apos;s <B>TP%</B> → Save: the game MVP is picked (and in the Grand Final, the Finals MVP). Then <B>Start Game N draft</B> → confirm or change the lineup for that game → a new caster pair is seated and greets each other — or, if the series is won, the bracket advances and the victory/champion call plays.</p> },
          { id: 'break', title: 'Breaks', body: <p><B>Go to break</B> with minutes + message — OBS cuts to <B>Break</B>, the break music starts, and the casters send the show to break (&ldquo;Mag-break muna tayo, mga ka-TCC! Pagbalik natin, Game 3 na!&rdquo;). After a finished game, <B>End break → Game N draft</B> starts the next draft (and its welcome); during a mid-game pause, <B>End break</B> returns to the game.</p> },
          { id: 'off', title: 'Finish', body: <p><B>End broadcast</B> takes the series off air. Results stay saved.</p> },
        ],
      },
      {
        id: 'help',
        title: 'Troubleshooting',
        subtitle: 'Quick fixes for the most common issues.',
        icon: LifeBuoy,
        steps: [
          { id: 't-admin', title: '“Not an organizer yet”', body: <p>Create <code>admins/&lt;your UID&gt;</code> in Firestore (One-time setup → Make yourself an admin).</p> },
          { id: 't-silent', title: 'Casters are silent', body: <p>Press Start in the booth, use Edge, press Test on a caster, check the OBS audio source and that the booth tab isn&apos;t sleeping.</p> },
          { id: 't-ai', title: 'Log says “AI fallback”', body: <p>Check <code>GEMINI_API_KEY</code>/<code>GEMINI_MODEL</code> on Vercel, the daily cap, or a rate limit. The casters keep talking from the built-in library meanwhile.</p> },
          { id: 't-overlay', title: 'OBS browser source is black', body: <p>1) Normal if no series is on air — overlays only show in their phase; add <code>?demo=1</code> to check placement. 2) Make sure <code>npm run dev</code> is running and the URL is exactly <code>http://127.0.0.1:5180/overlay/…</code> (another project using the same port makes OBS open the wrong app). 3) Right-click the source → Properties → Refresh cache of current page.</p> },
          { id: 't-upload', title: 'Upload buttons are disabled', body: <p>Set both Cloudinary keys and use an <B>unsigned</B> preset; restart the dev server / redeploy.</p> },
          { id: 't-timer', title: 'Draft timer differs between PCs', body: <p>Sync the computer clocks (Windows: Settings → Time &amp; language → Sync now).</p> },
        ],
      },
    ],
    [origin],
  );
}

export default function GuidePage() {
  // 127.0.0.1 (not localhost) so OBS always reaches this app, never another one sharing the port.
  const origin = window.location.origin.replace('//localhost', '//127.0.0.1');
  const parts = useParts(origin);
  const [done, setDone] = useState<Record<string, boolean>>(() => safeLocalGet(PROGRESS_KEY, {} as Record<string, boolean>));
  const [active, setActive] = useState(parts[0].id);
  const total = parts.reduce((n, p) => n + p.steps.length, 0);
  const completed = parts.reduce((n, p) => n + p.steps.filter((s) => done[s.id]).length, 0);

  useEffect(() => safeLocalSet(PROGRESS_KEY, done), [done]);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-30% 0px -60% 0px' },
    );
    parts.forEach((p) => {
      const el = document.getElementById(p.id);
      if (el) observer.observe(el);
    });
    if (window.location.hash) document.getElementById(window.location.hash.slice(1))?.scrollIntoView();
    return () => observer.disconnect();
  }, [parts]);

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-lg">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link to="/" className="flex items-center gap-2.5">
            <Logo size={38} />
            <span className="font-display text-xl uppercase leading-none">
              TCC Esports <span className="text-brand">Guide</span>
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/admin" className="hidden items-center gap-1.5 rounded-lg border border-line px-3 py-2 text-sm font-semibold text-muted hover:text-fg sm:inline-flex">
              <Clapperboard className="h-4 w-4" /> Control room
            </Link>
            <ThemeToggle />
          </div>
        </div>
        <div className="h-1 bg-line">
          <div className="h-full bg-brand transition-all" style={{ width: `${(completed / total) * 100}%` }} />
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-24 lg:h-fit">
          <Link to="/" className="mb-4 inline-flex items-center gap-1 text-sm text-muted hover:text-fg">
            <ArrowLeft className="h-4 w-4" /> Back to site
          </Link>
          <p className="eyebrow">Step-by-step guide</p>
          <p className="mt-1 font-display text-3xl uppercase leading-none">
            {completed}/{total} done
          </p>
          <nav className="mt-4 flex gap-1 overflow-x-auto lg:flex-col" aria-label="Guide sections">
            {parts.map((p) => {
              const n = p.steps.filter((s) => done[s.id]).length;
              const Icon = p.icon;
              return (
                <a
                  key={p.id}
                  href={`#${p.id}`}
                  aria-current={active === p.id ? 'true' : undefined}
                  className={cn(
                    'flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition',
                    active === p.id ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'text-muted hover:bg-surface2 hover:text-fg',
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span className="flex-1">{p.title}</span>
                  <span className={cn('text-xs tabular', active === p.id ? 'text-white/80' : 'text-muted')}>
                    {n}/{p.steps.length}
                  </span>
                </a>
              );
            })}
          </nav>
          <button onClick={() => setDone({})} className="mt-4 text-xs text-muted underline hover:text-fg">
            Reset progress
          </button>
        </aside>

        <main className="min-w-0 space-y-12">
          <div>
            <h1 className="section-title">Setup &amp; operations guide</h1>
            <p className="mt-2 max-w-2xl text-muted">
              Everything from creating the free accounts to calling a Grand Final with the AI casters. Tick each step as you go — your progress is saved in this browser.
            </p>
          </div>
          {parts.map((p, pi) => {
            const Icon = p.icon;
            return (
              <section key={p.id} id={p.id} className="scroll-mt-24">
                <div className="mb-4 flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand text-white">
                    <Icon className="h-6 w-6" />
                  </span>
                  <div>
                    <p className="eyebrow">Part {pi + 1}</p>
                    <h2 className="font-display text-3xl uppercase leading-none">{p.title}</h2>
                    <p className="text-sm text-muted">{p.subtitle}</p>
                  </div>
                </div>
                <ol className="space-y-3">
                  {p.steps.map((s, si) => {
                    const isDone = Boolean(done[s.id]);
                    return (
                      <li key={s.id} id={`step-${s.id}`} className={cn('card flex gap-4 p-4 transition', isDone && 'border-emerald-500/40 opacity-80')}>
                        <button
                          onClick={() => setDone((d) => ({ ...d, [s.id]: !d[s.id] }))}
                          aria-pressed={isDone}
                          aria-label={isDone ? `Mark "${s.title}" as not done` : `Mark "${s.title}" as done`}
                          className={cn(
                            'flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-display text-lg leading-none transition',
                            isDone ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-line text-muted hover:border-brand hover:text-brand',
                          )}
                        >
                          {isDone ? <Check className="h-4 w-4" /> : si + 1}
                        </button>
                        <div className="min-w-0 flex-1 text-sm leading-relaxed text-muted [&_code]:rounded [&_code]:bg-surface2 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[12.5px] [&_code]:text-fg">
                          <h3 className={cn('mb-1.5 text-base font-semibold text-fg', isDone && 'line-through decoration-emerald-500/60')}>{s.title}</h3>
                          {s.body}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </section>
            );
          })}
        </main>
      </div>
    </div>
  );
}
