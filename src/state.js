// The single mutable game state, plus its persistence. Everything shared lives
// on `G` because ES module bindings cannot be reassigned across files — a
// module-level `let` here could be read elsewhere but never updated.

import { COLS, ROWS } from './config.js';

const STORE = 'blockfall.stats';

export function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export function loadStats() {
  try { return { best: 0, bestLines: 0, bestCombo: 0, ...JSON.parse(localStorage.getItem(STORE) || '{}') }; }
  catch { return { best: 0, bestLines: 0, bestCombo: 0 }; }
}

export function saveStats() {
  try { localStorage.setItem(STORE, JSON.stringify(G.stats)); } catch {}
}

// ---------- in-progress run ----------

const RUN_STORE = 'blockfall.run';
const RUN_VERSION = 1;

export function saveRun(payload) {
  try { localStorage.setItem(RUN_STORE, JSON.stringify({ v: RUN_VERSION, ...payload })); } catch {}
}

/** Returns null if absent, unreadable, or written by an older schema. */
export function loadRun() {
  try {
    const run = JSON.parse(localStorage.getItem(RUN_STORE) || 'null');
    return run && run.v === RUN_VERSION ? run : null;
  } catch { return null; }
}

export function clearRun() {
  try { localStorage.removeItem(RUN_STORE); } catch {}
}

/** The board as one string, '.' for empty — 220 chars rather than nested JSON. */
export function encodeGrid(grid) {
  return grid.map(row => row.map(c => c || '.').join('')).join('');
}

export function decodeGrid(str) {
  const grid = emptyGrid();
  if (typeof str !== 'string' || str.length !== ROWS * COLS) return grid;
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const ch = str[y * COLS + x];
      if (ch !== '.') grid[y][x] = ch;
    }
  }
  return grid;
}

// Everything mutable lives here. ES module bindings can't be reassigned across
// files, so shared state has to be properties on an object rather than `let`s.
export const G = {
  grid: emptyGrid(),
  active: null,
  queue: [],
  bag: null,
  hold: null,
  canHold: true,

  state: 'menu',   // menu | playing | clearing | paused | pausedClearing | dying | over
  score: 0, lines: 0, level: 1, combo: -1, backToBack: false,
  runBest: 0,      // score to beat, captured at the start of the run
  newBest: false,
  stats: { best: 0, bestLines: 0, bestCombo: 0 },

  gravityAcc: 0,

  // Lock delay: once grounded, a piece gets LOCK_DELAY ms before it sets, and
  // each successful move or rotation restarts that clock — capped at
  // MAX_LOCK_RESETS so a piece cannot be stalled indefinitely.
  lockTimer: 0, lockResets: 0, grounded: false,

  // T-spin detection. A spin only counts if the piece's last successful action
  // was a rotation, so `rotatedLast` is cleared by any move or by gravity.
  // `lastKick` is the index into the SRS kick table that succeeded; index 4
  // promotes a mini T-spin to a full one.
  lastKick: 0, rotatedLast: false,

  clearRows: null, clearTimer: 0, clearTime: 200, clearCount: 0, pendingClear: null,
  deathRow: ROWS, deathTimer: 0,

  particles: [], shake: 0,
};
