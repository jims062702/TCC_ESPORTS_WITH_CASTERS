# TCC Esports — MLBB Tournament Platform, OBS Overlays & AI Taglish Shoutcasters

**Let the game begin.** A complete Mobile Legends: Bang Bang tournament stack that runs entirely on free tiers:

| Piece | What it does | Free service |
|---|---|---|
| Public site | Light/dark landing page with full-screen sections (Home, Matches, Bracket, Standings, Leaderboard, Teams), active-section highlighting, Home image carousel | Vercel Hobby |
| Setup guide | Step-by-step in-app guide at `/guide` (works before Firebase is configured) | — |
| Admin control room | Teams & rosters, tournaments & brackets, live observer controller, caster booth, media, settings | Vercel Hobby |
| Real-time sync | Scores, series (Bo1–Bo7), drafts, KDA, gold, battle spells, objectives, replay triggers, caster pair | Firebase Firestore (Spark) |
| Auth | Organizer login (email/password or Google) | Firebase Auth (Spark) |
| Media | Team logos, player photos, caster avatars, hero portraits, highlight & replay clips | Cloudinary Free |
| AI casters | Taglish commentary + pre-generated shoutcast library | Gemini API free tier |
| Voices | 8 distinct caster voices, one at a time | Browser `speechSynthesis` (best in Microsoft Edge) |
| Broadcast | 5 transparent 1920×1080 browser sources + OBS Replay Buffer automation | OBS Studio + obs-websocket |

The logo in `public/logo.png` is the TCC Esports badge cut onto a **transparent background**, so it sits cleanly on both themes. The whole palette (crimson `#f8312f`, bull red, charcoal `#322f36`, neon red text, teal `#3ef0d8` from the bull's eyes) is sampled from it.

---

## 1. Quick start (local)

Requirements: **Node 20+** and free accounts for Firebase, Cloudinary and Google AI Studio.

```bash
npm install
cp .env.example .env      # then fill in the values (see sections 2–4)
npm run dev               # http://127.0.0.1:5180  (fixed port, see vite.config.ts)
```

- Public site: `http://127.0.0.1:5180/`
- **Step-by-step guide: `http://127.0.0.1:5180/guide`** — setup, OBS, running the casters and the match-day run sheet, with a progress checklist
- Control room: `http://127.0.0.1:5180/admin`
- The AI endpoint `/api/gemini` also works in `npm run dev` (served by a small Vite middleware), so you do not need the Vercel CLI locally.

Other scripts: `npm run build` (typecheck + production build), `npm run preview`, `npm run typecheck`.

---

## 2. Firebase (Firestore + Auth) — free Spark plan

1. Go to <https://console.firebase.google.com> → **Add project** (Analytics optional).
2. **Build → Firestore Database → Create database** → production mode → pick a region near you (e.g. `asia-southeast1`).
3. **Build → Authentication → Get started** → enable **Email/Password** and/or **Google**.
   For Email/Password, add your organizer account under **Users → Add user**.
4. **Project settings → Your apps → Web (`</>`)** → register an app → copy the config into `.env`:
   `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_MESSAGING_SENDER_ID`, `VITE_FIREBASE_APP_ID`.
5. **Security rules:** open Firestore → **Rules**, paste the contents of [`firestore.rules`](firestore.rules) and **Publish**
   (or `npx firebase-tools deploy --only firestore:rules` if you use the Firebase CLI).
6. **Make yourself an admin:** sign in once at `/admin/login`. The page shows your **UID** with a copy button.
   In Firestore create collection **`admins`** → document ID = your UID → add any field (e.g. `email: "you@…"`). Reload.
7. After deploying (section 5), add your Vercel domain under **Authentication → Settings → Authorized domains**.

No composite indexes are needed — every query is a single equality filter.

---

## 3. Cloudinary — free plan

1. Sign up at <https://cloudinary.com> and copy your **Cloud name** → `VITE_CLOUDINARY_CLOUD_NAME`.
2. **Settings → Upload → Upload presets → Add upload preset**:
   - Signing mode: **Unsigned**
   - Folder: `tcc-esports` (the app adds sub-folders: teams, players, casters, heroes, highlights, replays)
   - Recommended restrictions: allowed formats `jpg,png,webp,gif,mp4,webm,mov`, max file size ~100 MB
3. Put the preset name in `VITE_CLOUDINARY_UPLOAD_PRESET`.

Images are delivered with on-the-fly transformations (`f_auto,q_auto`, face-aware crops) and highlight videos are streamed as H.264 MP4 so they loop smoothly in OBS.

---

## 4. Gemini (AI casters) — free tier

1. Create an API key at <https://aistudio.google.com/apikey>.
2. Put it in **`GEMINI_API_KEY`** — **server-only**. Never prefix it with `VITE_`; it must not end up in the public bundle.
3. Optional: `GEMINI_MODEL` (default `gemini-flash-latest`) — use any model your key can call on the free tier. Free-tier models and limits change over time, so check <https://ai.google.dev/gemini-api/docs/pricing>.
4. Optional: `GEMINI_THINKING_BUDGET` (e.g. `0` on 2.5 Flash models for faster replies). Leave empty if your model doesn't support it.
5. Optional: `GEMINI_TTS_MODEL` (default `gemini-3.1-flash-tts-preview`) — the text-to-speech model for the **realistic caster voices**. The free tier only allows a handful of voice requests per day; enable billing in Google AI Studio for a full broadcast (the booth falls back to browser voices when the quota runs out).

The browser calls `/api/gemini` (a Vercel Edge Function in [`api/gemini.ts`](api/gemini.ts)). The function only serves signed-in admins: it verifies the caller's Firebase ID token by reading `admins/{uid}` through the Firestore REST API with that same token, so no service account is required.

---

## 5. Deploy to Vercel (free Hobby plan)

1. Push this folder to a GitHub repository (`.env` is git-ignored).
2. On <https://vercel.com> → **Add New → Project** → import the repo. Framework preset **Vite** is detected (see [`vercel.json`](vercel.json)).
3. **Settings → Environment Variables**: add every key from `.env.example` (all `VITE_*` keys + `GEMINI_API_KEY`, optional `GEMINI_MODEL`, `GEMINI_THINKING_BUDGET`).
4. Deploy. `vercel.json` rewrites every route to the SPA (except `/api/*`) and long-caches hashed assets.
5. Add the `*.vercel.app` (or custom) domain to Firebase **Authorized domains**.

Alternative: `npx vercel` from this folder, then `npx vercel --prod`.

---

## 6. OBS Studio setup

### Fastest: connect OBS and let the controller do it
1. OBS 28+ → **Tools → WebSocket Server Settings** → enable (port 4455) → **Show Connect Info** → copy the password.
2. **Admin → Live Controller → OBS** card → paste → **Connect** (auto-reconnects next time).
3. **Create all scenes in OBS** — builds *Game Feed*, *Draft*, *In-game HUD*, *Instant Replay* (with the live HUD window), *Break* and *Casters* with every overlay inside. Or **Download scene file** and in OBS use **Scene Collection → Import**.
4. Put your game capture in **Game Feed** once (Draft and In-game HUD nest it).

After that OBS follows the controller: Go live / next draft → **Draft**, Start game → **In-game HUD**, Instant replay → **Instant Replay** → back to **In-game HUD**, Go to break → **Break**.

### Sound effects & break music
The overlays generate their own audio (original, royalty-free): stingers on draft start, game start, into the replay and back to the game, and an intense 140 BPM, exactly 5-minute break track that loops on long breaks. Keep **Control audio via OBS** on the browser sources (automatic setup does it). `?sound=0` mutes an overlay, `?music=0` turns off break music, `?vol=0.5` sets the level. Preview them in **Live Controller → OBS → Sound check**.

### Browser sources (1920×1080)
Copy the URLs from **Admin → Dashboard** (they use your deployed domain).

| URL | Scene | Notes |
|---|---|---|
| `/overlay/draft` | Draft | Team names, logos, 10-ban draft (bans, picks, hero portraits), live timer ring, series score, caster names + captions, Game Intro banner |
| `/overlay/hud` | In-game HUD | Top scoreboard (kills, Turtles, Lords, gold-diff bar, series pips), player columns (photo, hero, K/D/A, battle-spell cooldown ring), event banners **with the player's photo**, caster strip + live subtitles |
| `/overlay/replay` | Instant Replay (above the live PiP and the replay Media Source) | Transparent until a replay is triggered → INSTANT REPLAY frame, headline/description, progress bar, captions, and a **LIVE game window on the right** (picture-in-picture) |
| `/overlay/break` | Break | Full-screen `<video autoplay muted loop>` highlight playlist, countdown, series card, "now playing" |
| `/overlay/casters` | Desk / caster cam | Active caster pair + live subtitles only |

Tips:
- Tick **"Refresh browser when scene becomes active"**. Overlays need no login.
- Query flags: `?demo=1` (sample data for positioning — remove before the show), `?preview=1` (checkerboard background), `?always=1` (show outside its phase), HUD: `?players=0`, `?casters=0`, `?captions=0`, `?top=0`; break: `?sound=1` (play clip audio).

### Caster voices → stream audio
Open the admin in **Microsoft Edge** on the streaming PC and press **Start** in the casters pill (bottom-right of every admin page) or in **Caster Booth**. One tab is enough — the casting engine keeps running while you use the Live Controller. Edge ships free natural Philippine voices (en-PH *James/Rosa*, fil-PH *Angelo/Blessica*) that the booth assigns automatically. In OBS add **Application Audio Capture** → the Edge window (or use Desktop Audio). Keep only one booth open; a Firestore transaction prevents two booths from voicing the same event anyway.

### Instant replay (10 seconds)
The saved clip is stretched over the whole canvas automatically (OBS often records it at 1280×720 while the canvas is 1920×1080). Tip: replays show what went out on stream, so avoid triggering a second replay within 10 seconds of the first.

1. OBS → **Settings → Output → Replay Buffer**: enable, **Maximum Replay Time 10 s**. Start the Replay Buffer.
2. Create a scene **Instant Replay** with a **Media Source** named **Replay Media**, and put the `/overlay/replay` browser source above it.
3. Option A (automatic): OBS 28+ → **Tools → WebSocket Server Settings** → enable (note the password). In **Live Controller → Instant replay → OBS**, connect. One click then saves the buffer, loads the clip, cuts to the replay scene, plays it and cuts back to your **In-game HUD** scene as soon as the clip ends (or after the replay length, whichever comes first). **End replay → In-game HUD** cuts back early.
   Option B (manual): press your Replay Buffer hotkey and switch scenes yourself — the overlay and casters still run from the controller.
4. **Live In-game HUD picture-in-picture:** in **Live Controller → Instant replay → OBS**, pick your *In-game HUD scene* (game capture + `/overlay/hud`) and press **Set up live PiP in OBS**. It nests that scene in the replay scene, fits it into the overlay's LIVE window (right side, 576×324 on a 1080p canvas, scaled automatically for other canvas sizes) and layers it under the replay overlay — so the live game *with its HUD* stays visible during the replay. Manual alternative: in the replay scene **+ → Scene → In-game HUD** → *Edit Transform* → position 1288, 220 → bounding box *Scale to inner bounds* 576×324; order top → bottom: `/overlay/replay`, In-game HUD, replay media. `?pip=0` hides the frame.
5. Upload good replays in **Media & Replays** (folder "replays") to add them to the break loop.

---

## 7. Landing page

- Seven **full-screen sections** — Home, Highlights, Matches, Bracket, Standings, Leaderboard, Teams. Every section is at least one screen tall. Scrolling is completely free (no snapping — the page stays exactly where you stop); long content (a big bracket or leaderboard) just makes its section taller.
- The navbar highlights the **active section** (pill + underline) and the URL hash follows along (`/#bracket` deep-links work). On phones, menu links close the menu first and then scroll to the section.
- **Highlights**: 4 video cards per row (2 on phones). On desktop, **hovering a card plays a muted preview**; **clicking/tapping opens a big player with sound** (prev/next, Esc to close). Only 4 are shown at first — **See more** adds 4 at a time and **Show less** collapses back. Videos come from **Admin → Media & Replays** (toggle **Show on website** per clip).
- **Home carousel**: the image fills the **whole Home section** (no border), fading out on the left behind the text and fully visible on the right; it changes every **3 seconds**. The **left/right arrows are on each side of the Home section** (on phones they sit next to the dots), and **one dot per uploaded image** sits at the **bottom of the Home section** (3 images → 3 dots, current one red). Also: swipe on touch, ← / → keys, and a 3-second progress bar. Manage it in **Admin → Settings → Home carousel** (multi-upload to Cloudinary or paste URLs, captions, reorder, live preview → **Save**). Until you upload images, 3 built-in TCC slides are shown (badge, "Let the game begin", tournament card); your uploads replace them. The arrows are always visible (greyed out when there's only one image).

## 8. Match-day workflow

1. **Teams & Rosters** — logos, an optional **coach** (shown on the draft overlay), up to **7 players** (photo, IGN, role, battle spell, default starter, optional signature heroes). *Dashboard → Load sample data* creates 8 demo teams and a double-elimination bracket.
2. **Tournaments** — create, add teams, choose single/double elimination and formats (default Bo3, final Bo5). Either **Generate bracket** from your seed order (byes go to top seeds) or play a **Seeding round first**: teams are drawn into one-game (Bo1) matches — every team plays once — and **Generate bracket from seeding** puts the winners on the top seeds (ties: kill difference, then the quicker win). Seeding losses never eliminate anyone. After the seeding round, **seeding winners pick their opponent** (any team except themselves — winners or losers): the first-round matchups swap automatically, and a matchup locks once its draft starts. The bracket ends in a **CHAMPION** slot with the **Finals MVP**; match cards show their scheduled date & time; **Print bracket** prints it in high contrast, fitted to the page width (long brackets continue on the next page). Click any match to schedule it, change its format, report a result, or **Go live**.
3. **Live Controller**
   - *Go live / Start Game N draft* — a lineup dialog: pick each team's **5 players + positions** for that game and the **coach** (or "No coach"). The system-picked caster pair is shown and **locked** for the game.
   - *Phases*: only **Draft → In-game → Break** (a finished game stays under In-game with its post-game stats).
   - *View on Facebook*: the switch in the controller header turns the website's **View on Facebook** button on/off for the match on air only (it opens the Facebook link from Settings). Every match card and match pop-up on the website shows its scheduled date & time ("TBA" until set). Bracket printing is in the admin only.
   - *Draft*: type a few letters + Enter — the hero search locks the top match and the box empties for the next one (↑/↓ choose another). A team that skips a ban: type **none** or press **No ban**. Two picks by the same side share one timer. Picks go to the player of that hero's position (or whose signature hero it is); **⇅** on two teammates trades their heroes. Positions and coaches show on the draft overlay. **Start Game** unlocks only when all 10 heroes are picked (bans can be none). **Edit lineup**, timer, undo, click a slot to fix it. The casters call every ban (with the reason — e.g. Freya "para hindi mahirapan ang backline nila"), hype signature picks ("NAKUHA NI … ANG Ling! Hindi ito binan!"), speculate about the next ban/pick from each player's hero pool and the tournament meta, and tell the story of earlier games.
   - *In-game*: the **game clock** counts the battle (pause, ±seconds, set mm:ss; it pauses on a mid-game break and the duration is saved). **+1 Kill** → pick the killer, then who died (+1 kill / +1 death). **First Blood / Double / Triple / Maniac / Savage** → pick the player, then who died — up to 1 / 2 / 3 / 4 / 5 players, only the ones not counted yet (pressed +1 Kill and it became a Double Kill? pick just the new victim). One kill per victim, one death each; banner with the killer's photo. **First Blood** locks once recorded. **Savage** pre-selects all five and opens a **10-second continuation**: another Savage in that window adds only the extra victims (+1, +2…) — each continuation restarts the 10 s. **Turtle / Lord / Purple Buff / Orange Buff** per side → pick who took it ("slain by"), tick **steal** in the same window — steals are never credited to a battle spell. Keys 1–5 / 6–0 pick players fast. **Gold difference**: turn on **Auto** after a one-minute setup (grab a frame from OBS, drag a box around the gold number, test read) — it reads the gold from the game every few seconds with free in-browser OCR, so you only press **Announce gold update**. Upload the real **battle spell icons** in Settings. **Fight** buttons make the casters ask *"Sino kaya ang makakakuha ng…?"*. **Battle spells: one click on the spell icon** starts the countdown and the casters call it (they don't read out cooldown seconds — the HUD shows the timer). Also: K/D/A ±, gold slider/presets, **Announce gold update**, **Instant replay**.
   - *End game* — records stats for the leaderboard, updates the series, and when the series is won advances the bracket (winner → next round, loser → lower bracket) and queues the **series victory / champion** call. Then **Post-game stats**: KDA ratio and Lord/Turtle secures are automatic — type each player's **TP%** (teamfight participation) from the result screen → Save. The post-match **MVP** is the best rating on the winning team; in the Grand Final the **Finals MVP** (most game MVPs, tie → best total rating) is computed automatically and shown on the bracket. The leaderboard adds **TP%** and **MVP** columns.
   - *Between games* — **Start Game N draft** (seats a new random caster pair), **Game intro**, **Break** with countdown + message (after a finished game, **End break → Game N draft** starts the next draft), **End broadcast**.
   - *Automatic caster announcements* (no buttons, no AI quota — hand-written Taglish lines, {partner} = the other caster's name from Settings → Casters):
     - **Go live / Start Game N draft** → "Welcome sa drafting phase natin, partner Ate Lyka!" — "Salamat, Direk Ken! …" + a DRAFT PHASE graphic on the draft overlay. Special lines for Game 1, match point and deciding games.
     - **Start Game** → "At magsisimula na ang laro! Welcome sa Game 2, mga ka-TCC!" + a GAME 2 graphic on the HUD.
     - **Instant replay** → every replay opens with "Tingnan muna natin ang instant replay…" (also enforced on live Gemini lines).
     - **Go to break** → "Mag-break muna tayo, mga ka-TCC! Pagbalik natin, Game 3 na!" (uses the minutes; a mid-game pause gets pause lines instead).
4. **Caster Booth** — keep running for the whole show (see section 8).

---

## 9. The AI caster desk

### Eight personas (4 male, 4 female) — two seated at random every game
| Caster | | Role | Leads on |
|---|---|---|---|
| **Kuya Marco** | M | Analyst — rotations, vision, wave management, item spikes | quiet moments, objective setups |
| **Direk Ken** | M | Hype play-by-play | Savage, Maniac, Triple, Lord, replays |
| **Ate Lyka** | F | Tempo & stats — gold, KDA, kill/objective counts | gold updates, results |
| **Trixie** | F | Clutch & battle-spell watcher | spells, clutch plays |
| **Coach Rafa** | M | Draft & meta strategist | draft breakdown, adjustments |
| **Tito Jun** | M | Veteran storyteller — stakes, momentum, legacy | series wins, results |
| **Bea** | F | Jungle & objective specialist | Turtle/Lord/Buff, contests |
| **Mika** | F | Host & crowd hype | game intros, champion moments |

They are original characters written in the style of Filipino pro-league (MPL-style) Taglish broadcasts: the play-by-play voice explodes on the action, then the partner answers with the *why* (positioning, rotation, stats, story). Names and avatars can be changed in **Settings** (with Cloudinary-hosted avatars).

### Realistic voices (live-caster delivery)
In **Caster Booth → Voice engine** choose:
- **Realistic** (default): each exchange is voiced in one Gemini text-to-speech clip with both seated casters taking turns. Every caster has an *original* Gemini voice (e.g. Direk Ken = Fenrir "excitable", Ate Lyka = Kore "firm", Tito Jun = Algenib "gravelly") and is directed to perform like a live Filipino pro-league caster — Taglish pronunciation, hype and shouting on big moments, calm analysis, natural breaths. Change any caster's **Live** voice in the booth and press **Test live voice**. Captions switch as each caster's line begins.
- **Basic**: free, unlimited browser voices (robotic).

The free Gemini tier allows only a few voice requests per day, so set a **Daily cap** and enable billing for a full broadcast. When the cap or quota is reached (or anything fails) the casters continue with browser voices automatically — they never go silent.

> The voices are original and do **not** imitate any real caster. Cloning a real person's voice requires that person's permission; if you want a real caster's voice, work with a caster who agrees to record lines for you.

### One voice at a time — a click takes over after the current line
Casters take turns — never two voices at once — with a short handoff gap between them. **Every click in the Live Controller takes over as soon as the current line is finished** (nobody is cut mid-sentence; the rest of that exchange is dropped and e.g. "Turtle slain by …" comes next). Events from the same click, like the last pick + draft breakdown, play in order. Only one booth talks at a time: starting the casters in one tab stops them in any other tab (the pill shows "on air in another tab" with **Stop them / Move here**). With **Instant response** on (default), a slow live AI line or realistic voice is replaced by the library line / instant voice so the desk never waits. Between clicks they **keep talking** about what's on screen — draft speculation and storytelling, in-game banter (player spotlights, lane matchups, game time, gold, objectives), post-game recap/MVP, and an occasional word during breaks. The two seated casters are always given different voices.

### Accuracy (no hallucinated game states)
Every line — AI or pre-written — is built only from a verified **fact sheet** (teams, series score, format, game number, kills, Turtles/Lords, gold lead, the selected player's IGN/hero/KDA/spell, steal flag, replay description). Pre-written lines use `{placeholders}`; a line whose facts are unknown (e.g. `{hero}` before heroes are set) is skipped automatically.

### Quota-saving design (free tier lasts the whole tournament)
- **57,000+ built-in lines, zero storage, zero API calls:** 198 hand-written event calls plus a line generator that gives every caster ~7,000 unique in-character lines (**56,958** in total, counted exactly in the booth). Each caster line is *[their own opener] + core statement + [their own closer]*; every part is a complete sentence written in that caster's voice, with separate sets for action calls (kills, objectives, replays), celebrations (intros, results, champions) and calm moments (draft, gold, banter), so all combinations read naturally. Browse, search and export them as JSON in **Caster Booth → Caster line library**, or open the plain-text snapshot in [`docs/caster-lines/`](docs/caster-lines/README.txt) (one file per caster, grouped by moment).
- Optional Gemini **pre-generation** in the booth: ~6 batched calls write hundreds more event calls, saved once in Firestore and reused for every match. Recently used lines are rotated out so calls don't repeat.
- **Live AI only where it matters** (default): replays that have a description, series victories and draft breakdowns. Everything else comes from the library at zero cost.
- **Throttling:** 10–15 s cooldown between calls, a daily cap counter, automatic back-off on HTTP 429, and the library as fallback on any error or timeout.
- **Firestore reads:** the landing page never listens to the high-frequency `live/current` document — only overlays and the control room do.

---

## 10. Project structure

```
api/gemini.ts                 Vercel Edge Function: admin-only Gemini proxy (lines + library modes)
public/logo.png …             Transparent TCC badge (+ favicon, touch icon)
firestore.rules               Security rules (public read, admin write)
src/
  services/
    firebase.ts               Init, auth, typed onSnapshot helpers (always return Unsubscribe)
    db.ts                     CRUD, bracket generation/reporting, sample data
    live.ts                   Live state machine: series, draft, events, end game → bracket
    bracket.ts                Single/double elimination with byes (pure, tested)
    stats.ts                  Standings & leaderboard aggregation
    cloudinary.ts             Unsigned uploads with progress + delivery transforms
    gemini.ts                 Prompt builders + /api/gemini client
    casters.ts                8 personas, random pairing, voice assignment, one-at-a-time speech
    personaLines.ts           Per-caster lines + the 57k-line generator (openers, cores, closers)
    templates.ts              Placeholder shoutcast library + line picker
    facts.ts                  Verified fact sheet for each event
    commentary.ts             Caster Booth engine (claim → queue → AI/library → captions → speech)
    obs.ts                    obs-websocket bridge for Replay Buffer automation
  hooks/                      useFirestore (real-time hooks with cleanup), useTheme, useAuth
  components/                 UI kit, logo/avatars, bracket tree, uploads, game widgets
  landing/                    Public site: full-screen sections, scroll-spy, Home carousel
  guide/                      In-app step-by-step setup & operations guide (/guide)
  admin/                      Control room pages (+ controller/ panels)
  overlay/                    OBS browser sources
```

---

## 11. Troubleshooting

- **"Not an organizer yet"** — create `admins/{yourUid}` in Firestore (section 2.6).
- **Uploads disabled** — set both Cloudinary env vars and use an *unsigned* preset.
- **Casters silent** — press *Start* in the booth (browsers require a click before audio), use Edge, check the voice dropdowns and the *Test* buttons, and capture the Edge window audio in OBS.
- **Casters sound robotic** — the booth is on *Basic* voices, or the realistic-voice quota/cap was reached (the booth shows a yellow note). Set `GEMINI_API_KEY`, choose *Realistic*, and check the daily cap / billing.
- **AI lines say "AI fallback"** — check `GEMINI_API_KEY` / `GEMINI_MODEL` on Vercel, the daily cap, or a 429 rate limit. The casters keep talking from the library either way.
- **OBS browser source is black** — (1) normal when no series is on air: overlays only appear in their phase; add `?demo=1` to see sample data while positioning. (2) Keep `npm run dev` running and use `http://127.0.0.1:5180/overlay/...` exactly — on Windows another Vite project on port 5173 can make OBS load the wrong app, which is why this project uses its own fixed port 5180. (3) Source → Properties → *Refresh cache of current page*.
- **Draft timer looks off on another PC** — sync the clocks (Windows: Settings → Time → Sync now); timers are computed from timestamps.

MLBB hero names are used for drafting only. Upload hero portraits you have the rights to use. Mobile Legends: Bang Bang is a trademark of Moonton; this project is not affiliated with Moonton or MPL.
