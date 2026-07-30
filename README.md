# Blockfall

A block-stacking game for the phone. No build step, no dependencies — plain ES modules and a canvas.

**Live: <https://evanmassi.github.io/blockfall/>** — installable, and plays offline once installed.

## Modes

**Game** — the standard one. Gravity accelerates with the level; top out and the run ends.

**Zen** — endless. Gravity stops accelerating at level 5, and topping out clears the bottom four rows and drops the stack instead of ending the run. Each mode keeps its own saved run and its own records, so an unbounded Zen score can never flatter the other.

## Controls

| Action | Touch | Keyboard |
| --- | --- | --- |
| Move | Drag left/right | ← → |
| Soft drop | Drag down | ↓ |
| Hard drop | Flick down | Space |
| Rotate CW | Tap | ↑ / X |
| Rotate CCW | Two-finger tap | Z / Ctrl |
| Hold | Swipe up | C / Shift |
| Pause | ❚❚ button | P / Esc |

The gesture list also appears on the pause screen — the gestures aren't guessable, and the menu is gone once you start playing.

## Run

```
python dev-server.py 8123
```

Then <http://localhost:8123>, or the machine's LAN address from a phone on the same network.

A server is required: ES modules are blocked over `file://`.

**Use `dev-server.py`, not `python -m http.server`, when testing on a device.** Mobile Safari caches ES modules independently and will happily skip revalidating some of them, leaving a phone running a mix of old and new files — which presents as an application bug and is very expensive to chase. `dev-server.py` sends `no-store`, omits `Last-Modified`, never answers `304`, and keeps its access log so you can see what a device actually fetched.

Add `?debug` for an on-screen log of pointer events plus the build id, also POSTed to `debug.log` so a phone's log doesn't have to be read off the screen. Inert without the query string.

## Test

```
node test/run.mjs
```

236 assertions across 37 blocks. `test/harness.mjs` stubs enough DOM to boot the real modules in Node and re-exports them with helpers; `test/run.mjs` holds only assertions. Coverage spans SRS kicks, T-spin scoring, lock delay, the death curtain, gestures, persistence, theme integrity, and whether the service worker's asset list matches the filesystem.

Every block opens with `reset()` and sets up what it needs. Blocks must not inherit state from each other — three bugs in this project were masked by assertions that only passed because of what a previous block happened to leave behind.

## Deploy

GitHub Pages, `main` branch, `/ (root)`. Paths are all relative, so serving from a subpath works. Pushing to `main` republishes; installed apps pick the change up on their **second** launch, because the service worker serves cache-first and revalidates behind it.

## Layout

```
index.html        markup
style.css
manifest.json     PWA metadata
sw.js             service worker; asset list must include every module
dev-server.py     no-cache static server for device testing
icons/            generated app icons (the L tetromino)
fonts/            Press Start 2P subset + licence

src/config.js     board dims, scoring tables, gravity table, CTRL tunables
src/pieces.js     SHAPES, ROTATIONS, KICKS              <- pure, no DOM
src/themes.js     palettes, block styles, level palettes
src/dom.js        element and canvas-context refs
src/state.js      G, plus stats and saved-run persistence
src/board.js      bag, queue, collision                 <- no DOM
src/sprites.js    block/ghost sprite cache, grayOf
src/audio.js      synthesised sound effects, no files
src/haptics.js    vibration patterns; a no-op on iOS
src/render.js     board, previews, layout, theme application
src/ui.js         overlays, toasts, HUD
src/game.js       spawn, lock, clear, scoring, modes, flow
src/input.js      keyboard + gestures
src/main.js       boot + frame loop
```

Everything mutable lives on `G` in `state.js`. ES module bindings can't be reassigned across files, so shared state has to be properties on an object rather than module-level `let`s.

## Mechanics

Guideline-accurate where it matters for feel:

- SRS rotation with full wall/floor kick tables
- 7-bag randomizer, hold slot, ghost piece, 3-piece preview
- Lock delay 500 ms with move-reset, capped at 15 resets
- T-spin detection (3-corner rule + kick-index upgrade), back-to-back, combos, perfect clears
- Level up every 10 lines

**Gravity is the NES table, not the modern guideline curve.** The guideline formula is tuned for competitive play and turns punishing early — 135 ms a row at level 8 against the console's 216 ms. `GRAVITY_FRAMES` in `src/config.js` holds frames per row at the NTSC refresh. Its plateaus are the hardware, which could only count whole frames; none is wider than three levels below 20.

Line clears escalate rather than all looking alike: a single, double, triple and Tetris differ in how long the clear holds, the shake, the particle count, and the thickness and colour of the light bar. A Tetris also fires columns of light up through the board and lands a low hit under the arpeggio. The ladder is `CLEAR_FX` in `src/config.js`.

## Themes

Five, all unlocked, switchable from the menu, pause and game-over screens. The choice persists.

| | |
| --- | --- |
| **Neon** | Dark, glowing, scanlines. The original. |
| **Aurora** | Midnight blue well, northern-lights palette. Calmer than Neon. |
| **Forest** | Earthy greens, terracotta, amber. Low glow, no scanlines. |
| **NES** | Pure black well, hairline border, NES system-palette pieces. |
| **Game Boy** | Dark chrome around a light olive LCD panel. No glow. |

A theme owns every colour decision *and how a cell is built* — `block.style` picks the construction, not just the tint:

- `bevel` — raised 3D, lit top-left. Neon, Aurora, Forest.
- `inset` — hard outline plus a per-piece inner mark. Game Boy.
- `nes` — flat fill with a three-pixel corner highlight, or a punched-out ring.

Only `bevel` leaves a gap between cells; the hardware styles butt together so their outlines form the grid, as on the originals.

**Game Boy** is the one light well — the LCD panel is the reference. The hardware drew every piece in one colour and told them apart by fill pattern, so each tetromino gets its own mark (stipple, hollow and filled squares at two sizes, a dot, solid) on top of a single olive ramp. That ramp is why the palette test measures contrast against each theme's own well rather than demanding dark themes.

**NES** repeats colours across pieces, because the console assigned three per *level* rather than one per shape — `levelPalettes` cycles them every ten levels. A `sharedPalette` flag lets the test suite permit duplicate piece colours there and still reject them everywhere else.

Adding a theme is one object in `src/themes.js`; the field list is documented at the top of that file. Picker swatches are canvases drawn with the real block renderer, so each shows that theme's actual bevel, glow and scanlines.

## Records and saved runs

Both are per mode. Records track score, lines and longest combo, shown as a card each on the menu once there's something to show. Beating a score mid-run announces itself and keeps the HUD score lit for the rest of the game.

Runs are saved at stable points only — a new piece, a pause, leaving for the menu, and `pagehide` — never mid-clear or mid-death, so a restored board is always one a player could have been looking at. The board serialises to a 220-character string, and the payload is versioned so an older save is discarded rather than half-loaded.

## Haptics

`navigator.vibrate` patterns paired with the sound events; iOS doesn't expose the API, so every call is a no-op there. Nothing fires on move or rotate — those repeat several times a second, and constant motor activity reads as a fault. A **BUZZ** toggle appears on the pause screen only where vibration exists.

## Typography

Display type is **Press Start 2P** (Cody Boisclair, SIL Open Font License) — latin subset only, 12.5 KB, in `fonts/`, cached by the service worker so it renders offline. Licence text ships alongside it.

It's one weight and renders far larger and wider per pixel than a normal face, so everything using it sets its own size and near-zero letter-spacing, and `font-synthesis: none` prevents faux bolding. Every piece of on-screen text uses it; there is no running prose left, only short labels and a two-column control list, which the face handles at 7–9px.

The title's first L is the real L tetromino: in its first rotation the piece is already the shape of the letter.

## Tuning

Feel constants are `CTRL` in `src/config.js` — gesture thresholds, DAS/ARR. `flickVel` and `flickDist` are the pair to reach for if hard drops fire when a soft drop was meant; they can only be judged on a real device.

## Not done yet

- Daily seed — same piece sequence for everyone that day
