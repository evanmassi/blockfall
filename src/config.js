// Board geometry, scoring tables and every tunable number. No behaviour here —
// anything that feels wrong on a device should be adjustable from this file
// alone, without reading the code that consumes it.

// Rows above VIS_ROWS are the spawn buffer: pieces are created there and are
// not drawn, so a piece never appears half-cut at the top of the well.
export const COLS = 10, VIS_ROWS = 20, HIDDEN = 2, ROWS = VIS_ROWS + HIDDEN;

export const LINE_SCORES = [0, 100, 300, 500, 800];
export const TSPIN_SCORES = [400, 800, 1200, 1600];
export const TSPIN_MINI_SCORES = [100, 200, 400, 400];
export const PERFECT_SCORES = [0, 800, 1200, 1800, 2000];

// Gravity, as NES Tetris measured it: whole frames per row at the NTSC refresh.
// Levels here are 1-indexed, so index 0 is the console's level 0.
//
// This replaced the modern guideline curve, (0.8 - (lvl-1)*0.007)^(lvl-1),
// which is tuned for competitive play and gets punishing fast — by level 8 it
// gave 135ms a row against the console's 216ms. The plateaus are real: the
// hardware could only count whole frames, so speed steps every few levels
// rather than every one.
export const FRAME_MS = 1000 / 60.0988;
export const GRAVITY_FRAMES = [
  48, 43, 38, 33, 28, 23, 18, 13, 8, 6, // 1–10, a step every level
  5, 5, 5,                              // 11–13
  4, 4, 4,                              // 14–16
  3, 3, 3,                              // 17–19
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2,         // 20–29
];
export const GRAVITY_MIN_FRAMES = 1;    // 30+, the console's kill screen

// Zen: endless, so gravity has to stop somewhere it stays playable, and topping
// out clears room instead of ending the run.
export const ZEN_SPEED_CAP_LEVEL = 5;
export const ZEN_RESCUE_ROWS = 4;

export const LOCK_DELAY = 500, MAX_LOCK_RESETS = 15;
export const DEATH_ROW_MS = 34, DEATH_HOLD_MS = 280;

// Line-clear feedback, indexed by lines cleared. A single stays deliberately
// modest — if singles are exciting there's nowhere left to go for a Tetris.
//   time   ms the clear animation holds before the stack collapses
//   shake  screen-shake magnitude
//   parts  particles per cleared cell
//   spread particle velocity scale
//   beam   thickness of the light bar, in cells
//   tint   theme color key for the bar, or null for the theme's flash color
export const CLEAR_FX = [
  null,
  { time: 165, shake: 1.5, parts: 2,  spread: 0.30, beam: 0.30, tint: null },
  { time: 205, shake: 3.0, parts: 4,  spread: 0.45, beam: 0.55, tint: null },
  { time: 255, shake: 5.5, parts: 7,  spread: 0.62, beam: 0.85, tint: 'accent' },
  { time: 340, shake: 9.0, parts: 12, spread: 0.88, beam: 1.15, tint: 'I' },
];


// Tunable feel — adjust after real-hands testing.
export const CTRL = {
  moveStep: 0.55,   // cells of finger travel per horizontal step
  softStep: 0.85,   // cells of finger travel per soft-drop step
  flickVel: 1.25,   // px/ms downward (smoothed) that counts as a hard-drop flick
  flickDist: 2.00,  // cells that must be covered *while fast* to commit a flick
  flickSmooth: 0.45,// weight of the newest velocity sample; lower = steadier
  holdSwipe: 1.20,  // cells of upward travel that trigger hold
  tapDist: 12,      // px of travel still considered a tap
  tapTime: 260,     // ms
  das: 150, arr: 33, softRepeat: 28, // keyboard
};
