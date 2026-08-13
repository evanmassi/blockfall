// The single mutable game state, plus its persistence. Everything shared lives
// on `G` because ES module bindings cannot be reassigned across files.

import { COLS, ROWS, DEFAULT_SETTINGS, UNDO_MAX, ZEN_CAPS } from './config.js';

const STORE = 'blockfall.stats';
const SETTINGS_STORE = 'blockfall.settings';

export const blankTally = () => ({ ms: 0, pieces: 0, tetris: 0, tspins: 0, perfect: 0, combo: 0, chain: 0 });

export function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// Two axes, not one list. The base decides how a run ends — Zen never tops out —
// and cascade decides how a clear resolves. Neither knows about the other.
export const BASES = ['marathon', 'zen'];

// The pair, flattened into the one string that keys a record and a save slot.
export const slotOf = (mode, cascade) => (cascade ? `${mode}-cascade` : mode);
export const SLOTS = BASES.flatMap(m => [slotOf(m, false), slotOf(m, true)]);

const CASCADE_SUFFIX = '-cascade';

export function parseSlot(slot) {
  const cascade = String(slot).endsWith(CASCADE_SUFFIX);
  const mode = cascade ? String(slot).slice(0, -CASCADE_SUFFIX.length) : String(slot);
  return { mode: BASES.includes(mode) ? mode : 'marathon', cascade };
}

// Per slot: Zen's score is unbounded and a cascade chain scores on a different
// curve, so none of the four may share a record with another.
const blankModeStats = () => ({ score: 0, lines: 0, combo: 0 });
const blankStats = () => Object.fromEntries(SLOTS.map(s => [s, blankModeStats()]));

export function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!raw) return blankStats();

    // Cascade was a mode of its own before it became a variant of Classic, and
    // that is exactly the pair it always was.
    if (raw.cascade && !raw[slotOf('marathon', true)]) raw[slotOf('marathon', true)] = raw.cascade;

    // Spread over a blank so a slot added after this save was written arrives
    // empty rather than undefined.
    if (SLOTS.some(s => raw[s])) {
      return Object.fromEntries(SLOTS.map(s => [s, { ...blankModeStats(), ...raw[s] }]));
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

// ---------- settings ----------

// Read back through the same clamps that write them: storage is editable by
// hand, and a zenCap of 40 would index off the end of the gravity table.
export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_STORE) || 'null') || {};
    return {
      countdown: !!raw.countdown,
      undos: Math.min(UNDO_MAX, Math.max(0, raw.undos | 0)),
      zenCap: ZEN_CAPS.includes(raw.zenCap) ? raw.zenCap : DEFAULT_SETTINGS.zenCap,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings() {
  try { localStorage.setItem(SETTINGS_STORE, JSON.stringify(G.settings)); } catch {}
}

// ---------- in-progress run ----------

// One save per slot: a shared one meant starting either mode silently threw
// away the other.
const RUN_VERSION = 1;
const LEGACY_RUN_STORE = 'blockfall.run';
const LAST_SLOT_STORE = 'blockfall.lastmode';
const runKey = slot => `blockfall.run.${slot}`;

export function saveRun(slot, payload) {
  try { localStorage.setItem(runKey(slot), JSON.stringify({ v: RUN_VERSION, ...payload })); } catch {}
}

/** Returns null if absent, unreadable, or written by an older schema. */
export function loadRun(slot) {
  try {
    const run = JSON.parse(localStorage.getItem(runKey(slot)) || 'null');
    return run && run.v === RUN_VERSION ? run : null;
  } catch { return null; }
}

export function clearRun(slot) {
  try { localStorage.removeItem(runKey(slot)); } catch {}
}

export function saveLastSlot(slot) {
  try { localStorage.setItem(LAST_SLOT_STORE, slot); } catch {}
}

export function loadLastSlot() {
  try {
    const slot = localStorage.getItem(LAST_SLOT_STORE);
    if (slot === 'cascade') return slotOf('marathon', true); // its name before the split
    return SLOTS.includes(slot) ? slot : 'marathon';
  } catch { return 'marathon'; }
}

/** Rehomes runs saved under a name from before either split. */
export function migrateLegacyRun() {
  try {
    // Cascade's own slot, from when it was a mode rather than a variant. The
    // payload is rewritten as the pair, not just moved: `mode: 'cascade'` means
    // nothing to a reader that now expects a base and a flag.
    const cascade = localStorage.getItem(runKey('cascade'));
    if (cascade) {
      const key = runKey(slotOf('marathon', true));
      if (!localStorage.getItem(key)) {
        const run = JSON.parse(cascade);
        localStorage.setItem(key, JSON.stringify({ ...run, mode: 'marathon', cascade: true }));
      }
      localStorage.removeItem(runKey('cascade'));
    }

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
  mode: 'marathon', // marathon | zen — how the run ends
  cascade: false,   // how a clear resolves; independent of the mode
  score: 0, lines: 0, level: 1, combo: -1, backToBack: false,
  chain: 0,        // cascade: clears set off by one placement, 0 for the first
  tally: blankTally(),
  runBest: 0,      // score to beat, captured at the start of the run
  newBest: false,
  stats: blankStats(),
  settings: { ...DEFAULT_SETTINGS },

  // Charges spent, not charges left, so raising the setting mid-run just works.
  undosUsed: 0,
  undoStack: [],   // one run payload per piece start, newest last

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
