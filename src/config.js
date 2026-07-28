export const COLS = 10, VIS_ROWS = 20, HIDDEN = 2, ROWS = VIS_ROWS + HIDDEN;

export const LINE_SCORES = [0, 100, 300, 500, 800];
export const TSPIN_SCORES = [400, 800, 1200, 1600];
export const TSPIN_MINI_SCORES = [100, 200, 400, 400];
export const PERFECT_SCORES = [0, 800, 1200, 1800, 2000];

export const LOCK_DELAY = 500, MAX_LOCK_RESETS = 15, CLEAR_TIME = 190;
export const DEATH_ROW_MS = 34, DEATH_HOLD_MS = 280;

// Tunable feel — adjust after real-hands testing.
export const CTRL = {
  moveStep: 0.55,   // cells of finger travel per horizontal step
  softStep: 0.70,   // cells of finger travel per soft-drop step
  flickVel: 0.95,   // px/ms downward that counts as a hard-drop flick
  flickDist: 1.30,  // cells of downward travel required for a flick
  holdSwipe: 1.20,  // cells of upward travel that trigger hold
  tapDist: 12,      // px of travel still considered a tap
  tapTime: 260,     // ms
  das: 150, arr: 33, softRepeat: 28, // keyboard
};
