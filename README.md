# Blockfall

A block-stacking game for the phone. No build step, no dependencies — plain ES modules.

## Run

```
python -m http.server 8123
```

Then open <http://localhost:8123>.

The server is required: ES modules are blocked over `file://`, so opening `index.html` directly won't work.

## Test

```
node test/run.mjs
```

Stubs enough DOM to boot the real modules in Node, then drives the game through the same entry points the browser uses — SRS kicks, T-spin scoring, lock delay, the death curtain, touch gestures.

## Layout

```
index.html        markup
style.css
src/config.js     board dims, scoring tables, CTRL tunables, timings
src/pieces.js     SHAPES, ROTATIONS, KICKS          <- pure, no DOM
src/themes.js     palettes + setTheme (syncs CSS custom properties)
src/dom.js        element and canvas-context refs
src/state.js      G, the shared mutable game state
src/board.js      bag, queue, collision                <- pure-ish, no DOM
src/sprites.js    block/ghost sprite cache, grayOf
src/render.js     board + preview drawing, resize
src/ui.js         overlay, toast, HUD
src/game.js       spawn, lock, clear, scoring, flow
src/input.js      keyboard + gestures
src/main.js       boot + frame loop
```

Everything mutable lives on `G` in `state.js`. ES module bindings can't be reassigned across files, so shared state has to be properties on an object rather than module-level `let`s.

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

## Mechanics

Follows the modern Tetris guideline so the feel matches what people expect:

- SRS rotation with full wall/floor kick tables
- 7-bag randomizer, hold slot, ghost piece, 3-piece preview
- Lock delay 500 ms with move-reset, capped at 15 resets
- T-spin detection (3-corner rule + kick-index upgrade), back-to-back, combos, perfect clears
- Guideline gravity curve, level up every 10 lines

Line clears escalate rather than all looking alike — a single, double, triple and Tetris differ in how long the clear holds, how hard the screen shakes, how many particles fly, and how thick and what color the light bar is. A Tetris also fires columns of light up through the board and lands a low hit under the arpeggio. The ladder is `CLEAR_FX` in `src/config.js`.

## Tuning

Feel constants are `CTRL` in `src/config.js` — gesture thresholds, DAS/ARR. Adjust after real-hands testing.

## Themes

Dark wells only — a light theme was built and rejected. All unlocked, switchable from the menu, pause and game-over screens. The choice persists in `localStorage`.

| | |
| --- | --- |
| **Neon** | Dark, glowing, scanlines. The original. |
| **Aurora** | Midnight blue well, northern-lights palette. Calmer than Neon. |
| **Forest** | Earthy greens, terracotta, amber. Low glow, no scanlines. |

A theme owns every color decision, including how blocks are lit — `block.glow`, `block.light`, `block.shade` and `block.outline` feed the sprite bevel, which is most of what separates Neon from Forest.

Picker swatches are canvases drawn with the real block renderer, so each one shows that theme's actual bevel, glow and scanlines rather than flat color chips.

Adding one is a single object in `src/themes.js`. `setTheme()` pushes the palette to CSS custom properties and the Android status bar; `applyTheme()` also clears the sprite cache and rebuilds the pre-rendered well, both of which bake in theme colors.

## Typography

Display type is **Press Start 2P** (Cody Boisclair, SIL Open Font License) — the latin subset only, 12.5KB, in `fonts/`, cached by the service worker so it renders offline. Licence text ships in `fonts/OFL.txt`.

It's one weight and renders far larger and wider per pixel than a normal face, so everything using it sets its own size and near-zero letter-spacing, and `font-synthesis: none` prevents faux bolding. Body copy stays in the monospace stack — the pixel face is unreadable in running text.

The title's first L is the real L tetromino: in its first rotation the piece is already the shape of the letter.

## Not done yet

- Zen mode (no top-out)
- Daily seed
- PWA manifest + service worker for offline / home-screen install (needs real hosting)
