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
  stats: { best: 0, bestLines: 0, bestCombo: 0 },

  gravityAcc: 0,
  lockTimer: 0, lockResets: 0, grounded: false,
  lastKick: 0, rotatedLast: false,

  clearRows: null, clearTimer: 0, pendingClear: null,
  deathRow: ROWS, deathTimer: 0,

  particles: [], shake: 0,
};
