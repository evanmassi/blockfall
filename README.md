# Blockfall

A block-stacking game for the phone. Single self-contained `index.html` — no build, no dependencies.

## Run

```
python -m http.server 8123
```

Then open <http://localhost:8123>.

`file://` works too, but high scores won't persist in Firefox.

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

Feel constants live in `CTRL` near the top of the script — gesture thresholds, DAS/ARR. Adjust after real-hands testing.

## Themes

`THEMES` maps a theme name to its palette. Adding one is a single object; the sprite cache and well are rebuilt on `resize()`. Only `neon` exists so far.

## Not done yet

- Theme picker UI
- Zen mode (no top-out)
- Daily seed
- PWA manifest + service worker for offline / home-screen install (needs real hosting)
