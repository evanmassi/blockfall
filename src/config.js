export const COLS = 10, VIS_ROWS = 20, HIDDEN = 2, ROWS = VIS_ROWS + HIDDEN;

export const LINE_SCORES = [0, 100, 300, 500, 800];
export const TSPIN_SCORES = [400, 800, 1200, 1600];
export const TSPIN_MINI_SCORES = [100, 200, 400, 400];
export const PERFECT_SCORES = [0, 800, 1200, 1800, 2000];

export const FRAME_MS = 1000 / 60.0988;
export const GRAVITY_FRAMES = [
  48, 43, 38, 33, 28, 23, 18, 13, 8, 6,
  5, 5, 5,
  4, 4, 4,
  3, 3, 3,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
];
export const GRAVITY_MIN_FRAMES = 1;

export const ZEN_SPEED_CAP_LEVEL = 5;
export const ZEN_RESCUE_ROWS = 4;

export const UNDO_MAX = 5;

export const ZEN_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
export const ZEN_CAPS = [...ZEN_LEVELS, 0];

export const DEFAULT_SETTINGS = {
  countdown: false,
  cascade: false,
  undos: 0,
  zenMin: 1,
  zenMax: ZEN_SPEED_CAP_LEVEL,
};

export const LOCK_DELAY = 500, MAX_LOCK_RESETS = 15;
export const DEATH_ROW_MS = 34, DEATH_HOLD_MS = 280;

export const READY_MS = 2500, READY_BEATS = 3;

export const CHAIN_SCORES = [1, 1.5, 2, 3, 4];

export const FALL_MS = 190;

export const CLEAR_FX = [
  null,
  { time: 165, shake: 1.5, parts: 2,  spread: 0.30, beam: 0.30, tint: null },
  { time: 205, shake: 3.0, parts: 4,  spread: 0.45, beam: 0.55, tint: null },
  { time: 255, shake: 5.5, parts: 7,  spread: 0.62, beam: 0.85, tint: 'accent' },
  { time: 340, shake: 9.0, parts: 12, spread: 0.88, beam: 1.15, tint: 'I' },
];

export const CTRL = {
  moveStep: 0.55,
  softStep: 0.85,
  flickVel: 0.90,
  flickDist: 1.00,
  flickSmooth: 0.45,
  holdSwipe: 1.20,
  tapDist: 12,
  tapTime: 260,
  das: 150, arr: 33, softRepeat: 28,
};
