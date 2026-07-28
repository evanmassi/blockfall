export const COLS = 10, VIS_ROWS = 20, HIDDEN = 2, ROWS = VIS_ROWS + HIDDEN;

export const LINE_SCORES = [0, 100, 300, 500, 800];
export const TSPIN_SCORES = [400, 800, 1200, 1600];
export const TSPIN_MINI_SCORES = [100, 200, 400, 400];
export const PERFECT_SCORES = [0, 800, 1200, 1800, 2000];

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

export const CLEAR_TIME_MAX = Math.max(...CLEAR_FX.filter(Boolean).map(f => f.time));

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
