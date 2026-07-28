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

## Tuning

Feel constants are `CTRL` in `src/config.js` — gesture thresholds, DAS/ARR. Adjust after real-hands testing.

## Themes

`src/themes.js` maps a name to a palette. Adding one is a single object; `setTheme()` pushes it to the CSS custom properties, and `resize()` rebuilds the sprite cache and well. Only `neon` exists so far.

## Not done yet

- Theme picker UI
- Zen mode (no top-out)
- Daily seed
- PWA manifest + service worker for offline / home-screen install (needs real hosting)
