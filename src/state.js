import { COLS, ROWS, DEFAULT_SETTINGS, UNDO_MAX, ZEN_CAPS, ZEN_LEVELS } from './config.js';

const STORE = 'blockfall.stats';
const SETTINGS_STORE = 'blockfall.settings';

export const blankTally = () => ({ ms: 0, pieces: 0, tetris: 0, tspins: 0, perfect: 0, combo: 0, chain: 0 });

export function emptyGrid() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

export const BASES = ['marathon', 'zen'];

export const slotOf = (mode, cascade) => (cascade ? `${mode}-cascade` : mode);
export const SLOTS = BASES.flatMap(m => [slotOf(m, false), slotOf(m, true)]);

const CASCADE_SUFFIX = '-cascade';

export function parseSlot(slot) {
  const cascade = String(slot).endsWith(CASCADE_SUFFIX);
  const mode = cascade ? String(slot).slice(0, -CASCADE_SUFFIX.length) : String(slot);
  return { mode: BASES.includes(mode) ? mode : 'marathon', cascade };
}

const blankModeStats = () => ({ score: 0, lines: 0, combo: 0 });
const blankStats = () => Object.fromEntries(SLOTS.map(s => [s, blankModeStats()]));

export function loadStats() {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE) || 'null');
    if (!raw) return blankStats();

    if (raw.cascade && !raw[slotOf('marathon', true)]) raw[slotOf('marathon', true)] = raw.cascade;

    if (SLOTS.some(s => raw[s])) {
      return Object.fromEntries(SLOTS.map(s => [s, { ...blankModeStats(), ...raw[s] }]));
    }

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

export function loadSettings() {
  try {
    const raw = JSON.parse(localStorage.getItem(SETTINGS_STORE) || 'null') || {};
    const max = raw.zenMax ?? raw.zenCap;
    const zenMax = ZEN_CAPS.includes(max) ? max : DEFAULT_SETTINGS.zenMax;
    const zenMin = ZEN_LEVELS.includes(raw.zenMin) ? raw.zenMin : DEFAULT_SETTINGS.zenMin;
    return {
      countdown: !!raw.countdown,
      cascade: !!raw.cascade,
      undos: Math.min(UNDO_MAX, Math.max(0, raw.undos | 0)),
      zenMin: zenMax ? Math.min(zenMin, zenMax) : zenMin,
      zenMax,
    };
  } catch { return { ...DEFAULT_SETTINGS }; }
}

export function saveSettings() {
  try { localStorage.setItem(SETTINGS_STORE, JSON.stringify(G.settings)); } catch {}
}

const RUN_VERSION = 1;
const LEGACY_RUN_STORE = 'blockfall.run';
const LAST_SLOT_STORE = 'blockfall.lastmode';
const runKey = slot => `blockfall.run.${slot}`;

export function saveRun(slot, payload) {
  try { localStorage.setItem(runKey(slot), JSON.stringify({ v: RUN_VERSION, ...payload })); } catch {}
}

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
    if (slot === 'cascade') return slotOf('marathon', true);
    return SLOTS.includes(slot) ? slot : 'marathon';
  } catch { return 'marathon'; }
}

export function migrateLegacyRun() {
  try {
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

  state: 'menu',
  mode: 'marathon',
  cascade: false,
  score: 0, lines: 0, level: 1, combo: -1, backToBack: false,
  chain: 0,
  tally: blankTally(),
  runBest: 0,
  newBest: false,
  stats: blankStats(),
  settings: { ...DEFAULT_SETTINGS },

  undosUsed: 0,
  undoStack: [],

  gravityAcc: 0,
  ready: 0,

  lockTimer: 0, lockResets: 0, grounded: false,

  lastKick: 0, rotatedLast: false,

  clearRows: null, clearTimer: 0, clearTime: 200, clearCount: 0, pendingClear: null,
  falling: null, fallTimer: 0,
  deathRow: ROWS, deathTimer: 0,

  particles: [], shake: 0,
};
