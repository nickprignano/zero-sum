# Zero Sum spec (v1)

Status: the owner's answers (2026-11-08) are folded in, and it's red-teamed twice with Fable
(changes listed at the end). Waiting for the owner's approval in PR #1. Nothing gets built until
it's approved.

The game is called **Zero Sum** (the owner's pick). It borrows the mood of 1980s "computer that
nearly starts a war" stories and nothing else: no film names, characters, plot beats, quotes,
art, sounds or trademarks, and no names that point at them. The banned-word list lives in the
words test (see Tests), not in this spec.

## What it is

A browser game for `zero-sum.prignano.ai`. You dial in to an old green-screen computer called
**MERIDIAN**, which runs two games on an invented continent map drawn in glowing vector lines:

- **Crisis**, the main game: a turn-based standoff between two made-up blocs.
- **Intercept**: a real-time missile-defense game. It's on the menu by itself, and it's also
  what happens when a Crisis game ends in an exchange.

The hook is in the scoring. Escalating can feel strong in the moment, but no game that ends in
an exchange ever scores more than a game that doesn't, and the best ending is a treaty both
sides sign. Players learn that by playing. Keeping the peace still takes judgment: you have to
read crisis cards that may be false alarms, look strong enough at home that your own hardliners
don't take over, and guess MERIDIAN's hidden temperament.

It's plain JavaScript with DOM text and one canvas, with no build step. The repo is the site,
served as static files on Cloudflare, and it installs as an app (PWA) on iPhone, iPad and
Android from day one.

## Decisions so far

| # | Question | Answer |
| --- | --- | --- |
| 1 | Kind of game | A green-screen terminal running the turn-based Crisis game, plus Intercept, a missile-defense action game with dramatic imagery (owner, 2026-11-08) |
| 2 | Audience and tone | 13 and up. Dramatic war imagery is fine. Still no gore, no casualty numbers, no real places or leaders (owner, 2026-11-08; the last part is our default) |
| 3 | Name | Zero Sum (owner, 2026-11-08) |
| 4 | Home | `nickprignano/zero-sum`, served at `zero-sum.prignano.ai`, deployed on each merge to `main` by Workers Builds like pinball. The owner creates the repo and adds the domain (owner, 2026-11-08) |
| 5 | v1 scope | One player against MERIDIAN, scores on the device, no server, a PWA on day one (owner, 2026-11-08) |
| - | License | MIT. Everything is our own work and nothing forces GPL |

## Prior art

Checked 2026-11-08. Nothing to fork.

| Source | What it is | What we take |
| --- | --- | --- |
| Fan terminal simulators on GitHub (for example `yackx/wopr`, `zompiexx/wargames`) | Recreations of the film's computer, with its names and dialogue | Nothing. They copy the film |
| Missile Command (Atari, 1980) | The arcade game that defined the missile-defense genre | The genre only: bursts in the sky stop falling traces. We deliberately drop its batteries, ammo-per-battery, bonus-city and leftover-ammo rules, and use none of its name, art or sounds |
| DEFCON (Introversion, 2006) | Commercial real-time nuclear strategy game with a vector map | The general idea of a glowing vector map and bleak scoring. No code, art, sound, name, or its countdown-level convention |
| RAND, "Designing a Strange Game" (2021) and similar research games | Nuclear-crisis games used for study | Ideas only: escalation ladders, misread signals, the cost of acting on bad information |
| pinball PR #7 | Our own PWA recipe | Manifest, icons, iOS tags, service worker with a stamped file list, the stale-file test, update button |

## The player's path

1. **Dial in.** A content note first ("Dramatic depictions of nuclear war. Made for 13 and up."
   and "Contains flashing lights", with the Reduce effects switch and **Continue**), shown once
   per device (every visit if storage is blocked). Then a black screen, a blinking cursor, a modem handshake sound, then MERIDIAN's
   login prompt. The player types a name (3 to 12 letters, kept on the device only) or taps
   **Guest**.
2. **Menu.** `CRISIS`, `INTERCEPT`, `HOW TO PLAY`, `SCORES`, `ABOUT`. Every menu line is a real button, so
   phones never need the keyboard. Typing a command also works.
3. **Crisis** or **Intercept**, below.
4. **Ending.** For Crisis: the score with how it was earned and MERIDIAN's temperament
   revealed, then (after lights out only) the final Intercept wave, then MERIDIAN's one closing
   line and the high-score tables. Crisis and Intercept keep separate tables, Crisis shown
   first.

## Crisis rules

### Setup

- The map is an invented continent split into 12 regions, hand-drawn as polygons in
  `data/map.json`, each with two or three city dots. Six regions belong to **the Ember Compact**,
  six to **the Tidewater League**. No real coastlines, countries or leaders.
- The player picks a bloc. MERIDIAN plays the other one.
- Each game has a seed. The seed decides MERIDIAN's temperament, the order of the deck and
  every random choice MERIDIAN makes, so a game replays exactly from its seed and moves.
- A game is at most **12 rounds**. Each round is one crisis card.

### Meters

All visible to the player at all times, for both sides.

| Meter | Range | Start | Meaning |
| --- | --- | --- | --- |
| **Tension** | 0 to 6, shared | 1 | Rises with escalation. Reaching 6 is an exchange: the game ends |
| **Trust** | 0 to 10, shared | 5 | Needed for a treaty |
| **Standing** | 0 to 10, one per side | 5 | How strong a side looks at home. At 0, hardliners take over that side |

### Cards

About 30 written cards in `data/crises.json`, each set in one region. Two kinds:

- **Threat** cards ("A radar station reports launches over the northern ice", "A patrol boat is
  seized in disputed water"). Each is secretly **real** or a **false alarm**. The card text is
  the same either way.
- **Opening** cards ("A summit invitation arrives", "A joint rescue at sea"). Always real.

### A round, in order

1. Draw the next card. A threat card adds its `tension` value (0 or 1) at once.
2. The player may **VERIFY** a threat card once: it costs the player 1 standing and shows
   whether the card is real. The round doesn't advance.
3. The player picks a move. MERIDIAN picks its move at the same time, without seeing the
   player's move or the card's secret.
4. Both moves are revealed and applied together (table below), then the card's consequences.
5. **Cool-down:** if neither side picked `SIGNAL` or `STRIKE` this round, tension drops by 1.
6. Clamp every meter to its range, then check for an ending. A threat round in which tension
   didn't rise counts as one **crisis defused**.

### Moves

Starting values. The simulation test tunes them before v1 ships, and the final numbers go in
`data/rules.json`, not in code.

| Move | Tension | Trust | Own standing |
| --- | --- | --- | --- |
| `TALK` | 0 | +1 | -1 |
| `AID` | 0 | +2 | -2 |
| `HOLD` | 0 | 0 | 0 |
| `SIGNAL` | +1 | 0 | +1 |
| `STRIKE` | +2 | -3 | +2 |

Card consequences, per side:

- **Escalating against a false alarm** (`SIGNAL` or `STRIKE`): trust -2 more.
- **Not answering a real threat** (`HOLD`, `TALK` or `AID`): own standing -1 more.
- **`TALK` on an opening card:** trust +1 more.

**Hardliners.** When a side's standing reaches 0, its `TALK` and `AID` are locked for the next
two rounds, then its standing resets to 3. This applies to the player as much as to MERIDIAN,
so always talking runs out of road.

### MERIDIAN

- A small, readable rule table in `src/crisis/meridian.js`, not machine learning. It weighs
  tension, trust, both standings, the player's last three moves, and how far it believes the
  card. It never sees the card's secret or the player's current move.
- Its **temperament** (calm, wary or brittle) sets how much it believes threat cards and how
  much trust it needs before it will talk. Calm talks from trust 6, wary from 7, brittle from 8
  and only when tension is 2 or less.
- It never uses `VERIFY`, so it is sometimes fooled by false alarms. Players can learn to see
  that coming.

### Endings and score

| Ending | When | Score |
| --- | --- | --- |
| **Treaty** | At the end of a round where both sides played `TALK`, trust is 8 or more and tension is 2 or less | 600 + 100 per crisis defused + 25 per round left |
| **Standoff** | Round 12 ends with no exchange | 300 + 100 per crisis defused + 10 per point of trust |
| **Lights out** | Tension reaches 6 | 0 if the player ever played `STRIKE`, otherwise 20 per round played (at most 240) |

The rule that makes the hook work, checked by a test: **every lights-out score is below every
standoff or treaty score.** Defused crises are worth more than rounds left, so a quick treaty
isn't automatically the top score: engaging with the cards is.

On lights out, after the score screen, Crisis hands over to one final, overwhelming **Intercept**
wave (see "When it follows a lost Crisis"). It adds nothing to any score. Then MERIDIAN prints its one closing line for that ending from `data/meridian-lines.json` (for example
`SESSION ENDED. NOTHING LEFT TO SCORE.`). The owner reads and approves every line in the PR.

### Deliberately missing

No counts of people, no real places, leaders or flags, no weapons named by real type names, no
gore.

## Intercept rules

A real-time missile-defense game on the same invented continent, seen from the side: your
bloc's coastline and cities along the bottom, the sky above. It's in the missile-defense genre
but deliberately breaks from the classic arcade layout: no gun batteries, no ammo count per
battery, no bonus city per points total, and no points for leftover shots.

### Play

- **Cities:** 8 city skylines in vector lines along the coast.
- **Interceptors:** one shared pool that holds 10 and refills 1 per second. Tap or click
  anywhere in the sky and a burst appears **at that point at once** (no flight time). Its ring
  grows for 0.4 s, holds, and fades by 1 s. Any trace inside the ring is destroyed. Every
  `pointerdown` fires, so several fingers work at once.
- **Incoming:** glowing traces fall from the top toward cities. From wave 2, some are
  **decoys**, identical until 60% of the way down, where they turn dotted, and harmless: they
  fade out at 75%. From wave 3, some traces **split** into three at 40% of the way down.
- **Scan:** once per wave, `SCAN` (button or S key) marks every decoy on screen for 3 seconds.
  It ties Intercept back to Crisis's false alarms.
- **Steady hands:** a wave where every burst destroyed at least one real trace rebuilds one lost
  city. That's the only way cities come back.
- **Score:** only cities kept. At the end of each wave, 100 × wave number × cities standing.
- **End:** when the last city falls. The final screen shows the wave reached and the score. No
  number of people, ever.

### Numbers

Wave 1 values and per-wave growth live in `data/intercept.json`, mirroring `rules.json`, and
the tests tune them. Starting values, in playfield units (the playfield is 1000 × 600, scaled to
fit the screen at a fixed shape):

| Value | Wave 1 | Each wave after |
| --- | --- | --- |
| Incoming traces | 8 | +2 |
| Time to fall the full height | 12 s | × 0.9 |
| Decoys (share of incoming) | 0 (wave 2: 15%) | +5 points, at most 35% |
| Splitting traces | 0 (wave 3: 1) | +1 |
| Burst ring radius | 50 units, never under 44 CSS px on screen | same |
| Pool size, refill | 10, 1 per second | same |

### When it follows a lost Crisis

The order is: Crisis lights out, then the Crisis score screen (0 or at most 240) so the lesson
lands first, then one Intercept wave, then MERIDIAN's closing line and the high scores.

- The wave is built to be overwhelming: incoming = 12 + 2 × (both sides' standing), at least
  20; decoys = 6 minus crises defused, at least 0; the pool starts at 10 and doesn't refill.
- A **Skip** button is always there.
- The result reads "Cities kept: N of 8. Not scored." It never counts toward the Crisis score
  and never goes in the Intercept high-score table.

### Dramatic imagery

- A city hit is a bright local glow at the city (never more than a quarter of the playfield),
  a shockwave ring, a short screen shake, and a rising column of glowing vector smoke that
  spreads into a cloud at the top. The skyline breaks into falling line segments and its lights
  go out.
- The sky fades from deep blue toward dark orange as cities fall, always over at least 300 ms,
  never a sudden cut.
- After the last city, the screen holds on the dark coastline with smoke drifting, then fades
  to MERIDIAN's terminal.
- Everything is lines, glow and particles on the canvas: no bitmaps, no people.

### Flash safety

- **No full-screen flashes.** Hit glows stay under a quarter of the playfield, and nothing
  flashes saturated red.
- A pure limiter in `src/intercept/game.js` queues every glow event and allows at most 3 a
  second, below the WCAG 2.3.1 limit; extra hits that second get the ring and smoke only. The
  test checks both the count and the area.
- The content note says "Contains flashing lights" and has the **Reduce effects** switch right
  there (also in the menu). Reduce effects, or `prefers-reduced-motion` (watched live, so a
  change mid-game applies at once), turns off glows, shake and smoke and leaves plain rings.

### Phones and speed

- Controls (`SCAN`, pause, mute) sit in a bar below the coastline, outside the playfield, so
  taps in the sky never hit a button. Thumbs cover the bottom of the screen, so the playfield
  keeps a margin above the bar.
- Canvas backing store capped at 2× pixel ratio. Glow is drawn as a wide faint stroke under a
  thin bright one with `lighter` blending, not `shadowBlur`, which is slow on iPhones. Rings and
  particles are drawn once to small offscreen canvases and stamped. At most 200 particles.
- Fixed time step of 1/60 s in game time, at most 5 catch-up steps a frame. The game pauses
  when its tab is hidden and resumes with a 3-second countdown, like pinball.
- Each wave comes from the game's seed, so a run is repeatable in tests.

## How it works

### Files

```
index.html               page, terminal, map canvas, theme header
src/main.js              screens, menu, game flow
src/terminal.js          typed-out lines, command line, buttons for every command
src/crisis/engine.js     rounds, meters, cards, endings, scoring (pure functions, no DOM)
src/crisis/meridian.js   MERIDIAN's rule table and temperaments (pure)
src/crisis/rng.js        seeded random numbers
src/intercept/game.js    waves, traces, splits, decoys, bursts, flash limiter, scoring (pure)
src/intercept/draw.js    Intercept's canvas drawing and effects
src/map.js               draws the map, pulses and city dots on the canvas
src/audio.js             synthesized sounds, mute
src/scores.js            high scores on the device
data/rules.json          Crisis move and card numbers
data/intercept.json      Intercept wave numbers
data/crises.json         crisis cards
data/meridian-lines.json MERIDIAN's lines
data/map.json            the invented continent: 12 region polygons and city dots
tools/sw-version.mjs     stamps the service worker file list (from pinball)
sw.js, manifest.webmanifest, icons/
test/*.test.mjs
```

ES modules loaded directly by the browser. No bundler and no npm packages in production. The
tests and tools need only Node.

### Look

- The game screen is a phosphor terminal: green text on near-black with a light scanline and
  glow. It stays dark in both site themes, because the dark screen is the look. The site's
  shared prignano-theme header above it follows light and dark as usual (pinball's approach:
  theme CSS and JS pinned to a commit on jsDelivr).
- The map is glowing lines on the canvas. Each bloc has a color and a line style (solid or
  dashed), so colorblind players can tell them apart.
- Phones in portrait: meters on top, map, then the card and the move buttons. Wide screens and
  landscape tablets: map on the left, terminal on the right. Intercept fills the screen in
  either orientation, with the playfield kept at a fixed shape and scaled to fit. The app
  doesn't lock orientation.

### Accessibility

- Text is real DOM text that scales with the browser's font size.
- Lines type out character by character for sighted players, but each finished line is added
  to an `aria-live="polite"` region, so screen readers hear whole lines once.
- The map has a text version: a list of regions with owner and status.
- Intercept is a fast reflex game and has no screen-reader version; the menu says so. Crisis is
  fully playable without sight.
- `prefers-reduced-motion` turns off typing, flicker, scanlines and the city-dot sequence.

### Controls

- Every command is a button. On a keyboard, typing commands works, arrow keys and Enter run the
  menu, and 1 to 5 pick moves, V verifies.
- Tap or press any key to skip typing.
- M mutes. P pauses Intercept. Crisis is turn-based, so it has no pause.

### Sound

Synthesized in code with the Web Audio API, so there's nothing to license: a modem handshake,
key clicks, a low hum, a rising tone when tension rises, a long falling tone for lights out, and for Intercept a
launch thump, a blast boom with a low rumble on city hits, and a siren at the start of each
wave.
Muted until the first tap or key press, and the mute setting is saved on the device.

### Scores and data

- Top 10 scores per game in `localStorage` with the player's name, and for Crisis the ending
  and seed. If storage is
  blocked, the game still plays.
- Nothing leaves the device. No analytics, no accounts, no server, no network calls except the
  pinned theme files.

### Installable app

Pinball PR #7's recipe: a manifest (`display: standalone`, no orientation lock), original icons
(a green cursor block on black, in any, maskable and Apple touch sizes), iOS home-screen tags, a
service worker that caches every file for offline play with its file list stamped by
`tools/sw-version.mjs`, a test that fails when the list is stale, an update button in the menu,
safe-area padding, the header hidden in the installed app, and sound resumed after an iPhone
locks.

### Hosting

Cloudflare Workers static assets with no Worker script (`wrangler.jsonc` named `zero-sum`,
`.assetsignore` leaving out tests, tools and docs), connected to the repo with Workers Builds
so each merge to `main` deploys. The owner creates the repo and adds the custom domain. Claude
writes `docs/DEPLOY.md` the way pinball's is written and changes nothing on the account without
his yes.

## Tests

`node --test` covers:

1. **Engine:** every card and rule loads, meters stay in range, the round order above holds,
   `VERIFY` works once per card and doesn't advance the round, hardliners lock and release,
   and the same seed and moves always give the same game.
2. **The hook:** 10,000 seeded games with random players plus scripted "always strike",
   "always talk" and "verify then answer" players. Every lights-out score is below every
   standoff and treaty score; always-talk does not win a treaty against a brittle MERIDIAN in
   most seeds; "verify then answer" averages above both scripted extremes. These checks tune
   `data/rules.json`.
3. **Words:** none of a short banned-word list (stored encoded in the test, so the repo never
   spells it out) appears in any shipped file. The test file and docs are left out of the scan.
4. **Intercept** (pure `game.js` checks over seeded runs): a burst destroys every trace inside
   its ring and none outside; decoys reveal at 60% and vanish at 75% without harm; splits and
   decoys start on the right waves; waves only get faster and larger; scan marks every decoy;
   steady hands rebuilds a city and nothing else does; the game ends when the last city falls;
   the flash limiter never allows more than 3 glow events in a second or one over a quarter of
   the playfield; Reduce effects gives zero glow events; the hand-over wave's size follows the
   Crisis state, it adds nothing to the Crisis score and never reaches the Intercept table; the
   same seed gives the same waves.
5. **PWA:** the service worker file list is current (from pinball).

**Done means:** all tests pass in CI, and before each PR the build thread runs a scripted
browser check (Playwright, not in CI, like pinball) at phone and desktop sizes that dials in and
plays fixed seeds to each of the three Crisis endings and plays an Intercept wave. Installing and playing offline is a manual
check listed in `docs/DEPLOY.md`.

## Pull requests

v1 lands as four PRs the owner can skim:

1. Terminal, dial-in, content note with Reduce effects, menu, How to play, `audio.js` and
   `scores.js`, the PWA recipe, `wrangler.jsonc`, `docs/DEPLOY.md`, CI.
2. Crisis: engine, MERIDIAN, rules, cards, map, the three endings, and tests 1 to 3.
3. Intercept: the game, its effects and sounds, the hand-over from a lost Crisis, test 4.
4. MERIDIAN's closing lines, About screen, polish.

## Not in v1

Two players online (would need a Cloudflare Worker and room codes, like chess), more games on
MERIDIAN's menu, a shared leaderboard, more than two blocs, music.

## Open questions

1. **Name clash.** "Zero Sum" is a common phrase, so small games may already use it. Default:
   a quick search of Steam, itch.io and the app stores before the first build PR; if there's a
   close match in the same genre, the owner decides whether to keep it.

## Fable red team (2026-11-08)

What it found, and what changed:

1. The chain of dial-in, game menu, tic-tac-toe, war game and a machine replaying itself was the
   film's plot beat for beat. **Cut tic-tac-toe and the self-replay.** The player discovers the
   futility through the scores, and MERIDIAN gets one neutral closing line.
2. A test holding film lines would put script text in a public repo. **Dropped it**; the
   banned-word test stores its words encoded and skips its own file and the docs.
3. An alert scale counting down to 1 copied the DEFCON convention. **Now a rising 0 to 6
   Tension meter.**
4. False alarms and `VERIFY` had no consequences, so verifying was never worth it. **Added card
   consequences; `VERIFY` now costs standing, not a round.**
5. Tension only ever went up, and lights out scored 0 whoever escalated. **Added a cool-down
   round; lights out now scores by the player's own moves, still below any standoff.**
6. Standing and `AID` did nothing to the player. **Hardliners now lock the player's `TALK` and
   `AID` too; `AID` costs standing, not points.**
7. Spamming `TALK` solved the leaderboard. **Treaty needs MERIDIAN to talk too, and defused
   crises outweigh rounds left.**
8. Real coastlines with two blocs would read as real alliances. **Invented continent instead**,
   which also drops the map tool and its data.
9. The AI and a bloc shared a name, and "Zero Sum" says the opposite of the hook (everyone
   loses together). **Blocs renamed.** Fable suggested Cold Open; the owner kept Zero Sum, and agreed with
   Fable on the rest, including leaving tic-tac-toe out.
10. Typing letter by letter would make screen readers spell out text, and a portrait lock fought
    the wide layout. **Finished lines go to a live region; no orientation lock.**
11. The offline install check would need a browser install in CI. **It's a manual step in
    `docs/DEPLOY.md`.**
12. Too many numbers left to guess. **Added the meters, moves, consequences, round order and
    scoring tables, with the numbers kept in `data/rules.json`.**

## Fable red team, second pass (2026-11-08): Intercept

What it found in the new missile-defense game, and what changed:

1. Three batteries, ammo per battery, leftover-ammo points and a bonus city per 10,000 points
   copied the classic arcade ruleset nearly line for line. **Replaced with one refilling pool,
   instant bursts, "steady hands" city rebuilds, and scoring on cities kept only.**
2. A beatable hand-over wave read as a reward for escalating, and the screen order was
   inconsistent. **Crisis score shown first, the wave is always overwhelming, it's skippable,
   and it's never scored.**
3. Three full-screen flashes a second sat at the WCAG ceiling, with a red sky under white
   flashes. **No full-screen flashes; small local glows; a tested limiter; flash warning and
   Reduce effects on the content note.**
4. Every Intercept number was a guess. **Added a numbers table in `data/intercept.json`.**
5. Thumbs and buttons would collide with taps in the sky. **Controls in a bar below the
   playfield, every touch fires, minimum burst size.**
6. Glow with `shadowBlur` would be slow on iPhones. **Cheaper glow, sprites, particle and
   pixel-ratio caps.**
7. Test gaps (hand-over, reduce effects, game over, rebuilds). **Added to test 4.**
8. PR 3 depended on sound, scores and endings planned for PR 4. **Reordered the PRs.**
9. Intercept's big scores next to Crisis's small ones could read as "war pays". **Separate
   tables, Crisis first.**

