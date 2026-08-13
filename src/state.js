// The single mutable game state, plus its persistence. Everything shared lives
// on `G` because ES module bindings cannot be reassigned across files.

import { COLS, ROWS } from './config.js';

const STORE = 'blockfall.stats';

export const blankTally = () => ({ ms: 0, pieces: 0, tetris: 0, tspins: 0, perfect: 0, combo: 0, chain: 0 });

export function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// Per mode: Zen's score is unbounded, so it must never share with Marathon.
export const MODES = ['marathon', 'zen', 'cascade'];

const blankModeStats = () => ({ score: 0, lines: 0, combo: 0 });
const blankStats = () => Object.fromEntries(MODES.map(m => [m, blankModeStats()]));

export function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!raw) return blankStats();

    // Spread over a blank so a mode added after this save was written arrives
    // empty rather than undefined.
    if (MODES.some(m => raw[m])) {
      return Object.fromEntries(MODES.map(m => [m, { ...blankModeStats(), ...raw[m] }]));
    }

    // Flat shape from before the split: everything but zen lines was marathon.
    return {
      ...blankStats(),
      marathon: { score: raw.best | 0, lines: raw.bestLines | 0, combo: raw.bestCombo | 0 },
      zen: { score: 0, lines: raw.bestZenLines | 0, combo: 0 },
    };
  } catch { return blankStats(); }
}

export function saveStats() {
  try { localStorage.setItem(STORE, JSON.stringify(G.stats)); } catch {}
}

// ---------- in-progress run ----------

// One save per mode: a shared slot meant starting either mode silently threw
// away the other.
const RUN_VERSION = 1;
const LEGACY_RUN_STORE = 'blockfall.run';
const LAST_MODE_STORE = 'blockfall.lastmode';
const runKey = mode => `blockfall.run.${mode}`;

export function saveRun(mode, payload) {
  try { localStorage.setItem(runKey(mode), JSON.stringify({ v: RUN_VERSION, ...payload })); } catch {}
}

/** Returns null if absent, unreadable, or written by an older schema. */
export function loadRun(mode) {
  try {
    const run = JSON.parse(localStorage.getItem(runKey(mode)) || 'null');
    return run && run.v === RUN_VERSION ? run : null;
  } catch { return null; }
}

export function clearRun(mode) {
  try { localStorage.removeItem(runKey(mode)); } catch {}
}

export function saveLastMode(mode) {
  try { localStorage.setItem(LAST_MODE_STORE, mode); } catch {}
}

export function loadLastMode() {
  try {
    const mode = localStorage.getItem(LAST_MODE_STORE);
    return MODES.includes(mode) ? mode : 'marathon';
  } catch { return 'marathon'; }
}

/** Rehomes a run saved before the slots were split by mode. */
export function migrateLegacyRun() {
  try {
    const raw = localStorage.getItem(LEGACY_RUN_STORE);
    if (!raw) return;
    const run = JSON.parse(raw);
    if (run && run.v === RUN_VERSION) {
      const mode = run.mode === 'zen' ? 'zen' : 'marathon';
      if (!localStorage.getItem(runKey(mode))) localStorage.setItem(runKey(mode), raw);
    }
    localStorage.removeItem(LEGACY_RUN_STORE);
  } catch {}
}

/** One string, '.' for empty — 220 chars rather than nested JSON. */
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

export const G = {
  grid: emptyGrid(),
  active: null,
  queue: [],
  bag: null,
  hold: null,
  canHold: true,

  state: 'menu',   // menu | playing | clearing | settling | paused | pausedClearing | pausedSettling | dying | over
  mode: 'marathon', // marathon | zen
  score: 0, lines: 0, level: 1, combo: -1, backToBack: false,
  chain: 0,        // cascade: clears set off by one placement, 0 for the first
  tally: blankTally(),
  runBest: 0,      // score to beat, captured at the start of the run
  newBest: false,
  stats: { marathon: { score: 0, lines: 0, combo: 0 }, zen: { score: 0, lines: 0, combo: 0 } },

  gravityAcc: 0,
  ready: 0,        // ms left on the countdown; nothing moves while set

  // Each move or rotation restarts the lock clock, capped at MAX_LOCK_RESETS so
  // a piece cannot be stalled indefinitely.
  lockTimer: 0, lockResets: 0, grounded: false,

  // A spin only counts if the last successful action was a rotation, so
  // `rotatedLast` is cleared by any move or by gravity. `lastKick` is the SRS
  // kick index that succeeded; 4 promotes a mini T-spin to a full one.
  lastKick: 0, rotatedLast: false,

  clearRows: null, clearTimer: 0, clearTime: 200, clearCount: 0, pendingClear: null,
  // Cascade: cells in flight, and how far through their fall. The grid already
  // holds their destinations, so the renderer draws these instead of those.
  falling: null, fallTimer: 0,
  deathRow: ROWS, deathTimer: 0,

  particles: [], shake: 0,
};
